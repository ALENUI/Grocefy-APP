-- Hardens the Grocefy foundation: role-aware RLS, a client-proof purchase transaction, immutable financial
-- history, soft deletion, price suggestions, and aggregate totals. The policies from the foundation migration are
-- replaced wholesale so every access rule lives in one place.

-- Reference data is part of the schema: signups default to XAF, so the registry must exist before any user does.
insert into public.currencies (code, name, symbol, decimal_digits) values
  ('USD', 'US Dollar', '$', 2), ('EUR', 'Euro', '€', 2), ('GBP', 'British Pound', '£', 2),
  ('XAF', 'Central African CFA Franc', 'FCFA', 0), ('NGN', 'Nigerian Naira', '₦', 2),
  ('GHS', 'Ghanaian Cedi', 'GH₵', 2), ('KES', 'Kenyan Shilling', 'KSh', 2), ('ZAR', 'South African Rand', 'R', 2),
  ('CAD', 'Canadian Dollar', 'CA$', 2), ('AUD', 'Australian Dollar', 'A$', 2), ('JPY', 'Japanese Yen', '¥', 0)
on conflict (code) do update set name = excluded.name, symbol = excluded.symbol, decimal_digits = excluded.decimal_digits;
insert into public.categories (name, is_default) values
  ('Food Stuffs', true), ('Kitchen', true), ('Bathroom', true), ('Cleaning', true), ('Home Appliances', true),
  ('Electronics', true), ('Office Supplies', true), ('Clothing', true), ('Personal Care', true), ('Household', true), ('Other', true)
on conflict (name, user_id) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- Remove the foundation policies and helpers. The old helpers returned NULL for non-members, which let
-- `if not can_purchase_list_item(...)` pass for any authenticated user.
do $$
declare policy record;
begin
  for policy in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', policy.policyname, policy.tablename);
  end loop;
end $$;
drop trigger lists_financial_identity on public.shopping_lists;
drop function public.protect_list_financial_identity();
drop function public.purchase_list_item(uuid, numeric);
drop function public.can_purchase_list_item(uuid);
drop function public.can_edit_list(uuid);
drop function public.can_view_list(uuid);
drop function public.get_list_role(uuid, uuid);
drop function public.get_group_role(uuid, uuid);

-- ---------------------------------------------------------------------------------------------------------------
-- Schema adjustments
alter table public.profiles drop column default_currency; -- user_settings is the single source of the default currency
alter table public.profiles add constraint profiles_username_format check (username ~ '^[A-Za-z0-9_.]{3,32}$');
create unique index profiles_username_lower_key on public.profiles (lower(username));

alter table public.categories add column archived_at timestamptz;
create unique index products_owner_name_lower_key on public.products (owner_id, lower(name));

-- Kept consistent with quantity × unit price by construction.
alter table public.list_items add column budgeted_total numeric(19,4) generated always as (round(quantity * budgeted_unit_price, 4)) stored;

-- Ownership is expressed by owner_id on the resource; membership rows only carry delegated roles.
alter table public.group_members add constraint group_members_role_not_owner check (role <> 'owner');
alter table public.list_members add constraint list_members_role_not_owner check (role <> 'owner');

