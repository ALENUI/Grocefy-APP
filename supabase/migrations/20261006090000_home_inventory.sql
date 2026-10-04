-- Home inventory: the core of the simplified product. A home is a shopping group shared by the people who live
-- there. Its inventory lists what the household keeps; anyone with edit rights marks an item as running low or out,
-- which puts it on the home's To-buy list with the last price paid as the expected price. Buying it (the existing
-- purchase transaction) records the actual price and puts the item back in stock, so the next time it runs low the
-- latest price is suggested.

create type public.stock_status as enum ('in_stock', 'low', 'out');

create table public.home_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shopping_groups(id),
  product_id uuid not null references public.products(id),
  category_id uuid references public.categories(id) on delete set null,
  status public.stock_status not null default 'in_stock',
  usual_quantity numeric(19,4) not null default 1 check (usual_quantity > 0), -- how much is usually bought at once
  unit text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (group_id, product_id)
);
create index on public.home_items (group_id, status) where archived_at is null;
create trigger home_items_updated before update on public.home_items for each row execute function public.set_updated_at();

alter table public.home_items enable row level security;
-- Everyone in the home sees the inventory; members (not view-only) add and update it. Items are archived, not deleted.
create policy "home items: home members view" on public.home_items for select to authenticated using (public.get_group_role(group_id) is not null);
create policy "home items: members add" on public.home_items for insert to authenticated
  with check (coalesce(public.get_group_role(group_id) in ('owner', 'partner', 'editor'), false));
create policy "home items: members update" on public.home_items for update to authenticated
  using (coalesce(public.get_group_role(group_id) in ('owner', 'partner', 'editor'), false))
  with check (coalesce(public.get_group_role(group_id) in ('owner', 'partner', 'editor'), false));
revoke delete, truncate on public.home_items from anon, authenticated;

create function public.guard_home_item() returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_client_request() then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.group_id <> old.group_id or new.product_id <> old.product_id or new.created_by is distinct from old.created_by then
    raise exception 'FORBIDDEN';
  end if;
  new.updated_by := auth.uid();
  -- Runs with the caller's RLS: the product and category must be visible to them.
  if (tg_op = 'INSERT' or new.product_id <> old.product_id) and not exists (select 1 from public.products where id = new.product_id) then raise exception 'NOT_FOUND'; end if;
  if new.category_id is not null and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
      and not exists (select 1 from public.categories where id = new.category_id) then
    raise exception 'NOT_FOUND';
  end if;
  return new;
end $$;
create trigger home_items_guard before insert or update on public.home_items for each row execute function public.guard_home_item();

-- Members see the products in their home's inventory (a housemate may have added them).
drop policy "products: owned, on a visible list, or purchased" on public.products;
create policy "products: owned, on a visible list, in your home, or purchased" on public.products for select to authenticated using (
  owner_id = auth.uid()
  or exists (select 1 from public.list_items i where i.product_id = products.id)
  or exists (select 1 from public.home_items h where h.product_id = products.id)
  or exists (select 1 from public.purchases p where p.product_id = products.id and p.user_id = auth.uid()));

-- The home each person is currently using; the app opens it on start.
alter table public.user_settings add column current_home_id uuid references public.shopping_groups(id) on delete set null;
grant update (current_home_id) on public.user_settings to authenticated;
create or replace function public.guard_user_settings() returns trigger language plpgsql set search_path = public as $$
begin
  if new.default_currency is distinct from old.default_currency then perform public.require_active_currency(new.default_currency); end if;
  if new.timezone is distinct from old.timezone and new.timezone is not null
      and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'VALIDATION_ERROR';
  end if;
  if public.is_client_request() and new.current_home_id is distinct from old.current_home_id and new.current_home_id is not null
      and public.get_group_role(new.current_home_id) is null then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end $$;

