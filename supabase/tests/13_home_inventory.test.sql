-- Home inventory: the core flow (running low → To buy with last price → bought at a new price → back in stock →
-- next time the new price is suggested), roles, visibility, pushes to housemates, and home creation.
begin;
select tests.household(); -- House Shopping (owner; grouppartner is a member) with its Food list
select tests.create_user('kid');
insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', tests.id('kid'), 'viewer');

-- Creating a home gives it a To-buy list and makes it the current home.
select tests.create_user('amara', 'USD');
select tests.login('amara');
select set_config('tests.amara_home', (select id::text from public.create_home('Amara''s flat')), false);
select tests.assert((select currency_code = 'USD' from public.shopping_groups where id = current_setting('tests.amara_home')::uuid), 'a home uses the creator''s default currency');
select tests.assert((select name = 'To buy' and currency_code = 'USD' from public.shopping_lists where group_id = current_setting('tests.amara_home')::uuid), 'a home starts with a To-buy list');
select tests.assert((select current_home_id::text = current_setting('tests.amara_home') from public.user_settings), 'the new home becomes the current home');
select tests.throws(format('update public.user_settings set current_home_id = %L', '10000000-0000-0000-0000-000000000001'), 'FORBIDDEN', 'the current home must be one you belong to');
reset role;

-- The owner sets up the inventory.
select tests.login('owner');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000d1', auth.uid(), 'Soap');
insert into public.home_items (id, group_id, product_id, usual_quantity) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000d1', 4);
select public.register_push_token('ExponentPushToken[owner]', 'ios');
reset role;

-- A housemate sees the inventory, including products the owner added, and marks things.
select tests.login('grouppartner');
select tests.assert((select count(*) = 2 and bool_and(status = 'in_stock') from public.home_items), 'members see the home inventory');
select tests.assert(exists (select 1 from public.products where name = 'Soap'), 'members see products in the inventory');
select tests.assert((select id = '40000000-0000-0000-0000-000000000001' from public.mark_home_item('70000000-0000-0000-0000-000000000001', 'low')),
  'Rice is already on the To-buy list, so it is not added twice');
select set_config('tests.soap_item', (select id::text from public.mark_home_item('70000000-0000-0000-0000-000000000002', 'out')), false);
select tests.assert((select list_id = '20000000-0000-0000-0000-000000000001' and status = 'pending' and quantity = 4 and budgeted_unit_price = 0
  from public.list_items where id = current_setting('tests.soap_item')::uuid), 'a finished item goes on the To-buy list with its usual quantity (no price yet)');
select tests.assert((select status = 'out' and updated_by = auth.uid() from public.home_items where id = '70000000-0000-0000-0000-000000000002'), 'the inventory shows it as finished, and who said so');

-- At the market: bought at 1,500 each. The price is recorded and the item is back in stock.
select public.purchase_list_item(current_setting('tests.soap_item')::uuid, 6000);
select tests.assert((select status = 'in_stock' from public.home_items where id = '70000000-0000-0000-0000-000000000002'), 'buying an item puts it back in stock');

-- Next time it runs low, the price paid last time is the expected price.
select set_config('tests.soap_again', (select id::text from public.mark_home_item('70000000-0000-0000-0000-000000000002', 'low')), false);
select tests.assert((select budgeted_unit_price = 1500 and budgeted_total = 6000 from public.list_items where id = current_setting('tests.soap_again')::uuid),
  'the next To-buy entry is budgeted at the last price paid');
select tests.assert((select public.mark_home_item('70000000-0000-0000-0000-000000000002', 'in_stock') is null), 'marking in stock adds nothing');
reset role;

select tests.assert((select count(*) = 3 and bool_and(user_id = tests.id('owner')) from public.push_outbox where dedupe_key like 'stock:%'),
  'housemates are pushed when something runs low or finishes (not the person who marked it)');
select tests.assert(exists (select 1 from public.push_outbox where body = 'grouppartner: Soap is finished' and title = 'House Shopping'), 'the push says what is finished');

-- View-only members see the inventory but cannot change it; outsiders see nothing.
select tests.login('kid');
select tests.assert((select count(*) = 2 from public.home_items), 'view-only members see the inventory');
select tests.throws($$ select public.mark_home_item('70000000-0000-0000-0000-000000000001', 'out') $$, 'FORBIDDEN', 'view-only members cannot mark items');
select tests.throws($$ insert into public.home_items (group_id, product_id) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001') $$,
  'row-level security', 'view-only members cannot add items');
reset role;
select tests.login('stranger');
select tests.assert(not exists (select 1 from public.home_items), 'outsiders see no inventory');
select tests.throws($$ select public.mark_home_item('70000000-0000-0000-0000-000000000001', 'out') $$, 'NOT_FOUND', 'outsiders cannot mark items');
select tests.throws($$ delete from public.home_items $$, 'permission denied', 'inventory items are archived, never deleted');
reset role;

rollback;
