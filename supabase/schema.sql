-- DEPRECATED — use split files (see 00_START_HERE.sql):
--   1_reset.sql → 2_bootstrap.sql → 3_extras.sql
--
-- ============================================================
-- Juwa2 Customer Support — Complete Supabase Schema
-- Single consolidated SQL file (schema + all migrations).
--
-- FRESH DATABASE: Run SECTION 2 only (complete bootstrap). Then run SECTION 3 for extras (notifications, RLS patches, realtime).
-- REBUILD EXISTING: Run SECTION 1 first, then SECTION 2, then SECTION 3.
-- Section 3 skips migrations already included in Section 2 (013, 014, etc.).
-- ============================================================

-- ============================================================
-- SECTION 1: RESET (optional — tear down existing app tables)
-- ============================================================

-- ============================================================
-- DEV / REBUILD: tear down Juwa2 app tables + helpers
-- Run in Supabase SQL Editor ONCE when you see errors like:
--   ERROR: 42P07: relation "businesses" already exists
--   ERROR: type "user_role" already exists
--
-- Does NOT touch auth.users. Deletes app data in public + related helpers.
-- After this, run: schema.sql then migrations 002 â†’ 003 â†’ 004 â†’ 005_suspension_patch_for_existing_db.sql (in order).
-- ============================================================

-- From migration 005
drop table if exists public.moderation_suspension_events cascade;

-- From migration 004 (audit trail; drop before profiles / businesses)
drop table if exists public.deleted_users_audit cascade;

-- From migration 003 (may not exist)
drop table if exists public.notifications cascade;

drop table if exists public.messages cascade;
drop table if exists public.reactions cascade;
drop table if exists public.comments cascade;
drop table if exists public.announcements cascade;
drop table if exists public.conversations cascade;
drop table if exists public.follows cascade;
drop table if exists public.admin_reports cascade;
drop table if exists public.otp_tokens cascade;
drop table if exists public.profiles cascade;
drop table if exists public.businesses cascade;

drop type if exists public.reaction_type cascade;
drop type if exists public.admin_report_status cascade;
drop type if exists public.user_role cascade;
drop type if exists public.business_role cascade;
drop type if exists public.account_status cascade;

drop function if exists public.set_updated_at() cascade;
drop function if exists public.my_profile() cascade;
drop function if exists public.is_business_admin(uuid) cascade;
drop function if exists public.is_business_member(uuid) cascade;
drop function if exists public.is_approved_user() cascade;
drop function if exists public.promote_user_to_business_admin(text, text) cascade;

-- From migration 004 (trigger dropped with messages; function may remain)
drop function if exists public.touch_conversation_on_message() cascade;


-- ============================================================
-- SECTION 2: MAIN SCHEMA
-- ============================================================

-- ============================================================
-- Juwa2 Customer Support â€” Full Supabase Schema
-- Fresh database bootstrap only.
-- Run this ONLY on a brand-new database.
--
-- If your database already exists, do NOT run this file again unless you
-- intentionally reset: run `supabase/migrations/000_reset_app_schema.sql` first.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 1. BUSINESSES
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table public.businesses (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text not null unique,          -- subdomain: slug.Juwa2 Customer Support.com
  description   text,
  logo_url      text,
  created_at    timestamptz default now()
);

-- Index for fast subdomain lookups
create index idx_businesses_slug on public.businesses(slug);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 2. PROFILES  (extends Supabase auth.users 1-to-1)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create type public.user_role     as enum ('customer', 'business');
create type public.business_role as enum ('admin', 'support');
create type public.account_status as enum ('pending', 'approved', 'rejected', 'blocked', 'suspended');

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  first_name    text not null,
  last_name     text not null,
  phone         text,
  phone_normalized text,
  referral_username text,
  signup_question text,
  avatar_url    text,
  role          public.user_role not null default 'customer',
  -- business-specific (null for customers)
  business_id   uuid references public.businesses(id) on delete set null,
  business_role public.business_role,
  account_status public.account_status not null default 'pending',
  email_verified boolean default false,
  deleted_at    timestamptz,
  deleted_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz default now(),
  -- constraints
  constraint business_role_requires_business
    check (
      (role = 'business' and business_id is not null and business_role is not null)
      or role = 'customer'
    )
);

create index idx_profiles_business on public.profiles(business_id);
create index idx_profiles_username  on public.profiles(username);
create index idx_profiles_status    on public.profiles(account_status);

create unique index idx_profiles_phone_norm_active
  on public.profiles (phone_normalized)
  where phone_normalized is not null
    and deleted_at is null
    and account_status in ('pending', 'approved', 'suspended', 'blocked');

