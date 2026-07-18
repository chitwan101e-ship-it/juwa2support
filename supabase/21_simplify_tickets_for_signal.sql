-- STEP 21: Undo Support↔ Technical ticket handoff; keep simple Signal-ready tickets
-- Run after 20_support_ticket_performance.sql (or after 15–20 if those already ran).
-- Safe to re-run.
--
-- Removes: shared notes, unread events, claim/resolve/close workflow.
-- Keeps: ticket_number, username, occurred_at, issue, photos — for search + Signal paste.

-- 1) Drop handoff side tables
drop table if exists public.support_ticket_unread_events cascade;
drop table if exists public.support_ticket_notes cascade;

-- 2) Allow multiple tickets per conversation (Signal tracking, not a handoff queue)
drop index if exists public.support_tickets_one_active_per_conversation;

-- 3) Collapse old workflow statuses → open / closed
update public.support_tickets
set status = 'open'
where status in ('in_progress', 'awaiting_support');

alter table public.support_tickets
  drop constraint if exists support_tickets_status_check;

alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status in ('open', 'closed'));

-- 4) Drop resolution-required constraint from the handoff workflow
alter table public.support_tickets
  drop constraint if exists support_tickets_resolution_valid;

-- 5) Clear handoff fields (columns kept so older app builds do not break mid-deploy)
update public.support_tickets
set
  claimed_by = null,
  claimed_at = null,
  resolution_text = null,
  resolution_image_url = null,
  resolved_by = null,
  ready_at = null
where claimed_by is not null
   or resolution_text is not null
   or ready_at is not null;

-- 6) Search-friendly index on ticket number (prefix / exact look-ups)
create index if not exists idx_support_tickets_ticket_number_lower
  on public.support_tickets (business_id, lower(ticket_number));

create index if not exists idx_support_tickets_game_username_lower
  on public.support_tickets (business_id, lower(game_username));

comment on table public.support_tickets is
  'Simple support tickets for Signal handoff: number, username, when, issue, photos. Searchable; no technical claim/resolve queue.';
