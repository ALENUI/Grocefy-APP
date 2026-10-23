-- Deleting an account: shared homes and lists pass on, what nobody else uses is deleted, and kept purchases lose
-- their purchaser but not their amounts.
begin;
select tests.household(); -- House Shopping (owner; grouppartner is a partner) with the Food list (partner, editor, viewer)

-- The Food list partner buys Rice.
select tests.login('partner');
select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500, false, '60000000-0000-0000-0000-0000000000e1');
reset role;
-- grouppartner already has a home called House Shopping.
select tests.login('grouppartner');
select public.create_home('House Shopping', 'XAF');
reset role;
-- The owner also keeps a list nobody else uses, with a product only they use.
select tests.login('owner');
insert into public.shopping_lists (id, owner_id, name, currency_code) values ('20000000-0000-0000-0000-0000000000e1', auth.uid(), 'Just me', 'XAF');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000e1', auth.uid(), 'Gum');
insert into public.list_items (list_id, product_id, budgeted_unit_price) values ('20000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1', 100);
select public.delete_account();
reset role;

select tests.assert(not exists (select 1 from auth.users where id = tests.id('owner')) and not exists (select 1 from public.profiles where id = tests.id('owner')),
  'the account and profile are gone');
select tests.assert((select owner_id = tests.id('grouppartner') and name = 'House Shopping (owner)' from public.shopping_groups where id = '10000000-0000-0000-0000-000000000001'),
  'the shared home passes to its partner (renamed, since they have a home with that name)');
select tests.assert(not exists (select 1 from public.group_members where group_id = '10000000-0000-0000-0000-000000000001' and user_id = tests.id('grouppartner')),
  'the new owner is no longer a member of their own home');
select tests.assert((select owner_id = tests.id('grouppartner') from public.shopping_lists where id = '20000000-0000-0000-0000-000000000001'),
  'lists in the home pass with it');
select tests.assert(not exists (select 1 from public.shopping_lists where id = '20000000-0000-0000-0000-0000000000e1'), 'a list nobody else uses is deleted');
select tests.assert(not exists (select 1 from public.products where id = '30000000-0000-0000-0000-0000000000e1'), 'a product only they used is deleted');
select tests.assert((select owner_id is null from public.products where id = '30000000-0000-0000-0000-000000000001'), 'a product others use stays, without an owner');
select tests.assert((select count(*) = 2 from public.list_items where list_id = '20000000-0000-0000-0000-000000000001'), 'the shared list keeps its items');

-- The partner who bought Rice deletes their account too: the purchase stays, without a purchaser.
select tests.login('partner');
select public.delete_account();
reset role;
select tests.assert((select count(*) = 1 and bool_and(user_id is null and purchased_amount = 23500) from public.purchases), 'purchases stay, without the purchaser');
select tests.assert((select count(*) = 1 and bool_and(user_id is null) from public.price_history), 'price history stays, without the purchaser');
select set_config('grocefy.deleting_account', '', true); -- the flag lasts until the end of the transaction, which here is the whole test
select tests.throws($$ delete from public.purchases $$, 'FINANCIAL_RECORD_IMMUTABLE', 'purchases are still immutable otherwise');

-- A home nobody else uses is deleted with its purchases.
select tests.login('stranger');
select set_config('tests.home', (select id::text from public.create_home('Flat', 'XAF')), true);
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000e2', auth.uid(), 'Bread');
insert into public.list_items (id, list_id, product_id, budgeted_unit_price)
select '40000000-0000-0000-0000-0000000000e2', id, '30000000-0000-0000-0000-0000000000e2', 500 from public.shopping_lists where group_id = current_setting('tests.home')::uuid;
select public.purchase_list_item('40000000-0000-0000-0000-0000000000e2', null, true);
select public.delete_account();
reset role;
select tests.assert(not exists (select 1 from public.shopping_groups where id = current_setting('tests.home')::uuid)
  and not exists (select 1 from public.purchases where product_id = '30000000-0000-0000-0000-0000000000e2')
  and not exists (select 1 from public.home_items where group_id = current_setting('tests.home')::uuid), 'a home nobody else uses is deleted with everything in it');

select tests.login_anon();
select tests.throws($$ select public.delete_account() $$, 'permission denied', 'signed-out callers cannot delete accounts');
reset role;

rollback;
