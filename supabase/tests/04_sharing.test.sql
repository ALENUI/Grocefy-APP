-- Invitations: creation rules, acceptance, decline, cancellation, expiry, email invitations, and the partner flow.
begin;
select tests.household();
select tests.create_user('newcomer');

-- Only owners invite, never as owner, never themselves, never twice.
select tests.login('editor');
select tests.throws($$ select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'newcomer') $$, 'FORBIDDEN', 'editors cannot invite');
reset role;
select tests.login('partner');
select tests.throws($$ select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'newcomer') $$, 'FORBIDDEN', 'partners cannot invite');
reset role;
select tests.login('stranger');
select tests.throws($$ select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'newcomer') $$, 'NOT_FOUND', 'non-members cannot invite or probe lists');
select tests.throws($$ insert into public.invitations (inviter_id, invitee_user_id, resource_type, resource_id, role)
  values (auth.uid(), auth.uid(), 'list', '20000000-0000-0000-0000-000000000001', 'owner') $$, 'permission denied', 'invitations cannot be inserted directly');
reset role;

select tests.login('owner');
select tests.throws($$ select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'owner', 'newcomer') $$, 'VALIDATION_ERROR', 'ownership cannot be granted by invitation');
select tests.throws($$ select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'owner') $$, 'VALIDATION_ERROR', 'owners cannot invite themselves');
select tests.throws($$ select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'nobody_here') $$, 'NOT_FOUND', 'unknown usernames are rejected');
select tests.throws($$ select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'editor') $$, 'ALREADY_MEMBER', 'existing members cannot be re-invited');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'NewComer');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'partner', tests.id('newcomer')::text);
select tests.assert((select count(*) = 1 and bool_and(role = 'partner' and resource_name = 'Food') from public.invitations), 'invites by username or id; re-inviting refreshes the pending invitation');
reset role;

-- The invitee sees the invitation and a notification, but not the list, until they accept.
select tests.login('newcomer');
select tests.assert((select count(*) = 1 from public.invitations where status = 'pending'), 'invitee sees the invitation');
select tests.assert(exists (select 1 from public.notifications where type = 'INVITATION' and title = 'You have been invited to join Food'), 'invitee is notified');
select tests.assert(not exists (select 1 from public.shopping_lists), 'no access before accepting');
reset role;
select set_config('tests.invitation', (select id::text from public.invitations), false);
select tests.login('stranger');
select tests.assert(not exists (select 1 from public.invitations), 'other users cannot see the invitation');
select tests.throws(format('select public.respond_to_invitation(%L, true)', current_setting('tests.invitation')), 'NOT_FOUND', 'other users cannot accept it');
reset role;

select tests.login('newcomer');
select public.respond_to_invitation((select id from public.invitations), true);
select tests.assert((select role = 'partner' from public.list_members where user_id = auth.uid()), 'accepting creates the membership with the invited role');
select tests.assert(exists (select 1 from public.shopping_lists where id = '20000000-0000-0000-0000-000000000001'), 'accepted member sees the list');
select tests.throws(format('select public.respond_to_invitation(%L, true)', (select id from public.invitations limit 1)), 'INVITATION_NOT_PENDING', 'an invitation is answered once');

-- End-to-end partner flow: add an item, purchase it, see it in history.
insert into public.products (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000b1', auth.uid(), 'Bread');
insert into public.list_items (id, list_id, product_id, budgeted_unit_price) values ('40000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000b1', 1000);
select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500);
select tests.assert((select count(*) = 1 and bool_and(currency_code = 'XAF') from public.purchases), 'invited partner can purchase');
reset role;
select tests.login('owner');
select tests.assert(exists (select 1 from public.notifications where type = 'INVITATION_ACCEPTED' and title = 'newcomer joined Food'), 'inviter is notified of acceptance');
select tests.assert((select suggested_unit_price = 23500 from public.get_price_suggestion('30000000-0000-0000-0000-000000000001', 'XAF')), 'the partner''s purchase becomes the owner''s suggestion');
select tests.assert(exists (select 1 from public.products where name = 'Bread'), 'owner sees products added by collaborators');
reset role;

-- Group invitations grant access to every list in the group; declines grant nothing.
select tests.create_user('groupviewer');
select tests.create_user('decliner');
select tests.login('owner');
select public.create_invitation('group', '10000000-0000-0000-0000-000000000001', 'viewer', 'groupviewer');
select public.create_invitation('group', '10000000-0000-0000-0000-000000000001', 'editor', 'decliner');
reset role;
select tests.login('groupviewer');
select public.respond_to_invitation((select id from public.invitations where status = 'pending'), true);
select tests.assert((select count(*) = 1 from public.shopping_lists) and (select count(*) = 1 from public.shopping_groups), 'group member sees the group and its lists');
select tests.throws($$ select public.purchase_list_item('40000000-0000-0000-0000-000000000002', 1) $$, 'FORBIDDEN', 'group viewer role applies to group lists');
reset role;
select tests.login('decliner');
select public.respond_to_invitation((select id from public.invitations where status = 'pending'), false);
select tests.assert(not exists (select 1 from public.shopping_groups), 'declining grants no access');
reset role;

-- Cancellation and expiry.
select tests.create_user('late');
select tests.login('owner');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'late');
select public.cancel_invitation((select id from public.invitations where status = 'pending'));
reset role;
select tests.login('late');
select tests.throws(format('select public.respond_to_invitation(%L, true)', (select id from public.invitations limit 1)), 'INVITATION_NOT_PENDING', 'cancelled invitations cannot be accepted');
reset role;
select tests.login('owner');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'late');
reset role;
update public.invitations set expires_at = now() - interval '1 minute' where status = 'pending';
select tests.login('late');
select tests.throws(format('select public.respond_to_invitation(%L, true)', (select id from public.invitations where status = 'pending')), 'INVITATION_EXPIRED', 'expired invitations cannot be accepted');
reset role;
update public.invitations set status = 'expired' where status = 'pending';

-- Email invitations do not reveal whether the address is registered and require a confirmed address to accept.
select tests.login('owner');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'editor', 'Future@Example.test');
select tests.assert((select invitee_user_id is null and invitee_email = 'future@example.test' from public.invitations where status = 'pending'), 'email invitation stores only the address');
reset role;
select tests.create_user('future', 'XAF', false);
select tests.login('future');
select tests.assert(not exists (select 1 from public.invitations), 'unconfirmed addresses cannot see email invitations');
reset role;
update auth.users set email_confirmed_at = now() where id = tests.id('future');
select tests.login('future');
select public.respond_to_invitation((select id from public.invitations where status = 'pending'), true);
select tests.assert((select role = 'editor' from public.list_members where user_id = auth.uid()), 'confirmed address can accept an email invitation');
reset role;

rollback;
