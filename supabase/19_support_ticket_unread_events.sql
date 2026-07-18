-- STEP 19: Per-staff unread activity counts for support tickets
-- Run after 18_support_ticket_shared_notes.sql. Safe to re-run.

create table if not exists public.support_ticket_unread_events (
  id          uuid primary key default uuid_generate_v4(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  event_type  text not null
    check (event_type in ('new_ticket', 'note', 'resolution', 'closed')),
  target_view text not null
    check (target_view in ('technical', 'app_replies')),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists idx_support_ticket_unread_events_user_unread
  on public.support_ticket_unread_events(user_id, created_at desc)
  where read_at is null;

create index if not exists idx_support_ticket_unread_events_ticket_user
  on public.support_ticket_unread_events(ticket_id, user_id, created_at desc);

alter table public.support_ticket_unread_events enable row level security;

drop policy if exists "support_ticket_unread_events_own_read" on public.support_ticket_unread_events;
create policy "support_ticket_unread_events_own_read"
  on public.support_ticket_unread_events for select
  using (user_id = auth.uid());

grant select on public.support_ticket_unread_events to authenticated;
revoke insert, update, delete on public.support_ticket_unread_events from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_unread_events'
  ) then
    alter publication supabase_realtime add table public.support_ticket_unread_events;
  end if;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

comment on table public.support_ticket_unread_events is
  'One per-recipient unread event for ticket creation, notes, resolutions, and closure.';
