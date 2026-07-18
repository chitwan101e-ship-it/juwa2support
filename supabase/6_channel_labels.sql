-- STEP 6: Website vs Juwa App inbox labels (safe to re-run)

-- Optional: track where the customer account originated
alter table public.profiles
  add column if not exists signup_source text;

comment on column public.profiles.signup_source is 'website | juwa_app — primary signup channel';

-- Preset labels for staff inbox filters
insert into public.inbox_label_definitions (business_id, name, color, is_system, preset_key)
select b.id, x.name, x.color, true, x.preset_key
from public.businesses b
cross join (
  values
    ('support_website', 'Website', '#0ea5e9'),
    ('support_juwa_app', 'Juwa App', '#a855f7')
) as x(preset_key, name, color)
where not exists (
  select 1 from public.inbox_label_definitions d
  where d.business_id = b.id and d.preset_key = x.preset_key
);

-- Keep new businesses in sync with channel labels
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
      ('support_juwa_app', 'Juwa App', '#a855f7')
  ) as x(preset_key, name, color)
  where not exists (
    select 1 from public.inbox_label_definitions d
    where d.business_id = new.id and d.preset_key = x.preset_key
  );
  return new;
end;
$$;
