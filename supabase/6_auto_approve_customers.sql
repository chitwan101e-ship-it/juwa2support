-- =============================================================================
-- Auto-approve customer signups (defense in depth)
-- =============================================================================
-- New website signups should never require manual staff approval.
-- The register API sets account_status = 'approved', but if production is behind
-- on deploy, inserts may still send 'pending'. This trigger enforces the policy
-- at the database layer for all new customer profiles.
--
-- Safe to re-run. Run in Supabase → SQL Editor after 3_extras.sql.
-- =============================================================================

create or replace function public.auto_approve_customer_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'customer' and new.account_status = 'pending' then
    new.account_status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_auto_approve_customer on public.profiles;
create trigger profiles_auto_approve_customer
  before insert on public.profiles
  for each row
  execute function public.auto_approve_customer_on_insert();

-- One-time: clear any customer rows still stuck in pending (legacy backlog).
update public.profiles
set account_status = 'approved'
where role = 'customer'
  and account_status = 'pending'
  and deleted_at is null;
