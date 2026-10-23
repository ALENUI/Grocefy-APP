-- Home categories: General is the default for items added without one, and housemates see the categories used in
-- their home (also a custom one someone else created). Outsiders still do not.
begin;
select tests.household(); -- House Shopping (owner; grouppartner is a member); the Food list's items are in the home

select tests.assert(exists (select 1 from public.categories where name = 'General' and is_default and user_id is null), 'General is a default category');
select tests.assert((select bool_and(c.name = 'General') from public.home_items h join public.categories c on c.id = h.category_id),
  'home items without a category are filed under General');

-- The owner adds Diapers under a new custom category.
select tests.login('owner');
insert into public.categories (id, user_id, name) values ('50000000-0000-0000-0000-0000000000c1', auth.uid(), 'Baby');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000c1', auth.uid(), 'Diapers');
insert into public.home_items (group_id, product_id, category_id) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000c1');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000c2', auth.uid(), 'Matches');
insert into public.home_items (group_id, product_id) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000c2');
select tests.assert((select c.name = 'General' from public.home_items h join public.categories c on c.id = h.category_id where h.product_id = '30000000-0000-0000-0000-0000000000c2'),
  'an item added without a category goes under General');
update public.home_items set category_id = null where product_id = '30000000-0000-0000-0000-0000000000c2';
select tests.assert((select c.name = 'General' from public.home_items h join public.categories c on c.id = h.category_id where h.product_id = '30000000-0000-0000-0000-0000000000c2'),
  'clearing a category puts the item back under General');
reset role;

select tests.login('grouppartner');
select tests.assert(exists (select 1 from public.categories where name = 'Baby'), 'housemates see a custom category used in their home');
reset role;

select tests.login('stranger');
select tests.assert(not exists (select 1 from public.categories where name = 'Baby'), 'outsiders do not see it');
reset role;

rollback;
