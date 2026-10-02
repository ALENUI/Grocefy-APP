-- Activity log for collaborative auditability, and list duplication for recurring shopping.

create type public.activity_action as enum (
  'LIST_CREATED', 'LIST_ARCHIVED', 'ITEM_ADDED', 'ITEM_EDITED', 'ITEM_REMOVED', 'ITEM_PURCHASED',
  'MEMBER_ADDED', 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED'
);

-- Written only by triggers. `subject` snapshots the product or member name so entries stay readable after renames.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null, -- null for system actions (jobs, seed)
  action public.activity_action not null,
  list_id uuid references public.shopping_lists(id),
  group_id uuid references public.shopping_groups(id),
  subject text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (list_id is not null or group_id is not null)
);
create index on public.activity_log (list_id, created_at desc) where list_id is not null;
create index on public.activity_log (group_id, created_at desc) where group_id is not null;

alter table public.activity_log enable row level security;
-- List events follow list access; group membership events are visible to the group's members.
create policy "activity: resource members view" on public.activity_log for select to authenticated using (
  (list_id is not null and public.can_view_list(list_id)) or (list_id is null and public.get_group_role(group_id) is not null));
revoke insert, update, delete, truncate on public.activity_log from anon, authenticated;

create function public.log_activity(action public.activity_action, list_id uuid, group_id uuid, subject text, metadata jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (actor_id, action, list_id, group_id, subject, metadata)
  values ((select id from public.profiles where id = auth.uid()), action, list_id, group_id, subject, coalesce(metadata, '{}'))
$$;
revoke execute on function public.log_activity(public.activity_action, uuid, uuid, text, jsonb) from public, anon, authenticated;

create function public.product_name(product_id uuid) returns text language sql stable security definer set search_path = public as $$
  select name from public.products where id = product_id
$$;
revoke execute on function public.product_name(uuid) from public, anon, authenticated;

create function public.username_of(user_id uuid) returns text language sql stable security definer set search_path = public as $$
  select username from public.profiles where id = user_id
$$;
revoke execute on function public.username_of(uuid) from public, anon, authenticated;

create function public.track_list_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('LIST_CREATED', new.id, new.group_id, new.name, jsonb_build_object('currency_code', new.currency_code));
  elsif old.archived_at is null and new.archived_at is not null then
    perform public.log_activity('LIST_ARCHIVED', new.id, new.group_id, new.name);
  end if;
  return null;
end $$;
create trigger shopping_lists_activity after insert or update on public.shopping_lists for each row execute function public.track_list_activity();

-- Purchases are logged from the purchases table; the status flip on the item itself is not an edit.
create function public.track_item_activity() returns trigger language plpgsql security definer set search_path = public as $$
declare list public.shopping_lists;
begin
  select * into list from public.shopping_lists where id = coalesce(new.list_id, old.list_id);
  if tg_op = 'INSERT' then
    perform public.log_activity('ITEM_ADDED', list.id, list.group_id, public.product_name(new.product_id),
      jsonb_build_object('quantity', new.quantity, 'budgeted_total', new.budgeted_total, 'currency_code', list.currency_code));
  elsif tg_op = 'DELETE' then
    perform public.log_activity('ITEM_REMOVED', list.id, list.group_id, public.product_name(old.product_id),
      jsonb_build_object('budgeted_total', old.budgeted_total, 'currency_code', list.currency_code));
  elsif new.status = old.status and (new.quantity, new.budgeted_unit_price, new.category_id) is distinct from (old.quantity, old.budgeted_unit_price, old.category_id) then
    perform public.log_activity('ITEM_EDITED', list.id, list.group_id, public.product_name(new.product_id),
      jsonb_build_object('previous_budgeted_total', old.budgeted_total, 'budgeted_total', new.budgeted_total, 'currency_code', list.currency_code));
  end if;
  return null;
end $$;
create trigger list_items_activity after insert or update or delete on public.list_items for each row execute function public.track_item_activity();

create function public.track_purchase_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity('ITEM_PURCHASED', new.list_id, new.group_id, public.product_name(new.product_id),
    jsonb_build_object('purchased_amount', new.purchased_amount, 'budgeted_amount', new.budgeted_amount, 'currency_code', new.currency_code));
  return null;
end $$;
create trigger purchases_activity after insert on public.purchases for each row execute function public.track_purchase_activity();

-- Membership changes: list_members and group_members have different key columns, so each gets its own trigger.
create function public.track_list_membership_activity() returns trigger language plpgsql security definer set search_path = public as $$
declare member uuid := coalesce(new.user_id, old.user_id); target uuid := coalesce(new.list_id, old.list_id);
begin
  if tg_op = 'INSERT' then perform public.log_activity('MEMBER_ADDED', target, null, public.username_of(member), jsonb_build_object('role', new.role));
  elsif tg_op = 'DELETE' then perform public.log_activity('MEMBER_REMOVED', target, null, public.username_of(member), jsonb_build_object('role', old.role));
  elsif new.role <> old.role then perform public.log_activity('MEMBER_ROLE_CHANGED', target, null, public.username_of(member), jsonb_build_object('previous_role', old.role, 'role', new.role));
  end if;
  return null;
end $$;
create function public.track_group_membership_activity() returns trigger language plpgsql security definer set search_path = public as $$
declare member uuid := coalesce(new.user_id, old.user_id); target uuid := coalesce(new.group_id, old.group_id);
begin
  if tg_op = 'INSERT' then perform public.log_activity('MEMBER_ADDED', null, target, public.username_of(member), jsonb_build_object('role', new.role));
  elsif tg_op = 'DELETE' then perform public.log_activity('MEMBER_REMOVED', null, target, public.username_of(member), jsonb_build_object('role', old.role));
  elsif new.role <> old.role then perform public.log_activity('MEMBER_ROLE_CHANGED', null, target, public.username_of(member), jsonb_build_object('previous_role', old.role, 'role', new.role));
  end if;
  return null;
end $$;
create trigger list_members_activity after insert or update or delete on public.list_members for each row execute function public.track_list_membership_activity();
create trigger group_members_activity after insert or update or delete on public.group_members for each row execute function public.track_group_membership_activity();

-- Live activity feeds.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log') then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end $$;

-- Copies a list (e.g. last week's groceries) into a new list owned by the caller, with every item pending again.
-- Runs with the caller's RLS. Each item's budget becomes the latest price the caller can see for that product in
-- the list's currency, falling back to the original budget; prices in other currencies are never used. The copy
-- stays in the source group only if the caller may create lists there.
create function public.duplicate_list(source_list_id uuid, new_name text default null)
returns public.shopping_lists language plpgsql set search_path = public as $$
declare
  source public.shopping_lists;
  result public.shopping_lists;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into source from public.shopping_lists where id = source_list_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if nullif(trim(coalesce(new_name, '')), '') is null then new_name := source.name || ' (copy)'; end if;

  insert into public.shopping_lists (owner_id, group_id, name, description, category_id, currency_code)
  values (auth.uid(),
    case when source.group_id is not null and coalesce(public.get_group_role(source.group_id) in ('owner', 'partner'), false) then source.group_id end,
    trim(new_name), source.description, source.category_id, source.currency_code)
  returning * into result;

  insert into public.list_items (list_id, product_id, category_id, quantity, unit, budgeted_unit_price, notes, created_by)
  select result.id, i.product_id, i.category_id, i.quantity, i.unit,
    coalesce((select ph.price from public.price_history ph where ph.product_id = i.product_id and ph.currency_code = source.currency_code
              order by ph.purchased_at desc, ph.created_at desc limit 1), i.budgeted_unit_price),
    i.notes, auth.uid()
  from public.list_items i where i.list_id = source.id and i.status <> 'archived'
  order by i.created_at;
  return result;
end $$;
revoke execute on function public.duplicate_list(uuid, text) from public, anon;
grant execute on function public.duplicate_list(uuid, text) to authenticated;
