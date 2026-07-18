-- STEP 9: Technical escalations (support → technical handoff)
-- Run after 8_staff_inbox_scope.sql — safe to re-run
--
-- IMPORTANT: Run 9a_technical_role_enum.sql FIRST (alone), wait for success, then run this file.
-- PostgreSQL cannot add and use a new enum value in the same transaction.

-- 1) Internal staff-only messages
alter table public.messages
  add column if not exists is_internal boolean not null default false;

comment on column public.messages.is_internal is
  'When true, visible to staff only — hidden from customers.';

-- 3) Escalation tracking
create table if not exists public.conversation_escalations (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade,
  escalated_by    uuid not null references public.profiles(id) on delete set null,
  reason          text not null,
  status          text not null default 'pending'
    check (status in ('pending', 'claimed', 'resolved')),
  claimed_by      uuid references public.profiles(id) on delete set null,
  resolved_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  resolved_at     timestamptz,
  constraint conversation_escalations_reason_nonempty
    check (char_length(trim(reason)) between 1 and 2000)
);

create index if not exists idx_conversation_escalations_business
  on public.conversation_escalations(business_id);

create index if not exists idx_conversation_escalations_conversation
  on public.conversation_escalations(conversation_id);

create unique index if not exists conversation_escalations_one_active
  on public.conversation_escalations(conversation_id)
  where status in ('pending', 'claimed');

-- 4) System label for technical queue
insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
select b.id, x.name, x.color, true, x.preset_key
from public.businesses b
cross join (
  values ('technical_escalation', 'Technical Escalation', '#f97316')
) as x(preset_key, name, color)
where not exists (
  select 1 from public.inbox_label_definitions d
  where d.business_id = b.id and d.preset_key = x.preset_key
);

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
      ('technical_escalation', 'Technical Escalation', '#f97316')
  ) as x(preset_key, name, color)
  where not exists (
    select 1 from public.inbox_label_definitions d
    where d.business_id = new.id and d.preset_key = x.preset_key
  );
  return new;
end;
$$;

-- 5) Staff inbox scope: technical staff have no channel inbox
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

-- 6) Conversation access: technical staff see escalated threads only
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
  );
$$;

revoke all on function public.conversation_is_technically_escalated(uuid) from public;
grant execute on function public.conversation_is_technically_escalated(uuid) to authenticated;

create or replace function public.staff_can_access_conversation(p_conversation_id uuid, p_staff_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.business_role;
  v_scope text;
  v_channel text;
begin
  select p.business_role into v_role
  from public.profiles p
  where p.id = p_staff_id;

  if v_role is null then
    return false;
  end if;

  if v_role = 'technical' then
    return public.conversation_is_technically_escalated(p_conversation_id);
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  select public.effective_support_inbox_scope(p_staff_id) into v_scope;
  if v_scope is null or v_scope = 'both' then
    return true;
  end if;

  select public.conversation_support_channel(p_conversation_id) into v_channel;
  return v_channel = v_scope;
end;
$$;

-- 7) Messages: customers cannot read internal notes
drop policy if exists "msg_read" on public.messages;
create policy "msg_read"
  on public.messages for select
  using (
    (
      coalesce(is_internal, false) = true
      and exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and public.is_business_member(c.business_id)
          and public.staff_can_access_conversation(c.id, auth.uid())
      )
    )
    or (
      coalesce(is_internal, false) = false
      and (
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
      )
    )
  );

-- 8) Escalation table RLS
alter table public.conversation_escalations enable row level security;

drop policy if exists "escalations_select" on public.conversation_escalations;
create policy "escalations_select"
  on public.conversation_escalations for select
  using (public.is_business_member(business_id));

drop policy if exists "escalations_insert" on public.conversation_escalations;
create policy "escalations_insert"
  on public.conversation_escalations for insert
  with check (
    public.is_business_member(business_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.business_id = business_id
        and p.business_role in ('admin', 'support')
    )
  );

drop policy if exists "escalations_update" on public.conversation_escalations;
create policy "escalations_update"
  on public.conversation_escalations for update
  using (
    public.is_business_member(business_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.business_id = business_id
        and p.business_role in ('admin', 'technical')
    )
  )
  with check (
    public.is_business_member(business_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.business_id = business_id
        and p.business_role in ('admin', 'technical')
    )
  );

-- 9) Realtime for escalation queue updates
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_escalations'
  ) then
    return;
  end if;
  alter publication supabase_realtime add table public.conversation_escalations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
