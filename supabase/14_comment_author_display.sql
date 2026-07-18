-- STEP 14: Let authenticated users resolve comment author display names
-- Run in Supabase SQL Editor if comments show "Member" instead of usernames.
-- Safe to re-run.

grant select on table public.profiles to authenticated;

drop policy if exists "profiles_select_display" on public.profiles;
create policy "profiles_select_display"
  on public.profiles for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and (
      role = 'business'
      or (role = 'customer' and account_status = 'approved')
    )
  );
