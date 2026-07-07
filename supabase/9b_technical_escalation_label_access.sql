-- STEP 9b: Technical inbox access via Technical Escalation label (not only escalation row)
-- Run after 9_technical_escalations.sql — safe to re-run

create or replace function public.conversation_is_technically_escalated(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_escalations e
    where e.conversation_id = p_conversation_id
      and e.status in ('pending', 'claimed')
  )
  or exists (
    select 1
    from public.conversation_inbox_labels cil
    join public.inbox_label_definitions d on d.id = cil.label_id
    where cil.conversation_id = p_conversation_id
      and d.preset_key = 'technical_escalation'
  );
$$;
