import { unwrap } from './errors';
import { getSupabaseClient, MemberRoleWithOwner, Tables, Views } from './supabase';

export type ShoppingList = Tables<'shopping_lists'>;
export type ListWithContext = ShoppingList & {
  group: Pick<Tables<'shopping_groups'>, 'id' | 'name'> | null;
  category: Pick<Tables<'categories'>, 'id' | 'name'> | null;
  totals: ListTotals | null;
};
export type ListItem = Tables<'list_items'> & { product: Pick<Tables<'products'>, 'id' | 'name'> | null; category: Pick<Tables<'categories'>, 'id' | 'name'> | null };
export type ListTotals = Views<'list_totals'>;
export type PriceSuggestion = {
  latestUnitPrice: number; latestCurrencyCode: string; latestPurchasedAt: string;
  /** Only set when a price exists in the requested currency; prices are never converted. */
  suggestedUnitPrice: number | null;
};

export type CreateListInput = { ownerId: string; name: string; currencyCode: string; groupId?: string | null; categoryId?: string | null; description?: string };
/** productId: a product chosen from search suggestions; otherwise the product is found or created by name. */
export type AddItemInput = { listId: string; productName: string; productId?: string; quantity?: number; unit?: string; budgetedUnitPrice: number; categoryId?: string | null; notes?: string };
export type ItemChanges = { quantity?: number; budgetedUnitPrice?: number; categoryId?: string | null };
export type ListChanges = { name?: string; categoryId?: string | null; currencyCode?: string };

const listSelect = '*, group:shopping_groups(id, name), category:categories(id, name)';

async function withTotals(lists: Omit<ListWithContext, 'totals'>[]): Promise<ListWithContext[]> {
  if (!lists.length) return [];
  const totals = unwrap(await getSupabaseClient().from('list_totals').select('*').in('list_id', lists.map((list) => list.id)));
  return lists.map((list) => ({ ...list, totals: totals.find((entry) => entry.list_id === list.id) ?? null }));
}

/** Active lists visible to the caller, newest first; optionally only those in one group. */
export async function fetchLists({ groupId }: { groupId?: string } = {}): Promise<ListWithContext[]> {
  let query = getSupabaseClient().from('shopping_lists').select(listSelect).is('archived_at', null).order('created_at', { ascending: false });
  if (groupId) query = query.eq('group_id', groupId);
  return withTotals(unwrap(await query));
}

export async function fetchList(listId: string): Promise<ListWithContext> {
  const [list] = await withTotals([unwrap(await getSupabaseClient().from('shopping_lists').select(listSelect).eq('id', listId).single())]);
  return list;
}

/** The caller's effective role on a list (own, list membership, or inherited from the group). For UI only; the server enforces it. */
export async function fetchListRole(listId: string): Promise<MemberRoleWithOwner | null> {
  return (await getSupabaseClient().rpc('get_list_role', { target_list_id: listId })).data ?? null;
}

export async function createList({ ownerId, name, currencyCode, groupId, categoryId, description }: CreateListInput): Promise<ShoppingList> {
  return unwrap(await getSupabaseClient().from('shopping_lists')
    .insert({ owner_id: ownerId, name, currency_code: currencyCode, group_id: groupId ?? null, category_id: categoryId ?? null, description })
    .select('*').single());
}

/** Renaming and recategorizing need Editor access; changing the currency needs the owner and an empty list. */
export async function updateList(listId: string, { name, categoryId, currencyCode }: ListChanges): Promise<void> {
  unwrap(await getSupabaseClient().from('shopping_lists').update({
    ...(name === undefined ? {} : { name }), ...(categoryId === undefined ? {} : { category_id: categoryId }), ...(currencyCode === undefined ? {} : { currency_code: currencyCode })
  }).eq('id', listId).select('id').single());
}

/** Archiving is the only way to remove a list; its purchase history is preserved. */
export async function archiveList(listId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('shopping_lists').update({ archived_at: new Date().toISOString() }).eq('id', listId).select('id').single());
}

export async function fetchListItems(listId: string): Promise<ListItem[]> {
  return unwrap(await getSupabaseClient().from('list_items').select(itemSelect).eq('list_id', listId).neq('status', 'archived').order('created_at'));
}

const itemSelect = '*, product:products(id, name), category:categories(id, name)';

const escapeLike = (value: string) => value.trim().replace(/[\\%_]/g, (character) => `\\${character}`);

/** An existing product the caller can see with exactly this name (case-insensitive), preferring their own. */
export async function findProduct(name: string, userId: string): Promise<Tables<'products'> | null> {
  if (!name.trim()) return null;
  const existing = unwrap(await getSupabaseClient().from('products').select('*').ilike('name', escapeLike(name)).is('archived_at', null).limit(10));
  return existing.find((product) => product.owner_id === userId) ?? existing[0] ?? null;
}

/** Reuses a product the caller can already see (including collaborators' products on shared lists) so price history stays shared. */
export async function findOrCreateProduct(name: string, userId: string): Promise<Tables<'products'>> {
  return (await findProduct(name, userId))
    ?? unwrap(await getSupabaseClient().from('products').insert({ owner_id: userId, name: name.trim() }).select('*').single());
}

/** Ranked suggestions (exact, prefix, then similar names) among products the caller can see; one result per name. */
export async function searchProducts(query: string, limit = 8): Promise<Tables<'products'>[]> {
  if (!query.trim()) return [];
  return unwrap(await getSupabaseClient().rpc('search_products', { query, result_limit: limit }));
}

/** `userId` is the signed-in user; the database overrides created_by with the authenticated user regardless. */
export async function addItem(userId: string, { listId, productName, productId, quantity = 1, unit, budgetedUnitPrice, categoryId, notes }: AddItemInput): Promise<ListItem> {
  const product = productId ? { id: productId } : await findOrCreateProduct(productName, userId);
  return unwrap(await getSupabaseClient().from('list_items')
    .insert({ list_id: listId, product_id: product.id, quantity, unit, budgeted_unit_price: budgetedUnitPrice, category_id: categoryId ?? null, notes, created_by: userId })
    .select(itemSelect).single());
}

export async function updateItem(itemId: string, { quantity, budgetedUnitPrice, categoryId }: ItemChanges): Promise<void> {
  unwrap(await getSupabaseClient().from('list_items').update({
    ...(quantity === undefined ? {} : { quantity }), ...(budgetedUnitPrice === undefined ? {} : { budgeted_unit_price: budgetedUnitPrice }), ...(categoryId === undefined ? {} : { category_id: categoryId })
  }).eq('id', itemId).select('id').single());
}

export async function removeItem(itemId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('list_items').delete().eq('id', itemId).select('id').single());
}

export async function getPriceSuggestion(productId: string, currencyCode: string): Promise<PriceSuggestion | null> {
  const [row] = unwrap(await getSupabaseClient().rpc('get_price_suggestion', { target_product_id: productId, target_currency_code: currencyCode }));
  if (!row) return null;
  return { latestUnitPrice: row.latest_unit_price, latestCurrencyCode: row.latest_currency_code, latestPurchasedAt: row.latest_purchased_at, suggestedUnitPrice: row.suggested_unit_price ?? null };
}
