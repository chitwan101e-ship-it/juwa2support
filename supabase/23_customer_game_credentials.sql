-- STEP 23: Multi-platform game credentials per customer (staff-only)
-- Run after 22_easy_ticket_numbers_and_customer_name.sql — safe to re-run
-- Platforms (app constants): juwa, orion_stars, fire_kirin, game_vault,
--   ultra_panda, panda_master, river_sweep, loot, highstake
-- Multiple usernames per platform are allowed (same customer can have several Juwa accounts, etc.)

create table if not exists public.customer_game_credentials (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  platform     text not null,
  username     text not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint customer_game_credentials_username_len
    check (char_length(trim(username)) between 1 and 64)
);

-- Allow many usernames on the same platform; block exact duplicates only
alter table public.customer_game_credentials
  drop constraint if exists customer_game_credentials_unique_platform;

drop index if exists customer_game_credentials_unique_platform;
drop index if exists customer_game_credentials_unique_username;

create unique index if not exists customer_game_credentials_unique_username
  on public.customer_game_credentials (
    business_id,
    customer_id,
    platform,
    lower(trim(username))
  );

alter table public.customer_game_credentials
  drop constraint if exists customer_game_credentials_platform_ok;

alter table public.customer_game_credentials
  add constraint customer_game_credentials_platform_ok
  check (platform in (
    'juwa',
    'orion_stars',
    'fire_kirin',
    'game_vault',
    'ultra_panda',
    'panda_master',
    'river_sweep',
    'loot',
    'highstake'
  ));

comment on table public.customer_game_credentials is
  'Staff-only in-game usernames; multiple per platform allowed for a customer within a business.';

create index if not exists idx_customer_game_credentials_customer
  on public.customer_game_credentials (business_id, customer_id);

create or replace function public.touch_customer_game_credentials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_game_credentials_touch_updated_at on public.customer_game_credentials;
create trigger customer_game_credentials_touch_updated_at
  before update on public.customer_game_credentials
  for each row execute function public.touch_customer_game_credentials_updated_at();

alter table public.customer_game_credentials enable row level security;

drop policy if exists "customer_game_credentials_staff_select" on public.customer_game_credentials;
create policy "customer_game_credentials_staff_select"
  on public.customer_game_credentials for select
  using (public.is_business_member(business_id));

drop policy if exists "customer_game_credentials_staff_insert" on public.customer_game_credentials;
create policy "customer_game_credentials_staff_insert"
  on public.customer_game_credentials for insert
  with check (
    public.is_business_member(business_id)
    and created_by = auth.uid()
  );

drop policy if exists "customer_game_credentials_staff_update" on public.customer_game_credentials;
create policy "customer_game_credentials_staff_update"
  on public.customer_game_credentials for update
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "customer_game_credentials_staff_delete" on public.customer_game_credentials;
create policy "customer_game_credentials_staff_delete"
  on public.customer_game_credentials for delete
  using (public.is_business_member(business_id));

grant select, insert, update, delete on public.customer_game_credentials to authenticated;

-- Backfill: existing conversation staff notes → Juwa credential (one per customer)
insert into public.customer_game_credentials (business_id, customer_id, platform, username, created_by)
select distinct on (c.business_id, c.customer_id)
  c.business_id,
  c.customer_id,
  'juwa',
  trim(c.staff_game_username),
  null
from public.conversations c
where c.staff_game_username is not null
  and char_length(trim(c.staff_game_username)) between 1 and 64
  and not exists (
    select 1
    from public.customer_game_credentials g
    where g.business_id = c.business_id
      and g.customer_id = c.customer_id
      and g.platform = 'juwa'
      and lower(trim(g.username)) = lower(trim(c.staff_game_username))
  )
order by c.business_id, c.customer_id, c.updated_at desc;
