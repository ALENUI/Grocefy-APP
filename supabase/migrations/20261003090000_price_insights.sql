-- Price insights. Both functions run with the caller's RLS, so they only aggregate prices and purchases the caller can
-- already see, and every figure is per currency: prices in different currencies are never averaged or compared.

-- One row per product and currency: last and previous unit price, range, average, and purchase count.
create function public.product_price_summary(search text default null, result_limit integer default 50)
returns table (
  product_id uuid, product_name text, currency_code text, purchase_count integer, last_price numeric, previous_price numeric,
  min_price numeric, max_price numeric, average_price numeric, last_purchased_at timestamptz
)
language sql stable set search_path = public as $$
  with ranked as (
    select ph.product_id, ph.currency_code, ph.price, ph.purchased_at,
      row_number() over (partition by ph.product_id, ph.currency_code order by ph.purchased_at desc, ph.created_at desc) as recency
    from public.price_history ph
  )
  select r.product_id, p.name, r.currency_code, count(*)::integer,
    max(r.price) filter (where r.recency = 1), max(r.price) filter (where r.recency = 2),
    min(r.price), max(r.price), round(avg(r.price), 4), max(r.purchased_at)
  from ranked r join public.products p on p.id = r.product_id
  where nullif(trim(search), '') is null
     or p.name ilike '%' || replace(replace(replace(trim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  group by r.product_id, p.name, r.currency_code
  order by max(r.purchased_at) desc, p.name
  limit least(greatest(result_limit, 1), 200)
$$;

-- Monthly purchased vs budgeted totals for the last `months` months (including the current one), per currency.
-- Personal scope covers the caller's own purchases; a group scope covers purchases made in that group. Months follow
-- the caller's timezone setting (UTC by default). Months without purchases are omitted.
create function public.spending_trend(months integer default 6, target_group_id uuid default null)
returns table (year integer, month integer, currency_code text, budgeted numeric, purchased numeric, purchase_count integer)
language sql stable set search_path = public as $$
  with zone as (
    select coalesce((select s.timezone from public.user_settings s where s.user_id = auth.uid()), 'UTC') as name
  ), bounds as (
    select zone.name, (date_trunc('month', now() at time zone zone.name) - make_interval(months => least(greatest(spending_trend.months, 1), 24) - 1)) at time zone zone.name as starts
    from zone
  )
  select extract(year from local_month)::integer, extract(month from local_month)::integer, p.currency_code,
    sum(p.budgeted_amount), sum(p.purchased_amount), count(*)::integer
  from public.purchases p
  cross join bounds
  cross join lateral (select date_trunc('month', p.purchased_at at time zone bounds.name) as local_month) month_of
  where p.purchased_at >= bounds.starts
    and case when target_group_id is null then p.user_id = auth.uid() else p.group_id = target_group_id end
  group by 1, 2, 3
  order by 1, 2, 3
$$;

revoke execute on function public.product_price_summary(text, integer) from public, anon;
revoke execute on function public.spending_trend(integer, uuid) from public, anon;
grant execute on function public.product_price_summary(text, integer) to authenticated;
grant execute on function public.spending_trend(integer, uuid) to authenticated;