create table if not exists public.signup_phone_attempts (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text,
  attempted_email text,
  attempted_username text,
  blocked boolean not null default false,
  block_reason text,
  client_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_signup_phone_attempts_phone_created
  on public.signup_phone_attempts (phone_normalized, created_at desc);

alter table public.signup_phone_attempts enable row level security;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 3. OTP TOKENS  (for email verification via Resend)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table public.otp_tokens (
  id         uuid primary key default uuid_generate_v4(),
  email      text not null,
  token      text not null,                  -- 6-digit code (hashed)
  expires_at timestamptz not null,
  used       boolean default false,
  verified_at timestamptz,
  purpose    text not null default 'signup' check (purpose in ('signup', 'password_reset')),
  created_at timestamptz default now()
);

create index idx_otp_email on public.otp_tokens(email);
create index idx_otp_tokens_email_purpose_active on public.otp_tokens (email, purpose) where used = false;

create or replace function public.auth_user_id_for_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth
stable
as $$
  select u.id
  from auth.users u
  where lower(trim(u.email::text)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.auth_user_id_for_email(text) from public;
grant execute on function public.auth_user_id_for_email(text) to service_role;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 4. ANNOUNCEMENTS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table public.announcements (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text not null,
  image_url   text,
  pinned      boolean default false,
  hidden_at   timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_announcements_business on public.announcements(business_id);
create index idx_announcements_created  on public.announcements(created_at desc);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 5. REACTIONS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create type public.reaction_type as enum ('like', 'helpful', 'love', 'question');

create table public.reactions (
  id              uuid primary key default uuid_generate_v4(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reaction        public.reaction_type not null default 'like',
  created_at      timestamptz default now(),
  unique (announcement_id, user_id)
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 6. COMMENTS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table public.comments (
  id              uuid primary key default uuid_generate_v4(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body            text not null,
  hidden_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz default now()
);

create index idx_comments_announcement on public.comments(announcement_id);
create index idx_comments_parent on public.comments(parent_comment_id) where parent_comment_id is not null;

create or replace function public.comments_validate_parent()
returns trigger
language plpgsql
as $$
begin
  if new.parent_comment_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.comments p
    where p.id = new.parent_comment_id
      and p.announcement_id = new.announcement_id
  ) then
    raise exception 'parent comment must belong to the same announcement';
  end if;
  return new;
end;
$$;

create trigger comments_validate_parent
  before insert or update of parent_comment_id, announcement_id on public.comments
  for each row
  execute function public.comments_validate_parent();


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 7. CONVERSATIONS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table public.conversations (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  customer_id   uuid not null references public.profiles(id) on delete cascade,
  assigned_to   uuid references public.profiles(id) on delete set null,
  status        text not null default 'open',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (business_id, customer_id)
);

create index idx_conversations_business  on public.conversations(business_id);
create index idx_conversations_customer  on public.conversations(customer_id);
create index idx_conversations_assigned  on public.conversations(assigned_to);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 8. MESSAGES
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null,
  read            boolean default false,
  created_at      timestamptz default now()
);

create index idx_messages_conversation on public.messages(conversation_id);
create index idx_messages_created      on public.messages(created_at asc);

-- 8b. INBOX LABELS (staff; matches migration 013_inbox_conversation_labels.sql)
create table public.inbox_label_definitions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  color text,
  is_system boolean not null default false,
  preset_key text,
  created_at timestamptz not null default now(),
  constraint inbox_label_name_nonempty check (char_length(trim(name)) between 1 and 48)
);

create unique index inbox_label_defs_business_name_lower
  on public.inbox_label_definitions (business_id, lower(trim(name)));

create unique index inbox_label_defs_business_preset
  on public.inbox_label_definitions (business_id, preset_key)
  where preset_key is not null;

create index idx_inbox_label_defs_business on public.inbox_label_definitions (business_id);

create table public.conversation_inbox_labels (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  label_id uuid not null references public.inbox_label_definitions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, label_id)
);

create index idx_conversation_inbox_labels_label on public.conversation_inbox_labels (label_id);

create or replace function public.conversation_inbox_labels_same_business()
returns trigger
language plpgsql
as $$
declare
  conv_bid uuid;
  lbl_bid uuid;
begin
  select c.business_id into conv_bid from public.conversations c where c.id = new.conversation_id;
  select d.business_id into lbl_bid from public.inbox_label_definitions d where d.id = new.label_id;
  if conv_bid is null then
    raise exception 'conversation not found';
  end if;
  if lbl_bid is null then
    raise exception 'label not found';
  end if;
  if conv_bid <> lbl_bid then
    raise exception 'label and conversation must belong to the same business';
  end if;
  return new;
end;
$$;

create trigger conversation_inbox_labels_same_business
  before insert or update of conversation_id, label_id on public.conversation_inbox_labels
  for each row
  execute function public.conversation_inbox_labels_same_business();

create or replace function public.seed_inbox_preset_labels_for_business()
returns trigger
language plpgsql
as $$
begin
  insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
  select new.id, x.name, x.color, true, x.preset_key
  from (
    values
      ('vip', 'VIP', '#ca8a04'),
      ('priority', 'Priority', '#ea580c'),
      ('scammer', 'Scammer', '#dc2626'),
      ('follow_up', 'Follow up', '#2563eb'),
      ('newly_approved', 'Newly approved', '#6366f1'),
      ('account_created', 'Account created', '#64748b'),
      ('active_player', 'Active player', '#16a34a')
  ) as x(preset_key, name, color)
  where not exists (
    select 1 from public.inbox_label_definitions d
    where d.business_id = new.id and d.preset_key = x.preset_key
  );
  return new;
end;
$$;

insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
select b.id, x.name, x.color, true, x.preset_key
from public.businesses b
cross join (
  values
    ('vip', 'VIP', '#ca8a04'),
    ('priority', 'Priority', '#ea580c'),
    ('scammer', 'Scammer', '#dc2626'),
    ('follow_up', 'Follow up', '#2563eb'),
    ('newly_approved', 'Newly approved', '#6366f1'),
    ('account_created', 'Account created', '#64748b'),
    ('active_player', 'Active player', '#16a34a')
) as x(preset_key, name, color)
where not exists (
  select 1 from public.inbox_label_definitions d
  where d.business_id = b.id and d.preset_key = x.preset_key
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 9. FOLLOWS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 8c. INBOX CANNED REPLIES (matches migration 014_inbox_canned_replies.sql)
create table public.inbox_canned_replies (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  body text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbox_canned_title_len check (char_length(trim(title)) between 1 and 100),
  constraint inbox_canned_body_len check (char_length(body) between 1 and 8000)
);

create index idx_inbox_canned_replies_business on public.inbox_canned_replies (business_id, sort_order, title);

create table public.follows (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (user_id, business_id)
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10. ADMIN REPORTS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create type public.admin_report_status as enum ('new', 'in_review', 'resolved');

create table public.admin_reports (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  reporter_id   uuid references public.profiles(id) on delete set null,
  reporter_name text not null,
  category      text not null,
  details       text not null,
  status        public.admin_report_status not null default 'new',
  assigned_to   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_admin_reports_business on public.admin_reports(business_id);
create index idx_admin_reports_status on public.admin_reports(status);

-- Moderation: suspend / unsuspend audit (matches migration 005)
create table public.moderation_suspension_events (
  id            uuid primary key default uuid_generate_v4(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete set null,
  actor_id      uuid not null,
  action        text not null check (action in ('suspend', 'unsuspend')),
  reason        text,
  created_at    timestamptz not null default now()
);

create index idx_moderation_suspension_profile on public.moderation_suspension_events (profile_id);
create index idx_moderation_suspension_created on public.moderation_suspension_events (created_at desc);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 11. HELPERS + RLS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.my_profile()
returns public.profiles
language sql security definer stable
as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.is_business_admin(bid uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and business_id = bid
      and business_role = 'admin'
  );
$$;

create or replace function public.is_business_member(bid uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and business_id = bid
      and role = 'business'
  );
$$;

create or replace function public.is_approved_user()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_status = 'approved'
  );
$$;

create or replace function public.is_business_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'business'
      and business_id is not null
  );
$$;

create or replace function public.promote_user_to_business_admin(
  user_email text,
  target_business_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  target_business_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can call promote_user_to_business_admin';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(user_email)
  limit 1;

  if target_user_id is null then
    raise exception 'User not found for email: %', user_email;
  end if;

  select id into target_business_id
  from public.businesses
  where slug = target_business_slug
  limit 1;

  if target_business_id is null then
    raise exception 'Business not found for slug: %', target_business_slug;
  end if;

  update public.profiles
  set role = 'business',
      business_id = target_business_id,
      business_role = 'admin',
      account_status = 'approved'
  where id = target_user_id;

  if not found then
    raise exception 'Profile row not found for user: %', user_email;
  end if;

  return target_user_id;
end;
$$;

alter table public.businesses     enable row level security;
alter table public.profiles       enable row level security;
alter table public.otp_tokens     enable row level security;
alter table public.announcements  enable row level security;
alter table public.reactions      enable row level security;
alter table public.comments       enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.inbox_label_definitions enable row level security;
alter table public.conversation_inbox_labels enable row level security;
alter table public.inbox_canned_replies enable row level security;
alter table public.follows        enable row level security;
alter table public.admin_reports  enable row level security;
alter table public.moderation_suspension_events enable row level security;

create policy "businesses_read"   on public.businesses for select using (true);
create policy "businesses_insert" on public.businesses for insert with check (false);

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_select_business_team" on public.profiles for select
  using (role = 'business' and business_id is not null and public.is_business_member(business_id));
create policy "profiles_select_business_customers" on public.profiles for select
  using (
    role = 'customer'
    and account_status in ('approved', 'suspended')
    and deleted_at is null
    and (
      exists (
        select 1 from public.conversations c
        where c.customer_id = profiles.id and public.is_business_member(c.business_id)
      )
      or exists (
        select 1 from public.follows f
        where f.user_id = profiles.id and public.is_business_member(f.business_id)
      )
    )
  );
create policy "profiles_select_business_broadcast" on public.profiles for select
  using (
    role = 'customer' and account_status = 'approved' and deleted_at is null and public.is_business_user()
  );
create policy "profiles_select_display" on public.profiles for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and (role = 'business' or (role = 'customer' and account_status = 'approved'))
  );
create policy "profiles_update_avatar_own" on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

revoke all on table public.profiles from anon;
revoke update on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
revoke select (phone, phone_normalized) on table public.profiles from authenticated;
grant update (avatar_url) on table public.profiles to authenticated;

create policy "otp_none"          on public.otp_tokens for all  using (false);

create policy "announce_read"     on public.announcements for select using (
  public.is_business_member(business_id)
  or (deleted_at is null and hidden_at is null)
);
create policy "announce_insert"   on public.announcements for insert with check (public.is_business_member(business_id));
create policy "announce_update"   on public.announcements for update
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "announce_delete"   on public.announcements for delete using (public.is_business_member(business_id));

create policy "reactions_read"    on public.reactions for select using (true);
create policy "reactions_own"     on public.reactions for all    using (user_id = auth.uid());

create policy "comments_read"     on public.comments for select using (
  exists (
    select 1 from public.announcements a
    where a.id = comments.announcement_id
      and public.is_business_member(a.business_id)
  )
  or (deleted_at is null and (hidden_at is null or user_id = auth.uid()))
);
create policy "comments_own"      on public.comments for all    using (user_id = auth.uid());
create policy "comments_staff_update" on public.comments for update using (
  exists (
    select 1 from public.announcements a
    where a.id = comments.announcement_id
      and public.is_business_member(a.business_id)
  )
);
create policy "comments_staff_delete" on public.comments for delete using (
  exists (
    select 1 from public.announcements a
    where a.id = comments.announcement_id
      and public.is_business_member(a.business_id)
  )
);

create policy "convo_customer"    on public.conversations for select using (customer_id = auth.uid());
create policy "convo_business"    on public.conversations for select using (public.is_business_member(business_id));
create policy "convo_insert"      on public.conversations for insert
  with check (customer_id = auth.uid() and public.is_approved_user());
create policy "convo_update_biz"  on public.conversations for update using (public.is_business_member(business_id));

create policy "msg_read"          on public.messages for select
using (
  sender_id = auth.uid()
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.customer_id = auth.uid() or public.is_business_member(c.business_id))
  )
);
create policy "msg_insert"        on public.messages for insert
  with check (sender_id = auth.uid() and public.is_approved_user());

create policy "msg_update_business_member"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_business_member(c.business_id)
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_business_member(c.business_id)
    )
  );

