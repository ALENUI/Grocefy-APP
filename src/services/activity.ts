import type { ActivityEntry } from '../activity';
import { unwrap } from './errors';
import { getSupabaseClient } from './supabase';

export type Activity = ActivityEntry & { id: string; list_id: string | null; group_id: string | null };

/** Recent activity for a list or a group (group-level membership events plus activity on the group's lists). */
export async function fetchActivity(scope: { listId: string } | { groupId: string }, limit = 30): Promise<Activity[]> {
  let query = getSupabaseClient().from('activity_log').select('id, action, subject, metadata, created_at, list_id, group_id, actor:profiles(username, display_name)')
    .order('created_at', { ascending: false }).limit(limit);
  query = 'listId' in scope ? query.eq('list_id', scope.listId) : query.eq('group_id', scope.groupId);
  return unwrap(await query).map((row) => ({ ...row, metadata: (row.metadata ?? {}) as Record<string, unknown> }));
}
