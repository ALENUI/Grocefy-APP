-- Default currency, list currency, validation, and signup.
begin;
select tests.create_user('amara', 'usd');
select tests.create_user('bruno', 'ZZZ');
select tests.assert((select default_currency = 'USD' from public.user_settings where user_id = tests.id('amara')), 'signup stores the chosen default currency');
select tests.assert((select default_currency = 'XAF' from public.user_settings where user_id = tests.id('bruno')), 'an unknown signup currency falls back to XAF');
select tests.throws($$ select tests.create_user('AMARA') $$, 'profiles_username_lower_key', 'usernames are unique regardless of case');

select tests.login_anon();
select tests.assert(not public.is_username_available('Amara'), 'taken usernames are unavailable');
select tests.assert(public.is_username_available('new_user'), 'free usernames are available');
select tests.assert(not public.is_username_available('a b'), 'malformed usernames are unavailable');
reset role;

select tests.login('amara');
insert into public.shopping_lists (id, owner_id, name, currency_code) values ('20000000-0000-0000-0000-0000000000a1', auth.uid(), 'Weekly', 'XAF');
update public.user_settings set default_currency = 'EUR';
select tests.assert((select currency_code = 'XAF' from public.shopping_lists), 'changing the default currency does not touch existing lists');
select tests.throws($$ update public.user_settings set default_currency = 'ZZZ' $$, 'INVALID_CURRENCY', 'default currency must be a registered currency');
select tests.throws($$ insert into public.shopping_lists (owner_id, name, currency_code) values (auth.uid(), 'Bad', 'ZZZ') $$, 'INVALID_CURRENCY', 'list currency must be a registered currency');
update public.shopping_lists set currency_code = 'USD';
select tests.assert((select currency_code = 'USD' from public.shopping_lists), 'an empty list can still change currency');
select tests.throws($$ update public.profiles set id = gen_random_uuid() $$, 'permission denied', 'profile id is immutable');
select tests.throws($$ insert into public.currencies (code, name, symbol, decimal_digits) values ('ABC', 'Fake', 'F', 2) $$, 'permission denied', 'clients cannot change the currency registry');
reset role;

update public.currencies set is_active = false where code = 'JPY';
select tests.login('amara');
select tests.throws($$ insert into public.shopping_lists (owner_id, name, currency_code) values (auth.uid(), 'Tokyo', 'JPY') $$, 'INVALID_CURRENCY', 'inactive currencies cannot be used for new lists');
select tests.assert(not exists (select 1 from public.currencies where code = 'JPY'), 'inactive currencies are hidden');
reset role;

rollback;