create policy "inbox_label_defs_select"
  on public.inbox_label_definitions for select
  using (public.is_business_member(business_id));

create policy "inbox_label_defs_insert"
  on public.inbox_label_definitions for insert
  with check (
    public.is_business_member(business_id)
    and is_system = false
    and preset_key is null
  );

create policy "inbox_label_defs_update"
  on public.inbox_label_definitions for update
  using (public.is_business_member(business_id) and is_system = false)
  with check (public.is_business_member(business_id) and is_system = false and preset_key is null);

create policy "inbox_label_defs_delete"
  on public.inbox_label_definitions for delete
  using (public.is_business_member(business_id) and is_system = false);

create policy "conversation_inbox_labels_select"
  on public.conversation_inbox_labels for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_inbox_labels.conversation_id
        and public.is_business_member(c.business_id)
    )
  );

create policy "conversation_inbox_labels_insert"
  on public.conversation_inbox_labels for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_inbox_labels.conversation_id
        and public.is_business_member(c.business_id)
    )
    and exists (
      select 1 from public.inbox_label_definitions d
      where d.id = conversation_inbox_labels.label_id
        and public.is_business_member(d.business_id)
    )
  );

create policy "conversation_inbox_labels_delete"
  on public.conversation_inbox_labels for delete
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_inbox_labels.conversation_id
        and public.is_business_member(c.business_id)
    )
  );