create extension if not exists pg_trgm with schema extensions;
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index on public.group_members (user_id);
create index on public.list_members (user_id);
create index on public.list_items (category_id);
create index on public.shopping_lists (category_id);
create index on public.purchases (list_id, purchased_at desc);
create index on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- Permission helpers. Group and list owners are resolved from owner_id; everyone else from accepted membership.
-- A list-level membership overrides the role inherited from the list's group. Every can_* helper returns a
-- non-null boolean so it is safe in both RLS policies and PL/pgSQL conditions.
create function public.get_group_role(target_group_id uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select case when g.owner_id = auth.uid() then 'owner'::public.member_role else (
    select m.role from public.group_members m where m.group_id = g.id and m.user_id = auth.uid() and m.status = 'accepted') end
  from public.shopping_groups g where g.id = target_group_id
$$;

create function public.get_list_role(target_list_id uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select case when l.owner_id = auth.uid() then 'owner'::public.member_role else coalesce(
    (select m.role from public.list_members m where m.list_id = l.id and m.user_id = auth.uid() and m.status = 'accepted'),
    public.get_group_role(l.group_id)) end
  from public.shopping_lists l where l.id = target_list_id
$$;

create function public.can_view_list(target_list_id uuid) returns boolean language sql stable set search_path = public as $$
  select public.get_list_role(target_list_id) is not null
$$;
create function public.can_edit_list(target_list_id uuid) returns boolean language sql stable set search_path = public as $$
  select coalesce(public.get_list_role(target_list_id) in ('owner', 'partner', 'editor'), false)
$$;
create function public.can_purchase_list(target_list_id uuid) returns boolean language sql stable set search_path = public as $$
  select coalesce(public.get_list_role(target_list_id) in ('owner', 'partner'), false)
$$;
create function public.can_manage_list(target_list_id uuid) returns boolean language sql stable set search_path = public as $$
  select coalesce(public.get_list_role(target_list_id) = 'owner', false)
$$;

-- Trigger guards apply only to requests made through the API roles; trusted SECURITY DEFINER functions
-- (such as purchase_list_item) run as the function owner and are allowed to perform the guarded changes.
create function public.is_client_request() returns boolean language sql stable as $$
  select current_user in ('anon', 'authenticated')
$$;

create function public.require_active_currency(code text) returns void language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.currencies c where c.code = require_active_currency.code and c.is_active) then
    raise exception 'INVALID_CURRENCY';
  end if;
end $$;

create function public.is_username_available(candidate text) returns boolean
language sql stable security definer set search_path = public as $$
  select candidate ~ '^[A-Za-z0-9_.]{3,32}$' and not exists (select 1 from public.profiles where lower(username) = lower(candidate))
$$;

-- Profiles are visible to people who share a group or list with their owner.
create function public.shares_resource_with(other_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from (
      select id from public.shopping_groups where owner_id = other_user
      union select group_id from public.group_members where user_id = other_user and status = 'accepted'
    ) their_groups where public.get_group_role(their_groups.id) is not null
  ) or exists (
    select 1 from (
      select id from public.shopping_lists where owner_id = other_user
      union select list_id from public.list_members where user_id = other_user and status = 'accepted'
    ) their_lists where public.get_list_role(their_lists.id) is not null
  )
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Signup: profile and settings are created from the metadata sent by the app.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_currency text := upper(new.raw_user_meta_data ->> 'default_currency');
  chosen_username text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), 'user_' || substr(new.id::text, 1, 8));
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, chosen_username, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), chosen_username));
  insert into public.user_settings (user_id, default_currency)
  values (new.id, case when exists (select 1 from public.currencies where code = requested_currency and is_active) then requested_currency else 'XAF' end);
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Integrity guards
create function public.guard_user_settings() returns trigger language plpgsql set search_path = public as $$
begin
  if new.default_currency is distinct from old.default_currency then perform public.require_active_currency(new.default_currency); end if;
  return new;
end $$;
create trigger user_settings_guard before update on public.user_settings for each row execute function public.guard_user_settings();

create function public.guard_shopping_group() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then raise exception 'OWNER_IMMUTABLE'; end if;
  if tg_op = 'INSERT' or new.currency_code <> old.currency_code then perform public.require_active_currency(new.currency_code); end if;
  return new;
end $$;
create trigger shopping_groups_guard before insert or update on public.shopping_groups for each row execute function public.guard_shopping_group();

-- A list's currency defines the meaning of every amount on it, so it is locked once the list has items.
-- Moving, archiving, and re-currencying a list are owner decisions; editors may only rename and describe it.
create function public.guard_shopping_list() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.require_active_currency(new.currency_code);
  else
    if new.owner_id <> old.owner_id then raise exception 'OWNER_IMMUTABLE'; end if;
    if public.is_client_request() and not public.can_manage_list(old.id) and (new.group_id is distinct from old.group_id
        or new.archived_at is distinct from old.archived_at or new.currency_code <> old.currency_code) then
      raise exception 'FORBIDDEN';
    end if;
    if new.currency_code <> old.currency_code then
      perform public.require_active_currency(new.currency_code);
      if exists (select 1 from public.list_items where list_id = old.id) then raise exception 'CURRENCY_LOCKED'; end if;
    end if;
  end if;
  if public.is_client_request() and new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id)
      and not coalesce(public.get_group_role(new.group_id) in ('owner', 'partner'), false) then
    raise exception 'FORBIDDEN';
  end if;
  -- Runs with the caller's RLS, so only categories the caller can see may be attached.
  if public.is_client_request() and new.category_id is not null and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
      and not exists (select 1 from public.categories where id = new.category_id) then
    raise exception 'NOT_FOUND';
  end if;
  return new;
