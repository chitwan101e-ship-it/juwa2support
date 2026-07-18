import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  assignConversationInboxLabel,
} from '@/lib/assignConversationInboxLabel'
import { CUSTOMER_ESCALATION_HANDOFF_MESSAGE } from '@/lib/technicalEscalation'
import type { BusinessStaffRole } from '@/lib/staffRoles'

const INBOX_LABEL_TECHNICAL_ESCALATION = 'technical_escalation'

async function requireStaff(
  allowedRoles: BusinessStaffRole[]
): Promise<
  | { ok: true; userId: string; businessId: string; businessRole: BusinessStaffRole }
  | { ok: false; response: NextResponse }
> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' },
        { status: 500 }
      ),
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: staff, error: staffErr } = await supabase
    .from('profiles')
    .select('id, role, business_id, business_role')
    .eq('id', user.id)
    .single()

  const businessId = staff?.business_id as string | null
  const businessRole = staff?.business_role as BusinessStaffRole | null
  const okStaff =
    !staffErr &&
    staff &&
    staff.role === 'business' &&
    businessId &&
    businessRole &&
    allowedRoles.includes(businessRole)

  if (!okStaff) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, userId: user.id, businessId, businessRole }
}

/** Support or admin escalates a thread to the technical queue. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireStaff(['admin', 'support'])
    if (!auth.ok) return auth.response

    const body = (await req.json()) as {
      conversationId?: string
      reason?: string
      notifyCustomer?: boolean
    }

    const conversationId = body.conversationId?.trim()
    const reason = body.reason?.trim()
    const notifyCustomer = body.notifyCustomer !== false

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: 'reason required — summarize the issue for technical staff.' }, { status: 400 })
    }

    const admin = createServiceClient()

    const { data: convo, error: convoErr } = await admin
      .from('conversations')
      .select('id, business_id, customer_id')
      .eq('id', conversationId)
      .single()

    if (convoErr || !convo || convo.business_id !== auth.businessId) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }

    const { data: existing, error: exErr } = await admin
      .from('conversation_escalations')
      .select('id, status')
      .eq('conversation_id', conversationId)
      .in('status', ['pending', 'claimed'])
      .maybeSingle()

    if (exErr) {
      return NextResponse.json({ error: exErr.message }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ error: 'This thread is already escalated to technical support.' }, { status: 400 })
    }

    const { data: escalation, error: escErr } = await admin
      .from('conversation_escalations')
      .insert({
        conversation_id: conversationId,
        business_id: auth.businessId,
        escalated_by: auth.userId,
        reason,
        status: 'pending',
      })
      .select('id, status, created_at')
      .single()

    if (escErr) {
      return NextResponse.json({ error: escErr.message }, { status: 500 })
    }

    await assignConversationInboxLabel(
      admin,
      auth.businessId,
      conversationId,
      INBOX_LABEL_TECHNICAL_ESCALATION
    )

    const internalBody = `[Escalated to Technical Support]\n${reason}`
    const { error: noteErr } = await admin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: auth.userId,
      body: internalBody,
      is_internal: true,
    })
    if (noteErr) {
      return NextResponse.json({ error: noteErr.message }, { status: 500 })
    }

    if (notifyCustomer) {
      const { error: pubErr } = await admin.from('messages').insert({
        conversation_id: conversationId,
        sender_id: auth.userId,
        body: CUSTOMER_ESCALATION_HANDOFF_MESSAGE,
        is_internal: false,
      })
      if (pubErr) {
        return NextResponse.json({ error: pubErr.message }, { status: 500 })
      }
    }

    await admin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    return NextResponse.json({
      ok: true,
      escalationId: escalation.id,
      status: escalation.status,
      message: 'Thread escalated to technical support.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
