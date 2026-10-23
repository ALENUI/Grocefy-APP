-- Deleting an account. The person's own data goes with them; what they share stays with the people they share it with:
--   - A home with other members passes to the next member (partner, then editor, then viewer; longest-standing first),
--     with the person's lists in it. A list shared outside a home passes to its next member the same way.
--   - Lists they own in someone else's home pass to that home's owner.
--   - Homes and lists nobody else uses are deleted with their items, purchases, and reports.
--   - Purchases and price history that stay keep their amounts; the purchaser becomes unknown.
--   - Their custom categories are deleted (items filed under them go back to General), and so are products only they used.

-- History that stays outlives the person who created it.
alter table public.products alter column owner_id drop not null,
  drop constraint products_owner_id_fkey, add constraint products_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete set null;
alter table public.list_items alter column created_by drop not null,
  drop constraint list_items_created_by_fkey, add constraint list_items_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.purchases alter column user_id drop not null,
  drop constraint purchases_user_id_fkey, add constraint purchases_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
alter table public.price_history alter column user_id drop not null,
  drop constraint price_history_user_id_fkey, add constraint price_history_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
alter table public.group_members drop constraint group_members_invited_by_fkey,
  add constraint group_members_invited_by_fkey foreign key (invited_by) references public.profiles(id) on delete set null;
alter table public.list_members drop constraint list_members_invited_by_fkey,
  add constraint list_members_invited_by_fkey foreign key (invited_by) references public.profiles(id) on delete set null;
alter table public.invitations drop constraint invitations_inviter_id_fkey,
  add constraint invitations_inviter_id_fkey foreign key (inviter_id) references public.profiles(id) on delete cascade;
alter table public.invitations drop constraint invitations_invitee_user_id_fkey,
  add constraint invitations_invitee_user_id_fkey foreign key (invitee_user_id) references public.profiles(id) on delete cascade;
alter table public.monthly_reports drop constraint monthly_reports_owner_id_fkey,
  add constraint monthly_reports_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade;

-- Financial records stay immutable, except while delete_account removes or anonymizes them. Only delete_account sets
-- this transaction-local flag; API clients cannot set configuration values.
create or replace function public.reject_financial_rewrite() returns trigger language plpgsql as $$
begin
  if current_setting('grocefy.deleting_account', true) = 'on' then return coalesce(new, old); end if;
  raise exception 'FINANCIAL_RECORD_IMMUTABLE';
end $$;

-- Owners stay fixed for API clients; delete_account hands homes and lists on.
create or replace function public.protect_list_financial_identity() returns trigger language plpgsql as $$
begin
  if public.is_client_request() and new.owner_id <> old.owner_id then raise exception 'OWNER_IMMUTABLE'; end if;
  if new.currency_code <> old.currency_code and exists (select 1 from public.purchases where list_id = old.id) then raise exception 'CURRENCY_IMMUTABLE_AFTER_PURCHASE'; end if;
  return new;
end; $$;

create or replace function public.guard_shopping_group() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and public.is_client_request() and new.owner_id <> old.owner_id then raise exception 'OWNER_IMMUTABLE'; end if;
  if tg_op = 'INSERT' or new.currency_code <> old.currency_code then perform public.require_active_currency(new.currency_code); end if;
  return new;
end $$;

create or replace function public.guard_shopping_list() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.require_active_currency(new.currency_code);
  else
    if public.is_client_request() and new.owner_id <> old.owner_id then raise exception 'OWNER_IMMUTABLE'; end if;
    if public.is_client_request() and not public.can_manage_list(old.id) and (new.group_id is distinct from old.group_id
        or new.archived_at is distinct from old.archived_at or new.currency_code <> old.currency_code) then
      raise exception 'FORBIDDEN';
    end if;
    if new.currency_code <> old.currency_code then
      perform public.require_active_currency(new.currency_code);
      if exists (select 1 from public.list_items where list_id = old.id) then raise exception 'CURRENCY_LOCKED'; end if;
    end if;
  end if;
  if public.is_client_request() and new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id)
      and not coalesce(public.get_group_role(new.group_id) in ('owner', 'partner'), false) then
    raise exception 'FORBIDDEN';
  end if;
  -- Runs with the caller's RLS, so only categories the caller can see may be attached.
  if public.is_client_request() and new.category_id is not null and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
      and not exists (select 1 from public.categories where id = new.category_id) then
    raise exception 'NOT_FOUND';
  end if;
  return new;
end $$;

