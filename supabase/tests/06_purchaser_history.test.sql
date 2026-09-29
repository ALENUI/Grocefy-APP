-- A purchaser's own history survives losing access to the list it was bought on.
begin;
select tests.household();

select tests.login('partner');
select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500);
reset role;
select tests.login('viewer');
select tests.assert((select count(*) = 1 from public.purchases), 'members see purchases on the list');
reset role;

delete from public.list_members where user_id in (tests.id('partner'), tests.id('viewer'));

select tests.login('partner');
select tests.assert(not exists (select 1 from public.shopping_lists), 'removed partner no longer sees the list');
select tests.assert((select count(*) = 1 and bool_and(purchased_amount = 23500 and currency_code = 'XAF') from public.purchases), 'removed partner keeps their purchase history');
select tests.assert((select name = 'Rice' from public.products), 'product names in the partner''s history stay readable');
select tests.assert(not exists (select 1 from public.products where name = 'Cooking Oil'), 'products they never bought stay hidden');
select tests.assert((select suggested_unit_price = 23500 from public.get_price_suggestion('30000000-0000-0000-0000-000000000001', 'XAF')), 'their price memory is kept');
reset role;

select tests.login('viewer');
select tests.assert(not exists (select 1 from public.purchases), 'removed members who did not purchase see nothing');
reset role;

rollback;
