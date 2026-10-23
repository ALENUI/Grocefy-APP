import { useEffect } from 'react';
import { writeCache } from './offline/cache';
import { fetchActivity } from './services/activity';
import { fetchCategories } from './services/categories';
import { fetchList, fetchListItems, fetchListRole, ListWithContext } from './services/lists';

/** Everything the list screen shows, saved under listDetailKey so the list opens instantly (and offline). */
export async function loadListDetail(listId: string, userId: string) {
  const [list, items, role, categories, activity] = await Promise.all([fetchList(listId), fetchListItems(listId), fetchListRole(listId), fetchCategories(userId), fetchActivity({ listId })]);
  return { list, items, role, categories, activity };
}
export const listDetailKey = (listId: string) => `list:${listId}`;

/** Saves the given lists' details in the background so each one opens offline, even if it was never opened here. */
export async function prefetchListDetails(listIds: string[], userId: string): Promise<void> {
  for (const listId of listIds) {
    try { await writeCache(listDetailKey(listId), await loadListDetail(listId, userId)); } catch { return; } // offline again: try next time
  }
}

/** While online, saves every shown list's details so each opens offline too (fresh data still loads when opened). */
export function usePrefetchListDetails(lists: { data?: ListWithContext[]; stale: boolean }, userId: string) {
  const listIds = !lists.stale && lists.data ? lists.data.map((list) => list.id).join(',') : '';
  useEffect(() => { if (listIds) prefetchListDetails(listIds.split(','), userId); }, [listIds, userId]);
}
