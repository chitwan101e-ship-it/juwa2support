-- =============================================================================
-- Create JUWA2 Support admin (run in Supabase Dashboard only)
-- =============================================================================
--
-- STEP 1 — Supabase Dashboard → Authentication → Users → Add user
--   Email:    juwa2support@gmail.com
--   Password: (choose your admin password here — stored in Supabase Auth only)
--   ✓ Auto Confirm User
--
-- STEP 2 — Run this entire file in Supabase → SQL Editor
--
-- Requires 2_bootstrap.sql (and 3_extras.sql) already applied.
-- =============================================================================

-- Business row for player support + dashboard
insert into public.businesses (name, slug)
values ('JUWA2 Support', 'juwa2')
on conflict (slug) do update set name = excluded.name;

-- Admin profile linked to the auth user you created in Step 1
insert into public.profiles (
  id,
  username,
  first_name,
  last_name,
  role,
  business_id,
  business_role,
  account_status,
  email_verified
)
select
  u.id,
  'juwa2support',
  'JUWA2',
  'Support',
  'business'::public.user_role,
  b.id,
  'admin'::public.business_role,
  'approved'::public.account_status,
  true
from auth.users u
cross join public.businesses b
where lower(u.email) = lower('juwa2support@gmail.com')
  and b.slug = 'juwa2'
on conflict (id) do update set
  username = excluded.username,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  role = 'business',
  business_id = excluded.business_id,
  business_role = 'admin',
  account_status = 'approved',
  email_verified = true,
  deleted_at = null;

-- Verify (should return one row: role=business, business_role=admin)
select
  u.email,
  p.username,
  p.role,
  p.business_role,
  p.account_status,
  b.name as business_name,
  b.slug as business_slug
from auth.users u
join public.profiles p on p.id = u.id
left join public.businesses b on b.id = p.business_id
where lower(u.email) = lower('juwa2support@gmail.com');
