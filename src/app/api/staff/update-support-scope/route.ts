import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseSupportInboxScope } from '@/lib/supportInboxScope'

/** Admin-only: change which inbox(es) a support agent can access. */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
    }

    const body = (await req.json()) as { targetUserId?: string; inboxScope?: string }
    const targetUserId = body.targetUserId?.trim()
    const inboxScope = parseSupportInboxScope(body.inboxScope)

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })
    }
    if (!inboxScope) {
      return NextResponse.json({ error: 'inboxScope must be both, website, or app.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProf, error: adminErr } = await supabase
      .from('profiles')
      .select('id, role, business_role, business_id')
      .eq('id', user.id)
      .single()

    if (
      adminErr ||
      !adminProf ||
      adminProf.role !== 'business' ||
      adminProf.business_role !== 'admin' ||
      !adminProf.business_id
    ) {
      return NextResponse.json({ error: 'Only business admins can change inbox assignments.' }, { status: 403 })
    }

    const businessId = adminProf.business_id as string
    const admin = createServiceClient()

    const { data: target, error: targetErr } = await admin
      .from('profiles')
      .select('id, business_id, business_role, deleted_at')
      .eq('id', targetUserId)
      .single()

    if (
      targetErr ||
      !target ||
      target.business_id !== businessId ||
      target.business_role !== 'support' ||
      target.deleted_at
    ) {
      return NextResponse.json({ error: 'Support team member not found.' }, { status: 404 })
    }

    const { error: updErr } = await admin
      .from('profiles')
      .update({ support_inbox_scope: inboxScope })
      .eq('id', targetUserId)

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, inboxScope })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
