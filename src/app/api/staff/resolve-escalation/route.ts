import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { removeConversationInboxLabel } from '@/lib/assignConversationInboxLabel'
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

/** Technical staff or admin marks an escalation resolved. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireStaff(['admin', 'technical'])
    if (!auth.ok) return auth.response

    const body = (await req.json()) as { conversationId?: string }
    const conversationId = body.conversationId?.trim()
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }

    const admin = createServiceClient()
    const now = new Date().toISOString()

    const { data: escalation, error: escErr } = await admin
      .from('conversation_escalations')
      .select('id, business_id, status, claimed_by')
      .eq('conversation_id', conversationId)
      .eq('status', 'claimed')
      .maybeSingle()

    if (escErr) {
      return NextResponse.json({ error: escErr.message }, { status: 500 })
    }
    if (!escalation || escalation.business_id !== auth.businessId) {
      return NextResponse.json({ error: 'No claimed escalation found for this thread.' }, { status: 404 })
    }

    if (auth.businessRole === 'technical' && escalation.claimed_by !== auth.userId) {
      return NextResponse.json(
        { error: 'Only the agent who claimed this thread (or an admin) can mark it resolved.' },
        { status: 403 }
      )
    }

    const { error: updErr } = await admin
      .from('conversation_escalations')
      .update({
        status: 'resolved',
        resolved_by: auth.userId,
        resolved_at: now,
      })
      .eq('id', escalation.id)

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    await removeConversationInboxLabel(
      admin,
      auth.businessId,
      conversationId,
      INBOX_LABEL_TECHNICAL_ESCALATION
    )

    await admin
      .from('conversations')
      .update({ assigned_to: null, updated_at: now })
      .eq('id', conversationId)

    return NextResponse.json({ ok: true, message: 'Escalation resolved.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