-- Who invited a member is cleared when the inviter's account is deleted.
create or replace function public.guard_group_membership() returns trigger language plpgsql as $$
begin
  if new.group_id <> old.group_id or new.user_id <> old.user_id
      or (new.invited_by is distinct from old.invited_by and new.invited_by is not null) then raise exception 'FORBIDDEN'; end if;
  return new;
end $$;
create or replace function public.guard_list_membership() returns trigger language plpgsql as $$
begin
  if new.list_id <> old.list_id or new.user_id <> old.user_id
      or (new.invited_by is distinct from old.invited_by and new.invited_by is not null) then raise exception 'FORBIDDEN'; end if;
  return new;
end $$;

-- Removes lists with everything on them. Only for delete_account (it needs the financial-record flag).
create function public.delete_lists(list_ids uuid[]) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.price_history where purchase_id in (select id from public.purchases where list_id = any(list_ids));
  delete from public.purchases where list_id = any(list_ids);
  delete from public.list_items where list_id = any(list_ids);
  delete from public.list_members where list_id = any(list_ids);
  delete from public.invitations where resource_type = 'list' and resource_id = any(list_ids);
  -- Last, after the deletes above have logged their activity.
  delete from public.activity_log where list_id = any(list_ids);
  delete from public.monthly_reports where list_id = any(list_ids);
  delete from public.shopping_lists where id = any(list_ids);
end $$;
revoke execute on function public.delete_lists(uuid[]) from public, anon, authenticated;

create function public.delete_home(target_home_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.delete_lists(array(select id from public.shopping_lists where group_id = target_home_id));
  delete from public.price_history where purchase_id in (select id from public.purchases where group_id = target_home_id);
  delete from public.purchases where group_id = target_home_id;
  delete from public.home_items where group_id = target_home_id;
  delete from public.group_members where group_id = target_home_id;
  delete from public.invitations where resource_type = 'group' and resource_id = target_home_id;
  delete from public.activity_log where group_id = target_home_id;
  delete from public.monthly_reports where group_id = target_home_id;
  delete from public.shopping_groups where id = target_home_id;
end $$;
revoke execute on function public.delete_home(uuid) from public, anon, authenticated;

-- Deletes the caller's account (see the top of this file). Cannot be undone.
create function public.delete_account() returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_name text;
  home public.shopping_groups;
  list public.shopping_lists;
  heir uuid;
begin
  if me is null then raise exception 'UNAUTHORIZED'; end if;
  select username into my_name from public.profiles where id = me;
  perform set_config('grocefy.deleting_account', 'on', true);

  for home in select * from public.shopping_groups where owner_id = me loop
    select user_id into heir from public.group_members where group_id = home.id and status = 'accepted' and user_id <> me
    order by array_position(array['partner', 'editor', 'viewer']::public.member_role[], role), created_at limit 1;
    if heir is null then perform public.delete_home(home.id); continue; end if;
    -- The heir owns the home now, so they are no longer a member of it. Home names are unique per owner.
    delete from public.group_members where group_id = home.id and user_id = heir;
    update public.shopping_groups set owner_id = heir,
      name = case when exists (select 1 from public.shopping_groups where owner_id = heir and name = home.name) then home.name || ' (' || coalesce(my_name, 'shared') || ')' else home.name end
    where id = home.id;
    update public.shopping_lists set owner_id = heir where group_id = home.id and owner_id = me;
  end loop;

  update public.shopping_lists l set owner_id = g.owner_id from public.shopping_groups g where g.id = l.group_id and l.owner_id = me;

  for list in select * from public.shopping_lists where owner_id = me loop
    select user_id into heir from public.list_members where list_id = list.id and status = 'accepted' and user_id <> me
    order by array_position(array['partner', 'editor', 'viewer']::public.member_role[], role), created_at limit 1;
    if heir is null then perform public.delete_lists(array[list.id]); continue; end if;
    delete from public.list_members where list_id = list.id and user_id = heir;
    update public.shopping_lists set owner_id = heir where id = list.id;
  end loop;

  delete from public.group_members where user_id = me;
  delete from public.list_members where user_id = me;
  delete from public.invitations where lower(invitee_email) = (select lower(email) from auth.users where id = me);
  delete from public.products p where p.owner_id = me
    and not exists (select 1 from public.list_items where product_id = p.id) and not exists (select 1 from public.home_items where product_id = p.id)
    and not exists (select 1 from public.purchases where product_id = p.id) and not exists (select 1 from public.price_history where product_id = p.id);

  -- Nothing done from here on is attributed to the deleted person.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = me; -- the profile and everything else of theirs follow through foreign keys
end $$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
