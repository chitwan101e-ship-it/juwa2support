-- STEP 15: Ticket-first support -> technical workflow
-- Run after 14_comment_author_display.sql. Safe to re-run.

create sequence if not exists public.support_ticket_number_seq;

create table if not exists public.support_tickets (
  id                 uuid primary key default uuid_generate_v4(),
  ticket_number      text not null unique,
  business_id        uuid not null references public.businesses(id) on delete cascade,
  conversation_id    uuid not null references public.conversations(id) on delete cascade,
  source_inbox       text not null default 'app' check (source_inbox in ('app', 'website')),
  customer_id        uuid not null references public.profiles(id) on delete cascade,
  customer_username  text not null,
  game_username      text,
  occurred_at        timestamptz,
  issue              text not null,
  supporting_image_url text,
  supporting_image_urls text[] not null default '{}'::text[],
  context_snapshot   jsonb not null default '[]'::jsonb,
  status             text not null default 'open'
    check (status in ('open', 'in_progress', 'awaiting_support', 'closed')),
  created_by         uuid references public.profiles(id) on delete set null,
  claimed_by         uuid references public.profiles(id) on delete set null,
  resolution_text    text,
  resolution_image_url text,
  resolved_by        uuid references public.profiles(id) on delete set null,
  closed_by          uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  claimed_at         timestamptz,
  ready_at           timestamptz,
  closed_at          timestamptz,
  updated_at         timestamptz not null default now(),
  constraint support_tickets_issue_nonempty
    check (char_length(trim(issue)) between 1 and 4000),
  constraint support_tickets_resolution_valid
    check (
      status not in ('awaiting_support', 'closed')
      or char_length(trim(coalesce(resolution_text, ''))) between 1 and 6000
    )
);

-- Column additions for databases that already ran an earlier version of this file
alter table public.support_tickets
  add column if not exists occurred_at timestamptz;

alter table public.support_tickets
  add column if not exists supporting_image_urls text[] not null default '{}'::text[];

update public.support_tickets
set supporting_image_urls = array[supporting_image_url]
where supporting_image_url is not null
  and cardinality(supporting_image_urls) = 0;

comment on column public.support_tickets.occurred_at is
  'When the customer says the issue happened (entered by support at ticket creation).';

comment on column public.support_tickets.supporting_image_urls is
  'Supporting evidence images attached to the ticket.';

create unique index if not exists support_tickets_one_active_per_conversation
  on public.support_tickets(conversation_id)
  where status in ('open', 'in_progress', 'awaiting_support');

create index if not exists idx_support_tickets_business_status_created
  on public.support_tickets(business_id, status, created_at desc);

create index if not exists idx_support_tickets_conversation_created
  on public.support_tickets(conversation_id, created_at desc);

create or replace function public.assign_support_ticket_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(trim(new.ticket_number), '') is null then
    new.ticket_number :=
      'TKT-' || to_char(current_timestamp at time zone 'UTC', 'YYYYMMDD') || '-' ||
      lpad(nextval('public.support_ticket_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_assign_number on public.support_tickets;
create trigger support_tickets_assign_number
  before insert on public.support_tickets
  for each row execute function public.assign_support_ticket_number();

create or replace function public.touch_support_ticket_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists support_tickets_touch_updated_at on public.support_tickets;
create trigger support_tickets_touch_updated_at
  before update on public.support_tickets
  for each row execute function public.touch_support_ticket_updated_at();

create table if not exists public.support_ticket_notes (
  id          uuid primary key default uuid_generate_v4(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint support_ticket_notes_body_nonempty
    check (char_length(trim(body)) between 1 and 4000)
);

create index if not exists idx_support_ticket_notes_ticket_created
  on public.support_ticket_notes(ticket_id, created_at asc);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_notes enable row level security;

drop policy if exists "support_tickets_staff_read" on public.support_tickets;
create policy "support_tickets_staff_read"
  on public.support_tickets for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'business'
        and p.business_id = support_tickets.business_id
        and p.business_role in ('admin', 'support', 'technical')
    )
  );

-- Ticket notes are a shared support <-> technical discussion.
drop policy if exists "support_ticket_notes_technical_read" on public.support_ticket_notes;
drop policy if exists "support_ticket_notes_staff_read" on public.support_ticket_notes;
create policy "support_ticket_notes_staff_read"
  on public.support_ticket_notes for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'business'
        and p.business_id = support_ticket_notes.business_id
        and p.business_role in ('admin', 'support', 'technical')
    )
  );

grant select on public.support_tickets to authenticated;
grant select on public.support_ticket_notes to authenticated;
revoke insert, update, delete on public.support_tickets from authenticated;
revoke insert, update, delete on public.support_ticket_notes from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_notes'
  ) then
    alter publication supabase_realtime add table public.support_ticket_notes;
  end if;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

comment on table public.support_tickets is
  'Role-separated handoff tickets: support creates, technical works privately, support receives final resolution.';
comment on column public.support_tickets.context_snapshot is
  'Immutable customer conversation context captured when the ticket is created.';
