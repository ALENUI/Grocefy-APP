import { unwrap } from './errors';
import { getSupabaseClient, MemberRoleWithOwner, Tables, Views } from './supabase';

export type ShoppingGroup = Tables<'shopping_groups'>;
export type GroupSummary = ShoppingGroup & { role: MemberRoleWithOwner | null; totals: Views<'group_totals'>[]; listCount: number; memberCount: number };

/** Active groups visible to the caller, with their role, per-currency totals, and member counts. */
export async function fetchGroups(userId: string): Promise<GroupSummary[]> {
  const client = getSupabaseClient();
  const groups = unwrap(await client.from('shopping_groups').select('*, members:group_members(user_id, role, status), lists:shopping_lists(id, archived_at)')
    .is('archived_at', null).order('created_at'));
  const totals = groups.length ? unwrap(await client.from('group_totals').select('*').in('group_id', groups.map((group) => group.id))) : [];
  return groups.map(({ members, lists, ...group }) => {
    const accepted = members.filter((member) => member.status === 'accepted');
    return {
      ...group,
      role: group.owner_id === userId ? 'owner' : accepted.find((member) => member.user_id === userId)?.role ?? null,
      totals: totals.filter((entry) => entry.group_id === group.id),
      listCount: lists.filter((list) => !list.archived_at).length,
      memberCount: accepted.length + 1
    };
  });
}

/** The caller's role in a group. For UI only; the server enforces it. */
export async function fetchGroupRole(groupId: string): Promise<MemberRoleWithOwner | null> {
  return (await getSupabaseClient().rpc('get_group_role', { target_group_id: groupId })).data ?? null;
}

export async function createGroup(ownerId: string, name: string, currencyCode: string, description?: string): Promise<ShoppingGroup> {
  return unwrap(await getSupabaseClient().from('shopping_groups').insert({ owner_id: ownerId, name, currency_code: currencyCode, description }).select('*').single());
}

export async function archiveGroup(groupId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('shopping_groups').update({ archived_at: new Date().toISOString() }).eq('id', groupId).select('id').single());
}
