import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

export type Purchase = Tables<'purchases'>;
export type PurchaseWithProduct = Purchase & { product: Pick<Tables<'products'>, 'id' | 'name'> | null; list: Pick<Tables<'shopping_lists'>, 'id' | 'name'> | null };
/** clientRef makes retries idempotent; purchasedAt keeps the time of a purchase made offline (the server bounds it). */
export type PurchaseInput = ({ actualAmount: number } | { useBudgetedAmount: true }) & { clientRef?: string; purchasedAt?: string };

/**
 * Calls the database transaction; clients never create purchases or history records directly.
 * The purchaser, currency, and budget snapshot are derived server-side from the item and list.
 */
export async function purchaseListItem(listItemId: string, input: PurchaseInput): Promise<Purchase> {
  const args = {
    target_item_id: listItemId,
    ...('useBudgetedAmount' in input ? { use_budgeted_amount: true } : { actual_amount: input.actualAmount }),
    ...(input.clientRef ? { client_ref: input.clientRef } : {}),
    ...(input.purchasedAt ? { purchased_at: input.purchasedAt } : {})
  };
  return unwrap(await getSupabaseClient().rpc('purchase_list_item', args));
}

/** Purchased history, newest first. Pass the last row of a page as `after` to fetch the next page (keyset pagination). */
export async function fetchPurchases({ listId, after, pageSize = 50 }: { listId?: string; after?: Pick<Purchase, 'purchased_at' | 'id'>; pageSize?: number } = {}): Promise<PurchaseWithProduct[]> {
  let query = getSupabaseClient().from('purchases').select('*, product:products(id, name), list:shopping_lists(id, name)')
    .order('purchased_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize);
  if (listId) query = query.eq('list_id', listId);
  if (after) query = query.or(`purchased_at.lt."${after.purchased_at}",and(purchased_at.eq."${after.purchased_at}",id.lt.${after.id})`);
  return unwrap(await query);
}