create policy "inbox_canned_replies_select"
  on public.inbox_canned_replies for select
  using (public.is_business_member(business_id));

create policy "inbox_canned_replies_insert"
  on public.inbox_canned_replies for insert
  with check (public.is_business_member(business_id));

create policy "inbox_canned_replies_update"
  on public.inbox_canned_replies for update
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "inbox_canned_replies_delete"
  on public.inbox_canned_replies for delete
  using (public.is_business_member(business_id));


create policy "follows_read"      on public.follows for select using (true);
create policy "follows_insert_approved" on public.follows for insert
  with check (user_id = auth.uid() and public.is_approved_user());
create policy "follows_delete_own" on public.follows for delete
  using (user_id = auth.uid());

create policy "admin_reports_select" on public.admin_reports for select
  using (public.is_business_member(business_id) or reporter_id = auth.uid());
create policy "admin_reports_insert" on public.admin_reports for insert
  with check (reporter_id = auth.uid());
create policy "admin_reports_update" on public.admin_reports for update
  using (public.is_business_member(business_id));

create policy "moderation_suspension_events_none"
  on public.moderation_suspension_events for all using (false);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 12. AUTO-UPDATE updated_at
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

create trigger set_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create trigger businesses_seed_inbox_labels
  after insert on public.businesses
  for each row
  execute function public.seed_inbox_preset_labels_for_business();

create trigger set_admin_reports_updated_at
  before update on public.admin_reports
  for each row execute function public.set_updated_at();

create trigger set_inbox_canned_replies_updated_at
  before update on public.inbox_canned_replies
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 13. REALTIME (manual, optional)
-- ────────────────────────────────────────────────────────────
-- Supabase Dashboard → Database → Replication:
-- enable for: messages, conversations, announcements (if you want live updates).

-- ────────────────────────────────────────────────────────────
-- TROUBLESHOOTING
-- - "relation already exists" -> Section 3 duplicated Section 2; use this file (013/014 skipped) or run Section 1 reset.
-- - Fresh database -> Section 2, then Section 3.


-- ============================================================
-- SECTION 3: INCREMENTAL MIGRATIONS (002–029)
-- ============================================================
-- If Section 2 completed successfully, continue here. Migrations 013/014 are skipped (duplicates).


-- ── Migration: 002_message_images_storage.sql ──
-- Run this in Supabase SQL Editor after the main schema.sql
-- Adds optional image attachments on support messages + a public storage bucket.

alter table public.messages add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('message-images', 'message-images', true)
on conflict (id) do nothing;

drop policy if exists "message_images_select" on storage.objects;
drop policy if exists "message_images_insert" on storage.objects;
drop policy if exists "message_images_update_own" on storage.objects;
drop policy if exists "message_images_delete_own" on storage.objects;

create policy "message_images_select"
  on storage.objects for select
  using (bucket_id = 'message-images');

create policy "message_images_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "message_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "message_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Run this in Supabase â†’ SQL Editor after the main schema.sql
-- Adds optional image attachments on support messages + a public storage bucket.

alter table public.messages add column if not exists image_url text;

-- Public bucket so chat bubbles can use stable URLs (tighten to private + signed URLs later if needed)
insert into storage.buckets (id, name, public)
values ('message-images', 'message-images', true)
on conflict (id) do nothing;

drop policy if exists "message_images_select" on storage.objects;
drop policy if exists "message_images_insert" on storage.objects;
drop policy if exists "message_images_update_own" on storage.objects;
drop policy if exists "message_images_delete_own" on storage.objects;

-- Authenticated users can upload; objects must live under their user-id folder (first path segment)
create policy "message_images_select"
  on storage.objects for select
  using (bucket_id = 'message-images');

create policy "message_images_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "message_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "message_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── Migration: 003_notifications.sql ──
-- Customer notifications (in-app inbox + unread badge)

create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  type        text not null default 'announcement',
  title       text not null,
  body        text not null,
  link        text,
  read        boolean not null default false,
  created_at  timestamptz default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, read);

alter table public.notifications enable row level security;

drop policy if exists "notifications_own_read" on public.notifications;
drop policy if exists "notifications_own_update" on public.notifications;
drop policy if exists "notifications_own_delete" on public.notifications;
drop policy if exists "notifications_insert" on public.notifications;

create policy "notifications_own_read"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_own_update"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "notifications_own_delete"
  on public.notifications for delete
  using (user_id = auth.uid());

create policy "notifications_insert"
  on public.notifications for insert
  with check (
    user_id = auth.uid()
    or (
      business_id is not null
      and public.is_business_member(business_id)
    )
  );

-- Customer notifications (in-app inbox + unread badge)

create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  type        text not null default 'announcement',
  title       text not null,
  body        text not null,
  link        text,
  read        boolean not null default false,
  created_at  timestamptz default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, read);

alter table public.notifications enable row level security;

drop policy if exists "notifications_own_read" on public.notifications;
drop policy if exists "notifications_own_update" on public.notifications;
drop policy if exists "notifications_own_delete" on public.notifications;
drop policy if exists "notifications_insert" on public.notifications;

create policy "notifications_own_read"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_own_update"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "notifications_own_delete"
  on public.notifications for delete
  using (user_id = auth.uid());

-- Allow users to create their own notifications (for local/manual tests)
-- and business members to create notifications tied to their business.
create policy "notifications_insert"
  on public.notifications for insert
  with check (
    user_id = auth.uid()
    or (
      business_id is not null
      and public.is_business_member(business_id)
    )
  );



-- ── Migration: 004_deleted_users_touch_inbox.sql ──
-- Soft-delete metadata on profiles + audit table + keep conversations fresh when customers message

alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists idx_profiles_not_deleted on public.profiles (id) where deleted_at is null;

