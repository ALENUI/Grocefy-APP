-- Monthly finance reports: budget vs. actual per category, one report per currency (currencies are never summed
-- together). Reports are built only from immutable purchase records. A report for a month that has ended is final
-- once generated: re-running generation returns it unchanged, so later renames or regenerations cannot alter a
-- statement that owners and partners have already received.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Month boundaries follow the report owner's timezone, so it must be a real IANA zone.
create or replace function public.guard_user_settings() returns trigger language plpgsql set search_path = public as $$
begin
  if new.default_currency is distinct from old.default_currency then perform public.require_active_currency(new.default_currency); end if;
  if new.timezone is distinct from old.timezone and new.timezone is not null
      and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'VALIDATION_ERROR';
  end if;
  return new;
end $$;

-- Purchases fall back to the list's category (its purpose, e.g. Food) when the item has none, so reports can
-- always attribute spending. Otherwise identical to the hardened purchase transaction.
create or replace function public.purchase_list_item(target_item_id uuid, actual_amount numeric default null, use_budgeted_amount boolean default false)
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
  values (item.id, item.product_id, item.list_id, list.group_id, auth.uid(), coalesce(item.category_id, list.category_id), item.quantity,
    item.budgeted_total, paid, list.currency_code)
  returning * into result;
  insert into public.price_history (product_id, user_id, price, currency_code, purchased_at, purchase_id)
  values (item.product_id, auth.uid(), round(paid / item.quantity, 4), list.currency_code, result.purchased_at, result.id);
  update public.list_items set status = 'purchased', purchased_at = result.purchased_at where id = item.id;
  return result;
end $$;

alter table public.monthly_reports add column period_start timestamptz;
alter table public.monthly_reports add column period_end timestamptz;
alter table public.monthly_reports add constraint monthly_reports_single_scope check (group_id is null or list_id is null);
alter table public.monthly_report_items add constraint monthly_report_items_one_row_per_category unique nulls not distinct (report_id, category_id);
create index on public.monthly_reports (owner_id, year desc, month desc);
create index on public.monthly_reports (group_id, year desc, month desc) where group_id is not null;
create index on public.monthly_reports (list_id, year desc, month desc) where list_id is not null;

-- Scope: exactly one of personal (purchases made by report_owner), group (purchases made in the group), or list.
-- Returns one report per currency found. Trusted callers only: permission checks happen in the public wrapper.
create function private.build_monthly_reports(report_owner uuid, scope_group uuid, scope_list uuid, report_year integer, report_month integer)
returns setof public.monthly_reports language plpgsql security definer set search_path = public as $$
declare
  zone text;
  starts timestamptz;
  ends timestamptz;
  totals record;
  existing public.monthly_reports;
  report public.monthly_reports;
  recipient uuid;
begin
  select coalesce(timezone, 'UTC') into zone from public.user_settings where user_id = report_owner;
  starts := make_timestamptz(report_year, report_month, 1, 0, 0, 0, coalesce(zone, 'UTC'));
  ends := make_timestamptz(case when report_month = 12 then report_year + 1 else report_year end, report_month % 12 + 1, 1, 0, 0, 0, coalesce(zone, 'UTC'));

  for totals in
    select p.currency_code, sum(p.budgeted_amount) as budgeted, sum(p.purchased_amount) as purchased
    from public.purchases p
    where p.purchased_at >= starts and p.purchased_at < ends
      and case when scope_list is not null then p.list_id = scope_list when scope_group is not null then p.group_id = scope_group else p.user_id = report_owner end
    group by p.currency_code order by p.currency_code
  loop
    select * into existing from public.monthly_reports r
    where r.owner_id = report_owner and r.group_id is not distinct from scope_group and r.list_id is not distinct from scope_list
      and r.year = report_year and r.month = report_month and r.currency_code = totals.currency_code
    for update;
    if found and existing.generated_at >= ends then
      return next existing; -- final: generated after the month closed
      continue;
    end if;

    insert into public.monthly_reports (owner_id, group_id, list_id, year, month, currency_code, total_budget, total_purchased, total_variance, period_start, period_end, generated_at)
    values (report_owner, scope_group, scope_list, report_year, report_month, totals.currency_code, totals.budgeted, totals.purchased, totals.purchased - totals.budgeted, starts, ends, now())
    on conflict (owner_id, group_id, list_id, year, month, currency_code) do update
      set total_budget = excluded.total_budget, total_purchased = excluded.total_purchased, total_variance = excluded.total_variance,
          period_start = excluded.period_start, period_end = excluded.period_end, generated_at = excluded.generated_at
    returning * into report;

    delete from public.monthly_report_items where report_id = report.id;
    insert into public.monthly_report_items (report_id, category_id, category_name_snapshot, budgeted_amount, purchased_amount, variance, item_count)
    select report.id, p.category_id, coalesce(c.name, 'Uncategorized'), sum(p.budgeted_amount), sum(p.purchased_amount),
      sum(p.purchased_amount) - sum(p.budgeted_amount), count(*)
    from public.purchases p left join public.categories c on c.id = p.category_id
    where p.purchased_at >= starts and p.purchased_at < ends and p.currency_code = totals.currency_code
      and case when scope_list is not null then p.list_id = scope_list when scope_group is not null then p.group_id = scope_group else p.user_id = report_owner end
    group by p.category_id, c.name;

    -- Owners and partners are notified once, when the closed month's report is first finalized.
    if now() >= ends then
      for recipient in
        select report_owner
        union select m.user_id from public.group_members m where m.group_id = scope_group and m.role = 'partner' and m.status = 'accepted'
        union select m.user_id from public.list_members m where m.list_id = scope_list and m.role = 'partner' and m.status = 'accepted'
      loop
        perform public.notify_user(recipient, 'MONTHLY_REPORT',
          to_char(starts at time zone coalesce(zone, 'UTC'), 'FMMonth YYYY') || ' finance report (' || totals.currency_code || ')',
          'Budget ' || trim_scale(totals.budgeted) || ' · Actual ' || trim_scale(totals.purchased) || ' ' || totals.currency_code, 'monthly_report', report.id);
      end loop;
    end if;
    return next report;
  end loop;
