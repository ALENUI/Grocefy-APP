-- Push tokens, what gets queued for whom, opt-outs, and the worker claim cycle.
begin;
select tests.household();
select tests.create_user('quiet');

-- Token registration
select tests.login('owner');
select public.register_push_token('ExponentPushToken[owner-phone]', 'ios');
select tests.throws($$ select public.register_push_token('not-a-token', 'ios') $$, 'VALIDATION_ERROR', 'only Expo push tokens are accepted');
select tests.throws($$ insert into public.push_tokens (user_id, token) values (auth.uid(), 'ExponentPushToken[forged]') $$, 'permission denied', 'tokens are registered only through the function');
select tests.assert((select count(*) = 1 from public.push_tokens), 'users see their own tokens');
reset role;
select tests.login('viewer');
select public.register_push_token('ExponentPushToken[viewer-phone]', 'android');
select tests.assert((select count(*) = 1 and bool_and(token = 'ExponentPushToken[viewer-phone]') from public.push_tokens), 'users never see other users'' tokens');
reset role;
select tests.login('editor');
select public.register_push_token('ExponentPushToken[editor-phone]', 'android');
reset role;
select tests.login('grouppartner');
select public.register_push_token('ExponentPushToken[grouppartner-phone]', 'android');
reset role;
select tests.login('quiet');
select public.register_push_token('ExponentPushToken[shared-phone]', 'ios');
reset role;
-- The same phone signed in by someone else moves the token to them.
select tests.login('stranger');
select public.register_push_token('ExponentPushToken[shared-phone]', 'ios');
reset role;
select tests.assert((select user_id = tests.id('stranger') from public.push_tokens where token = 'ExponentPushToken[shared-phone]'), 'a re-registered token moves to the new user');
update public.user_settings set push_notifications = false where user_id = tests.id('editor');

-- A purchase notifies everyone else who can see the list (not the buyer, not opted-out users, not users without a device).
select tests.login('partner');
select public.register_push_token('ExponentPushToken[partner-phone]', 'ios');
select public.purchase_list_item('40000000-0000-0000-0000-000000000001', 23500);
reset role;
select tests.assert((select array_agg(user_id order by user_id) = (select array_agg(id order by id) from (values (tests.id('owner')), (tests.id('viewer')), (tests.id('grouppartner'))) v(id))
  from public.push_outbox where dedupe_key like 'purchase:%'), 'owner, list members, and group members are notified');
select tests.assert((select bool_and(title = 'Food' and body = 'partner bought Rice for 23500 XAF' and data ->> 'url' = '/list/20000000-0000-0000-0000-000000000001')
  from public.push_outbox where dedupe_key like 'purchase:%'), 'the push names the buyer, item, amount, currency, and opens the list');

-- In-app notifications are pushed too.
select tests.login('owner');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'stranger');
reset role;
select tests.assert((select title = 'You have been invited to join Food' and data ->> 'url' = '/inbox' from public.push_outbox where user_id = tests.id('stranger')), 'invitations are pushed and open the inbox');
select tests.assert(not exists (select 1 from public.push_outbox where user_id = tests.id('quiet')), 'users without a device get no pushes');

-- Clients cannot read or drain the push queue.
select tests.login('owner');
select tests.throws($$ select * from public.push_outbox $$, 'permission denied', 'clients cannot read the push queue');
select tests.throws($$ select public.claim_push_batch() $$, 'permission denied', 'clients cannot claim pushes');
select public.unregister_push_token('ExponentPushToken[owner-phone]');
select tests.assert(not exists (select 1 from public.push_tokens), 'users can unregister their device');
reset role;

-- Worker cycle (service role)
select set_config('role', 'service_role', true);
select tests.assert((select count(*) = 4 from public.claim_push_batch(10)), 'the worker claims every due push');
select tests.assert((select count(*) = 0 from public.claim_push_batch(10)), 'claimed pushes are not handed out twice');
select public.complete_push(id, 'sent') from public.push_outbox where user_id = tests.id('owner');
select public.complete_push(id, 'failed', 'Expo push service unavailable') from public.push_outbox where user_id = tests.id('viewer');
reset role;
select tests.assert((select status = 'sent' from public.push_outbox where user_id = tests.id('owner')), 'sent pushes are recorded');
select tests.assert((select status = 'failed' and next_attempt_at > now() from public.push_outbox where user_id = tests.id('viewer')), 'failures retry later');

rollback;
