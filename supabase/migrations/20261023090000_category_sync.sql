-- A home item and its pending To-buy entries share one category. Changing it on either side files the other under it
-- too, so an item added at home under a new category shows under that category on the To-buy list (where it starts a
-- new section) instead of staying where an earlier entry put it.

create function public.sync_home_item_category() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.list_items i set category_id = new.category_id
  from public.shopping_lists l
  where l.id = i.list_id and l.group_id = new.group_id and l.archived_at is null
    and i.product_id = new.product_id and i.status = 'pending' and i.category_id is distinct from new.category_id;
  return null;
end $$;
create trigger home_items_sync_category after update of category_id on public.home_items
  for each row when (new.category_id is distinct from old.category_id) execute function public.sync_home_item_category();

-- The other direction. Clearing the category on To-buy files the home item under General, which then comes back here.
create function public.sync_list_item_category() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pending' then return null; end if;
  update public.home_items h set category_id = new.category_id
  from public.shopping_lists l
  where l.id = new.list_id and l.archived_at is null and h.group_id = l.group_id and h.product_id = new.product_id
    and h.category_id is distinct from new.category_id;
  return null;
end $$;
create trigger list_items_sync_category after update of category_id on public.list_items
  for each row when (new.category_id is distinct from old.category_id) execute function public.sync_list_item_category();

-- Bring existing data in line: where the two disagree, the side changed last wins.
update public.list_items i set category_id = h.category_id
from public.shopping_lists l, public.home_items h
where l.id = i.list_id and l.archived_at is null and h.group_id = l.group_id and h.product_id = i.product_id and h.archived_at is null
  and i.status = 'pending' and i.category_id is distinct from h.category_id and h.updated_at >= i.updated_at;
update public.home_items h set category_id = i.category_id
from public.shopping_lists l, public.list_items i
where l.id = i.list_id and l.archived_at is null and h.group_id = l.group_id and h.product_id = i.product_id and h.archived_at is null
  and i.status = 'pending' and i.category_id is distinct from h.category_id;

-- The home's To-buy list: its oldest active list, or a new "To buy" list (owned by the home's owner) when every list
-- was deleted. Only people who may change the home can create it.
create function public.home_to_buy_list(target_home_id uuid) returns public.shopping_lists
language plpgsql security definer set search_path = public as $$
declare
  list public.shopping_lists;
begin
  if not exists (select 1 from public.shopping_groups g where g.id = target_home_id and g.archived_at is null
                 and (g.owner_id = auth.uid() or public.get_group_role(g.id) in ('partner', 'editor'))) then
    raise exception 'FORBIDDEN';
  end if;
  select * into list from public.shopping_lists where group_id = target_home_id and archived_at is null order by created_at limit 1;
  if not found then
    insert into public.shopping_lists (owner_id, group_id, name, currency_code)
    select owner_id, id, 'To buy', currency_code from public.shopping_groups where id = target_home_id
    returning * into list;
  end if;
  return list;
end $$;
revoke execute on function public.home_to_buy_list(uuid) from public, anon;

-- Same as before, except that a home whose lists were all deleted gets a new To-buy list instead of failing.
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

  if target_list_id is null then
    list := public.home_to_buy_list(home_item.group_id);
  else
    select * into list from public.shopping_lists where group_id = home_item.group_id and archived_at is null and id = target_list_id;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;

  insert into public.list_items (list_id, product_id, category_id, quantity, unit, is_bulk, budgeted_unit_price)
  values (list.id, home_item.product_id, home_item.category_id, home_item.usual_quantity, home_item.unit, home_item.is_bulk,
    coalesce((select ph.price from public.price_history ph where ph.product_id = home_item.product_id and ph.currency_code = list.currency_code
              order by ph.purchased_at desc, ph.created_at desc limit 1), 0))
  returning * into result;
  return result;
end $$;