-- Creates a home with its first To-buy list and makes it the caller's current home. Runs with the caller's RLS.
create function public.create_home(home_name text, currency_code text default null) returns public.shopping_groups
language plpgsql set search_path = public as $$
declare
  home public.shopping_groups;
  currency text := coalesce(upper(currency_code), (select default_currency from public.user_settings where user_id = auth.uid()), 'XAF');
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if nullif(trim(home_name), '') is null then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.shopping_groups (owner_id, name, currency_code) values (auth.uid(), trim(home_name), currency) returning * into home;
  insert into public.shopping_lists (owner_id, group_id, name, currency_code) values (auth.uid(), home.id, 'To buy', currency);
  update public.user_settings set current_home_id = home.id where user_id = auth.uid();
  return home;
end $$;

-- Marks an inventory item. Running low or out puts it on a To-buy list (the given one, else the home's oldest list)
-- unless it is already there, budgeted at the latest unit price paid in that list's currency (0 when unknown; never a
-- price in another currency). Returns the pending list item, or null when marked in stock.
create function public.mark_home_item(target_item_id uuid, new_status public.stock_status, target_list_id uuid default null)
returns public.list_items language plpgsql set search_path = public as $$
declare
  home_item public.home_items;
  list public.shopping_lists;
  existing public.list_items;
  result public.list_items;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into home_item from public.home_items where id = target_item_id and archived_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.home_items set status = new_status where id = home_item.id;
  if not found then raise exception 'FORBIDDEN'; end if; -- RLS: view-only members cannot update
  if new_status = 'in_stock' then return null; end if;

  select i.* into existing from public.list_items i join public.shopping_lists l on l.id = i.list_id
  where l.group_id = home_item.group_id and l.archived_at is null and i.product_id = home_item.product_id and i.status = 'pending'
  limit 1;
  if found then return existing; end if;

  select * into list from public.shopping_lists
  where group_id = home_item.group_id and archived_at is null and (target_list_id is null or id = target_list_id)
  order by created_at limit 1;
  if not found then raise exception 'NOT_FOUND'; end if;

  insert into public.list_items (list_id, product_id, category_id, quantity, unit, budgeted_unit_price)
  values (list.id, home_item.product_id, home_item.category_id, home_item.usual_quantity, home_item.unit,
    coalesce((select ph.price from public.price_history ph where ph.product_id = home_item.product_id and ph.currency_code = list.currency_code
              order by ph.purchased_at desc, ph.created_at desc limit 1), 0))
  returning * into result;
  return result;
end $$;

-- Buying an item restocks it in the home's inventory.
create function public.restock_home_item() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null then
    update public.home_items set status = 'in_stock', updated_by = new.user_id
    where group_id = new.group_id and product_id = new.product_id and archived_at is null and status <> 'in_stock';
  end if;
  return null;
end $$;
create trigger purchases_restock after insert on public.purchases for each row execute function public.restock_home_item();

-- Housemates are told when something runs low or out, so nobody has to say it out loud.
create function public.push_stock_change() returns trigger language plpgsql security definer set search_path = public as $$
declare
  home public.shopping_groups;
  who text;
  product text;
  recipient uuid;
begin
  if new.status = 'in_stock' or new.status = old.status then return null; end if;
  select * into home from public.shopping_groups where id = new.group_id;
  select display_name into who from public.profiles where id = new.updated_by;
  select name into product from public.products where id = new.product_id;
  for recipient in
    select home.owner_id union select m.user_id from public.group_members m where m.group_id = home.id and m.status = 'accepted'
  loop
    continue when recipient is null or recipient = new.updated_by;
    perform public.queue_push(recipient, home.name,
      coalesce(who, 'Someone') || ': ' || coalesce(product, 'an item') || case when new.status = 'out' then ' is finished' else ' is running low' end,
      jsonb_build_object('url', '/'), 'stock:' || new.id || ':' || new.status || ':' || extract(epoch from new.updated_at) || ':' || recipient);
  end loop;
  return null;
end $$;
create trigger home_items_push after update of status on public.home_items for each row execute function public.push_stock_change();

revoke execute on function public.create_home(text, text) from public, anon;
revoke execute on function public.mark_home_item(uuid, public.stock_status, uuid) from public, anon;
grant execute on function public.create_home(text, text) to authenticated;
grant execute on function public.mark_home_item(uuid, public.stock_status, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'home_items') then
    alter publication supabase_realtime add table public.home_items;
  end if;
end $$;