create table if not exists public.deleted_users_audit (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null,
  auth_user_id uuid not null,
  business_id uuid references public.businesses(id) on delete set null,
  username text,
  reason text,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_deleted_users_audit_profile on public.deleted_users_audit(profile_id);
create index if not exists idx_deleted_users_audit_created on public.deleted_users_audit(created_at desc);

alter table public.deleted_users_audit enable row level security;

drop policy if exists "deleted_users_audit_none" on public.deleted_users_audit;
create policy "deleted_users_audit_none" on public.deleted_users_audit for all using (false);

-- When anyone sends a chat message, bump the parent conversation so inbox ordering stays correct.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- Supabase Dashboard â†’ Database â†’ Replication: enable supabase_realtime for `conversations` + `messages`
-- so the staff dashboard live-refreshes (optional; app also polls).


-- ── Migration: 005_suspension_patch_for_existing_db.sql ──
-- Suspension moderation patch for EXISTING databases.
-- Safe, additive, idempotent. Does NOT drop tables/data.
-- Use this if schema.sql was already run before suspension features existed.

-- 1) Add 'suspended' to account_status enum when missing
DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'account_status'
      AND e.enumlabel = 'suspended'
  ) THEN
    ALTER TYPE public.account_status ADD VALUE 'suspended';
  END IF;
END
$enum$;

-- 2) Audit log table for suspend/unsuspend actions
CREATE TABLE IF NOT EXISTS public.moderation_suspension_events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE SET NULL,
  actor_id    uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('suspend', 'unsuspend')),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_suspension_profile
  ON public.moderation_suspension_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_moderation_suspension_created
  ON public.moderation_suspension_events(created_at DESC);

COMMENT ON TABLE public.moderation_suspension_events IS
  'Audit log for staff suspend/unsuspend actions. Hidden from regular clients via RLS.';

ALTER TABLE public.moderation_suspension_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moderation_suspension_events_none" ON public.moderation_suspension_events;
CREATE POLICY "moderation_suspension_events_none"
  ON public.moderation_suspension_events
  FOR ALL
  USING (false);


-- ── Migration: 006_messages_staff_mark_read.sql ──
-- Staff inbox: allow business members to update messages (mark customer messages read).
-- Also backfill customer-authored messages as read so only messages created after this migration default to unread for badges.

drop policy if exists "msg_update_business_member" on public.messages;

create policy "msg_update_business_member"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_business_member(c.business_id)
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_business_member(c.business_id)
    )
  );

-- Historical customer messages: treat as already seen (read = true) so badges reflect new traffic only
update public.messages m
set read = true
from public.conversations c
where m.conversation_id = c.id
  and m.sender_id = c.customer_id;


-- ── Migration: 007_profile_images_storage.sql ──
-- Adds profile photo storage support for both customer and business users.

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do nothing;

drop policy if exists "profile_images_select" on storage.objects;
drop policy if exists "profile_images_insert" on storage.objects;
drop policy if exists "profile_images_update_own" on storage.objects;
drop policy if exists "profile_images_delete_own" on storage.objects;

create policy "profile_images_select"
  on storage.objects for select
  using (bucket_id = 'profile-images');

create policy "profile_images_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── Migration: 008_comments_threading.sql ──
-- Threaded replies on announcement comments (Facebook-style).
-- Run in Supabase SQL Editor on existing databases after earlier migrations.

alter table public.comments
  add column if not exists parent_comment_id uuid references public.comments (id) on delete cascade;

create index if not exists idx_comments_parent on public.comments (parent_comment_id)
  where parent_comment_id is not null;

create or replace function public.comments_validate_parent()
returns trigger
language plpgsql
as $$
begin
  if new.parent_comment_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.comments p
    where p.id = new.parent_comment_id
      and p.announcement_id = new.announcement_id
  ) then
    raise exception 'parent comment must belong to the same announcement';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_validate_parent on public.comments;
create trigger comments_validate_parent
  before insert or update of parent_comment_id, announcement_id on public.comments
  for each row
  execute function public.comments_validate_parent();


-- ── Migration: 009_message_notifications.sql ──
-- Link notifications to support threads and create alerts on new messages.
-- Staff: one row per business member when a customer sends a message.
-- Customer: one row when staff replies.
-- App marks these read when the user opens the thread (see markConversationNotificationsRead).

alter table public.notifications add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

create index if not exists idx_notifications_user_conversation_unread
  on public.notifications(user_id, conversation_id)
  where read = false;

drop trigger if exists messages_notify_staff_after_insert on public.messages;
drop trigger if exists messages_notify_customer_after_insert on public.messages;
drop function if exists public.notify_staff_on_customer_message();
drop function if exists public.notify_customer_on_staff_reply();

