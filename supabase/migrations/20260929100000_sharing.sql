-- Sharing: invitations are the only way to become a group or list member. Owners invite by username, user id, or
-- email; invitees accept or decline; owners and inviters can cancel. All state changes go through the functions
-- below, which derive the inviter, invitee, and membership from the authenticated session.

alter table public.invitations add column resource_name text; -- snapshot shown to invitees who cannot see the resource yet
alter table public.invitations add column responded_at timestamptz;
alter table public.invitations add constraint invitations_role_not_owner check (role <> 'owner');
alter table public.invitations add constraint invitations_email_format check (invitee_email is null or invitee_email ~ '^[^@\s]+@[^@\s]+$');
create unique index invitations_one_pending_per_invitee on public.invitations
  (resource_type, resource_id, coalesce(invitee_user_id::text, lower(invitee_email))) where status = 'pending';
create index on public.invitations (invitee_user_id) where status = 'pending';
create index on public.invitations (lower(invitee_email)) where status = 'pending';

-- Email-addressed invitations are only honoured for a confirmed address, so registering someone else's email
-- (with confirmations disabled or pending) cannot claim their invitation.
create function public.current_confirmed_email() returns text language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null
$$;

create function public.is_invitee(invitation public.invitations) returns boolean language sql stable set search_path = public as $$
  select coalesce(invitation.invitee_user_id = auth.uid()
    or (invitation.invitee_user_id is null and lower(invitation.invitee_email) = public.current_confirmed_email()), false)
$$;

drop policy "invitations: parties view" on public.invitations;
create policy "invitations: parties view" on public.invitations for select to authenticated using (inviter_id = auth.uid() or public.is_invitee(invitations));

-- Internal: only callable from the SECURITY DEFINER functions in this file.
create function public.notify_user(recipient uuid, notification_type text, notification_title text, notification_message text, target_type text, target_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, message, resource_type, resource_id)
  values (recipient, notification_type, notification_title, notification_message, target_type, target_id)
$$;
revoke execute on function public.notify_user(uuid, text, text, text, text, uuid) from public, anon, authenticated;

-- invitee may be a username, a user id, or an email address.
create function public.create_invitation(target_resource_type public.invitation_resource, target_resource_id uuid, target_role public.member_role, invitee text)
returns public.invitations language plpgsql security definer set search_path = public as $$
declare
  resource_label text;
  archived timestamptz;
  normalized text := lower(trim(invitee));
  invitee_id uuid;
  invitee_address text;
  result public.invitations;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if target_role is null or target_role = 'owner' or normalized is null or normalized = '' then raise exception 'VALIDATION_ERROR'; end if;

  if target_resource_type = 'group' then
    select name, archived_at into resource_label, archived from public.shopping_groups where id = target_resource_id;
    if not found or public.get_group_role(target_resource_id) is null then raise exception 'NOT_FOUND'; end if;
    if public.get_group_role(target_resource_id) <> 'owner' then raise exception 'FORBIDDEN'; end if;
  else
    select name, archived_at into resource_label, archived from public.shopping_lists where id = target_resource_id;
    if not found or not public.can_view_list(target_resource_id) then raise exception 'NOT_FOUND'; end if;
    if not public.can_manage_list(target_resource_id) then raise exception 'FORBIDDEN'; end if;
  end if;
  if archived is not null then raise exception 'RESOURCE_ARCHIVED'; end if;

  if normalized ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into invitee_id from public.profiles where id = normalized::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
  elsif position('@' in normalized) > 0 then
    invitee_address := normalized; -- never resolved to an account here, so invitations cannot probe which emails are registered
  else
    select id into invitee_id from public.profiles where lower(username) = normalized;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;

  if invitee_id = auth.uid() or invitee_address = public.current_confirmed_email() then raise exception 'VALIDATION_ERROR'; end if;
  if invitee_id is not null and (
    (target_resource_type = 'group' and (exists (select 1 from public.group_members where group_id = target_resource_id and user_id = invitee_id and status = 'accepted')
      or exists (select 1 from public.shopping_groups where id = target_resource_id and owner_id = invitee_id)))
    or (target_resource_type = 'list' and (exists (select 1 from public.list_members where list_id = target_resource_id and user_id = invitee_id and status = 'accepted')
      or exists (select 1 from public.shopping_lists where id = target_resource_id and owner_id = invitee_id)))) then
    raise exception 'ALREADY_MEMBER';
  end if;

  -- Re-inviting refreshes the pending invitation instead of creating a duplicate.
  update public.invitations set role = target_role, expires_at = now() + interval '7 days', inviter_id = auth.uid(), resource_name = resource_label
  where status = 'pending' and resource_type = target_resource_type and resource_id = target_resource_id
    and coalesce(invitee_user_id::text, lower(invitee_email)) = coalesce(invitee_id::text, invitee_address)
  returning * into result;
  if not found then
    insert into public.invitations (inviter_id, invitee_user_id, invitee_email, resource_type, resource_id, resource_name, role)
    values (auth.uid(), invitee_id, invitee_address, target_resource_type, target_resource_id, resource_label, target_role)
    returning * into result;
  end if;

  if invitee_id is null then
    select id into invitee_id from auth.users where lower(email) = invitee_address and email_confirmed_at is not null;
  end if;
  if invitee_id is not null then
    perform public.notify_user(invitee_id, 'INVITATION', 'You have been invited to join ' || resource_label,
      'Role: ' || initcap(target_role::text), 'invitation', result.id);
  end if;
  return result;
