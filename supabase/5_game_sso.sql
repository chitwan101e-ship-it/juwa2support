-- STEP 5: In-app game SSO (safe to re-run)
-- Run after 3_extras.sql on existing projects.

-- Link Relay profiles to Juwa game accounts (no shared password required).
alter table public.profiles
  add column if not exists game_user_id text;

create unique index if not exists idx_profiles_game_user_id
  on public.profiles (game_user_id)
  where game_user_id is not null
    and deleted_at is null;

-- Single-use SSO tokens (replay protection for game-sso).
create table if not exists public.game_sso_jti_uses (
  jti text primary key,
  game_user_id text,
  used_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_game_sso_jti_expires
  on public.game_sso_jti_uses (expires_at);

alter table public.game_sso_jti_uses enable row level security;

-- Service role only (no client policies).

-- Resolve auth.users.id by email (service-role RPC from provision / SSO).
create or replace function public.auth_user_id_for_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
stable
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.auth_user_id_for_email(text) from public;
grant execute on function public.auth_user_id_for_email(text) to service_role;
