import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

type Watched = { table: 'shopping_lists' | 'list_items' | 'purchases' | 'list_members' | 'group_members' | 'notifications' | 'invitations' | 'activity_log'; filter?: string };

let channelCount = 0;

/**
 * Subscribes to row changes and calls `onChange` (debounced) whenever any of them change. Realtime applies the
 * subscriber's RLS policies, so only changes the user may read are delivered. Returns an unsubscribe function.
 * Events only signal "something changed": callers refetch through the normal services, keeping one source of truth.
 */
export function watchTables(watched: Watched[], onChange: () => void, debounceMs = 300): () => void {
  const client = getSupabaseClient();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => { clearTimeout(timer); timer = setTimeout(onChange, debounceMs); };
  let channel: RealtimeChannel = client.channel(`grocefy-${++channelCount}`);
  for (const { table, filter } of watched) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, notify);
  }
  channel.subscribe();
  return () => { clearTimeout(timer); client.removeChannel(channel); };
}

/** Everything that changes what a list screen shows: the list itself, its items, purchases, and membership. */
export const watchList = (listId: string, onChange: () => void) => watchTables([
  { table: 'shopping_lists', filter: `id=eq.${listId}` },
  { table: 'list_items', filter: `list_id=eq.${listId}` },
  { table: 'purchases', filter: `list_id=eq.${listId}` },
  { table: 'list_members', filter: `list_id=eq.${listId}` },
  { table: 'activity_log', filter: `list_id=eq.${listId}` }
], onChange);

/** Lists overview: any list, item, or purchase the user can see. */
export const watchLists = (onChange: () => void) => watchTables([{ table: 'shopping_lists' }, { table: 'list_items' }, { table: 'purchases' }, { table: 'list_members' }, { table: 'group_members' }], onChange);

/** The user's notifications and invitations (inbox and badge). */
export const watchInbox = (userId: string, onChange: () => void) => watchTables([{ table: 'notifications', filter: `user_id=eq.${userId}` }, { table: 'invitations' }], onChange);

/** Group screens: membership, the group's lists, and their items and purchases. */
export const watchGroup = (groupId: string, onChange: () => void) => watchTables([
  { table: 'group_members', filter: `group_id=eq.${groupId}` },
  { table: 'shopping_lists', filter: `group_id=eq.${groupId}` },
  { table: 'purchases', filter: `group_id=eq.${groupId}` },
  { table: 'list_items' },
  { table: 'activity_log', filter: `group_id=eq.${groupId}` }
], onChange);
