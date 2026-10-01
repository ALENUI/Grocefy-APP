-- Development seed data (applied by `supabase start` / `supabase db reset`; never run against production).
-- Reference data (currencies, default categories) comes from the migrations.
--
-- Demo accounts (password for both: grocefy-demo):
--   demo@grocefy.test   @demo   owner of House Shopping and Office Shopping
--   alex@grocefy.test   @alex   partner in House Shopping
--
-- Last month has finalized purchases (so price memory and a monthly report exist); this month has a mix of
-- purchased and pending items. The Imports list uses USD to show that currencies are never mixed.

-- Accounts --------------------------------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, extensions.crypt('grocefy-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('username', username, 'display_name', display_name, 'default_currency', 'XAF'),
  now(), now(), '', '', '', ''
from (values ('d0000000-0000-0000-0000-000000000001'::uuid, 'demo@grocefy.test', 'demo', 'Demo User'),
             ('d0000000-0000-0000-0000-000000000002'::uuid, 'alex@grocefy.test', 'alex', 'Alex')) account(id, email, username, display_name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now()
from auth.users where id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002');

update public.user_settings set timezone = 'Africa/Douala' where user_id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002');

-- Groups, lists, and sharing --------------------------------------------------------------------------------------
insert into public.shopping_groups (id, owner_id, name, description, currency_code) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'House Shopping', 'Everything for the house', 'XAF'),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Office Shopping', 'Supplies for the office', 'XAF');
insert into public.group_members (group_id, user_id, role, invited_by) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'partner', 'd0000000-0000-0000-0000-000000000001');

insert into public.shopping_lists (id, owner_id, group_id, name, category_id, currency_code)
select list.id::uuid, 'd0000000-0000-0000-0000-000000000001', list.group_id::uuid, list.name, (select id from public.categories where is_default and name = list.category), list.currency
from (values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Food', 'Food Stuffs', 'XAF'),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Kitchen', 'Kitchen', 'XAF'),
  ('d2000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'Bathroom', 'Bathroom', 'XAF'),
  ('d2000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000002', 'Stationery', 'Office Supplies', 'XAF'),
  ('d2000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000002', 'Imports', 'Electronics', 'USD')
) list(id, group_id, name, category, currency);

insert into public.products (owner_id, name)
select 'd0000000-0000-0000-0000-000000000001', name
from unnest(array['Rice', 'Cooking Oil', 'Tomatoes', 'Plantains', 'Milk', 'Dish Soap', 'Sponges', 'Soap', 'Toothpaste', 'Printer Paper', 'Pens', 'USB Cable']) name;

-- Items and purchases -------------------------------------------------------------------------------------------
-- (list, product, quantity, unit budget, paid or null, purchaser or null, purchased at)
create temporary table demo_items (list_id uuid, product text, quantity numeric, unit_budget numeric, paid numeric, purchaser uuid, purchased_at timestamptz);
insert into demo_items values
  -- Last month, finalized: price memory and a monthly report
  ('d2000000-0000-0000-0000-000000000001', 'Rice', 1, 25000, 23500, 'd0000000-0000-0000-0000-000000000002', date_trunc('month', now()) - interval '25 days'),
  ('d2000000-0000-0000-0000-000000000001', 'Cooking Oil', 2, 3500, 7400, 'd0000000-0000-0000-0000-000000000001', date_trunc('month', now()) - interval '25 days'),
  ('d2000000-0000-0000-0000-000000000001', 'Tomatoes', 3, 1000, 2700, 'd0000000-0000-0000-0000-000000000002', date_trunc('month', now()) - interval '12 days'),
  ('d2000000-0000-0000-0000-000000000002', 'Dish Soap', 1, 1500, 1500, 'd0000000-0000-0000-0000-000000000001', date_trunc('month', now()) - interval '12 days'),
  ('d2000000-0000-0000-0000-000000000003', 'Toothpaste', 2, 1200, 2600, 'd0000000-0000-0000-0000-000000000001', date_trunc('month', now()) - interval '5 days'),
  ('d2000000-0000-0000-0000-000000000004', 'Printer Paper', 4, 3000, 11000, 'd0000000-0000-0000-0000-000000000001', date_trunc('month', now()) - interval '18 days'),
  -- This month
  ('d2000000-0000-0000-0000-000000000001', 'Rice', 1, 23500, 24000, 'd0000000-0000-0000-0000-000000000002', least(now(), date_trunc('month', now()) + interval '1 day')),
  ('d2000000-0000-0000-0000-000000000005', 'USB Cable', 2, 8, 15.50, 'd0000000-0000-0000-0000-000000000001', least(now(), date_trunc('month', now()) + interval '1 day')),
  -- Still to buy
  ('d2000000-0000-0000-0000-000000000001', 'Plantains', 6, 500, null, null, null),
  ('d2000000-0000-0000-0000-000000000001', 'Milk', 2, 1800, null, null, null),
  ('d2000000-0000-0000-0000-000000000001', 'Cooking Oil', 1, 3700, null, null, null),
  ('d2000000-0000-0000-0000-000000000002', 'Sponges', 3, 400, null, null, null),
  ('d2000000-0000-0000-0000-000000000003', 'Soap', 4, 600, null, null, null),
  ('d2000000-0000-0000-0000-000000000004', 'Pens', 10, 150, null, null, null),
  ('d2000000-0000-0000-0000-000000000005', 'USB Cable', 1, 8, null, null, null);

do $$
declare row record; item_id uuid; purchase_id uuid; list public.shopping_lists; product_id uuid;
begin
  for row in select * from demo_items order by purchased_at nulls last loop
    select * into list from public.shopping_lists where id = row.list_id;
    select id into product_id from public.products where owner_id = list.owner_id and name = row.product;
    insert into public.list_items (list_id, product_id, quantity, budgeted_unit_price, status, purchased_at, created_by)
    values (row.list_id, product_id, row.quantity, row.unit_budget, case when row.paid is null then 'pending' else 'purchased' end::public.list_item_status, row.purchased_at, list.owner_id)
    returning id into item_id;
    if row.paid is not null then
      insert into public.purchases (list_item_id, product_id, list_id, group_id, user_id, category_id, quantity, budgeted_amount, purchased_amount, currency_code, purchased_at)
      values (item_id, product_id, row.list_id, list.group_id, row.purchaser, list.category_id, row.quantity, row.quantity * row.unit_budget, row.paid, list.currency_code, row.purchased_at)
      returning id into purchase_id;
      insert into public.price_history (product_id, user_id, price, currency_code, purchased_at, purchase_id)
      values (product_id, row.purchaser, round(row.paid / row.quantity, 4), list.currency_code, row.purchased_at, purchase_id);
    end if;
  end loop;
end $$;

-- Finalize last month's reports (group and personal), as the scheduled job would.
select private.generate_previous_month_reports();

-- A pending invitation so the inbox has something to show for Alex.
insert into public.invitations (inviter_id, invitee_user_id, resource_type, resource_id, resource_name, role)
values ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'group', 'd1000000-0000-0000-0000-000000000002', 'Office Shopping', 'editor');

-- Seed scratch data is not needed afterwards.
drop table demo_items;