end $$;
create trigger shopping_lists_guard before insert or update on public.shopping_lists for each row execute function public.guard_shopping_list();

-- Purchase state can only be set by purchase_list_item, and purchased items are frozen.
create function public.guard_list_item() returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_client_request() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.purchased_at := null;
    new.created_by := auth.uid();
    if exists (select 1 from public.shopping_lists where id = new.list_id and archived_at is not null) then raise exception 'LIST_ARCHIVED'; end if;
  else
    if old.status = 'purchased' then raise exception 'ALREADY_PURCHASED'; end if;
    if new.status = 'purchased' or new.purchased_at is distinct from old.purchased_at then raise exception 'FORBIDDEN'; end if;
    if new.list_id <> old.list_id or new.created_by <> old.created_by then raise exception 'FORBIDDEN'; end if;
  end if;
  -- These lookups run with the caller's RLS: products and categories must be visible to the caller.
  if (tg_op = 'INSERT' or new.product_id <> old.product_id) and not exists (select 1 from public.products where id = new.product_id) then
    raise exception 'NOT_FOUND';
  end if;
  if new.category_id is not null and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
      and not exists (select 1 from public.categories where id = new.category_id) then
    raise exception 'NOT_FOUND';
  end if;
  return new;
end $$;
create trigger list_items_guard before insert or update on public.list_items for each row execute function public.guard_list_item();

-- Only the role and status of a membership may change; who and what it refers to is fixed.
create function public.guard_group_membership() returns trigger language plpgsql as $$
begin
  if new.group_id <> old.group_id or new.user_id <> old.user_id or new.invited_by is distinct from old.invited_by then raise exception 'FORBIDDEN'; end if;
  return new;
end $$;
create function public.guard_list_membership() returns trigger language plpgsql as $$
begin
  if new.list_id <> old.list_id or new.user_id <> old.user_id or new.invited_by is distinct from old.invited_by then raise exception 'FORBIDDEN'; end if;
  return new;
end $$;
create trigger group_members_guard before update on public.group_members for each row execute function public.guard_group_membership();
create trigger list_members_guard before update on public.list_members for each row execute function public.guard_list_membership();
create trigger group_members_updated before update on public.group_members for each row execute function public.set_updated_at();
create trigger list_members_updated before update on public.list_members for each row execute function public.set_updated_at();

-- Purchases and price history are historical financial records. Corrections must be modelled as explicit
-- adjustments, never as rewrites; this applies to every role, including the service role.
create function public.reject_financial_rewrite() returns trigger language plpgsql as $$
begin
  raise exception 'FINANCIAL_RECORD_IMMUTABLE';
end $$;
create trigger purchases_immutable before update or delete on public.purchases for each row execute function public.reject_financial_rewrite();
create trigger price_history_immutable before update or delete on public.price_history for each row execute function public.reject_financial_rewrite();

