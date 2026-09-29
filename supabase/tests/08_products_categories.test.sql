-- Product search ranking and visibility; custom categories on shared lists.
begin;
select tests.household();

select tests.login('owner');
insert into public.products (owner_id, name) values (auth.uid(), 'Brown Rice'), (auth.uid(), 'Rice Flour'), (auth.uid(), 'Wild rice'), (auth.uid(), '100% Juice'), (auth.uid(), 'Soap');
update public.products set archived_at = now() where name = 'Soap';
select tests.assert((select (array_agg(name))[1:2] = array['Rice', 'Rice Flour'] and count(*) = 4 and bool_and(name ilike '%rice%') from public.search_products('rice')),
  'exact match first, then prefix matches, then other matches');
select tests.assert(exists (select 1 from public.search_products('Cooking Oils')), 'close variants match by trigram similarity');
select tests.assert(not exists (select 1 from public.search_products('xylophone')), 'unrelated queries return nothing');
select tests.assert((select array_agg(name) from public.search_products('100%')) = array['100% Juice'], 'wildcards in the query are literal');
select tests.assert(not exists (select 1 from public.search_products('soap')), 'archived products are not suggested');
select tests.assert(not exists (select 1 from public.search_products('   ')), 'blank queries return nothing');
select tests.assert((select count(*) = 2 from public.search_products('r', 2)), 'results are limited');
reset role;

select tests.login('stranger');
insert into public.products (owner_id, name) values (auth.uid(), 'rice');
select tests.assert((select array_agg(owner_id = auth.uid()) from public.search_products('rice')) = array[true], 'non-members only find their own products');
reset role;

-- The partner sees the owner's Rice through the shared list and has their own "rice": one result, their own.
select tests.login('partner');
insert into public.products (owner_id, name) values (auth.uid(), 'rice');
select tests.assert((select count(*) = 1 and bool_and(owner_id = auth.uid()) from public.search_products('rice') where lower(name) = 'rice'), 'same-named products collapse, preferring the caller''s own');
select tests.assert(exists (select 1 from public.search_products('Cooking')), 'products on shared lists are suggested');

-- Custom categories: a partner's category used on a shared list becomes visible to the list's members.
insert into public.categories (id, user_id, name) values ('50000000-0000-0000-0000-000000000001', auth.uid(), 'Baby Care');
update public.list_items set category_id = '50000000-0000-0000-0000-000000000001' where id = '40000000-0000-0000-0000-000000000002';
reset role;
select tests.login('owner');
select tests.assert(exists (select 1 from public.categories where name = 'Baby Care'), 'categories used on shared items are visible to members');
select tests.affects_no_rows($$ update public.categories set name = 'Mine now' where name = 'Baby Care' $$, 'only the creator can rename a custom category');
select tests.affects_no_rows($$ update public.categories set name = 'Groceries' where name = 'Food Stuffs' $$, 'default categories cannot be renamed');
select tests.affects_no_rows($$ delete from public.categories $$, 'categories are archived, never deleted');
reset role;
select tests.login('partner');
update public.categories set name = 'Baby & Kids', archived_at = now() where id = '50000000-0000-0000-0000-000000000001';
select tests.assert((select name = 'Baby & Kids' and archived_at is not null from public.categories where id = '50000000-0000-0000-0000-000000000001'), 'the creator can rename and archive');
reset role;
select tests.login('stranger');
insert into public.shopping_lists (id, owner_id, name, currency_code) values ('20000000-0000-0000-0000-0000000000f1', auth.uid(), 'Mine', 'XAF');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000f1', auth.uid(), 'Milk');
select tests.throws($$ insert into public.list_items (list_id, product_id, category_id, budgeted_unit_price) values ('20000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000f1', '50000000-0000-0000-0000-000000000001', 1) $$,
  'NOT_FOUND', 'categories the caller cannot see cannot be attached');
reset role;

rollback;
