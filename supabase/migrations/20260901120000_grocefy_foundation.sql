-- Grocefy financial and authorization foundation. Apply with `supabase db push`.
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'viewer', 'editor', 'partner');
create type public.member_status as enum ('pending', 'accepted', 'declined', 'expired', 'cancelled');
create type public.list_item_status as enum ('pending', 'purchased', 'archived');
create type public.invitation_resource as enum ('group', 'list');

create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'), name text not null, symbol text not null,
  decimal_digits smallint not null check (decimal_digits between 0 and 4), is_active boolean not null default true
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, username text not null unique check (char_length(username) between 3 and 32),
  display_name text not null, avatar_url text, default_currency text not null default 'XAF' references public.currencies(code),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade, default_currency text not null default 'XAF' references public.currencies(code),
  timezone text, language text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(), name text not null, user_id uuid references public.profiles(id) on delete cascade,
  is_default boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (name, user_id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), name text not null,
  default_category_id uuid references public.categories(id) on delete set null, notes text, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, name)
);
create table public.shopping_groups (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), name text not null,
  description text, currency_code text not null references public.currencies(code), archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, name)
);
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), group_id uuid references public.shopping_groups(id) on delete set null,
  name text not null, description text, category_id uuid references public.categories(id) on delete set null, currency_code text not null references public.currencies(code),
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.group_members (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.shopping_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, role public.member_role not null, invited_by uuid references public.profiles(id),
  status public.member_status not null default 'accepted', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(group_id, user_id)
);
create table public.list_members (
  id uuid primary key default gen_random_uuid(), list_id uuid not null references public.shopping_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, role public.member_role not null, invited_by uuid references public.profiles(id),
  status public.member_status not null default 'accepted', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(list_id, user_id)
);
create table public.list_items (
  id uuid primary key default gen_random_uuid(), list_id uuid not null references public.shopping_lists(id), product_id uuid not null references public.products(id),
  category_id uuid references public.categories(id) on delete set null, quantity numeric(19,4) not null default 1 check (quantity > 0), unit text,
  budgeted_unit_price numeric(19,4) not null check (budgeted_unit_price >= 0), status public.list_item_status not null default 'pending', notes text,
  created_by uuid not null references public.profiles(id), purchased_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.purchases (
  id uuid primary key default gen_random_uuid(), list_item_id uuid not null unique references public.list_items(id), product_id uuid not null references public.products(id),
  list_id uuid not null references public.shopping_lists(id), group_id uuid references public.shopping_groups(id), user_id uuid not null references public.profiles(id),
  category_id uuid references public.categories(id) on delete set null, quantity numeric(19,4) not null check (quantity > 0), budgeted_amount numeric(19,4) not null check (budgeted_amount >= 0),
  purchased_amount numeric(19,4) not null check (purchased_amount >= 0), currency_code text not null references public.currencies(code), purchased_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.price_history (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id), user_id uuid not null references public.profiles(id),
  price numeric(19,4) not null check (price >= 0), currency_code text not null references public.currencies(code), purchased_at timestamptz not null, purchase_id uuid not null unique references public.purchases(id), created_at timestamptz not null default now()
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(), inviter_id uuid not null references public.profiles(id), invitee_user_id uuid references public.profiles(id), invitee_email text,
  resource_type public.invitation_resource not null, resource_id uuid not null, role public.member_role not null, status public.member_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days', created_at timestamptz not null default now(), accepted_at timestamptz,
  check (invitee_user_id is not null or invitee_email is not null)
);
create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), group_id uuid references public.shopping_groups(id), list_id uuid references public.shopping_lists(id),
  year smallint not null check (year between 2020 and 2200), month smallint not null check (month between 1 and 12), currency_code text not null references public.currencies(code),
  total_budget numeric(19,4) not null, total_purchased numeric(19,4) not null, total_variance numeric(19,4) not null, generated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, group_id, list_id, year, month, currency_code)
);
create table public.monthly_report_items (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.monthly_reports(id) on delete cascade, category_id uuid references public.categories(id) on delete set null,
  category_name_snapshot text not null, budgeted_amount numeric(19,4) not null, purchased_amount numeric(19,4) not null, variance numeric(19,4) not null, item_count integer not null check (item_count >= 0)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, type text not null, title text not null, message text not null,
  resource_type text, resource_id uuid, read_at timestamptz, created_at timestamptz not null default now()
);