end $$;
revoke all on function private.build_monthly_reports(uuid, uuid, uuid, integer, integer) from public, anon, authenticated;

-- Generates (or returns the final) reports for one scope and month: personal when no group or list is given.
-- Group and list reports are available to their owners and partners.
create function public.generate_monthly_report(target_year integer, target_month integer, target_group_id uuid default null, target_list_id uuid default null)
returns setof public.monthly_reports language plpgsql security definer set search_path = public as $$
declare
  report_owner uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if target_month not between 1 and 12 or target_year not between 2020 and 2200 or (target_group_id is not null and target_list_id is not null)
      or make_date(target_year, target_month, 1) > now()::date then
    raise exception 'VALIDATION_ERROR';
  end if;

  if target_group_id is not null then
    select owner_id into report_owner from public.shopping_groups where id = target_group_id;
    if not found or public.get_group_role(target_group_id) is null then raise exception 'NOT_FOUND'; end if;
    if public.get_group_role(target_group_id) not in ('owner', 'partner') then raise exception 'FORBIDDEN'; end if;
  elsif target_list_id is not null then
    select owner_id into report_owner from public.shopping_lists where id = target_list_id;
    if not found or not public.can_view_list(target_list_id) then raise exception 'NOT_FOUND'; end if;
    if not public.can_purchase_list(target_list_id) then raise exception 'FORBIDDEN'; end if;
  else
    report_owner := auth.uid();
  end if;

  return query select * from private.build_monthly_reports(report_owner, target_group_id, target_list_id, target_year, target_month);
end $$;
revoke execute on function public.generate_monthly_report(integer, integer, uuid, uuid) from public, anon;
grant execute on function public.generate_monthly_report(integer, integer, uuid, uuid) to authenticated;

-- Scheduled job: finalizes last month's reports for every group with purchases and every purchaser (personal).
-- Idempotent: running it again returns the already-final reports and sends no new notifications.
create function private.generate_previous_month_reports() returns integer language plpgsql security definer set search_path = public as $$
declare
  last_month date := (date_trunc('month', now() at time zone 'UTC') - interval '1 month')::date;
  scope record;
  generated integer := 0;
  report_count integer;
begin
  -- A window wide enough for every timezone around the UTC month; build_monthly_reports applies exact boundaries.
  for scope in
    select distinct g.owner_id, p.group_id from public.purchases p join public.shopping_groups g on g.id = p.group_id
    where p.purchased_at >= last_month - interval '1 day' and p.purchased_at < last_month + interval '1 month 1 day'
  loop
    select count(*) into report_count from private.build_monthly_reports(scope.owner_id, scope.group_id, null, extract(year from last_month)::integer, extract(month from last_month)::integer);
    generated := generated + report_count;
  end loop;
  for scope in
    select distinct p.user_id from public.purchases p
    where p.purchased_at >= last_month - interval '1 day' and p.purchased_at < last_month + interval '1 month 1 day'
  loop
    select count(*) into report_count from private.build_monthly_reports(scope.user_id, null, null, extract(year from last_month)::integer, extract(month from last_month)::integer);
    generated := generated + report_count;
  end loop;
  return generated;
end $$;
revoke all on function private.generate_previous_month_reports() from public, anon, authenticated;

-- Schedule the job where pg_cron is available (Supabase): 14:00 UTC on the 1st, after the month has ended in every
-- timezone (the latest is UTC-12), so each report is final when it is generated and partners are notified.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('grocefy-monthly-reports', '0 14 1 * *', 'select private.generate_previous_month_reports()');
  end if;
end $$;
