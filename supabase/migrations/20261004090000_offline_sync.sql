-- Offline shopping support for the purchase transaction:
--   * client_ref makes a purchase idempotent: an app that retries after a dropped connection gets the original
--     purchase back instead of an error or a duplicate.
--   * purchased_at lets a purchase made offline keep the time it happened, within limits: at most 72 hours back,
--     never in the future, and never inside a period whose monthly report has already been finalized for this
--     purchase's scope (finalized statements must not change). Otherwise the sync time is used. It may predate the
--     item's server timestamp: an item added offline is only created on the server when it syncs.

alter table public.purchases add column client_ref uuid unique;

drop function public.purchase_list_item(uuid, numeric, boolean);
create function public.purchase_list_item(
  target_item_id uuid, actual_amount numeric default null, use_budgeted_amount boolean default false,
  client_ref uuid default null, purchased_at timestamptz default null
) returns public.purchases language plpgsql security definer set search_path = public as $$
declare
  item public.list_items;
  list public.shopping_lists;
  paid numeric(19,4);
  happened timestamptz;
  result public.purchases;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;

  -- A retry of a purchase that already succeeded returns it unchanged.
  if client_ref is not null then
    select * into result from public.purchases p where p.client_ref = purchase_list_item.client_ref;
    if found then
      if result.user_id <> auth.uid() or result.list_item_id <> target_item_id then raise exception 'VALIDATION_ERROR'; end if;
      return result;
    end if;
  end if;

  select * into item from public.list_items where id = target_item_id for update;
  if not found or not public.can_view_list(item.list_id) then raise exception 'NOT_FOUND'; end if;
  if not public.can_purchase_list(item.list_id) then raise exception 'FORBIDDEN'; end if;
  if item.status = 'purchased' then raise exception 'ALREADY_PURCHASED'; end if;
  if item.status = 'archived' then raise exception 'VALIDATION_ERROR'; end if;
  select * into list from public.shopping_lists where id = item.list_id;
  if list.archived_at is not null then raise exception 'LIST_ARCHIVED'; end if;

  paid := case when use_budgeted_amount then item.budgeted_total else actual_amount end;
  if paid is null or paid < 0 then raise exception 'VALIDATION_ERROR'; end if;

  happened := least(coalesce(purchase_list_item.purchased_at, now()), now());
  if happened < now() - interval '72 hours' or exists (
    select 1 from public.monthly_reports r
    where r.period_start <= happened and happened < r.period_end and r.generated_at >= r.period_end
      and ((r.group_id is not null and r.group_id = list.group_id) or r.list_id = list.id
        or (r.group_id is null and r.list_id is null and r.owner_id = auth.uid()))
  ) then
    happened := now();
  end if;

  insert into public.purchases (list_item_id, product_id, list_id, group_id, user_id, category_id, quantity, budgeted_amount, purchased_amount,
    currency_code, purchased_at, client_ref)
  values (item.id, item.product_id, item.list_id, list.group_id, auth.uid(), coalesce(item.category_id, list.category_id), item.quantity,
    item.budgeted_total, paid, list.currency_code, happened, client_ref)
  returning * into result;
  insert into public.price_history (product_id, user_id, price, currency_code, purchased_at, purchase_id)
  values (item.product_id, auth.uid(), round(paid / item.quantity, 4), list.currency_code, result.purchased_at, result.id);
  update public.list_items set status = 'purchased', purchased_at = result.purchased_at where id = item.id;
  return result;
end $$;
revoke execute on function public.purchase_list_item(uuid, numeric, boolean, uuid, timestamptz) from public, anon;
grant execute on function public.purchase_list_item(uuid, numeric, boolean, uuid, timestamptz) to authenticated;