create index on public.shopping_lists(owner_id); create index on public.shopping_lists(group_id); create index on public.list_items(list_id); create index on public.list_items(product_id);
create index on public.purchases(user_id); create index on public.purchases(list_id); create index on public.purchases(group_id); create index on public.purchases(product_id); create index on public.purchases(purchased_at desc);
create index on public.price_history(product_id, purchased_at desc); create index on public.group_members(group_id, user_id); create index on public.list_members(list_id, user_id);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger settings_updated before update on public.user_settings for each row execute function public.set_updated_at();
create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();
create trigger groups_updated before update on public.shopping_groups for each row execute function public.set_updated_at();
create trigger lists_updated before update on public.shopping_lists for each row execute function public.set_updated_at();
create trigger items_updated before update on public.list_items for each row execute function public.set_updated_at();
create or replace function public.protect_list_financial_identity() returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'OWNER_IMMUTABLE'; end if;
  if new.currency_code <> old.currency_code and exists (select 1 from public.purchases where list_id = old.id) then raise exception 'CURRENCY_IMMUTABLE_AFTER_PURCHASE'; end if;
  return new;
end; $$;
create trigger lists_financial_identity before update on public.shopping_lists for each row execute function public.protect_list_financial_identity();

create or replace function public.get_group_role(target_group_id uuid, target_user_id uuid default auth.uid()) returns public.member_role language sql stable security definer set search_path = public as $$
  select role from public.group_members where group_id = target_group_id and user_id = target_user_id and status = 'accepted' limit 1
