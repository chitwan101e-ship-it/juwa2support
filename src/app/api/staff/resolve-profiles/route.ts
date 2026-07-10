import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const MAX_IDS = 200

async function assertBusinessStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
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
    (staff.business_role !== 'admin' &&
      staff.business_role !== 'support' &&
      staff.business_role !== 'technical')
  ) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { staff, admin: createServiceClient() }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
    }

    const auth = await assertBusinessStaff()
    if ('error' in auth && auth.error) return auth.error

    const body = (await req.json()) as { ids?: unknown }
    const rawIds = Array.isArray(body.ids) ? body.ids : []
    const ids = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))].slice(
      0,
      MAX_IDS
    )

    if (ids.length === 0) {
      return NextResponse.json({ profiles: [] })
    }

    const { data: rows, error } = await auth.admin
      .from('profiles')
      .select('id, username, first_name, last_name, avatar_url, role, business_role')
      .in('id', ids)
      .is('deleted_at', null)

    if (error) throw error

    return NextResponse.json({ profiles: rows ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
