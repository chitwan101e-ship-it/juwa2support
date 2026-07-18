import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { BusinessStaffRole } from '@/lib/staffRoles'

async function requireStaff(
  allowedRoles: BusinessStaffRole[]
): Promise<
  | { ok: true; userId: string; businessId: string }
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

  return { ok: true, userId: user.id, businessId }
}

/** Technical staff or admin claims an escalated thread. */
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
      .eq('status', 'pending')
      .maybeSingle()

    if (escErr) {
      return NextResponse.json({ error: escErr.message }, { status: 500 })
    }
    if (!escalation || escalation.business_id !== auth.businessId) {
      return NextResponse.json({ error: 'No pending escalation found for this thread.' }, { status: 404 })
    }

    const { error: updErr } = await admin
      .from('conversation_escalations')
      .update({
        status: 'claimed',
        claimed_by: auth.userId,
        claimed_at: now,
      })
      .eq('id', escalation.id)

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    await admin
      .from('conversations')
      .update({ assigned_to: auth.userId, updated_at: now })
      .eq('id', conversationId)

    return NextResponse.json({ ok: true, message: 'Thread claimed.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