-- ---------------------------------------------------------------------------------------------------------------
-- Atomic, permission-checked purchase finalization. The client supplies only the item and the amount paid; the
-- purchaser, currency, budget snapshot, and timestamps are derived from the database.
create function public.purchase_list_item(target_item_id uuid, actual_amount numeric default null, use_budgeted_amount boolean default false)
returns public.purchases language plpgsql security definer set search_path = public as $$
declare
  item public.list_items;
  list public.shopping_lists;
  paid numeric(19,4);
  result public.purchases;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into item from public.list_items where id = target_item_id for update;
  if not found or not public.can_view_list(item.list_id) then raise exception 'NOT_FOUND'; end if;
  if not public.can_purchase_list(item.list_id) then raise exception 'FORBIDDEN'; end if;
  if item.status = 'purchased' then raise exception 'ALREADY_PURCHASED'; end if;
  if item.status = 'archived' then raise exception 'VALIDATION_ERROR'; end if;
  select * into list from public.shopping_lists where id = item.list_id;
  if list.archived_at is not null then raise exception 'LIST_ARCHIVED'; end if;

  paid := case when use_budgeted_amount then item.budgeted_total else actual_amount end;
  if paid is null or paid < 0 then raise exception 'VALIDATION_ERROR'; end if;

  insert into public.purchases (list_item_id, product_id, list_id, group_id, user_id, category_id, quantity, budgeted_amount, purchased_amount, currency_code)
  values (item.id, item.product_id, item.list_id, list.group_id, auth.uid(), item.category_id, item.quantity, item.budgeted_total, paid, list.currency_code)
  returning * into result;
  insert into public.price_history (product_id, user_id, price, currency_code, purchased_at, purchase_id)
  values (item.product_id, auth.uid(), round(paid / item.quantity, 4), list.currency_code, result.purchased_at, result.id);
  update public.list_items set status = 'purchased', purchased_at = result.purchased_at where id = item.id;
  return result;
end $$;

-- Latest known unit price for a product, plus the latest one in the requested currency. Prices in another
-- currency are returned for display only and are never offered as a suggestion (no silent conversion).
create function public.get_price_suggestion(target_product_id uuid, target_currency_code text)
returns table (latest_unit_price numeric, latest_currency_code text, latest_purchased_at timestamptz, suggested_unit_price numeric, suggested_purchased_at timestamptz)
language sql stable set search_path = public as $$
  with visible as (
    select price, currency_code, purchased_at, created_at from public.price_history where product_id = target_product_id
  ), latest as (
    select * from visible order by purchased_at desc, created_at desc limit 1
  ), same_currency as (
    select * from visible where currency_code = upper(target_currency_code) order by purchased_at desc, created_at desc limit 1
  )
  select latest.price, latest.currency_code, latest.purchased_at, same_currency.price, same_currency.purchased_at
  from latest left join same_currency on true
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Aggregates are computed from source records with the caller's RLS. Totals are always per currency.
create view public.list_totals with (security_invoker = true) as
select l.id as list_id, l.group_id, l.currency_code, l.archived_at,
  coalesce(sum(i.budgeted_total) filter (where i.status <> 'archived'), 0)::numeric(19,4) as budgeted_total,
  coalesce(sum(p.purchased_amount), 0)::numeric(19,4) as purchased_total,
  coalesce(sum(p.budgeted_amount), 0)::numeric(19,4) as purchased_budgeted_total,
  count(i.id) filter (where i.status <> 'archived') as item_count,
  count(i.id) filter (where i.status = 'purchased') as purchased_count
from public.shopping_lists l
left join public.list_items i on i.list_id = l.id
left join public.purchases p on p.list_item_id = i.id
group by l.id;

create view public.group_totals with (security_invoker = true) as
select t.group_id, t.currency_code, sum(t.budgeted_total)::numeric(19,4) as budgeted_total,
  sum(t.purchased_total)::numeric(19,4) as purchased_total, count(*) as list_count
from public.list_totals t
where t.group_id is not null and t.archived_at is null
group by t.group_id, t.currency_code;

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security. There are no DELETE policies on resources with financial history: they are archived.
create policy "currencies: active are public" on public.currencies for select to anon, authenticated using (is_active);

create policy "profiles: self and collaborators" on public.profiles for select to authenticated using (id = auth.uid() or public.shares_resource_with(id));
create policy "profiles: update self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "settings: read own" on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy "settings: update own" on public.user_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "categories: visible" on public.categories for select to authenticated using (
  is_default or user_id = auth.uid()
  or exists (select 1 from public.list_items i where i.category_id = categories.id)
  or exists (select 1 from public.shopping_lists l where l.category_id = categories.id));
create policy "categories: create own" on public.categories for insert to authenticated with check (user_id = auth.uid() and not is_default);
create policy "categories: update own" on public.categories for update to authenticated using (user_id = auth.uid() and not is_default) with check (user_id = auth.uid() and not is_default);

