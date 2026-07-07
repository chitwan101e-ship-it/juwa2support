import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { BusinessStaffRole } from '@/lib/staffRoles'

const INBOX_LABEL_TECHNICAL_ESCALATION = 'technical_escalation'

/** Ensures an active escalation row exists when the Technical Escalation label is on a thread. */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
    }

    const body = (await req.json()) as { conversationId?: string }
    const conversationId = body.conversationId?.trim()
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      (businessRole === 'admin' || businessRole === 'support' || businessRole === 'technical')

    if (!okStaff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createServiceClient()

    const { data: convo, error: convoErr } = await admin
      .from('conversations')
      .select('id, business_id')
      .eq('id', conversationId)
      .single()

    if (convoErr || !convo || convo.business_id !== businessId) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }

    const { data: labelDef, error: defErr } = await admin
      .from('inbox_label_definitions')
      .select('id')
      .eq('business_id', businessId)
      .eq('preset_key', INBOX_LABEL_TECHNICAL_ESCALATION)
      .maybeSingle()

    if (defErr) {
      return NextResponse.json({ error: defErr.message }, { status: 500 })
    }
    if (!labelDef?.id) {
      return NextResponse.json({ error: 'Technical Escalation label is not configured for this business.' }, { status: 400 })
    }

    const { data: labelRow, error: labelErr } = await admin
      .from('conversation_inbox_labels')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('label_id', labelDef.id)
      .maybeSingle()

    if (labelErr) {
      return NextResponse.json({ error: labelErr.message }, { status: 500 })
    }
    if (!labelRow) {
      return NextResponse.json({ error: 'Thread does not have Technical Escalation label.' }, { status: 400 })
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
      return NextResponse.json({ ok: true, escalationId: existing.id, status: existing.status, synced: false })
    }

    const { data: created, error: crErr } = await admin
      .from('conversation_escalations')
      .insert({
        conversation_id: conversationId,
        business_id: businessId,
        escalated_by: user.id,
        reason: 'Synced from Technical Escalation label on thread.',
        status: 'pending',
      })
      .select('id, status, created_at')
      .single()

    if (crErr) {
      return NextResponse.json({ error: crErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      escalationId: created.id,
      status: created.status,
      synced: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
