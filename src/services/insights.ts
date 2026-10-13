import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

/** One product in one currency. Prices are unit prices; currencies are never mixed. */
export type PriceSummary = {
  productId: string; productName: string; currencyCode: string; purchaseCount: number;
  lastPrice: number; previousPrice: number | null; minPrice: number; maxPrice: number; averagePrice: number; lastPurchasedAt: string;
};
export type PricePoint = Pick<Tables<'price_history'>, 'id' | 'price' | 'currency_code' | 'purchased_at'> & {
  purchase: { quantity: number; list: { name: string } | null } | null;
};
export type TrendMonth = { year: number; month: number; currencyCode: string; budgeted: number; purchased: number; purchaseCount: number };

/** Price book: every product the caller has price history for, most recently bought first. */
export async function fetchPriceSummaries(search?: string, limit = 100): Promise<PriceSummary[]> {
  const rows = unwrap(await getSupabaseClient().rpc('product_price_summary', { ...(search?.trim() ? { search } : {}), result_limit: limit }));
  return rows.map((row) => ({
    productId: row.product_id, productName: row.product_name, currencyCode: row.currency_code, purchaseCount: row.purchase_count,
    lastPrice: row.last_price, previousPrice: row.previous_price ?? null, minPrice: row.min_price, maxPrice: row.max_price,
    averagePrice: row.average_price, lastPurchasedAt: row.last_purchased_at
  }));
}

/** Every recorded unit price for a product, newest first, with the list it was bought on. */
export async function fetchPriceHistory(productId: string, limit = 200): Promise<PricePoint[]> {
  return unwrap(await getSupabaseClient().from('price_history')
    .select('id, price, currency_code, purchased_at, purchase:purchases(quantity, list:shopping_lists(name))')
    .eq('product_id', productId).order('purchased_at', { ascending: false }).limit(limit));
}

export async function fetchProductName(productId: string): Promise<string> {
  const product: Tables<'products'> = unwrap(await getSupabaseClient().from('products').select('*').eq('id', productId).single());
  return product.name;
}

/** Purchased vs budgeted per month and currency for the last `months` months (own purchases, or a group's). */
export async function fetchSpendingTrend(months = 6, groupId?: string): Promise<TrendMonth[]> {
  const rows = unwrap(await getSupabaseClient().rpc('spending_trend', { months, ...(groupId ? { target_group_id: groupId } : {}) }));
  return rows.map((row) => ({ year: row.year, month: row.month, currencyCode: row.currency_code, budgeted: row.budgeted, purchased: row.purchased, purchaseCount: row.purchase_count }));
}

/** Percentage change from the previous to the last price, or null when there is no previous price. */
export const priceChange = (summary: Pick<PriceSummary, 'lastPrice' | 'previousPrice'>) =>
  summary.previousPrice ? ((summary.lastPrice - summary.previousPrice) / summary.previousPrice) * 100 : null;