create policy "products: owned or on a visible list" on public.products for select to authenticated using (
  owner_id = auth.uid() or exists (select 1 from public.list_items i where i.product_id = products.id));
create policy "products: create own" on public.products for insert to authenticated with check (owner_id = auth.uid());
create policy "products: update own" on public.products for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "groups: members view" on public.shopping_groups for select to authenticated using (owner_id = auth.uid() or public.get_group_role(id) is not null);
create policy "groups: create own" on public.shopping_groups for insert to authenticated with check (owner_id = auth.uid());
create policy "groups: owner updates" on public.shopping_groups for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "group members: members view" on public.group_members for select to authenticated using (public.get_group_role(group_id) is not null);
create policy "group members: owner changes roles" on public.group_members for update to authenticated
  using (public.get_group_role(group_id) = 'owner') with check (public.get_group_role(group_id) = 'owner');
create policy "group members: owner removes or member leaves" on public.group_members for delete to authenticated
  using (public.get_group_role(group_id) = 'owner' or user_id = auth.uid());

create policy "lists: members view" on public.shopping_lists for select to authenticated using (owner_id = auth.uid() or public.can_view_list(id));
create policy "lists: create own" on public.shopping_lists for insert to authenticated with check (owner_id = auth.uid());
create policy "lists: editors update" on public.shopping_lists for update to authenticated using (public.can_edit_list(id)) with check (public.can_edit_list(id));

create policy "list members: members view" on public.list_members for select to authenticated using (public.can_view_list(list_id));
create policy "list members: owner changes roles" on public.list_members for update to authenticated
  using (public.can_manage_list(list_id)) with check (public.can_manage_list(list_id));
create policy "list members: owner removes or member leaves" on public.list_members for delete to authenticated
  using (public.can_manage_list(list_id) or user_id = auth.uid());

create policy "items: members view" on public.list_items for select to authenticated using (public.can_view_list(list_id));
create policy "items: editors add" on public.list_items for insert to authenticated with check (public.can_edit_list(list_id));
create policy "items: editors update" on public.list_items for update to authenticated using (public.can_edit_list(list_id)) with check (public.can_edit_list(list_id));
create policy "items: editors remove unpurchased" on public.list_items for delete to authenticated using (public.can_edit_list(list_id) and status <> 'purchased');

create policy "purchases: members view" on public.purchases for select to authenticated using (public.can_view_list(list_id));
create policy "price history: purchaser or list members" on public.price_history for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.purchases p where p.id = purchase_id));

create policy "invitations: parties view" on public.invitations for select to authenticated using (
  inviter_id = auth.uid() or invitee_user_id = auth.uid() or lower(invitee_email) = lower(auth.jwt() ->> 'email'));

create policy "reports: owners and partners view" on public.monthly_reports for select to authenticated using (
  owner_id = auth.uid()
  or (group_id is not null and coalesce(public.get_group_role(group_id) in ('owner', 'partner'), false))
  or (list_id is not null and public.can_purchase_list(list_id)));
create policy "report items: follow report" on public.monthly_report_items for select to authenticated using (
  exists (select 1 from public.monthly_reports r where r.id = report_id));

create policy "notifications: read own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications: mark own read" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges. Supabase grants all privileges on public objects to the API roles by default; narrow them so
-- server-owned records can only be written by SECURITY DEFINER functions.
revoke all on all tables in schema public from anon;
grant select on public.currencies to anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke insert, update, delete on public.currencies, public.purchases, public.price_history, public.invitations,
  public.monthly_reports, public.monthly_report_items from authenticated;
revoke insert, update, delete on public.profiles, public.user_settings, public.notifications from authenticated;
revoke insert on public.group_members, public.list_members from authenticated; -- memberships come from accepted invitations
grant update (username, display_name, avatar_url) on public.profiles to authenticated;
grant update (default_currency, timezone, language) on public.user_settings to authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke execute on function public.purchase_list_item(uuid, numeric, boolean) from public, anon;
grant execute on function public.purchase_list_item(uuid, numeric, boolean) to authenticated;
revoke execute on function public.get_price_suggestion(uuid, text) from public, anon;
grant execute on function public.get_price_suggestion(uuid, text) to authenticated;
