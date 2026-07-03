-- STEP 8: Staff inbox assignment (Website / Juwa App / Both)
-- Run after 6_channel_labels.sql — safe to re-run

do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'support_inbox_scope') then
    create type public.support_inbox_scope as enum ('both', 'website', 'app');
  end if;
end
$enum$;

alter table public.profiles
  add column if not exists support_inbox_scope public.support_inbox_scope;

comment on column public.profiles.support_inbox_scope is
  'Support agents only: both | website | app. Admins always see all inboxes (null).';

update public.profiles
set support_inbox_scope = 'both'
where business_role = 'support'
  and support_inbox_scope is null;

alter table public.profiles drop constraint if exists profiles_support_scope_for_support;
alter table public.profiles add constraint profiles_support_scope_for_support
  check (
    business_role <> 'support'
    or support_inbox_scope is not null
  );

-- Effective scope: admins -> both; support -> assigned scope
create or replace function public.effective_support_inbox_scope(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.business_role = 'admin' then 'both'
    when p.business_role = 'support' then coalesce(p.support_inbox_scope::text, 'both')
    else null
  end
  from public.profiles p
  where p.id = p_user_id;
$$;

revoke all on function public.effective_support_inbox_scope(uuid) from public;
grant execute on function public.effective_support_inbox_scope(uuid) to authenticated;

-- Resolve conversation channel from inbox labels, then customer profile
create or replace function public.conversation_support_channel(p_conversation_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_channel text;
begin
  if exists (
    select 1
    from public.conversation_inbox_labels cil
    join public.inbox_label_definitions d on d.id = cil.label_id
    where cil.conversation_id = p_conversation_id
      and d.preset_key = 'support_juwa_app'
  ) then
    return 'app';
  end if;

  if exists (
    select 1
    from public.conversation_inbox_labels cil
    join public.inbox_label_definitions d on d.id = cil.label_id
    where cil.conversation_id = p_conversation_id
      and d.preset_key = 'support_website'
  ) then
    return 'website';
  end if;

  select c.customer_id into v_customer_id
  from public.conversations c
  where c.id = p_conversation_id;

  if v_customer_id is null then
    return 'website';
  end if;

  select case
    when p.signup_source = 'juwa_app' or p.game_user_id is not null then 'app'
    else 'website'
  end into v_channel
  from public.profiles p
  where p.id = v_customer_id;

  return coalesce(v_channel, 'website');
end;
$$;

revoke all on function public.conversation_support_channel(uuid) from public;
grant execute on function public.conversation_support_channel(uuid) to authenticated;

create or replace function public.staff_can_access_conversation(p_conversation_id uuid, p_staff_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope text;
  v_channel text;
begin
  select public.effective_support_inbox_scope(p_staff_id) into v_scope;
  if v_scope is null or v_scope = 'both' then
    return true;
  end if;

  select public.conversation_support_channel(p_conversation_id) into v_channel;
  return v_channel = v_scope;
end;
$$;

revoke all on function public.staff_can_access_conversation(uuid, uuid) from public;
grant execute on function public.staff_can_access_conversation(uuid, uuid) to authenticated;

-- Scope-limited conversation access for support agents
drop policy if exists "convo_business" on public.conversations;
create policy "convo_business"
  on public.conversations for select
  using (
    public.is_business_member(business_id)
    and public.staff_can_access_conversation(id, auth.uid())
  );

drop policy if exists "msg_read" on public.messages;
create policy "msg_read"
  on public.messages for select
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          c.customer_id = auth.uid()
          or (
            public.is_business_member(c.business_id)
            and public.staff_can_access_conversation(c.id, auth.uid())
          )
        )
    )
  );

drop policy if exists "msg_update_business_member" on public.messages;
create policy "msg_update_business_member"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_business_member(c.business_id)
        and public.staff_can_access_conversation(c.id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_business_member(c.business_id)
        and public.staff_can_access_conversation(c.id, auth.uid())
    )
  );
