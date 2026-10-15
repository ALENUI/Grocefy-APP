-- To-buy and Home stay in step. Anything put on a home's To-buy list belongs in the home: it is added to the
-- inventory as finished (or marked finished if it was in stock or archived), so buying it later puts it back in stock
-- through the existing purchases_restock trigger. Items a housemate marked as running low stay low.
-- List items also record whether the quantity is counted per item or in bulk packs.

alter table public.list_items add column is_bulk boolean not null default false;

create function public.stock_list_item_in_home() returns trigger language plpgsql security definer set search_path = public as $$
declare
  home_id uuid;
begin
  if new.status <> 'pending' then return null; end if;
  select group_id into home_id from public.shopping_lists where id = new.list_id and archived_at is null;
  if home_id is null then return null; end if; -- personal lists have no home
  insert into public.home_items (group_id, product_id, category_id, status, usual_quantity, unit, created_by, updated_by)
  values (home_id, new.product_id, new.category_id, 'out', new.quantity, new.unit, new.created_by, new.created_by)
  on conflict (group_id, product_id) do update set status = 'out', archived_at = null, updated_by = excluded.updated_by
  where home_items.status = 'in_stock' or home_items.archived_at is not null;
  return null;
end $$;
create trigger list_items_stock_home after insert on public.list_items for each row execute function public.stock_list_item_in_home();

-- Bring existing data in line: pending To-buy items whose product is not in the home yet are added as finished.
insert into public.home_items (group_id, product_id, category_id, status, usual_quantity, unit, created_by, updated_by)
select distinct on (l.group_id, i.product_id) l.group_id, i.product_id, i.category_id, 'out', i.quantity, i.unit, i.created_by, i.created_by
from public.list_items i join public.shopping_lists l on l.id = i.list_id
where i.status = 'pending' and l.group_id is not null and l.archived_at is null
order by l.group_id, i.product_id, i.created_at
on conflict (group_id, product_id) do nothing;
