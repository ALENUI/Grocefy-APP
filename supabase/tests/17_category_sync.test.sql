-- A home item and its pending To-buy entries share one category, and a home whose lists were all deleted gets a new
-- To-buy list when something runs out.
begin;
select tests.household(); -- Rice (40…01) and Oil (40…02) are pending on Food, so they are in the home as finished

select tests.login('owner');
insert into public.categories (id, user_id, name) values ('50000000-0000-0000-0000-0000000000d1', auth.uid(), 'Grains'), ('50000000-0000-0000-0000-0000000000d2', auth.uid(), 'Snacks');
update public.home_items set category_id = '50000000-0000-0000-0000-0000000000d1' where product_id = '30000000-0000-0000-0000-000000000001';
select tests.assert((select category_id = '50000000-0000-0000-0000-0000000000d1' from public.list_items where id = '40000000-0000-0000-0000-000000000001'),
  'a category changed at home moves the To-buy entry to it');
update public.list_items set category_id = '50000000-0000-0000-0000-0000000000d1' where id = '40000000-0000-0000-0000-000000000002';
select tests.assert((select category_id = '50000000-0000-0000-0000-0000000000d1' from public.home_items where product_id = '30000000-0000-0000-0000-000000000002'),
  'a category changed on To-buy moves the home item to it');
update public.list_items set category_id = null where id = '40000000-0000-0000-0000-000000000002';
select tests.assert((select c.name = 'General' from public.home_items h join public.categories c on c.id = h.category_id where h.product_id = '30000000-0000-0000-0000-000000000002'),
  'clearing the category on To-buy puts the home item under General');
select tests.assert((select c.name = 'General' from public.list_items i join public.categories c on c.id = i.category_id where i.id = '40000000-0000-0000-0000-000000000002'),
  'and the To-buy entry follows it there');

-- An item added at home under a new category goes on To-buy under that category.
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000d1', auth.uid(), 'Crisps'), ('30000000-0000-0000-0000-0000000000d2', auth.uid(), 'Soap');
insert into public.home_items (id, group_id, product_id, category_id) values
  ('70000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000d2');
select tests.assert((select category_id = '50000000-0000-0000-0000-0000000000d2' from public.mark_home_item('70000000-0000-0000-0000-0000000000d1', 'out')),
  'marking it finished puts it on To-buy under its own category');

-- Every list of the home deleted: marking something low creates a new To-buy list, owned by the home's owner.
update public.shopping_lists set archived_at = now() where group_id = '10000000-0000-0000-0000-000000000001';
insert into public.home_items (id, group_id, product_id) values ('70000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000d2');
reset role;
select tests.login('grouppartner');
select set_config('tests.entry_list', (select list_id::text from public.mark_home_item('70000000-0000-0000-0000-0000000000d2', 'low')), true);
select tests.assert((select name = 'To buy' and owner_id = tests.id('owner') and archived_at is null from public.shopping_lists where id = current_setting('tests.entry_list')::uuid),
  'a home whose lists were all deleted gets a new To-buy list');
reset role;
select tests.login('stranger');
select tests.throws($$ select public.home_to_buy_list('10000000-0000-0000-0000-000000000001') $$, 'FORBIDDEN', 'outsiders cannot create lists in a home');
reset role;

rollback;
