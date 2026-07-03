-- STEP 7: Auto "Unread" inbox label for threads with unread customer messages
-- Run after 6_channel_labels.sql — safe to re-run

-- 1) Preset label for every business
insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
select b.id, x.name, x.color, true, x.preset_key
from public.businesses b
cross join (
  values ('unread', 'Unread', '#ef4444')
) as x(preset_key, name, color)
where not exists (
  select 1 from public.inbox_label_definitions d
  where d.business_id = b.id and d.preset_key = x.preset_key
);

-- 2) Keep new businesses in sync (includes channel + unread presets)
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
      ('unread', 'Unread', '#ef4444')
  ) as x(preset_key, name, color)
  where not exists (
    select 1 from public.inbox_label_definitions d
    where d.business_id = new.id and d.preset_key = x.preset_key
  );
  return new;
end;
$$;

-- 3) Sync unread label on a single conversation
create or replace function public.sync_conversation_unread_label(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_customer_id uuid;
  v_label_id uuid;
  v_has_unread boolean;
begin
  select c.business_id, c.customer_id
  into v_business_id, v_customer_id
  from public.conversations c
  where c.id = p_conversation_id;

  if v_business_id is null or v_customer_id is null then
    return;
  end if;

  select d.id into v_label_id
  from public.inbox_label_definitions d
  where d.business_id = v_business_id
    and d.preset_key = 'unread';

  if v_label_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.sender_id = v_customer_id
      and m.read is distinct from true
  ) into v_has_unread;

  if v_has_unread then
    insert into public.conversation_inbox_labels (conversation_id, label_id)
    values (p_conversation_id, v_label_id)
    on conflict (conversation_id, label_id) do nothing;
  else
    delete from public.conversation_inbox_labels
    where conversation_id = p_conversation_id
      and label_id = v_label_id;
  end if;
end;
$$;

revoke all on function public.sync_conversation_unread_label(uuid) from public;
grant execute on function public.sync_conversation_unread_label(uuid) to authenticated;

-- 4) Triggers on customer message insert / read status change
create or replace function public.messages_sync_unread_label()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_conversation_id uuid;
begin
  v_conversation_id := coalesce(new.conversation_id, old.conversation_id);

  select c.customer_id into v_customer_id
  from public.conversations c
  where c.id = v_conversation_id;

  if v_customer_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.sender_id = v_customer_id then
      perform public.sync_conversation_unread_label(new.conversation_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(new.sender_id, old.sender_id) = v_customer_id
       and (old.read is distinct from new.read) then
      perform public.sync_conversation_unread_label(new.conversation_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists messages_sync_unread_label_after_insert on public.messages;
create trigger messages_sync_unread_label_after_insert
  after insert on public.messages
  for each row execute function public.messages_sync_unread_label();

drop trigger if exists messages_sync_unread_label_after_update on public.messages;
create trigger messages_sync_unread_label_after_update
  after update of read on public.messages
  for each row execute function public.messages_sync_unread_label();

-- 5) Backfill unread label on existing threads with unread customer messages
insert into public.conversation_inbox_labels (conversation_id, label_id)
select distinct c.id, d.id
from public.conversations c
join public.messages m
  on m.conversation_id = c.id
  and m.sender_id = c.customer_id
  and m.read is distinct from true
join public.inbox_label_definitions d
  on d.business_id = c.business_id
  and d.preset_key = 'unread'
where not exists (
  select 1 from public.conversation_inbox_labels cil
  where cil.conversation_id = c.id and cil.label_id = d.id
);
