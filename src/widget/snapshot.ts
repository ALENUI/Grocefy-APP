import type { HomeItem, StockStatus } from '../services/home';
import { leftToBuy, type ListWithContext } from '../services/lists';

/** What the home-screen widget shows. Saved by the app (and by the widget's own refresh) so the widget draws without the app open. */
export type WidgetSnapshot = {
  userId: string; homeId: string; homeName: string; currencyCode: string;
  /** What needs buying, finished first. */
  needed: { name: string; status: Exclude<StockStatus, 'in_stock'> }[];
  /** Still to buy across the home's lists, one total per currency (amounts in different currencies are never added). */
  toBuy: { currencyCode: string; amount: number }[];
  itemsLeft: number;
  updatedAt: string;
};

export function buildSnapshot(userId: string, home: { id: string; name: string; currency_code: string }, items: Pick<HomeItem, 'status' | 'product'>[], lists: ListWithContext[]): WidgetSnapshot {
  const needed = items.filter((item) => item.status !== 'in_stock')
    .sort((a, b) => Number(b.status === 'out') - Number(a.status === 'out'))
    .map((item) => ({ name: item.product?.name ?? 'Item', status: item.status as Exclude<StockStatus, 'in_stock'> }));
  const totals = lists.reduce<Record<string, number>>((all, list) => ({ ...all, [list.currency_code]: (all[list.currency_code] ?? 0) + leftToBuy(list.totals) }), {});
  return {
    userId, homeId: home.id, homeName: home.name, currencyCode: home.currency_code, needed,
    toBuy: Object.entries(totals).filter(([, amount]) => amount > 0).map(([currencyCode, amount]) => ({ currencyCode, amount })),
    itemsLeft: lists.reduce((sum, list) => sum + (list.totals?.item_count ?? 0) - (list.totals?.purchased_count ?? 0), 0),
    updatedAt: new Date().toISOString()
  };
}
