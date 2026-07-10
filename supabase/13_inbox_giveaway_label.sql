-- STEP 13: Giveaway inbox label (auto-applied + visible to technical staff)
-- Run after 9b_technical_escalation_label_access.sql — safe to re-run

-- 1) Preset label for every business
insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
select b.id, x.name, x.color, true, x.preset_key
from public.businesses b
cross join (
  values ('giveaway', 'Giveaway', '#ec4899')
) as x(preset_key, name, color)
where not exists (
  select 1 from public.inbox_label_definitions d
  where d.business_id = b.id and d.preset_key = x.preset_key
);

-- 2) Keep new businesses in sync
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
      ('active_player', 'Active player', '#16a34a'),
      ('support_website', 'Website', '#0ea5e9'),
      ('support_juwa_app', 'Juwa App', '#a855f7'),
      ('unread', 'Unread', '#ef4444'),
      ('technical_escalation', 'Technical Escalation', '#f97316'),
      ('giveaway', 'Giveaway', '#ec4899')
  ) as x(preset_key, name, color)
  where not exists (
    select 1 from public.inbox_label_definitions d
    where d.business_id = new.id and d.preset_key = x.preset_key
  );
  return new;
end;
$$;

-- 3) Detect giveaway-related message text
create or replace function public.message_body_matches_giveaway(p_body text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    lower(coalesce(p_body, '')) ~* '(give\s*away|giveaway|giveaway\s+winner|won the giveaway|enter(ed)?\s+(the\s+)?giveaway|free\s+giveaway|giveaway\s+entry|sweepstakes|raffle)',
    false
  );
$$;

-- 4) Auto-assign Giveaway label on matching messages (sticky once applied)
create or replace function public.messages_assign_giveaway_label()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_label_id uuid;
begin
  if not public.message_body_matches_giveaway(new.body) then
    return new;
  end if;

  select c.business_id into v_business_id
  from public.conversations c
  where c.id = new.conversation_id;

  if v_business_id is null then
    return new;
  end if;

  select d.id into v_label_id
  from public.inbox_label_definitions d
  where d.business_id = v_business_id
    and d.preset_key = 'giveaway';

  if v_label_id is null then
    return new;
  end if;

  insert into public.conversation_inbox_labels (conversation_id, label_id)
  values (new.conversation_id, v_label_id)
  on conflict (conversation_id, label_id) do nothing;

  return new;
end;
$$;

drop trigger if exists messages_assign_giveaway_label_after_insert on public.messages;
create trigger messages_assign_giveaway_label_after_insert
  after insert on public.messages
  for each row execute function public.messages_assign_giveaway_label();

-- 5) Technical staff can access giveaway-tagged threads (same gate as technical escalation)
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
      and d.preset_key in ('technical_escalation', 'giveaway')
  );
$$;

-- 6) Backfill existing threads with giveaway-related customer messages
insert into public.conversation_inbox_labels (conversation_id, label_id)
select distinct m.conversation_id, d.id
from public.messages m
join public.conversations c on c.id = m.conversation_id
join public.inbox_label_definitions d
  on d.business_id = c.business_id
  and d.preset_key = 'giveaway'
where public.message_body_matches_giveaway(m.body)
  and not exists (
    select 1 from public.conversation_inbox_labels cil
    where cil.conversation_id = m.conversation_id and cil.label_id = d.id
  );
