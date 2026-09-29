import { unwrap } from './errors';
import { getSupabaseClient, Tables, Views } from './supabase';

export type ShoppingList = Tables<'shopping_lists'>;
export type ListItem = Tables<'list_items'> & { product: Pick<Tables<'products'>, 'id' | 'name'> | null };
export type ListTotals = Views<'list_totals'>;
export type GroupTotals = Views<'group_totals'>;
export type PriceSuggestion = {
  latestUnitPrice: number; latestCurrencyCode: string; latestPurchasedAt: string;
  /** Only set when a price exists in the requested currency; prices are never converted. */
  suggestedUnitPrice: number | null;
};

export type CreateListInput = { ownerId: string; name: string; currencyCode: string; groupId?: string | null; categoryId?: string | null; description?: string };
export type AddItemInput = { listId: string; productName: string; quantity?: number; unit?: string; budgetedUnitPrice: number; categoryId?: string | null; notes?: string };

export async function fetchLists(): Promise<(ShoppingList & { totals: ListTotals | null })[]> {
  const client = getSupabaseClient();
  const lists = unwrap(await client.from('shopping_lists').select('*').is('archived_at', null).order('created_at', { ascending: false }));
  const totals = unwrap(await client.from('list_totals').select('*').in('list_id', lists.map((list) => list.id)));
  return lists.map((list) => ({ ...list, totals: totals.find((entry) => entry.list_id === list.id) ?? null }));
}

/** Group totals are per currency: lists in one group may use different currencies and are never summed together. */
export async function fetchGroupTotals(groupId: string): Promise<GroupTotals[]> {
  return unwrap(await getSupabaseClient().from('group_totals').select('*').eq('group_id', groupId));
}

export async function createList({ ownerId, name, currencyCode, groupId, categoryId, description }: CreateListInput): Promise<ShoppingList> {
  return unwrap(await getSupabaseClient().from('shopping_lists')
    .insert({ owner_id: ownerId, name, currency_code: currencyCode, group_id: groupId ?? null, category_id: categoryId ?? null, description })
    .select('*').single());
}

/** Archiving is the only way to remove a list; its purchase history is preserved. */
export async function archiveList(listId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('shopping_lists').update({ archived_at: new Date().toISOString() }).eq('id', listId).select('id').single());
}

export async function fetchListItems(listId: string): Promise<ListItem[]> {
  return unwrap(await getSupabaseClient().from('list_items').select('*, product:products(id, name)').eq('list_id', listId).neq('status', 'archived').order('created_at'));
}

/** Reuses a product the caller can already see (including collaborators' products on shared lists) so price history stays shared. */
export async function findOrCreateProduct(name: string, userId: string): Promise<Tables<'products'>> {
  const client = getSupabaseClient();
  const trimmed = name.trim();
  const escaped = trimmed.replace(/[\\%_]/g, (character) => `\\${character}`);
  const existing = unwrap(await client.from('products').select('*').ilike('name', escaped).is('archived_at', null).limit(10));
  const match = existing.find((product) => product.owner_id === userId) ?? existing[0];
  if (match) return match;
  return unwrap(await client.from('products').insert({ owner_id: userId, name: trimmed }).select('*').single());
}

export async function searchProducts(query: string, limit = 20): Promise<Tables<'products'>[]> {
  const escaped = query.trim().replace(/[\\%_]/g, (character) => `\\${character}`);
  return unwrap(await getSupabaseClient().from('products').select('*').ilike('name', `%${escaped}%`).is('archived_at', null).order('name').limit(limit));
}

/** `userId` is the signed-in user; the database overrides created_by with the authenticated user regardless. */
export async function addItem(userId: string, { listId, productName, quantity = 1, unit, budgetedUnitPrice, categoryId, notes }: AddItemInput): Promise<ListItem> {
  const product = await findOrCreateProduct(productName, userId);
  return unwrap(await getSupabaseClient().from('list_items')
    .insert({ list_id: listId, product_id: product.id, quantity, unit, budgeted_unit_price: budgetedUnitPrice, category_id: categoryId ?? null, notes, created_by: userId })
    .select('*, product:products(id, name)').single());
}

export async function updateItemBudget(itemId: string, budgetedUnitPrice: number, quantity?: number): Promise<void> {
  unwrap(await getSupabaseClient().from('list_items').update({ budgeted_unit_price: budgetedUnitPrice, ...(quantity === undefined ? {} : { quantity }) }).eq('id', itemId).select('id').single());
}

export async function getPriceSuggestion(productId: string, currencyCode: string): Promise<PriceSuggestion | null> {
  const [row] = unwrap(await getSupabaseClient().rpc('get_price_suggestion', { target_product_id: productId, target_currency_code: currencyCode }));
  if (!row) return null;
  return { latestUnitPrice: row.latest_unit_price, latestCurrencyCode: row.latest_currency_code, latestPurchasedAt: row.latest_purchased_at, suggestedUnitPrice: row.suggested_unit_price ?? null };
}
