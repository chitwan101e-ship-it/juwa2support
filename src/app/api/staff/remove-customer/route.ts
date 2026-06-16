import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notifyBusinessTeamAdmins } from '@/lib/notifyStaffAdmins'

/**
 * Soft-removes a customer linked to the staff member's business (follow or support thread).
 * Sets deleted_at, blocks login, and records who removed the account.
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
    }

    const body = (await req.json()) as { targetUserId?: string }
    const targetUserId = body.targetUserId
    if (!targetUserId || typeof targetUserId !== 'string') {
      return NextResponse.json({ error: 'targetUserId is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
      return NextResponse.json({ error: 'Only business team members can remove customers.' }, { status: 403 })
    }

    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'You cannot remove your own account this way.' }, { status: 400 })
    }

    const businessId = staff.business_id as string
    const admin = createServiceClient()

    const { data: target, error: tErr } = await admin
      .from('profiles')
      .select('id, role, account_status, first_name, last_name, username, phone, referral_username, deleted_at')
      .eq('id', targetUserId)
      .single()

    if (tErr || !target || target.role !== 'customer') {
      return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
    }

    if (target.deleted_at) {
      return NextResponse.json({ ok: true, alreadyRemoved: true })
    }

    const [{ data: follow }, { data: convo }] = await Promise.all([
      admin
        .from('follows')
        .select('user_id')
        .eq('user_id', targetUserId)
        .eq('business_id', businessId)
        .maybeSingle(),
      admin
        .from('conversations')
        .select('id')
        .eq('customer_id', targetUserId)
        .eq('business_id', businessId)
        .limit(1)
        .maybeSingle(),
    ])

    if (!follow && !convo) {
      return NextResponse.json({ error: 'This customer is not linked to your business.' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const { error: updErr } = await admin
      .from('profiles')
      .update({
        deleted_at: now,
        deleted_by: user.id,
        account_status: 'blocked',
      })
      .eq('id', targetUserId)
      .eq('role', 'customer')

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    const { error: banErr } = await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: '876000h',
    })
    if (banErr) console.error('[remove-customer] ban user:', banErr)

    const { data: authUser } = await admin.auth.admin.getUserById(targetUserId)
    const email = authUser.user?.email ?? '—'
    const t = target as {
      first_name: string
      last_name: string
      username: string
      phone: string | null
      referral_username: string | null
    }
    const name = `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || t.username
    const phoneLine = t.phone?.trim() ? `Phone: ${t.phone.trim()}` : 'Phone: —'
    const refLine = t.referral_username ? `Referral: @${t.referral_username}` : 'Referral: —'

    await notifyBusinessTeamAdmins(
      admin,
      businessId,
      {
        title: 'Customer removed',
        body: `Removed ${name} (@${t.username}, ${email}). ${phoneLine}. ${refLine}.`,
        link: '/notifications',
      },
      { excludeUserId: user.id }
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
