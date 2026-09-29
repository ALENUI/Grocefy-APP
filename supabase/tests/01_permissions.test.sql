-- Role matrix: Viewer, Editor, Partner, Owner, group-inherited roles, non-members, and anonymous requests.
begin;
select tests.household();

-- Anonymous ------------------------------------------------------------------------------------------------------
select tests.login_anon();
select tests.assert((select count(*) from public.currencies) = 11, 'anonymous users can read the currency registry');
select tests.throws($$ select * from public.profiles $$, 'permission denied', 'anonymous users cannot read profiles');
select tests.throws($$ select * from public.shopping_lists $$, 'permission denied', 'anonymous users cannot read lists');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 1) $$, 'permission denied', 'anonymous users cannot purchase');
reset role;

-- Non-member -----------------------------------------------------------------------------------------------------
select tests.login('stranger');
select tests.assert(not exists (select 1 from public.shopping_lists), 'non-member sees no lists');
select tests.assert(not exists (select 1 from public.shopping_groups), 'non-member sees no groups');
select tests.assert(not exists (select 1 from public.list_items), 'non-member sees no items');
select tests.assert(not exists (select 1 from public.products), 'non-member sees no foreign products');
select tests.assert((select count(*) from public.profiles) = 1, 'non-member sees only their own profile');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 1) $$, 'NOT_FOUND', 'non-member cannot purchase (and cannot probe item existence)');
select tests.affects_no_rows($$ update public.list_items set budgeted_unit_price = 1 $$, 'non-member cannot edit items');
select tests.affects_no_rows($$ update public.shopping_lists set name = 'Mine' $$, 'non-member cannot edit lists');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000ff', auth.uid(), 'Salt');
select tests.throws($$ insert into public.list_items (list_id, product_id, budgeted_unit_price) values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000ff', 1) $$,
  'row-level security', 'non-member cannot add items');
select tests.throws($$ insert into public.shopping_lists (owner_id, group_id, name, currency_code) values (auth.uid(), '10000000-0000-0000-0000-000000000001', 'Sneaky', 'XAF') $$,
  'FORBIDDEN', 'non-member cannot create a list inside someone else''s group');
select tests.throws($$ insert into public.shopping_lists (owner_id, name, currency_code) values (tests.id('owner'), 'Forged', 'XAF') $$,
  'row-level security', 'users cannot create lists on behalf of someone else');
select tests.throws($$ insert into public.list_items (list_id, product_id, budgeted_unit_price) values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1) $$,
  'NOT_FOUND', 'non-member cannot reference another user''s product');
reset role;

-- Viewer ---------------------------------------------------------------------------------------------------------
select tests.login('viewer');
select tests.assert((select count(*) from public.list_items) = 2, 'viewer sees list items');
select tests.assert((select count(*) from public.products) = 2, 'viewer sees products used on the list');
select tests.assert((select budgeted_total from public.list_totals) = 31000, 'viewer sees totals');
select tests.assert(exists (select 1 from public.profiles where id = tests.id('owner')), 'viewer sees collaborator profiles');
select tests.throws($$ insert into public.list_items (list_id, product_id, budgeted_unit_price) values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1) $$,
  'row-level security', 'viewer cannot add items');
select tests.affects_no_rows($$ update public.list_items set budgeted_unit_price = 1 $$, 'viewer cannot edit items');
select tests.affects_no_rows($$ delete from public.list_items $$, 'viewer cannot delete items');
select tests.affects_no_rows($$ update public.shopping_lists set name = 'Renamed' $$, 'viewer cannot edit the list');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 1) $$, 'FORBIDDEN', 'viewer cannot purchase');
select tests.affects_no_rows($$ update public.list_members set role = 'partner' $$, 'viewer cannot change roles');
reset role;

-- Editor ---------------------------------------------------------------------------------------------------------
select tests.login('editor');
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-000000000003', auth.uid(), 'Sugar');
insert into public.list_items (id, list_id, product_id, budgeted_unit_price, status, created_by)
values ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 1500, 'purchased', tests.id('owner'));
select tests.assert((select status = 'pending' and created_by = tests.id('editor') from public.list_items where id = '40000000-0000-0000-0000-000000000003'),
  'editor can add items; status and author are server-controlled');