$$;
create or replace function public.get_list_role(target_list_id uuid, target_user_id uuid default auth.uid()) returns public.member_role language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.list_members where list_id = target_list_id and user_id = target_user_id and status = 'accepted' limit 1), (select public.get_group_role(group_id, target_user_id) from public.shopping_lists where id = target_list_id))
$$;
create or replace function public.can_view_list(target_list_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select owner_id = auth.uid() or public.get_list_role(id) is not null from public.shopping_lists where id = target_list_id
$$;
create or replace function public.can_edit_list(target_list_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select owner_id = auth.uid() or public.get_list_role(id) in ('owner','partner','editor') from public.shopping_lists where id = target_list_id
$$;
create or replace function public.can_purchase_list_item(target_item_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select l.owner_id = auth.uid() or public.get_list_role(l.id) in ('owner','partner') from public.list_items i join public.shopping_lists l on l.id = i.list_id where i.id = target_item_id
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'username', 'user_' || substr(new.id::text, 1, 8)), coalesce(new.raw_user_meta_data ->> 'display_name', 'New Grocefy user'));
  insert into public.user_settings (user_id) values (new.id); return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Atomic and permission-checked purchase finalization. The list currency is authoritative.
create or replace function public.purchase_list_item(target_item_id uuid, actual_amount numeric) returns public.purchases language plpgsql security definer set search_path = public as $$
declare item public.list_items; list public.shopping_lists; result public.purchases;
begin
  if actual_amount is null or actual_amount < 0 then raise exception 'VALIDATION_ERROR'; end if;
  select * into item from public.list_items where id = target_item_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if item.status = 'purchased' then raise exception 'ALREADY_PURCHASED'; end if;
  if not public.can_purchase_list_item(target_item_id) then raise exception 'FORBIDDEN'; end if;
  select * into list from public.shopping_lists where id = item.list_id;
  insert into public.purchases (list_item_id, product_id, list_id, group_id, user_id, category_id, quantity, budgeted_amount, purchased_amount, currency_code)
  values (item.id, item.product_id, item.list_id, list.group_id, auth.uid(), item.category_id, item.quantity, item.quantity * item.budgeted_unit_price, actual_amount, list.currency_code) returning * into result;
  insert into public.price_history (product_id, user_id, price, currency_code, purchased_at, purchase_id) values (item.product_id, auth.uid(), actual_amount / item.quantity, list.currency_code, result.purchased_at, result.id);
  update public.list_items set status = 'purchased', purchased_at = result.purchased_at where id = item.id;
  return result;
end; $$;
revoke all on function public.purchase_list_item(uuid, numeric) from public;
grant execute on function public.purchase_list_item(uuid, numeric) to authenticated;

alter table public.currencies enable row level security; alter table public.profiles enable row level security; alter table public.user_settings enable row level security; alter table public.categories enable row level security; alter table public.products enable row level security; alter table public.shopping_groups enable row level security; alter table public.shopping_lists enable row level security; alter table public.group_members enable row level security; alter table public.list_members enable row level security; alter table public.list_items enable row level security; alter table public.purchases enable row level security; alter table public.price_history enable row level security; alter table public.invitations enable row level security; alter table public.monthly_reports enable row level security; alter table public.monthly_report_items enable row level security; alter table public.notifications enable row level security;
create policy "active currencies readable" on public.currencies for select to authenticated using (is_active);
create policy "own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own settings" on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "visible categories" on public.categories for select to authenticated using (is_default or user_id = auth.uid());
create policy "create own categories" on public.categories for insert to authenticated with check (user_id = auth.uid() and not is_default);
create policy "update own categories" on public.categories for update to authenticated using (user_id = auth.uid() and not is_default) with check (user_id = auth.uid() and not is_default);
create policy "delete own categories" on public.categories for delete to authenticated using (user_id = auth.uid() and not is_default);
create policy "own products" on public.products for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "visible groups" on public.shopping_groups for select to authenticated using (owner_id = auth.uid() or public.get_group_role(id) is not null);
create policy "owners manage groups" on public.shopping_groups for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "visible group members" on public.group_members for select to authenticated using (exists (select 1 from public.shopping_groups g where g.id = group_id and (g.owner_id = auth.uid() or public.get_group_role(g.id) is not null)));
create policy "group owners manage members" on public.group_members for all to authenticated using (exists (select 1 from public.shopping_groups g where g.id = group_id and g.owner_id = auth.uid())) with check (exists (select 1 from public.shopping_groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy "visible lists" on public.shopping_lists for select to authenticated using (public.can_view_list(id));
create policy "owners create lists" on public.shopping_lists for insert to authenticated with check (owner_id = auth.uid());
create policy "edit lists" on public.shopping_lists for update to authenticated using (public.can_edit_list(id)) with check (public.can_edit_list(id));
create policy "visible list members" on public.list_members for select to authenticated using (public.can_view_list(list_id));
create policy "list owners manage members" on public.list_members for all to authenticated using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.owner_id = auth.uid())) with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.owner_id = auth.uid()));
create policy "visible items" on public.list_items for select to authenticated using (public.can_view_list(list_id));
create policy "edit items" on public.list_items for all to authenticated using (public.can_edit_list(list_id)) with check (public.can_edit_list(list_id));
create policy "visible purchases" on public.purchases for select to authenticated using (public.can_view_list(list_id));
create policy "visible price history" on public.price_history for select to authenticated using (user_id = auth.uid());
create policy "invitation parties can view" on public.invitations for select to authenticated using (inviter_id = auth.uid() or invitee_user_id = auth.uid());
create policy "owners create invitations" on public.invitations for insert to authenticated with check (inviter_id = auth.uid());
create policy "invitees respond" on public.invitations for update to authenticated using (invitee_user_id = auth.uid()) with check (invitee_user_id = auth.uid());
create policy "visible reports" on public.monthly_reports for select to authenticated using (owner_id = auth.uid() or (list_id is not null and public.can_view_list(list_id)) or (group_id is not null and public.get_group_role(group_id) in ('owner','partner')));
create policy "visible report items" on public.monthly_report_items for select to authenticated using (exists (select 1 from public.monthly_reports r where r.id = report_id and (r.owner_id = auth.uid() or (r.list_id is not null and public.can_view_list(r.list_id)) or (r.group_id is not null and public.get_group_role(r.group_id) in ('owner','partner')))));
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