create or replace function public.notify_staff_on_customer_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  staff record;
  preview text;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null then
    return new;
  end if;
  if new.sender_id <> c.customer_id then
    return new;
  end if;

  preview := left(trim(new.body), 160);
  if preview is null or preview = '' then
    preview := 'ðŸ“· Message';
  end if;

  for staff in
    select id
    from public.profiles
    where business_id = c.business_id
      and role = 'business'
      and deleted_at is null
  loop
    insert into public.notifications (user_id, business_id, type, title, body, link, conversation_id)
    values (
      staff.id,
      c.business_id,
      'support_message',
      'New customer message',
      preview,
      '/dashboard',
      c.id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_customer_on_staff_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  preview text;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null then
    return new;
  end if;
  if new.sender_id = c.customer_id then
    return new;
  end if;

  preview := left(trim(new.body), 160);
  if preview is null or preview = '' then
    preview := 'ðŸ“· Reply';
  end if;

  insert into public.notifications (user_id, business_id, type, title, body, link, conversation_id)
  values (
    c.customer_id,
    c.business_id,
    'support_reply',
    'New reply from the team',
    preview,
    '/feed',
    c.id
  );

  return new;
end;
$$;

create trigger messages_notify_staff_after_insert
  after insert on public.messages
  for each row execute function public.notify_staff_on_customer_message();

create trigger messages_notify_customer_after_insert
  after insert on public.messages
  for each row execute function public.notify_customer_on_staff_reply();

-- Safer UPDATE policy: recipient can only keep rows tied to their user_id when toggling read.
drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── Migration: 010_mark_customer_messages_read_rpc.sql ──
-- Reliable "mark customer messages read" for staff (bypasses PostgREST PATCH filter quirks).
-- Call from the app via: rpc('mark_customer_messages_read_for_staff', { p_conversation_id: '<uuid>' })

create or replace function public.mark_customer_messages_read_for_staff(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_business_id uuid;
  n int;
begin
  select c.customer_id, c.business_id
  into v_customer_id, v_business_id
  from public.conversations c
  where c.id = p_conversation_id;

  if v_customer_id is null or v_business_id is null then
    return 0;
  end if;

  if not public.is_business_member(v_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.messages m
  set read = true
  where m.conversation_id = p_conversation_id
    and m.sender_id = v_customer_id
    and m.read is distinct from true;

  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.mark_customer_messages_read_for_staff(uuid) from public;
grant execute on function public.mark_customer_messages_read_for_staff(uuid) to authenticated;


-- ── Migration: 011_message_read_at.sql ──
-- When a message is marked read, record read_at for "Seen Â· 5m ago" receipts.
-- Customer can mark staff messages read (mirror of 006 for business).

alter table public.messages add column if not exists read_at timestamptz;

update public.messages
set read_at = coalesce(read_at, created_at)
where read = true
  and read_at is null;

create or replace function public.mark_customer_messages_read_for_staff(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_business_id uuid;
  n int;
begin
  select c.customer_id, c.business_id
  into v_customer_id, v_business_id
  from public.conversations c
  where c.id = p_conversation_id;

  if v_customer_id is null or v_business_id is null then
    return 0;
  end if;

  if not public.is_business_member(v_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.messages m
  set read = true,
      read_at = now()
  where m.conversation_id = p_conversation_id
    and m.sender_id = v_customer_id
    and m.read is distinct from true;

  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.mark_customer_messages_read_for_staff(uuid) from public;
grant execute on function public.mark_customer_messages_read_for_staff(uuid) to authenticated;

create or replace function public.mark_staff_messages_read_for_customer(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_business_id uuid;
  n int;
begin
  select c.customer_id, c.business_id
  into v_customer_id, v_business_id
  from public.conversations c
  where c.id = p_conversation_id;

  if v_customer_id is null or auth.uid() is distinct from v_customer_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.messages m
  set read = true,
      read_at = now()
  where m.conversation_id = p_conversation_id
    and m.sender_id is distinct from v_customer_id
    and m.read is distinct from true;

  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.mark_staff_messages_read_for_customer(uuid) from public;
grant execute on function public.mark_staff_messages_read_for_customer(uuid) to authenticated;


-- ── Migration: 012_customer_reply_notify_via_app.sql ──
-- Customer "support_reply" notifications are created by the app (POST /api/staff/notify-customer-reply)
-- using the service role, because trigger-time inserts into notifications often fail under RLS
-- while the originating messages row still commits.
--
-- If this trigger is still enabled, customers can receive duplicate notifications.

drop trigger if exists messages_notify_customer_after_insert on public.messages;


-- ── Migration: 013_inbox_conversation_labels.sql ──
-- Skipped: inbox_label_definitions + conversation_inbox_labels already created in Section 2.

-- ── Migration: 014_inbox_canned_replies.sql ──
-- Skipped: inbox_canned_replies already created in Section 2.

-- ── Migration: 015_signup_phone_referral.sql ──
-- Customer signup: normalized phone dedup, optional referral handle, signup attempt audit

alter table public.profiles add column if not exists phone_normalized text;
alter table public.profiles add column if not exists referral_username text;

comment on column public.profiles.phone_normalized is 'Digits-only key for duplicate-phone prevention; derived from public.profiles.phone.';
comment on column public.profiles.referral_username is 'Optional @username the customer entered as referrer (not validated as FK).';

-- At most one non-rejected, non-deleted profile per normalized phone
create unique index if not exists idx_profiles_phone_norm_active
  on public.profiles (phone_normalized)
  where phone_normalized is not null
    and deleted_at is null
    and account_status in ('pending', 'approved', 'suspended', 'blocked');

create index if not exists idx_profiles_phone_norm_lookup
  on public.profiles (phone_normalized)
  where phone_normalized is not null and deleted_at is null;

-- Log signup attempts (including blocked duplicates) for abuse review
create table if not exists public.signup_phone_attempts (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text,
  attempted_email text,
  attempted_username text,
  blocked boolean not null default false,
  block_reason text,
  client_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_signup_phone_attempts_phone_created
  on public.signup_phone_attempts (phone_normalized, created_at desc);

alter table public.signup_phone_attempts enable row level security;


-- ── Migration: 016_harden_profile_follow_notification_rls.sql ──
-- Roll back RLS hardening changes that caused staff/customer visibility regressions.
-- Keep this migration idempotent so re-running it restores pre-016 behavior.

-- ---------------------------------------------------------------------------
-- 1) PROFILES: restore original broad read policy
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_read" on public.profiles;

create policy "profiles_read"
  on public.profiles for select
  using (true);

-- ---------------------------------------------------------------------------
-- 2) FOLLOWS: restore original broad read policy
-- ---------------------------------------------------------------------------
drop policy if exists "follows_read" on public.follows;

create policy "follows_read"
  on public.follows for select
  using (true);

-- ---------------------------------------------------------------------------
-- 3) NOTIFICATIONS INSERT: restore original business-member insert behavior
-- ---------------------------------------------------------------------------
drop policy if exists "notifications_insert" on public.notifications;

create policy "notifications_insert"
  on public.notifications for insert
  with check (
    user_id = auth.uid()
    or
    (
      notifications.business_id is not null
      and public.is_business_member(notifications.business_id)
    )
  );


-- ── Migration: 017_otp_purpose_password_reset.sql ──
-- Distinguish signup vs password-reset OTP rows; support auth lookup by email (service role).

alter table public.otp_tokens add column if not exists purpose text not null default 'signup';

alter table public.otp_tokens drop constraint if exists otp_tokens_purpose_check;
alter table public.otp_tokens add constraint otp_tokens_purpose_check
  check (purpose in ('signup', 'password_reset'));

create index if not exists idx_otp_tokens_email_purpose_active
  on public.otp_tokens (email, purpose)
  where used = false;

-- Returns auth.users.id for a login email (case-insensitive). Callable only by service_role.
create or replace function public.auth_user_id_for_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth
stable
as $$
  select u.id
  from auth.users u
  where lower(trim(u.email::text)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.auth_user_id_for_email(text) from public;
grant execute on function public.auth_user_id_for_email(text) to service_role;


-- ── Migration: 018_announcements_comments_moderation.sql ──
-- Soft moderation for announcements (posts) and comments: hide + soft-delete.

alter table public.announcements
  add column if not exists hidden_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.comments
  add column if not exists hidden_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_announcements_feed_visible
  on public.announcements (business_id, created_at desc)
  where deleted_at is null and hidden_at is null;

create index if not exists idx_comments_feed_visible
  on public.comments (announcement_id, created_at)
  where deleted_at is null and hidden_at is null;

-- Announcements: public feed sees only visible posts; staff see hidden on dashboard.
drop policy if exists "announce_read" on public.announcements;
create policy "announce_read"
  on public.announcements for select
  using (
    public.is_business_member(business_id)
    or (deleted_at is null and hidden_at is null)
  );

-- Comments: visible to everyone unless hidden/deleted; authors and staff see hidden.
drop policy if exists "comments_read" on public.comments;
create policy "comments_read"
  on public.comments for select
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = comments.announcement_id
        and public.is_business_member(a.business_id)
    )
    or (
      deleted_at is null
      and (hidden_at is null or user_id = auth.uid())
    )
  );

-- Staff can update/delete any comment on their business announcements.
drop policy if exists "comments_staff_update" on public.comments;
create policy "comments_staff_update"
  on public.comments for update
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = comments.announcement_id
        and public.is_business_member(a.business_id)
    )
  );

drop policy if exists "comments_staff_delete" on public.comments;
create policy "comments_staff_delete"
  on public.comments for delete
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = comments.announcement_id
        and public.is_business_member(a.business_id)
    )
  );


