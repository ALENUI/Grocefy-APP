import { getSupabaseClient } from './supabase';

export type PurchaseResult = { id: string; purchased_amount: string; currency_code: string; purchased_at: string };
export type PurchaseErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'ALREADY_PURCHASED' | 'UNKNOWN';

/** Calls the database transaction; clients never create purchases or history records directly. */
export async function purchaseListItem(listItemId: string, actualAmount: string): Promise<PurchaseResult> {
  const { data, error } = await getSupabaseClient().rpc('purchase_list_item', { target_item_id: listItemId, actual_amount: actualAmount });
  if (error) {
    const code = ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR', 'ALREADY_PURCHASED'].find((entry) => error.message.includes(entry)) ?? 'UNKNOWN';
    throw Object.assign(new Error(error.message), { code: code as PurchaseErrorCode });
  }
  return data as PurchaseResult;
}
