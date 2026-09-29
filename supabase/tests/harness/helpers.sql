-- Assertion and session helpers shared by the *.test.sql files.
create schema tests;
grant usage on schema tests to anon, authenticated;

-- Creates an auth user (and, through the signup trigger, a profile) addressable as tests.id('<username>').
create function tests.create_user(username text, currency text default 'XAF') returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into auth.users (email, raw_user_meta_data)
  values (username || '@example.test', jsonb_build_object('username', username, 'default_currency', currency)) returning id into new_id;
  perform set_config('tests.' || username, new_id::text, false);
  return new_id;
end $$;

create function tests.id(username text) returns uuid language sql stable as $$ select current_setting('tests.' || username)::uuid $$;

-- Switches the transaction to the API role with the user's JWT claims. Use `reset role;` to return to the superuser.
create function tests.login(username text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', tests.id(username), 'email', username || '@example.test', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

create function tests.assert(condition boolean, description text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'ASSERTION FAILED: %', description; end if;
end $$;

create function tests.throws(statement text, expected text, description text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm not like '%' || expected || '%' then
      raise exception 'ASSERTION FAILED: % (expected error containing "%", got "%")', description, expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'ASSERTION FAILED: % (expected error containing "%", but the statement succeeded)', description, expected;
end $$;

-- RLS filters UPDATE/DELETE silently; this asserts that nothing was touched.
create function tests.affects_no_rows(statement text, description text) returns void language plpgsql as $$
declare affected integer;
begin
  execute statement;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'ASSERTION FAILED: % (% rows affected)', description, affected; end if;
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- Household fixture used by most suites:
--   House Shopping group (10…01, XAF) owned by `owner`, with `grouppartner` as a group partner.
--   Food list (20…01, XAF) in that group, with `partner`, `editor`, and `viewer` list members.
--   Products Rice (30…01) and Cooking Oil (30…02); items Rice 1 × 25,000 (40…01) and Oil 2 × 3,000 (40…02).
--   `stranger` belongs to nothing.
create function tests.household() returns void language plpgsql as $$
begin
  perform tests.create_user(name) from unnest(array['owner', 'partner', 'editor', 'viewer', 'grouppartner', 'stranger']) name;
  insert into public.shopping_groups (id, owner_id, name, currency_code) values ('10000000-0000-0000-0000-000000000001', tests.id('owner'), 'House Shopping', 'XAF');
  insert into public.group_members (group_id, user_id, role, invited_by) values ('10000000-0000-0000-0000-000000000001', tests.id('grouppartner'), 'partner', tests.id('owner'));
  insert into public.shopping_lists (id, owner_id, group_id, name, currency_code)
  values ('20000000-0000-0000-0000-000000000001', tests.id('owner'), '10000000-0000-0000-0000-000000000001', 'Food', 'XAF');
  insert into public.list_members (list_id, user_id, role, invited_by)
  select '20000000-0000-0000-0000-000000000001', tests.id(member.name), member.role::public.member_role, tests.id('owner')
  from (values ('partner', 'partner'), ('editor', 'editor'), ('viewer', 'viewer')) member(name, role);
  insert into public.products (id, owner_id, name) values
    ('30000000-0000-0000-0000-000000000001', tests.id('owner'), 'Rice'), ('30000000-0000-0000-0000-000000000002', tests.id('owner'), 'Cooking Oil');
  insert into public.list_items (id, list_id, product_id, quantity, budgeted_unit_price, created_by) values
    ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 25000, tests.id('owner')),
    ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 2, 3000, tests.id('owner'));
end $$;

grant execute on all functions in schema tests to anon, authenticated;
