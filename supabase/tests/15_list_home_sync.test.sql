-- To-buy and Home stay in step: adding to a home's To-buy list puts the item in the home as finished, buying it puts
-- it back in stock, and running-low items stay low. Personal lists leave the home alone.
begin;
select tests.household(); -- House Shopping with its Food list holding Rice and Cooking Oil
select tests.assert((select count(*) = 2 and bool_and(status = 'out') from public.home_items where group_id = '10000000-0000-0000-0000-000000000001'),
  'items on the To-buy list are in the home as finished');
select tests.assert((select usual_quantity = 2 from public.home_items where product_id = '30000000-0000-0000-0000-000000000002'), 'the home item takes the To-buy quantity');

-- An editor adds Sugar (bulk) to the list: it appears in the home as finished.
select tests.login('editor');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000e1', auth.uid(), 'Sugar');
insert into public.list_items (id, list_id, product_id, quantity, budgeted_unit_price, is_bulk)
values ('40000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000e1', 1, 9000, true);
select tests.assert((select is_bulk from public.list_items where id = '40000000-0000-0000-0000-0000000000e1'), 'a To-buy item can be counted in bulk');
reset role;
select tests.assert((select status = 'out' and created_by = tests.id('editor') from public.home_items where product_id = '30000000-0000-0000-0000-0000000000e1'),
  'a new To-buy item is added to the home as finished, by whoever added it');

-- The partner buys Sugar: back in stock at home.
select tests.login('partner');
select public.purchase_list_item('40000000-0000-0000-0000-0000000000e1', 9000);
reset role;
select tests.assert((select status = 'in_stock' from public.home_items where product_id = '30000000-0000-0000-0000-0000000000e1'), 'buying a To-buy item restocks it at home');

-- Adding it again marks the in-stock home item finished; a running-low item stays low.
update public.home_items set status = 'low' where product_id = '30000000-0000-0000-0000-000000000001';
select tests.login('editor');
insert into public.list_items (list_id, product_id, quantity, budgeted_unit_price) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000e1', 1, 9000),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 25000);
reset role;
select tests.assert((select status = 'out' from public.home_items where product_id = '30000000-0000-0000-0000-0000000000e1'), 'adding an in-stock item to To-buy marks it finished');
select tests.assert((select status = 'low' from public.home_items where product_id = '30000000-0000-0000-0000-000000000001'), 'an item marked running low stays low');

-- An archived home item comes back when it is put on the list again.
update public.home_items set archived_at = now(), status = 'in_stock' where product_id = '30000000-0000-0000-0000-000000000002';
select tests.login('owner');
insert into public.list_items (list_id, product_id, quantity, budgeted_unit_price) values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 1, 3000);
reset role;
select tests.assert((select archived_at is null and status = 'out' from public.home_items where product_id = '30000000-0000-0000-0000-000000000002'), 'an archived item returns to the home as finished');

-- A personal list (no home) does not touch any home.
select tests.login('stranger');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000e2', auth.uid(), 'Tea');
insert into public.shopping_lists (id, owner_id, name, currency_code) values ('20000000-0000-0000-0000-0000000000e2', auth.uid(), 'Mine', 'XAF');
insert into public.list_items (list_id, product_id, quantity, budgeted_unit_price) values ('20000000-0000-0000-0000-0000000000e2', '30000000-0000-0000-0000-0000000000e2', 1, 500);
reset role;
select tests.assert(not exists (select 1 from public.home_items where product_id = '30000000-0000-0000-0000-0000000000e2'), 'personal lists do not add to a home');

rollback;
