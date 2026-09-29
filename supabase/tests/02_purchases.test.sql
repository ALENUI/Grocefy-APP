-- Purchase transaction, immutability, price history, suggestions, and totals.
begin;
select tests.household();

select tests.login('partner');
select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500);
select tests.assert((select user_id = tests.id('partner') and currency_code = 'XAF' and budgeted_amount = 25000 and purchased_amount = 23500
  from public.purchases where list_item_id = '40000000-0000-0000-0000-000000000001'), 'purchase derives purchaser, currency, and budget from the database');
select tests.assert((select status = 'purchased' and purchased_at is not null from public.list_items where id = '40000000-0000-0000-0000-000000000001'), 'item is marked purchased');
select tests.assert((select price = 23500 and currency_code = 'XAF' from public.price_history where product_id = '30000000-0000-0000-0000-000000000001'), 'price history records amount and currency');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 20000) $$, 'ALREADY_PURCHASED', 'an item cannot be purchased twice');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000002', -1) $$, 'VALIDATION_ERROR', 'negative amounts are rejected');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000002') $$, 'VALIDATION_ERROR', 'an amount or use_budgeted_amount is required');
select public.purchase_list_item('40000000-0000-0000-0000-000000000002', null, true);
select tests.assert((select purchased_amount = 6000 from public.purchases where list_item_id = '40000000-0000-0000-0000-000000000002'), 'use_budgeted_amount pays quantity × unit budget');
select tests.assert((select price = 3000 from public.price_history where product_id = '30000000-0000-0000-0000-000000000002'), 'price history stores the unit price');
select tests.assert((select budgeted_total = 31000 and purchased_total = 29500 and purchased_count = 2 from public.list_totals), 'list totals aggregate budgets and purchases');
select tests.assert((select budgeted_total = 31000 and currency_code = 'XAF' from public.group_totals), 'group totals aggregate per currency');
reset role;

-- Purchased items and purchases are frozen, even for the owner.
select tests.login('owner');
select tests.throws($$ update public.list_items set budgeted_unit_price = 1 where id = '40000000-0000-0000-0000-000000000001' $$, 'ALREADY_PURCHASED', 'purchased items cannot be edited');
select tests.affects_no_rows($$ delete from public.list_items where id = '40000000-0000-0000-0000-000000000001' $$, 'purchased items cannot be deleted');
select tests.throws($$ update public.purchases set purchased_amount = 1 $$, 'permission denied', 'owners cannot rewrite purchases');
select tests.throws($$ delete from public.purchases $$, 'permission denied', 'owners cannot delete purchases');
select tests.throws($$ update public.shopping_lists set currency_code = 'USD' where id = '20000000-0000-0000-0000-000000000001' $$, 'CURRENCY_LOCKED', 'list currency is locked once it has items');
reset role;
select tests.throws($$ update public.purchases set purchased_amount = 1 $$, 'FINANCIAL_RECORD_IMMUTABLE', 'purchases are immutable for every role');
select tests.throws($$ delete from public.price_history $$, 'FINANCIAL_RECORD_IMMUTABLE', 'price history is immutable for every role');

-- Viewers can see purchase history; strangers cannot.
select tests.login('viewer');
select tests.assert((select count(*) from public.purchases) = 2, 'viewer sees purchases');
select tests.assert((select count(*) from public.price_history) = 2, 'viewer sees price history for the list');
reset role;
select tests.login('stranger');
select tests.assert(not exists (select 1 from public.purchases) and not exists (select 1 from public.price_history), 'non-members see no purchase or price history');
select tests.assert(not exists (select 1 from public.get_price_suggestion('30000000-0000-0000-0000-000000000001', 'XAF')), 'non-members get no price suggestion');
reset role;

-- Price suggestions never cross currencies.
select tests.login('owner');
select tests.assert((select suggested_unit_price = 23500 from public.get_price_suggestion('30000000-0000-0000-0000-000000000001', 'XAF')), 'same-currency list suggests the last price');
select tests.assert((select suggested_unit_price is null and latest_unit_price = 23500 and latest_currency_code = 'XAF'
  from public.get_price_suggestion('30000000-0000-0000-0000-000000000001', 'USD')), 'other-currency list shows the original price without suggesting it');
reset role;

-- Atomicity: if any step fails, nothing is written.
select tests.login('owner');
insert into public.list_items (id, list_id, product_id, budgeted_unit_price) values ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 24000);
reset role;
create function pg_temp.fail_price_history() returns trigger language plpgsql as $$ begin raise exception 'SIMULATED_FAILURE'; end $$;
create trigger simulated_failure before insert on public.price_history for each row execute function pg_temp.fail_price_history();
select tests.login('partner');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000009', 22000) $$, 'SIMULATED_FAILURE', 'the simulated failure aborts the purchase');
reset role;
drop trigger simulated_failure on public.price_history;
select tests.assert(not exists (select 1 from public.purchases where list_item_id = '40000000-0000-0000-0000-000000000009'), 'no partial purchase is left behind');
select tests.assert((select status = 'pending' from public.list_items where id = '40000000-0000-0000-0000-000000000009'), 'the item stays pending after a failed purchase');

rollback;