-- ── Migration: 019_fix_moderation_rls_select.sql ──
-- Fix 403 on soft-delete/hide updates: staff must be able to SELECT rows they moderate
-- (PostgREST returns updated rows; old announce_read blocked deleted_at IS NOT NULL).

drop policy if exists "announce_read" on public.announcements;
create policy "announce_read"
  on public.announcements for select
  using (
    public.is_business_member(business_id)
    or (deleted_at is null and hidden_at is null)
  );

drop policy if exists "comments_read" on public.comments;
create policy "comments_read"
  on public.comments for select
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = comments.announcement_id
        and public.is_business_member(a.business_id)
    )
    or (
      deleted_at is null
      and (hidden_at is null or user_id = auth.uid())
    )
  );

-- Ensure business members (not only admins) can update announcements.
drop policy if exists "announce_update" on public.announcements;
create policy "announce_update"
  on public.announcements for update
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "announce_insert" on public.announcements;
create policy "announce_insert"
  on public.announcements for insert
  with check (public.is_business_member(business_id));

drop policy if exists "announce_delete" on public.announcements;
create policy "announce_delete"
  on public.announcements for delete
  using (public.is_business_member(business_id));


-- ── Migration: 020_harden_profiles_rls.sql ──
-- Fix critical profiles RLS: block privilege self-escalation (Vuln 1) and anonymous PII dump (Vuln 2).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_business_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'business'
      and business_id is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- Drop insecure policies
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_own" on public.profiles;
drop policy if exists "profiles_read" on public.profiles;

-- ---------------------------------------------------------------------------
-- SELECT: least-privilege row access (authenticated only; anon has no grants)
-- ---------------------------------------------------------------------------
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_select_business_team"
  on public.profiles for select
  using (
    role = 'business'
    and business_id is not null
    and public.is_business_member(business_id)
  );

create policy "profiles_select_business_customers"
  on public.profiles for select
  using (
    role = 'customer'
    and account_status in ('approved', 'suspended')
    and deleted_at is null
    and (
      exists (
        select 1 from public.conversations c
        where c.customer_id = profiles.id
          and public.is_business_member(c.business_id)
      )
      or exists (
        select 1 from public.follows f
        where f.user_id = profiles.id
          and public.is_business_member(f.business_id)
      )
    )
  );

-- Business staff: list approved customers for announcements / notifications
create policy "profiles_select_business_broadcast"
  on public.profiles for select
  using (
    role = 'customer'
    and account_status = 'approved'
    and deleted_at is null
    and public.is_business_user()
  );

-- Feed / comments / messages: display names for approved customers and business staff
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

-- ---------------------------------------------------------------------------
-- UPDATE: clients may only change avatar_url on their own row
-- ---------------------------------------------------------------------------
create policy "profiles_update_avatar_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Column + role grants: no anon access; hide phone from client role
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon;
revoke update on table public.profiles from anon, authenticated;

grant select on table public.profiles to authenticated;
revoke select (phone, phone_normalized) on table public.profiles from authenticated;

grant update (avatar_url) on table public.profiles to authenticated;


-- ── Migration: 021_otp_verify_and_approval_rls.sql ──
-- Vuln 3: signup OTP must be verified before register (verified_at).
-- Vuln 4: only approved customers may follow businesses or open support chats.

alter table public.otp_tokens
  add column if not exists verified_at timestamptz;

create index if not exists idx_otp_tokens_signup_verified
  on public.otp_tokens (email, purpose)
  where used = false and verified_at is not null;

-- ---------------------------------------------------------------------------
-- FOLLOWS: approved customers may follow/unfollow; inserts on approve stay service-role
-- ---------------------------------------------------------------------------
drop policy if exists "follows_own" on public.follows;

create policy "follows_insert_approved"
  on public.follows for insert
  with check (user_id = auth.uid() and public.is_approved_user());

create policy "follows_delete_own"
  on public.follows for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- CONVERSATIONS + MESSAGES: approved customers only
