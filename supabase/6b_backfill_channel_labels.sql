-- BACKFILL: tag existing customers with Website / Juwa App inbox labels
-- Run AFTER 6_channel_labels.sql
-- Safe to re-run (skips duplicates)

-- 1) Mark signup source on existing profiles
update public.profiles
set signup_source = 'juwa_app'
where role = 'customer'
  and deleted_at is null
  and game_user_id is not null
  and (signup_source is null or signup_source = '');

update public.profiles
set signup_source = 'website'
where role = 'customer'
  and deleted_at is null
  and (signup_source is null or signup_source = '')
  and game_user_id is null;

-- 2) Apply "Website" label to existing website customer threads
insert into public.conversation_inbox_labels (conversation_id, label_id)
select c.id, d.id
from public.conversations c
join public.profiles p on p.id = c.customer_id
join public.inbox_label_definitions d
  on d.business_id = c.business_id
  and d.preset_key = 'support_website'
where p.role = 'customer'
  and p.deleted_at is null
  and p.signup_source = 'website'
  and not exists (
    select 1 from public.conversation_inbox_labels cil
    where cil.conversation_id = c.id and cil.label_id = d.id
  );

-- 3) Apply "Juwa App" label to existing app-linked customer threads
insert into public.conversation_inbox_labels (conversation_id, label_id)
select c.id, d.id
from public.conversations c
join public.profiles p on p.id = c.customer_id
join public.inbox_label_definitions d
  on d.business_id = c.business_id
  and d.preset_key = 'support_juwa_app'
where p.role = 'customer'
  and p.deleted_at is null
  and p.signup_source = 'juwa_app'
  and not exists (
    select 1 from public.conversation_inbox_labels cil
    where cil.conversation_id = c.id and cil.label_id = d.id
  );
