import { Database } from './database.types';
import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

export type Invitation = Omit<Tables<'invitations'>, 'is_invitee'>;
export type ResourceType = Database['public']['Enums']['invitation_resource'];
/** Roles that can be granted; ownership comes from creating the resource and is never delegated. */
export type MemberRole = Exclude<Database['public']['Enums']['member_role'], 'owner'>;
export type Member = { id: string; userId: string; role: MemberRole; profile: Pick<Tables<'profiles'>, 'username' | 'display_name' | 'avatar_url'> | null };
export type Notification = Tables<'notifications'>;

/** `invitee` may be a username, a user id, or an email address. Only the resource owner can invite. */
export async function inviteMember(resourceType: ResourceType, resourceId: string, role: MemberRole, invitee: string): Promise<Invitation> {
  return unwrap(await getSupabaseClient().rpc('create_invitation', {
    target_resource_type: resourceType, target_resource_id: resourceId, target_role: role, invitee
  }));
}

export async function respondToInvitation(invitationId: string, accept: boolean): Promise<Invitation> {
  return unwrap(await getSupabaseClient().rpc('respond_to_invitation', { target_invitation_id: invitationId, accept }));
}

export async function cancelInvitation(invitationId: string): Promise<Invitation> {
  return unwrap(await getSupabaseClient().rpc('cancel_invitation', { target_invitation_id: invitationId }));
}

/** Pending, unexpired invitations visible to the caller: ones they received, and ones for resources they own. */
export async function fetchPendingInvitations(): Promise<Invitation[]> {
  return unwrap(await getSupabaseClient().from('invitations').select('*').eq('status', 'pending').gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }));
}

export async function fetchMembers(resourceType: ResourceType, resourceId: string): Promise<Member[]> {
  const client = getSupabaseClient();
  const rows = resourceType === 'group'
    ? unwrap(await client.from('group_members').select('id, user_id, role, profile:profiles!group_members_user_id_fkey(username, display_name, avatar_url)').eq('group_id', resourceId).eq('status', 'accepted'))
    : unwrap(await client.from('list_members').select('id, user_id, role, profile:profiles!list_members_user_id_fkey(username, display_name, avatar_url)').eq('list_id', resourceId).eq('status', 'accepted'));
  return rows.map((row) => ({ id: row.id, userId: row.user_id, role: row.role as MemberRole, profile: row.profile }));
}

/** Owner only: enforced by RLS. */
export async function changeMemberRole(resourceType: ResourceType, membershipId: string, role: MemberRole): Promise<void> {
  const table = resourceType === 'group' ? 'group_members' : 'list_members';
  unwrap(await getSupabaseClient().from(table).update({ role }).eq('id', membershipId).select('id').single());
}

/** Owners can remove anyone; members can remove themselves (leave). */
export async function removeMember(resourceType: ResourceType, membershipId: string): Promise<void> {
  const table = resourceType === 'group' ? 'group_members' : 'list_members';
  unwrap(await getSupabaseClient().from(table).delete().eq('id', membershipId).select('id').single());
}

export async function fetchNotifications({ unreadOnly = false, pageSize = 50 } = {}): Promise<Notification[]> {
  let query = getSupabaseClient().from('notifications').select('*').order('created_at', { ascending: false }).limit(pageSize);
  if (unreadOnly) query = query.is('read_at', null);
  return unwrap(await query);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).select('id').single());
}

export type Inbox = { invitations: Invitation[]; notifications: Notification[]; unreadCount: number };

/** Invitations addressed to the user (by account or confirmed email) and their notifications, with the badge count. */
export async function fetchInbox(userId: string, email: string | undefined): Promise<Inbox> {
  const [invitations, notifications] = await Promise.all([fetchPendingInvitations(), fetchNotifications()]);
  const address = email?.toLowerCase();
  const received = invitations.filter((invitation) => invitation.invitee_user_id === userId || (!invitation.invitee_user_id && !!address && invitation.invitee_email === address));
  return { invitations: received, notifications, unreadCount: received.length + notifications.filter((notification) => !notification.read_at).length };
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null).select('id'));
}