end $$;

create function public.respond_to_invitation(target_invitation_id uuid, accept boolean)
returns public.invitations language plpgsql security definer set search_path = public as $$
declare
  invitation public.invitations;
  archived timestamptz;
  result public.invitations;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if accept is null then raise exception 'VALIDATION_ERROR'; end if;
  select * into invitation from public.invitations where id = target_invitation_id for update;
  if not found or not public.is_invitee(invitation) then raise exception 'NOT_FOUND'; end if;
  if invitation.status <> 'pending' then raise exception 'INVITATION_NOT_PENDING'; end if;
  if invitation.expires_at <= now() then raise exception 'INVITATION_EXPIRED'; end if;

  if accept then
    if invitation.resource_type = 'group' then
      select archived_at into archived from public.shopping_groups where id = invitation.resource_id;
      if archived is not null then raise exception 'RESOURCE_ARCHIVED'; end if;
      insert into public.group_members (group_id, user_id, role, invited_by, status)
      values (invitation.resource_id, auth.uid(), invitation.role, invitation.inviter_id, 'accepted')
      on conflict (group_id, user_id) do update set role = excluded.role, status = 'accepted';
    else
      select archived_at into archived from public.shopping_lists where id = invitation.resource_id;
      if archived is not null then raise exception 'RESOURCE_ARCHIVED'; end if;
      insert into public.list_members (list_id, user_id, role, invited_by, status)
      values (invitation.resource_id, auth.uid(), invitation.role, invitation.inviter_id, 'accepted')
      on conflict (list_id, user_id) do update set role = excluded.role, status = 'accepted';
    end if;
  end if;

  update public.invitations
  set status = case when accept then 'accepted' else 'declined' end::public.member_status,
      invitee_user_id = auth.uid(), responded_at = now(), accepted_at = case when accept then now() end
  where id = invitation.id returning * into result;

  perform public.notify_user(invitation.inviter_id, 'INVITATION_' || case when accept then 'ACCEPTED' else 'DECLINED' end,
    (select username from public.profiles where id = auth.uid()) || case when accept then ' joined ' else ' declined to join ' end || invitation.resource_name,
    'Role: ' || initcap(invitation.role::text), invitation.resource_type::text, invitation.resource_id);
  return result;
end $$;

create function public.cancel_invitation(target_invitation_id uuid)
returns public.invitations language plpgsql security definer set search_path = public as $$
declare
  invitation public.invitations;
  result public.invitations;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into invitation from public.invitations where id = target_invitation_id for update;
  if not found or not (invitation.inviter_id = auth.uid()
    or (invitation.resource_type = 'group' and public.get_group_role(invitation.resource_id) = 'owner')
    or (invitation.resource_type = 'list' and public.can_manage_list(invitation.resource_id))) then
    raise exception 'NOT_FOUND';
  end if;
  if invitation.status <> 'pending' then raise exception 'INVITATION_NOT_PENDING'; end if;
  update public.invitations set status = 'cancelled', responded_at = now() where id = invitation.id returning * into result;
  return result;
end $$;

-- Owners see pending invitations for their resources (not only the ones they sent).
create policy "invitations: resource owners view" on public.invitations for select to authenticated using (
  (resource_type = 'group' and public.get_group_role(resource_id) = 'owner') or (resource_type = 'list' and public.can_manage_list(resource_id)));

revoke execute on function public.create_invitation(public.invitation_resource, uuid, public.member_role, text) from public, anon;
revoke execute on function public.respond_to_invitation(uuid, boolean) from public, anon;
revoke execute on function public.cancel_invitation(uuid) from public, anon;
revoke execute on function public.current_confirmed_email() from public, anon;
grant execute on function public.create_invitation(public.invitation_resource, uuid, public.member_role, text) to authenticated;
grant execute on function public.respond_to_invitation(uuid, boolean) to authenticated;
grant execute on function public.cancel_invitation(uuid) to authenticated;
grant execute on function public.current_confirmed_email() to authenticated;
