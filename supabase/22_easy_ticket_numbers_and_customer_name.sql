-- STEP 22: Easy ticket numbers (J2-1, J2-2, …) + customer display name for Signal paste
-- Run after 21_simplify_tickets_for_signal.sql. Safe to re-run.

alter table public.support_tickets
  add column if not exists customer_name text;

comment on column public.support_tickets.customer_name is
  'Customer first + last name captured at ticket creation (for Signal paste).';

-- New tickets: short Juwa2 numbers — J2-1, J2-2, J2-3 …
create or replace function public.assign_support_ticket_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(trim(new.ticket_number), '') is null then
    new.ticket_number := 'J2-' || nextval('public.support_ticket_number_seq')::text;
  end if;
  return new;
end;
$$;

-- Backfill older TKT-YYYYMMDD-00000N rows to the same easy style (keeps the sequence digits).
update public.support_tickets
set ticket_number = 'J2-' || (regexp_match(ticket_number, '(\d+)$'))[1]::bigint::text
where ticket_number ~ '^TKT-'
  and regexp_match(ticket_number, '(\d+)$') is not null
  and not exists (
    select 1
    from public.support_tickets other
    where other.id <> support_tickets.id
      and other.ticket_number = 'J2-' || (regexp_match(support_tickets.ticket_number, '(\d+)$'))[1]::bigint::text
  );

create index if not exists idx_support_tickets_customer_name_lower
  on public.support_tickets (business_id, lower(customer_name));
