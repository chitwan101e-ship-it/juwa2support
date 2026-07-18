-- STEP 20: Indexes for paginated ticket lists and unread badge counts
-- Run after 19_support_ticket_unread_events.sql. Safe to re-run.

-- Newest-first ticket pages per business (no status filter / "All tickets").
create index if not exists idx_support_tickets_business_created
  on public.support_tickets(business_id, created_at desc);

-- Juwa App "Ticket replies" pages filtered by source inbox.
create index if not exists idx_support_tickets_business_source_created
  on public.support_tickets(business_id, source_inbox, created_at desc);

-- Sidebar unread badge counts per staff member and view.
create index if not exists idx_support_ticket_unread_events_user_view_unread
  on public.support_ticket_unread_events(user_id, target_view)
  where read_at is null;
