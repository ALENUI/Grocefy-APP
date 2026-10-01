-- Activity log entries, their visibility, and list duplication with same-currency price refresh.
begin;
select tests.household();
delete from public.activity_log; -- ignore fixture setup (performed without a user session)

select tests.login('owner');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000a1', auth.uid(), 'Sugar');
insert into public.list_items (id, list_id, product_id, quantity, budgeted_unit_price) values
  ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000a1', 2, 800);
reset role;
select tests.login('editor');
update public.list_items set budgeted_unit_price = 900 where id = '40000000-0000-0000-0000-0000000000a1';
delete from public.list_items where id = '40000000-0000-0000-0000-0000000000a1';
reset role;
select tests.login('partner');
select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500);
reset role;
select tests.login('owner');
update public.list_members set role = 'editor' where user_id = tests.id('viewer');
reset role;
insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', tests.id('stranger'), 'viewer');

select tests.assert((select actor_id = tests.id('owner') and subject = 'Sugar' and (metadata ->> 'budgeted_total')::numeric = 1600 from public.activity_log where action = 'ITEM_ADDED'),
  'adding an item records who, what, and the budget');
select tests.assert((select actor_id = tests.id('editor') and (metadata ->> 'previous_budgeted_total')::numeric = 1600 and (metadata ->> 'budgeted_total')::numeric = 1800
  from public.activity_log where action = 'ITEM_EDITED'), 'budget edits record the before and after');
select tests.assert((select actor_id = tests.id('editor') and subject = 'Sugar' from public.activity_log where action = 'ITEM_REMOVED'), 'removals are recorded');
select tests.assert((select actor_id = tests.id('partner') and subject = 'Rice' and (metadata ->> 'purchased_amount')::numeric = 23500 and metadata ->> 'currency_code' = 'XAF'
  from public.activity_log where action = 'ITEM_PURCHASED'), 'purchases record the amount and currency');
select tests.assert((select count(*) = 1 from public.activity_log where action = 'ITEM_EDITED'), 'the purchase itself is not logged as an edit');
select tests.assert((select subject = 'viewer' and metadata ->> 'previous_role' = 'viewer' and metadata ->> 'role' = 'editor' from public.activity_log where action = 'MEMBER_ROLE_CHANGED'),
  'role changes record both roles');
select tests.assert((select list_id is null and group_id = '10000000-0000-0000-0000-000000000001' and subject = 'stranger' from public.activity_log where action = 'MEMBER_ADDED'),
  'group membership is recorded on the group');

-- Visibility
select tests.login('viewer');
select tests.assert((select count(*) = 5 from public.activity_log), 'list members see the list''s activity, but not group-only events');
select tests.throws($$ insert into public.activity_log (action, list_id) values ('ITEM_ADDED', '20000000-0000-0000-0000-000000000001') $$, 'permission denied', 'activity cannot be forged');
reset role;
select tests.login('grouppartner');
select tests.assert((select count(*) = 6 from public.activity_log), 'group members see list and group activity');
reset role;
delete from public.group_members where user_id = tests.id('stranger');
select tests.login('stranger');
select tests.assert(not exists (select 1 from public.activity_log where list_id is not null), 'non-members see no list activity');
reset role;

-- Duplicating: Rice was bought at 23,500 XAF (budget 25,000); Cooking Oil has no price history.
select tests.login('owner');
insert into public.shopping_lists (id, owner_id, name, currency_code) values ('20000000-0000-0000-0000-0000000000a2', auth.uid(), 'Imports', 'USD');
insert into public.list_items (id, list_id, product_id, budgeted_unit_price) values ('40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001', 50);
select public.purchase_list_item('40000000-0000-0000-0000-0000000000a2', 45);
select set_config('tests.copy', (select id::text from public.duplicate_list('20000000-0000-0000-0000-000000000001', 'Food next week')), false);
select tests.assert((select owner_id = auth.uid() and group_id = '10000000-0000-0000-0000-000000000001' and currency_code = 'XAF' and name = 'Food next week'
  from public.shopping_lists where id = current_setting('tests.copy')::uuid), 'the copy belongs to the caller, keeps the group and currency');
select tests.assert((select bool_and(status = 'pending') and count(*) = 2 from public.list_items where list_id = current_setting('tests.copy')::uuid), 'every item is pending again');
select tests.assert((select budgeted_unit_price = 23500 from public.list_items where list_id = current_setting('tests.copy')::uuid and product_id = '30000000-0000-0000-0000-000000000001'),
  'budgets refresh to the latest price in the list currency (the later USD price is ignored)');
select tests.assert((select budgeted_unit_price = 3000 and quantity = 2 from public.list_items where list_id = current_setting('tests.copy')::uuid and product_id = '30000000-0000-0000-0000-000000000002'),
  'items without price history keep their budget and quantity');
select tests.assert((select name = 'Food (copy)' from public.duplicate_list('20000000-0000-0000-0000-000000000001')), 'a default name is used when none is given');
reset role;

select tests.login('editor');
select tests.assert((select owner_id = auth.uid() and group_id is null from public.duplicate_list('20000000-0000-0000-0000-000000000001')),
  'members without group rights get a personal copy outside the group');
reset role;
select tests.login('stranger');
select tests.throws($$ select public.duplicate_list('20000000-0000-0000-0000-000000000001') $$, 'NOT_FOUND', 'non-members cannot duplicate');
reset role;

rollback;
