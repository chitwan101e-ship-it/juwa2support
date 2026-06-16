import type { SupabaseClient } from '@supabase/supabase-js'

export type PrimaryBusiness = {
  id: string
  name: string
  staffSenderId: string | null
}

async function findBusinessStaffSender(
  admin: SupabaseClient,
  businessId: string
): Promise<string | null> {
  const { data: adminRow } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'business')
    .eq('business_role', 'admin')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (adminRow?.id) return adminRow.id as string

  const { data: supportRow } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'business')
    .eq('business_role', 'support')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  return (supportRow?.id as string | undefined) ?? null
}

/** Resolves which business new customers auto-follow (mirrors feed primary-support logic). */
export async function resolvePrimaryBusinessForSignup(
  admin: SupabaseClient
): Promise<PrimaryBusiness | null> {
  const { data: businesses, error } = await admin
    .from('businesses')
    .select('id, name, slug')
    .order('name', { ascending: true })

  if (error || !businesses?.length) {
    if (error) console.error('[resolvePrimaryBusiness]', error.message)
    return null
  }

  const envSlug =
    process.env.NEXT_PUBLIC_PRIMARY_SUPPORT_BUSINESS_SLUG?.trim() ||
    process.env.PRIMARY_SUPPORT_BUSINESS_SLUG?.trim()

  const pick = async (row: { id: string; name: string }) => ({
    id: row.id,
    name: row.name,
    staffSenderId: await findBusinessStaffSender(admin, row.id),
  })

  if (envSlug) {
    const fromEnv = businesses.find((b) => b.slug.toLowerCase() === envSlug.toLowerCase())
    if (fromEnv) return pick(fromEnv)
  }

  const slugHints = ['support', 'juwa2', 'admin', 'help']
  for (const hint of slugHints) {
    const hit = businesses.find((b) => b.slug.toLowerCase() === hint)
    if (hit) return pick(hit)
  }

  const byName = businesses.find((b) => /support|helpdesk|help\s*desk|juwa2\s*support/i.test(b.name))
  if (byName) return pick(byName)

  return pick(businesses[0])
}
