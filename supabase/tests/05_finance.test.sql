-- Monthly reports: category aggregation, variance, currency separation, idempotency, finality, access, timezones.
begin;
select tests.household();

-- Records a purchase at an arbitrary time (as the superuser) to build history for past months.
create function pg_temp.backdated_purchase(list_id uuid, product_name text, category_name text, budget numeric, paid numeric, purchaser text, purchased_at timestamptz)
returns void language plpgsql as $$
declare product uuid; category uuid; item uuid; purchase uuid; list public.shopping_lists;
begin
  select * into list from public.shopping_lists where id = list_id;
  select id into category from public.categories where name = category_name and is_default;
  insert into public.products (owner_id, name) values (list.owner_id, product_name || ' ' || gen_random_uuid()) returning id into product;
  insert into public.list_items (list_id, product_id, category_id, budgeted_unit_price, status, purchased_at, created_by)
  values (list_id, product, category, budget, 'purchased', purchased_at, list.owner_id) returning id into item;
  insert into public.purchases (list_item_id, product_id, list_id, group_id, user_id, category_id, quantity, budgeted_amount, purchased_amount, currency_code, purchased_at)
  values (item, product, list_id, list.group_id, tests.id(purchaser), category, 1, budget, paid, list.currency_code, purchased_at) returning id into purchase;
end $$;

-- Current month through the real purchase flow: Food 200,000 → 180,000; Kitchen 100,000 → 120,000.
update public.list_items set category_id = (select id from public.categories where name = 'Food Stuffs' and is_default), budgeted_unit_price = 200000
where id = '40000000-0000-0000-0000-000000000001';
update public.list_items set category_id = (select id from public.categories where name = 'Kitchen' and is_default), quantity = 1, budgeted_unit_price = 100000
where id = '40000000-0000-0000-0000-000000000002';
select tests.login('partner');
select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 180000);
select public.purchase_list_item('40000000-0000-0000-0000-000000000002', 120000);
select tests.throws($$ select public.generate_monthly_report(2026, 13) $$, 'VALIDATION_ERROR', 'month must be valid');
select tests.throws(format('select public.generate_monthly_report(%s, %s)', extract(year from now() + interval '1 month'), extract(month from now() + interval '1 month')),
  'VALIDATION_ERROR', 'future months cannot be reported');
