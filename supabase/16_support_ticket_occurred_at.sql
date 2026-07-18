-- STEP 16: Add "when did it happen" info to support tickets
-- Run after 15_support_tickets.sql (for databases that already ran it). Safe to re-run.

alter table public.support_tickets
  add column if not exists occurred_at timestamptz;

comment on column public.support_tickets.occurred_at is
  'When the customer says the issue happened (entered by support at ticket creation).';
