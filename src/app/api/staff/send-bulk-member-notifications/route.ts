import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  INBOX_LABEL_JUWA_APP,
  INBOX_LABEL_WEBSITE,
} from '@/lib/assignConversationInboxLabel'
import { JUWA2_BRAND } from '@/lib/juwa2Theme'
import { sendBulkCustomerNotificationEmails } from '@/lib/sendBulkCustomerNotificationEmails'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/** Inbox delivery is bulk DB inserts, so it can handle large audiences. */
const MAX_INBOX_RECIPIENTS = 2000
/** Email is throttled (~0.6s/send for Resend rate limits), so it must stay within maxDuration. */
const MAX_EMAIL_RECIPIENTS = 500
const QUERY_CHUNK = 200
const INSERT_CHUNK = 200

type Delivery = 'inbox' | 'email' | 'both'
type NotificationType = 'announcement' | 'alert' | 'update'

export const maxDuration = 300

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

/**
 * Creates missing support conversations, assigns channel labels, and inserts the
 * chat message + bell notification for every recipient using chunked bulk inserts.
 * Runs in the background; per-chunk failures are logged and skipped.
 */
async function deliverInboxMessages(opts: {
  admin: SupabaseClient
  businessId: string
  senderId: string
  customerIds: string[]
  chatBody: string
  notificationType: NotificationType
  title: string
  messageBody: string
}): Promise<{ sent: number; failed: number }> {
  const { admin, businessId, senderId, customerIds } = opts

  // 1. Existing conversations for these customers.
  const conversationByCustomer = new Map<string, string>()
  for (const slice of chunks(customerIds, QUERY_CHUNK)) {
    const { data, error } = await admin
      .from('conversations')
      .select('id, customer_id')
      .eq('business_id', businessId)
      .in('customer_id', slice)
    if (error) throw error
    for (const row of data || []) {
      const r = row as { id: string; customer_id: string }
      conversationByCustomer.set(r.customer_id, r.id)
    }
  }

  // 2. Bulk-create missing conversations (followers without a thread yet).
  const missing = customerIds.filter((id) => !conversationByCustomer.has(id))
  for (const slice of chunks(missing, INSERT_CHUNK)) {
    const { data, error } = await admin
      .from('conversations')
      .upsert(
        slice.map((customerId) => ({
          business_id: businessId,
          customer_id: customerId,
          status: 'open',
        })),
        { onConflict: 'business_id,customer_id', ignoreDuplicates: true }
      )
      .select('id, customer_id')
    if (error) throw error
    for (const row of data || []) {
      const r = row as { id: string; customer_id: string }
      conversationByCustomer.set(r.customer_id, r.id)
    }
  }
  // ignoreDuplicates returns no rows for pre-existing conflicts; re-fetch any gaps.
  const stillMissing = customerIds.filter((id) => !conversationByCustomer.has(id))
  for (const slice of chunks(stillMissing, QUERY_CHUNK)) {
    const { data, error } = await admin
      .from('conversations')
      .select('id, customer_id')
      .eq('business_id', businessId)
      .in('customer_id', slice)
    if (error) throw error
    for (const row of data || []) {
      const r = row as { id: string; customer_id: string }
      conversationByCustomer.set(r.customer_id, r.id)
    }
  }

  // 3. Channel labels (Website vs Juwa App) for newly created threads, in bulk.
  if (missing.length > 0) {
    try {
      const { data: labelDefs } = await admin
        .from('inbox_label_definitions')
        .select('id, preset_key')
        .eq('business_id', businessId)
        .in('preset_key', [INBOX_LABEL_WEBSITE, INBOX_LABEL_JUWA_APP])
      const labelIdByPreset = new Map(
        (labelDefs || []).map((d) => [(d as { preset_key: string }).preset_key, (d as { id: string }).id])
      )

      const labelRows: { conversation_id: string; label_id: string }[] = []
      for (const slice of chunks(missing, QUERY_CHUNK)) {
        const { data: profiles } = await admin
          .from('profiles')
          .select('id, signup_source, game_user_id')
          .in('id', slice)
        for (const row of profiles || []) {
          const p = row as { id: string; signup_source: string | null; game_user_id: string | null }
          const conversationId = conversationByCustomer.get(p.id)
          if (!conversationId) continue
          const preset =
            p.signup_source === 'juwa_app' || p.game_user_id ? INBOX_LABEL_JUWA_APP : INBOX_LABEL_WEBSITE
          const labelId = labelIdByPreset.get(preset)
          if (labelId) labelRows.push({ conversation_id: conversationId, label_id: labelId })
        }
      }

      for (const slice of chunks(labelRows, INSERT_CHUNK)) {
        const { error } = await admin
          .from('conversation_inbox_labels')
          .upsert(slice, { onConflict: 'conversation_id,label_id', ignoreDuplicates: true })
        if (error) console.error('[bulk-member-notification:labels]', error.message)
      }
    } catch (error) {
      // Labels are cosmetic; never block message delivery on them.
      console.error('[bulk-member-notification:labels]', error)
    }
  }

  // 4. Bulk-insert chat messages and bell notifications.
  const deliverable = customerIds.filter((id) => conversationByCustomer.has(id))
  let sent = 0
  let failed = customerIds.length - deliverable.length

  for (const slice of chunks(deliverable, INSERT_CHUNK)) {
    const messageRows = slice.map((customerId) => ({
      conversation_id: conversationByCustomer.get(customerId) as string,
      sender_id: senderId,
      body: opts.chatBody,
    }))
    const { error: messageErr } = await admin.from('messages').insert(messageRows)
    if (messageErr) {
      console.error('[bulk-member-notification:messages]', messageErr.message)
      failed += slice.length
      continue
    }

    const notificationRows = slice.map((customerId) => ({
      user_id: customerId,
      business_id: businessId,
      type: opts.notificationType,
      title: opts.title,
      body: opts.messageBody,
      link: '/feed?openChat=1',
      conversation_id: conversationByCustomer.get(customerId) as string,
    }))
    const { error: notificationErr } = await admin.from('notifications').insert(notificationRows)
    if (notificationErr) {
      // Chat message already delivered; only the bell entry is missing.
      console.error('[bulk-member-notification:notifications]', notificationErr.message)
    }
    sent += slice.length
  }

  return { sent, failed }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' },
        { status: 500 }
      )
    }

    const body = (await req.json()) as {
      userIds?: string[]
      delivery?: Delivery
      notificationType?: NotificationType
      title?: string
      body?: string
    }

    const userIds = [
      ...new Set(
        (Array.isArray(body.userIds) ? body.userIds : [])
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ]
    const delivery = body.delivery
    const notificationType = body.notificationType
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const messageBody = typeof body.body === 'string' ? body.body.trim() : ''

    if (
      !userIds.length ||
      (delivery !== 'inbox' && delivery !== 'email' && delivery !== 'both') ||
      (notificationType !== 'announcement' &&
        notificationType !== 'alert' &&
        notificationType !== 'update') ||
      !title ||
      !messageBody
    ) {
      return NextResponse.json(
        { error: 'userIds, delivery, notificationType, title, and body are required.' },
        { status: 400 }
      )
    }

    const wantsEmail = delivery === 'email' || delivery === 'both'
    const maxRecipients = wantsEmail ? MAX_EMAIL_RECIPIENTS : MAX_INBOX_RECIPIENTS
    if (userIds.length > maxRecipients) {
      return NextResponse.json(
        {
          error: wantsEmail
            ? `Email delivery supports up to ${MAX_EMAIL_RECIPIENTS} recipients per send. Use Inbox delivery (up to ${MAX_INBOX_RECIPIENTS}) or split the audience.`
            : `Too many recipients (max ${MAX_INBOX_RECIPIENTS}).`,
        },
        { status: 400 }
      )
    }
    if (title.length > 160 || messageBody.length > 5000) {
      return NextResponse.json(
        { error: 'Title must be 160 characters or fewer and message must be 5,000 characters or fewer.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: staff, error: staffErr } = await supabase
      .from('profiles')
      .select('id, role, business_role, business_id')
      .eq('id', user.id)
      .single()

    if (
      staffErr ||
      !staff ||
      staff.role !== 'business' ||
      !staff.business_id ||
      (staff.business_role !== 'admin' && staff.business_role !== 'support')
    ) {
      return NextResponse.json(
        { error: 'Only business admins and support members can send bulk notifications.' },
        { status: 403 }
      )
    }

    const admin = createServiceClient()
    const businessId = staff.business_id as string
    const approved = new Set<string>()
    const related = new Set<string>()

    for (const slice of chunks(userIds, QUERY_CHUNK)) {
      const [{ data: profiles, error: profileErr }, { data: conversations, error: convoErr }, { data: follows, error: followErr }] =
        await Promise.all([
          admin
            .from('profiles')
            .select('id')
            .in('id', slice)
            .eq('role', 'customer')
            .eq('account_status', 'approved')
            .is('deleted_at', null),
          admin
            .from('conversations')
            .select('customer_id')
            .eq('business_id', businessId)
            .in('customer_id', slice),
          admin
            .from('follows')
            .select('user_id')
            .eq('business_id', businessId)
            .in('user_id', slice),
        ])

      if (profileErr) throw profileErr
      if (convoErr) throw convoErr
      if (followErr) throw followErr
      for (const row of profiles || []) approved.add((row as { id: string }).id)
      for (const row of conversations || []) related.add((row as { customer_id: string }).customer_id)
      for (const row of follows || []) related.add((row as { user_id: string }).user_id)
    }

    const eligibleIds = userIds.filter((id) => approved.has(id) && related.has(id))
    const skipped = userIds.length - eligibleIds.length

    if (eligibleIds.length === 0) {
      return NextResponse.json({
        ok: true,
        recipientCount: userIds.length,
        eligibleCount: 0,
        skipped,
        inbox: { processing: false, recipientCount: 0 },
        email: { processing: false, recipientCount: 0 },
      })
    }

    // All delivery work runs after the response so the dashboard never waits on it.
    const senderId = user.id
    const wantsInbox = delivery === 'inbox' || delivery === 'both'

    if (wantsInbox) {
      const chatBody = `${title}\n\n${messageBody}`
      after(async () => {
        try {
          const result = await deliverInboxMessages({
            admin: createServiceClient(),
            businessId,
            senderId,
            customerIds: eligibleIds,
            chatBody,
            notificationType,
            title,
            messageBody,
          })
          console.info('[bulk-member-notification:inbox:done]', {
            recipientCount: eligibleIds.length,
            ...result,
          })
        } catch (error) {
          console.error('[bulk-member-notification:inbox]', error)
        }
      })
    }

    if (wantsEmail) {
      const prefix =
        notificationType === 'alert'
          ? 'Alert'
          : notificationType === 'update'
            ? 'Update'
            : 'Announcement'
      const { data: business } = await admin
        .from('businesses')
        .select('name')
        .eq('id', businessId)
        .maybeSingle()
      const brandName = (business as { name?: string } | null)?.name?.trim() || JUWA2_BRAND
      const emailOptions = {
        userIds: eligibleIds,
        subject: `${prefix}: ${title}`,
        title,
        body: messageBody,
        linkPath: delivery === 'both' ? '/feed?openChat=1' : '/feed',
        ctaLabel: delivery === 'both' ? 'Open message' : 'Open app',
        brandName,
      }

      after(async () => {
        try {
          const result = await sendBulkCustomerNotificationEmails(
            createServiceClient(),
            emailOptions
          )
          console.info('[bulk-member-notification:email:done]', {
            recipientCount: eligibleIds.length,
            ...result,
          })
        } catch (error) {
          console.error('[bulk-member-notification:email]', error)
        }
      })
    }

    return NextResponse.json({
      ok: true,
      recipientCount: userIds.length,
      eligibleCount: eligibleIds.length,
      skipped,
      inbox: { processing: wantsInbox, recipientCount: wantsInbox ? eligibleIds.length : 0 },
      email: { processing: wantsEmail, recipientCount: wantsEmail ? eligibleIds.length : 0 },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