select tests.throws($$ select public.generate_monthly_report(2026, 1, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') $$,
  'VALIDATION_ERROR', 'a report has a single scope');
reset role;

select tests.login('grouppartner');
select public.generate_monthly_report(extract(year from now())::int, extract(month from now())::int, '10000000-0000-0000-0000-000000000001');
select public.generate_monthly_report(extract(year from now())::int, extract(month from now())::int, '10000000-0000-0000-0000-000000000001');
select tests.assert((select count(*) = 1 from public.monthly_reports), 'regenerating does not duplicate the report');
select tests.assert((select currency_code = 'XAF' and total_budget = 300000 and total_purchased = 300000 and total_variance = 0 and owner_id = tests.id('owner')
  from public.monthly_reports), 'group totals: budget 300,000, actual 300,000, variance 0, owned by the group owner');
select tests.assert((select variance = -20000 and item_count = 1 from public.monthly_report_items where category_name_snapshot = 'Food Stuffs'), 'Food is 20,000 under budget');
select tests.assert((select variance = 20000 from public.monthly_report_items where category_name_snapshot = 'Kitchen'), 'Kitchen is 20,000 over budget');
select tests.assert((select count(*) = 2 from public.monthly_report_items), 'regenerating replaces category rows');
reset role;

-- Access: owners and partners only.
select tests.login('owner');
select tests.assert((select count(*) = 1 from public.monthly_reports), 'group owner sees the group report');
reset role;
select tests.login('viewer');
select tests.assert(not exists (select 1 from public.monthly_reports) and not exists (select 1 from public.monthly_report_items), 'viewers cannot see reports');
select tests.throws(format('select public.generate_monthly_report(%s, %s, null, %L)', extract(year from now()), extract(month from now()), '20000000-0000-0000-0000-000000000001'),
  'FORBIDDEN', 'viewers cannot generate list reports');
reset role;
select tests.login('editor');
select tests.throws(format('select public.generate_monthly_report(%s, %s, null, %L)', extract(year from now()), extract(month from now()), '20000000-0000-0000-0000-000000000001'),
  'FORBIDDEN', 'editors cannot generate list reports');
reset role;
select tests.login('stranger');
select tests.throws(format('select public.generate_monthly_report(%s, %s, %L)', extract(year from now()), extract(month from now()), '10000000-0000-0000-0000-000000000001'),
  'NOT_FOUND', 'non-members cannot generate group reports');
select tests.throws($$ insert into public.monthly_reports (owner_id, year, month, currency_code, total_budget, total_purchased, total_variance)
  values (auth.uid(), 2026, 1, 'XAF', 0, 0, 0) $$, 'permission denied', 'reports cannot be written directly');
select tests.throws($$ select private.generate_previous_month_reports() $$, 'permission denied', 'the scheduled job is not callable by clients');
reset role;

-- Personal report: the partner's own purchases, visible only to them.
select tests.login('partner');
select public.generate_monthly_report(extract(year from now())::int, extract(month from now())::int);
select tests.assert((select total_purchased = 300000 from public.monthly_reports where group_id is null and list_id is null), 'personal report covers the user''s purchases');
reset role;
select tests.login('owner');
select tests.assert(not exists (select 1 from public.monthly_reports where group_id is null and list_id is null), 'personal reports are private');
reset role;

-- Currency separation: a USD list in the same group produces a separate USD report.
insert into public.shopping_lists (id, owner_id, group_id, name, currency_code, category_id)
values ('20000000-0000-0000-0000-0000000000c1', tests.id('owner'), '10000000-0000-0000-0000-000000000001', 'Imports', 'USD',
  (select id from public.categories where name = 'Electronics' and is_default));
insert into public.list_items (id, list_id, product_id, budgeted_unit_price, created_by)
values ('40000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-000000000001', 50, tests.id('owner'));
select tests.login('owner');
select public.purchase_list_item('40000000-0000-0000-0000-0000000000c1', 45.5);
select tests.assert((select count(*) = 2 from public.generate_monthly_report(extract(year from now())::int, extract(month from now())::int, '10000000-0000-0000-0000-000000000001')),
  'mixed currencies produce one report per currency');
select tests.assert((select total_budget = 300000 from public.monthly_reports where group_id is not null and currency_code = 'XAF'), 'XAF totals exclude USD');
select tests.assert((select total_budget = 50 and total_purchased = 45.5 and total_variance = -4.5 from public.monthly_reports where currency_code = 'USD'), 'USD totals stand alone');
select tests.assert((select category_name_snapshot = 'Electronics' from public.monthly_report_items i join public.monthly_reports r on r.id = i.report_id where r.currency_code = 'USD'),
  'items without a category fall back to the list category');
reset role;

-- Scheduled job for last month: final, idempotent, and notifies owners and partners once. Month boundaries use the
-- owner's timezone: 00:30 on the 1st in Douala (UTC+1) is still the previous day in UTC.
update public.user_settings set timezone = 'Africa/Douala' where user_id = tests.id('owner');
select tests.throws($$ update public.user_settings set timezone = 'Mars/Olympus' $$, 'VALIDATION_ERROR', 'timezone must be a real zone');
select pg_temp.backdated_purchase('20000000-0000-0000-0000-000000000001', 'Beans', 'Food Stuffs', 10000, 9000, 'partner',
  make_timestamptz(extract(year from date_trunc('month', now()) - interval '1 month')::int, extract(month from date_trunc('month', now()) - interval '1 month')::int, 1, 0, 30, 0, 'Africa/Douala'));
select pg_temp.backdated_purchase('20000000-0000-0000-0000-000000000001', 'Pans', 'Kitchen', 30000, 32000, 'grouppartner',
  make_timestamptz(extract(year from date_trunc('month', now()) - interval '1 month')::int, extract(month from date_trunc('month', now()) - interval '1 month')::int, 15, 12, 0, 0, 'Africa/Douala'));
-- Expected: the group report (owner in Douala: Beans + Pans) and grouppartner's personal report (Pans). The partner
-- keeps UTC, so for them Beans falls in the month before and they get no personal report for last month.
select tests.assert(private.generate_previous_month_reports() = 2, 'job creates the group report and personal reports per purchaser timezone');
select tests.assert((select total_budget = 40000 and total_purchased = 41000 and total_variance = 1000 from public.monthly_reports
  where group_id is not null and (year, month) <> (extract(year from now())::int, extract(month from now())::int)), 'first-of-month purchase counts in the owner''s month');
select tests.assert(not exists (select 1 from public.monthly_reports where owner_id = tests.id('partner') and (year, month) <> (extract(year from now())::int, extract(month from now())::int)),
  'the same purchase belongs to the previous month in UTC');
select tests.assert((select count(*) = 1 from public.notifications where type = 'MONTHLY_REPORT' and user_id = tests.id('owner')), 'owner is notified');
select tests.assert((select count(*) = 2 from public.notifications where type = 'MONTHLY_REPORT' and user_id = tests.id('grouppartner')), 'group partner gets the group and personal report');
select tests.assert(not exists (select 1 from public.notifications where type = 'MONTHLY_REPORT' and user_id = tests.id('viewer')), 'viewers are not sent reports');
update public.categories set name = 'Groceries' where name = 'Food Stuffs' and is_default;
select tests.assert(private.generate_previous_month_reports() = 2, 'rerunning the job returns the final reports');
select tests.assert((select count(*) = 2 from public.monthly_reports where (year, month) <> (extract(year from now())::int, extract(month from now())::int)), 'rerunning creates nothing new');
select tests.assert((select count(*) = 1 from public.notifications where type = 'MONTHLY_REPORT' and user_id = tests.id('owner')), 'rerunning sends no new notifications');
select tests.assert(exists (select 1 from public.monthly_report_items i join public.monthly_reports r on r.id = i.report_id
  where i.category_name_snapshot = 'Food Stuffs' and (r.year, r.month) <> (extract(year from now())::int, extract(month from now())::int)),
  'final reports keep the category name they were issued with');

rollback;
