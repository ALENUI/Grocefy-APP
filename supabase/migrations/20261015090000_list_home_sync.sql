-- To-buy and Home stay in step. Anything put on a home's To-buy list belongs in the home: it is added to the
-- inventory as finished (or marked finished if it was in stock or archived). Items a housemate marked as running
-- low stay low.
-- Quantities are counted per item or in bulk packs. Buying an item fills the home back up: the quantity bought
-- becomes the item's full quantity, which is also what goes on the To-buy list the next time it runs out.

alter table public.list_items add column is_bulk boolean not null default false;
alter table public.home_items add column is_bulk boolean not null default false;

create function public.stock_list_item_in_home() returns trigger language plpgsql security definer set search_path = public as $$
declare
  home_id uuid;
begin
  if new.status <> 'pending' then return null; end if;
  select group_id into home_id from public.shopping_lists where id = new.list_id and archived_at is null;
  if home_id is null then return null; end if; -- personal lists have no home
  insert into public.home_items (group_id, product_id, category_id, status, usual_quantity, unit, is_bulk, created_by, updated_by)
  values (home_id, new.product_id, new.category_id, 'out', new.quantity, new.unit, new.is_bulk, new.created_by, new.created_by)
  on conflict (group_id, product_id) do update set status = 'out', archived_at = null, updated_by = excluded.updated_by
  where home_items.status = 'in_stock' or home_items.archived_at is not null;
  return null;
end $$;
create trigger list_items_stock_home after insert on public.list_items for each row execute function public.stock_list_item_in_home();

-- Buying an item puts it in the home as full: in stock, with the quantity bought as its full quantity. It is added
-- (or brought back from the archive) if the home did not have it. Replaces the earlier status-only restock.
create or replace function public.restock_home_item() returns trigger language plpgsql security definer set search_path = public as $$
declare
  item public.list_items;
begin
  if new.group_id is null then return null; end if;
  select * into item from public.list_items where id = new.list_item_id;
  insert into public.home_items (group_id, product_id, category_id, status, usual_quantity, unit, is_bulk, created_by, updated_by)
  values (new.group_id, new.product_id, new.category_id, 'in_stock', new.quantity, item.unit, coalesce(item.is_bulk, false), new.user_id, new.user_id)
  on conflict (group_id, product_id) do update set status = 'in_stock', archived_at = null, usual_quantity = excluded.usual_quantity,
    unit = coalesce(excluded.unit, home_items.unit), is_bulk = excluded.is_bulk, updated_by = excluded.updated_by;
  return null;
end $$;

-- Running low again puts the full quantity on the To-buy list, counted the same way (per item or bulk).
create or replace function public.mark_home_item(target_item_id uuid, new_status public.stock_status, target_list_id uuid default null)
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

  insert into public.list_items (list_id, product_id, category_id, quantity, unit, is_bulk, budgeted_unit_price)
  values (list.id, home_item.product_id, home_item.category_id, home_item.usual_quantity, home_item.unit, home_item.is_bulk,
    coalesce((select ph.price from public.price_history ph where ph.product_id = home_item.product_id and ph.currency_code = list.currency_code
              order by ph.purchased_at desc, ph.created_at desc limit 1), 0))
  returning * into result;
  return result;
end $$;

-- Bring existing data in line: pending To-buy items whose product is not in the home yet are added as finished.
insert into public.home_items (group_id, product_id, category_id, status, usual_quantity, unit, is_bulk, created_by, updated_by)
select distinct on (l.group_id, i.product_id) l.group_id, i.product_id, i.category_id, 'out', i.quantity, i.unit, i.is_bulk, i.created_by, i.created_by
from public.list_items i join public.shopping_lists l on l.id = i.list_id
where i.status = 'pending' and l.group_id is not null and l.archived_at is null
order by l.group_id, i.product_id, i.created_at
on conflict (group_id, product_id) do nothing;