update public.list_items set budgeted_unit_price = 27000 where id = '40000000-0000-0000-0000-000000000001';
select tests.assert((select budgeted_total from public.list_items where id = '40000000-0000-0000-0000-000000000001') = 27000, 'editor can edit budgets');
update public.list_items set budgeted_unit_price = 25000 where id = '40000000-0000-0000-0000-000000000001';
select tests.throws($$ update public.list_items set status = 'purchased' where id = '40000000-0000-0000-0000-000000000001' $$, 'FORBIDDEN', 'editor cannot mark items purchased directly');
select tests.throws($$ update public.list_items set list_id = gen_random_uuid() where id = '40000000-0000-0000-0000-000000000001' $$, 'FORBIDDEN', 'items cannot move between lists');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 1) $$, 'FORBIDDEN', 'editor cannot purchase');
select tests.throws($$ insert into public.purchases (list_item_id, product_id, list_id, user_id, quantity, budgeted_amount, purchased_amount, currency_code)
  values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', auth.uid(), 1, 1, 1, 'XAF') $$,
  'permission denied', 'purchases cannot be inserted directly');
update public.shopping_lists set name = 'Food & Drinks' where id = '20000000-0000-0000-0000-000000000001';
select tests.assert((select name from public.shopping_lists) = 'Food & Drinks', 'editor can rename the list');
select tests.throws($$ update public.shopping_lists set archived_at = now() $$, 'FORBIDDEN', 'editor cannot archive the list');
select tests.throws($$ update public.shopping_lists set group_id = null $$, 'FORBIDDEN', 'editor cannot move the list');
select tests.affects_no_rows($$ update public.list_members set role = 'partner' $$, 'editor cannot change roles');
select tests.throws($$ insert into public.list_members (list_id, user_id, role) values ('20000000-0000-0000-0000-000000000001', tests.id('stranger'), 'partner') $$,
  'permission denied', 'members cannot be added without an invitation');
reset role;

-- Partner --------------------------------------------------------------------------------------------------------
select tests.login('partner');
select tests.assert((select purchased_amount from public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500)) = 23500, 'partner can purchase');
select tests.affects_no_rows($$ update public.list_members set role = 'viewer' where user_id = tests.id('editor') $$, 'partner cannot change roles');
select tests.affects_no_rows($$ delete from public.list_members where user_id = tests.id('editor') $$, 'partner cannot remove other members');
select tests.throws($$ update public.shopping_lists set archived_at = now() $$, 'FORBIDDEN', 'partner cannot archive the list');
reset role;

-- Group-inherited role -------------------------------------------------------------------------------------------
select tests.login('grouppartner');
select tests.assert(exists (select 1 from public.shopping_lists where id = '20000000-0000-0000-0000-000000000001'), 'group partner sees lists in the group');
select tests.assert((select purchased_amount from public.purchase_list_item('40000000-0000-0000-0000-000000000002', null, true)) = 6000, 'group partner can purchase in group lists');
insert into public.shopping_lists (owner_id, group_id, name, currency_code) values (auth.uid(), '10000000-0000-0000-0000-000000000001', 'Kitchen', 'XAF');
select tests.assert(exists (select 1 from public.shopping_lists where name = 'Kitchen'), 'group partner can create lists in the group');
reset role;

-- Owner ----------------------------------------------------------------------------------------------------------
select tests.login('owner');
select tests.assert((select count(*) from public.shopping_lists) = 2, 'group owner sees lists created by group partners');
update public.list_members set role = 'editor' where user_id = tests.id('viewer');
select tests.assert((select role = 'editor' from public.list_members where user_id = tests.id('viewer')), 'owner can change roles');
select tests.throws($$ update public.list_members set role = 'owner' where user_id = tests.id('viewer') $$, 'list_members_role_not_owner', 'ownership cannot be granted through membership');
select tests.throws($$ update public.list_members set user_id = tests.id('stranger') where user_id = tests.id('viewer') $$, 'FORBIDDEN', 'memberships cannot be reassigned');
select tests.throws($$ update public.shopping_lists set owner_id = tests.id('partner') where name = 'Food & Drinks' $$, 'OWNER_IMMUTABLE', 'ownership is immutable');
select tests.affects_no_rows($$ delete from public.shopping_lists $$, 'lists are archived, never deleted');
select tests.affects_no_rows($$ delete from public.shopping_groups $$, 'groups are archived, never deleted');
update public.shopping_lists set archived_at = now() where id = '20000000-0000-0000-0000-000000000001';
select tests.assert((select archived_at is not null from public.shopping_lists where id = '20000000-0000-0000-0000-000000000001'), 'owner can archive the list');
select tests.assert((select count(*) from public.purchases) = 2, 'purchase history survives archiving');
delete from public.list_members where user_id = tests.id('editor');
select tests.assert(not exists (select 1 from public.list_members where user_id = tests.id('editor')), 'owner can remove members');
reset role;

select tests.login('editor');
select tests.assert(not exists (select 1 from public.shopping_lists where id = '20000000-0000-0000-0000-000000000001'), 'removed members lose access');
reset role;

-- A member can leave on their own.
select tests.login('viewer');
delete from public.list_members where user_id = auth.uid();
select tests.assert(not exists (select 1 from public.shopping_lists), 'members can leave a list');
reset role;

rollback;
