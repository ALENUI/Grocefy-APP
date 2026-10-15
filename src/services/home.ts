import { Database } from './database.types';
import { ServiceError, unwrap } from './errors';
import { fetchGroups, GroupSummary } from './groups';
import { findOrCreateProduct } from './lists';
import { fetchSpendingTrend, TrendMonth } from './insights';
import { getSupabaseClient, Tables } from './supabase';

export type StockStatus = Database['public']['Enums']['stock_status'];
export type HomeItem = Tables<'home_items'> & {
  product: Pick<Tables<'products'>, 'id' | 'name'> | null;
  category: Pick<Tables<'categories'>, 'id' | 'name'> | null;
  /** Last unit price paid in the home's currency, if it was ever bought. */
  lastPrice: number | null;
};

/**
 * The home the user is using: their saved current home, else the first home they belong to (which is then saved).
 * Null when they have none yet (they create one or accept an invitation).
 */
export async function fetchCurrentHome(userId: string, currentHomeId: string | null | undefined): Promise<GroupSummary | null> {
  const homes = await fetchGroups(userId);
  const home = homes.find((entry) => entry.id === currentHomeId) ?? homes[0] ?? null;
  if (home && home.id !== currentHomeId) await setCurrentHome(userId, home.id);
  return home;
}

export async function setCurrentHome(userId: string, homeId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('user_settings').update({ current_home_id: homeId }).eq('user_id', userId).select('user_id').single());
}

/** Creates a home with a "To buy" list, in the given currency (default: the user's default currency). */
export async function createHome(name: string, currencyCode?: string): Promise<Tables<'shopping_groups'>> {
  return unwrap(await getSupabaseClient().rpc('create_home', { home_name: name, ...(currencyCode ? { currency_code: currencyCode } : {}) }));
}

/** The home's inventory with the last price paid for each item (in the home's currency). */
export async function fetchHomeItems(homeId: string, currencyCode: string): Promise<HomeItem[]> {
  const client = getSupabaseClient();
  const items = unwrap(await client.from('home_items').select('*, product:products(id, name), category:categories(id, name)')
    .eq('group_id', homeId).is('archived_at', null).order('created_at'));
  const productIds = items.map((item) => item.product_id);
  const prices = productIds.length ? unwrap(await client.from('price_history').select('product_id, price, purchased_at')
    .in('product_id', productIds).eq('currency_code', currencyCode).order('purchased_at', { ascending: false }).limit(productIds.length * 20)) : [];
  return items.map((item) => ({ ...item, lastPrice: prices.find((price) => price.product_id === item.product_id)?.price ?? null }));
}

/** Adds something the household keeps at home. Re-adding an archived item restores it. */
export async function addHomeItem(userId: string, homeId: string, name: string, { usualQuantity = 1, unit, isBulk = false, categoryId }: { usualQuantity?: number; unit?: string; isBulk?: boolean; categoryId?: string | null } = {}): Promise<void> {
  const client = getSupabaseClient();
  const product = await findOrCreateProduct(name, userId);
  const { error } = await client.from('home_items').insert({ group_id: homeId, product_id: product.id, usual_quantity: usualQuantity, unit, is_bulk: isBulk, category_id: categoryId ?? null });
  if (!error) return;
  if (error.code !== '23505') unwrap({ data: null, error });
  // Already in this home: bring it back if it was archived, otherwise report it.
  const restored = unwrap(await client.from('home_items').update({ archived_at: null }).eq('group_id', homeId).eq('product_id', product.id).not('archived_at', 'is', null).select('id'));
  if (restored.length === 0) throw new ServiceError('ALREADY_EXISTS', 'Already in your home');
}

export async function updateHomeItem(itemId: string, changes: { usualQuantity?: number; unit?: string | null; isBulk?: boolean; categoryId?: string | null }): Promise<void> {
  unwrap(await getSupabaseClient().from('home_items').update({
    ...(changes.usualQuantity === undefined ? {} : { usual_quantity: changes.usualQuantity }),
    ...(changes.unit === undefined ? {} : { unit: changes.unit }),
    ...(changes.isBulk === undefined ? {} : { is_bulk: changes.isBulk }),
    ...(changes.categoryId === undefined ? {} : { category_id: changes.categoryId })
  }).eq('id', itemId).select('id').single());
}

export async function archiveHomeItem(itemId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('home_items').update({ archived_at: new Date().toISOString() }).eq('id', itemId).select('id').single());
}

/**
 * Marks an item in stock, running low, or finished. Low and finished put it on a To-buy list (the given one, else the
 * home's first list) at the last price paid, unless it is already there. Returns the To-buy entry, if any.
 */
export async function markHomeItem(itemId: string, status: StockStatus, listId?: string): Promise<Tables<'list_items'> | null> {
  const { data, error } = await getSupabaseClient().rpc('mark_home_item', { target_item_id: itemId, new_status: status, ...(listId ? { target_list_id: listId } : {}) });
  if (error) unwrap({ data: null, error });
  return (data as Tables<'list_items'> | null) ?? null;
}

/** What the home has spent this month, one total per currency. */
export async function fetchMonthSpending(homeId: string): Promise<TrendMonth[]> {
  const now = new Date();
  return (await fetchSpendingTrend(1, homeId)).filter((month) => month.year === now.getFullYear() && month.month === now.getMonth() + 1);
}