-- ---------------------------------------------------------------------------
drop policy if exists "convo_insert" on public.conversations;
create policy "convo_insert"
  on public.conversations for insert
  with check (customer_id = auth.uid() and public.is_approved_user());

drop policy if exists "msg_insert" on public.messages;
create policy "msg_insert"
  on public.messages for insert
  with check (sender_id = auth.uid() and public.is_approved_user());


-- ── Migration: 022_signup_question.sql ──
-- Optional question customers can ask during signup (shown to staff at approval).

alter table public.profiles add column if not exists signup_question text;

comment on column public.profiles.signup_question is 'Optional question the customer entered during signup for staff review.';


-- ── Migration: 023_inbox_latest_previews.sql ──
-- Latest message preview per conversation (avoids PostgREST row limits on bulk message queries).

create or replace function public.inbox_latest_previews(p_conversation_ids uuid[])
returns table(conversation_id uuid, body text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select distinct on (m.conversation_id) m.conversation_id, m.body, m.created_at
  from public.messages m
  inner join public.conversations c on c.id = m.conversation_id
  where m.conversation_id = any(p_conversation_ids)
    and public.is_business_member(c.business_id)
  order by m.conversation_id, m.created_at desc;
$$;

revoke all on function public.inbox_latest_previews(uuid[]) from public;
grant execute on function public.inbox_latest_previews(uuid[]) to authenticated;


-- ── Migration: 024_notifications_realtime.sql ──
-- Enable Realtime for in-app notifications (desktop alert fallback).
-- Dashboard: Database â†’ Replication â†’ supabase_realtime should list `notifications`.
-- This migration is safe if the table is already in the publication.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    return;
  end if;
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;


-- ── Migration: 025_messages_realtime.sql ──
-- Enable Realtime for live message INSERT events (staff desktop corner alerts).
-- Dashboard: Database â†’ Replication â†’ supabase_realtime should list `messages`.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    return;
  end if;
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;


-- ── Migration: 026_inbox_newly_approved_label.sql ──
-- System preset: auto-applied when a customer is approved (support thread).

insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
select b.id, x.name, x.color, true, x.preset_key
from public.businesses b
cross join (
  values ('newly_approved', 'Newly approved', '#6366f1')
) as x(preset_key, name, color)
where not exists (
  select 1 from public.inbox_label_definitions d
  where d.business_id = b.id and d.preset_key = x.preset_key
);

create or replace function public.seed_inbox_preset_labels_for_business()
returns trigger
language plpgsql
as $$
begin
  insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
  select new.id, x.name, x.color, true, x.preset_key
  from (
    values
      ('vip', 'VIP', '#ca8a04'),
      ('priority', 'Priority', '#ea580c'),
      ('scammer', 'Scammer', '#dc2626'),
      ('follow_up', 'Follow up', '#2563eb'),
      ('newly_approved', 'Newly approved', '#6366f1')
  ) as x(preset_key, name, color)
  where not exists (
    select 1 from public.inbox_label_definitions d
    where d.business_id = new.id and d.preset_key = x.preset_key
  );
  return new;
end;
$$;


-- ── Migration: 027_inbox_active_player_account_created_labels.sql ──
-- System presets for feed-post email targeting (Active player, Account created).

update public.inbox_label_definitions
set preset_key = 'account_created', is_system = true
where preset_key is null and lower(trim(name)) = 'account created';

update public.inbox_label_definitions
set preset_key = 'active_player', is_system = true
where preset_key is null and lower(trim(name)) = 'active player';

insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
select b.id, x.name, x.color, true, x.preset_key
from public.businesses b
cross join (
  values
    ('account_created', 'Account created', '#64748b'),
    ('active_player', 'Active player', '#16a34a')
) as x(preset_key, name, color)
where not exists (
  select 1 from public.inbox_label_definitions d
  where d.business_id = b.id and d.preset_key = x.preset_key
);

create or replace function public.seed_inbox_preset_labels_for_business()
returns trigger
language plpgsql
as $$
begin
  insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
  select new.id, x.name, x.color, true, x.preset_key
  from (
    values
      ('vip', 'VIP', '#ca8a04'),
      ('priority', 'Priority', '#ea580c'),
      ('scammer', 'Scammer', '#dc2626'),
      ('follow_up', 'Follow up', '#2563eb'),
      ('newly_approved', 'Newly approved', '#6366f1'),
      ('account_created', 'Account created', '#64748b'),
      ('active_player', 'Active player', '#16a34a')
  ) as x(preset_key, name, color)
  where not exists (
    select 1 from public.inbox_label_definitions d
    where d.business_id = new.id and d.preset_key = x.preset_key
  );
  return new;
end;
$$;


-- ── Migration: 028_support_message_popup_title.sql ──
-- Staff notification title: "{First name} message" instead of generic "New customer message".

create or replace function public.notify_staff_on_customer_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  staff record;
  customer record;
  preview text;
  popup_title text;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null then
    return new;
  end if;
  if new.sender_id <> c.customer_id then
    return new;
  end if;

  preview := left(trim(new.body), 160);
  if preview is null or preview = '' then
    preview := 'ðŸ“· Message';
  end if;

  select first_name, username into customer
  from public.profiles
  where id = c.customer_id;

  popup_title := coalesce(
    nullif(trim(customer.first_name), ''),
    nullif(trim(customer.username), ''),
    'Customer'
  ) || ' message';

  for staff in
    select id
    from public.profiles
    where business_id = c.business_id
      and role = 'business'
      and deleted_at is null
  loop
    insert into public.notifications (user_id, business_id, type, title, body, link, conversation_id)
    values (
      staff.id,
      c.business_id,
      'support_message',
      popup_title,
      preview,
      '/dashboard',
      c.id
    );
  end loop;

  return new;
end;
$$;


-- ── Migration: 029_businesses_admin_update.sql ──
-- Allow business admins to update their business row (e.g. logo_url when uploading profile photo).

create policy "businesses_update_admin"
  on public.businesses for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.business_id = businesses.id
        and p.business_role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.business_id = businesses.id
        and p.business_role = 'admin'
    )
  );

grant update on table public.businesses to authenticated;

