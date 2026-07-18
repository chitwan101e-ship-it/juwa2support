-- STEP 18: Make ticket notes a shared support <-> technical discussion
-- Run after 17_support_ticket_multiple_images.sql. Safe to re-run.

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

-- Live updates so both teams see new notes without refreshing.
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
