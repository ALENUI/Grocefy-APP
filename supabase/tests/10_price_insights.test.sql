-- Price summaries and spending trends: per-currency figures, visibility, and month bucketing.
begin;
select tests.household();

-- Rice history for the household: 20,000 → 22,000 → 23,500 XAF over three months, and 45 USD once.
create function pg_temp.bought(list_id uuid, product_id uuid, paid numeric, budget numeric, buyer text, at timestamptz) returns void language plpgsql as $$
declare item uuid; purchase uuid; list public.shopping_lists;
begin
  select * into list from public.shopping_lists where id = list_id;
  insert into public.list_items (list_id, product_id, budgeted_unit_price, status, purchased_at, created_by) values (list_id, product_id, budget, 'purchased', at, list.owner_id) returning id into item;
  insert into public.purchases (list_item_id, product_id, list_id, group_id, user_id, quantity, budgeted_amount, purchased_amount, currency_code, purchased_at)
  values (item, product_id, list_id, list.group_id, tests.id(buyer), 1, budget, paid, list.currency_code, at) returning id into purchase;
  insert into public.price_history (product_id, user_id, price, currency_code, purchased_at, purchase_id) values (product_id, tests.id(buyer), paid, list.currency_code, at, purchase);
end $$;
insert into public.shopping_lists (id, owner_id, name, currency_code) values ('20000000-0000-0000-0000-0000000000b1', tests.id('owner'), 'Imports', 'USD');
select pg_temp.bought('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 20000, 21000, 'owner', date_trunc('month', now()) - interval '2 months' + interval '3 days');
select pg_temp.bought('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 22000, 21000, 'partner', date_trunc('month', now()) - interval '1 month' + interval '3 days');
select pg_temp.bought('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 23500, 25000, 'partner', date_trunc('month', now()) + interval '1 hour');
select pg_temp.bought('20000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000001', 45, 50, 'owner', date_trunc('month', now()) + interval '2 hours');

select tests.login('owner');
select tests.assert((select purchase_count = 3 and last_price = 23500 and previous_price = 22000 and min_price = 20000 and max_price = 23500 and round(average_price) = 21833
  from public.product_price_summary() where currency_code = 'XAF'), 'XAF summary: last, previous, range, and average');
select tests.assert((select purchase_count = 1 and last_price = 45 and previous_price is null from public.product_price_summary() where currency_code = 'USD'),
  'USD prices are summarized separately, never mixed with XAF');
select tests.assert((select count(*) = 2 from public.product_price_summary('ric')), 'search filters by product name');
select tests.assert(not exists (select 1 from public.product_price_summary('%')), 'wildcards in the search are literal');
select tests.assert((select array_agg(purchased order by year, month) = array[20000, 22000, 23500]::numeric[] from public.spending_trend(6, '10000000-0000-0000-0000-000000000001')),
  'group trend has one XAF bucket per month (the USD list is not in the group)');
select tests.assert((select array_agg(currency_code || ':' || trim_scale(purchased) order by year, month, currency_code) = array['XAF:20000', 'USD:45'] from public.spending_trend(6)),
  'personal trend has only the owner''s own purchases, bucketed by month and currency');
select tests.assert((select count(*) = 0 from public.spending_trend(1) where (year, month) <> (extract(year from now())::int, extract(month from now())::int)), 'the window is limited to the requested months');
reset role;

select tests.login('partner');
select tests.assert((select sum(purchased) = 45500 from public.spending_trend(6)), 'personal trend covers only the caller''s purchases');
reset role;

select tests.login('stranger');
select tests.assert(not exists (select 1 from public.product_price_summary()), 'non-members see no prices');
select tests.assert(not exists (select 1 from public.spending_trend(6, '10000000-0000-0000-0000-000000000001')), 'non-members see no group spending');
reset role;

rollback;
