-- STEP 17: Allow multiple supporting images on support tickets
-- Run after 16_support_ticket_occurred_at.sql. Safe to re-run.

alter table public.support_tickets
  add column if not exists supporting_image_urls text[] not null default '{}'::text[];

-- Preserve evidence attached before the multi-image column was introduced.
update public.support_tickets
set supporting_image_urls = array[supporting_image_url]
where supporting_image_url is not null
  and cardinality(supporting_image_urls) = 0;

comment on column public.support_tickets.supporting_image_urls is
  'Supporting evidence images attached to the ticket.';
