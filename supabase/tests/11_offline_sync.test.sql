-- Idempotent purchase retries and offline purchase timestamps.
begin;
select tests.household();
-- Items are old enough for backdating checks.
update public.list_items set created_at = now() - interval '10 days';

select tests.login('partner');
-- Idempotency: the same client_ref returns the original purchase instead of failing or duplicating.
select set_config('tests.first', (select id::text from public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500, false, '60000000-0000-0000-0000-000000000001')), false);
select tests.assert((select id::text = current_setting('tests.first') from public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500, false, '60000000-0000-0000-0000-000000000001')),
  'a retried purchase returns the original');
select tests.assert((select count(*) = 1 from public.purchases), 'retries never create a second purchase');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000002', 1, false, '60000000-0000-0000-0000-000000000001') $$,
  'VALIDATION_ERROR', 'a client_ref cannot be reused for a different item');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 1, false, '60000000-0000-0000-0000-000000000099') $$,
  'ALREADY_PURCHASED', 'a different ref for an already purchased item is still rejected');
reset role;
select tests.login('grouppartner');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500, false, '60000000-0000-0000-0000-000000000001') $$,
  'VALIDATION_ERROR', 'another user cannot claim someone else''s client_ref');
reset role;

-- Offline timestamps: kept when recent (even before the item reached the server); clamped when too old or in the future.
select tests.login('owner');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000c1', auth.uid(), 'Salt'), ('30000000-0000-0000-0000-0000000000c2', auth.uid(), 'Pepper'),
  ('30000000-0000-0000-0000-0000000000c3', auth.uid(), 'Flour'), ('30000000-0000-0000-0000-0000000000c4', auth.uid(), 'Yeast');
insert into public.list_items (id, list_id, product_id, budgeted_unit_price) values
  ('40000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000c1', 100),
  ('40000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000c2', 100),
  ('40000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000c3', 100),
  ('40000000-0000-0000-0000-0000000000c4', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000c4', 100);
reset role;
update public.list_items set created_at = now() - interval '10 days' where id in ('40000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c2', '40000000-0000-0000-0000-0000000000c3');
select tests.login('owner');
select tests.assert((select purchased_at = now() - interval '2 hours' from public.purchase_list_item('40000000-0000-0000-0000-0000000000c1', 100, false, null, now() - interval '2 hours')),
  'a purchase made offline 2 hours ago keeps its time');
select tests.assert((select purchased_at = now() from public.purchase_list_item('40000000-0000-0000-0000-0000000000c2', 100, false, null, now() - interval '5 days')),
  'times older than 72 hours fall back to the sync time');
select tests.assert((select purchased_at = now() from public.purchase_list_item('40000000-0000-0000-0000-0000000000c3', 100, false, null, now() + interval '1 day')),
  'future times fall back to the sync time');
select tests.assert((select purchased_at = now() - interval '2 hours' from public.purchase_list_item('40000000-0000-0000-0000-0000000000c4', 100, false, null, now() - interval '2 hours')),
  'an item added and bought offline keeps the purchase time, though the item reached the server later');
select tests.assert((select bool_and(ph.purchased_at = p.purchased_at) from public.purchases p join public.price_history ph on ph.purchase_id = p.id), 'price history uses the same time');
reset role;

-- A finalized report for the period wins: the purchase is recorded at sync time instead of changing the report.
insert into public.monthly_reports (owner_id, group_id, year, month, currency_code, total_budget, total_purchased, total_variance, period_start, period_end, generated_at)
values (tests.id('owner'), '10000000-0000-0000-0000-000000000001', 2026, 1, 'XAF', 0, 0, 0, now() - interval '30 days', now() - interval '1 hour', now() - interval '30 minutes');
select tests.login('partner');
select tests.assert((select purchased_at = now() from public.purchase_list_item('40000000-0000-0000-0000-000000000002', null, true, null, now() - interval '2 hours')),
  'a time inside a finalized report period falls back to the sync time');
reset role;

rollback;
