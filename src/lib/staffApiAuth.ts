import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BusinessStaffRole } from '@/lib/staffRoles'

export type StaffApiAuth = {
  userId: string
  businessId: string
  businessRole: BusinessStaffRole
  username: string | null
}

export async function requireStaffApi(
  allowedRoles: BusinessStaffRole[]
): Promise<
  | { ok: true; auth: StaffApiAuth }
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
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: staff, error: staffError } = await supabase
    .from('profiles')
    .select('id, role, business_id, business_role, username')
    .eq('id', user.id)
    .single()

  const businessId = staff?.business_id as string | null
  const businessRole = staff?.business_role as BusinessStaffRole | null
  if (
    staffError ||
    !staff ||
    staff.role !== 'business' ||
    !businessId ||
    !businessRole ||
    !allowedRoles.includes(businessRole)
  ) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return {
    ok: true,
    auth: {
      userId: user.id,
      businessId,
      businessRole,
      username: (staff?.username as string | null) ?? null,
    },
  }
}

