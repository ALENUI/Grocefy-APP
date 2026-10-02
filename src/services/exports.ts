import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { csvAmount, slug, toCsv } from '../csv';
import { MonthlyReportWithItems } from './finance';
import { PurchaseWithProduct } from './purchases';
import { unwrap } from './errors';
import { getSupabaseClient } from './supabase';

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

export const periodLabel = (report: Pick<MonthlyReportWithItems, 'year' | 'month'>) => `${report.year}-${String(report.month).padStart(2, '0')}`;

/** Category statement for one monthly report (one currency). Variance = purchased − budgeted. */
export function reportCsv(report: MonthlyReportWithItems, scopeName: string): string {
  const code = report.currency_code;
  const rows = [...report.items].sort((a, b) => a.category_name_snapshot.localeCompare(b.category_name_snapshot)).map((item) => [
    periodLabel(report), scopeName, code, item.category_name_snapshot, item.item_count,
    csvAmount(item.budgeted_amount, code), csvAmount(item.purchased_amount, code), csvAmount(item.variance, code)
  ]);
  return toCsv([
    ['Period', 'Scope', 'Currency', 'Category', 'Items', 'Budgeted', 'Purchased', 'Variance'],
    ...rows,
    [periodLabel(report), scopeName, code, 'TOTAL', report.items.reduce((sum, item) => sum + item.item_count, 0),
      csvAmount(report.total_budget, code), csvAmount(report.total_purchased, code), csvAmount(report.total_variance, code)]
  ]);
}

/** One line per purchase, each with its own currency. */
export function purchasesCsv(purchases: (PurchaseWithProduct & { category?: { name: string } | null })[]): string {
  return toCsv([
    ['Purchased at', 'Item', 'List', 'Category', 'Quantity', 'Budgeted', 'Paid', 'Currency'],
    ...purchases.map((purchase) => [purchase.purchased_at, purchase.product?.name ?? '', purchase.list?.name ?? '', purchase.category?.name ?? '',
      Number(purchase.quantity), csvAmount(purchase.budgeted_amount, purchase.currency_code), csvAmount(purchase.purchased_amount, purchase.currency_code), purchase.currency_code])
  ]);
}

export type PeriodScope = { groupId: string } | { userId: string };

/** Every purchase in [start, end) and one currency for a group, or made by a user, oldest first. Pass a report's period boundaries so the lines match its totals. */
export async function fetchPurchasesInPeriod(scope: PeriodScope, start: string, end: string, currencyCode: string, max = 5000): Promise<(PurchaseWithProduct & { category: { name: string } | null })[]> {
  const rows: (PurchaseWithProduct & { category: { name: string } | null })[] = [];
  const pageSize = 500;
  for (let page = 0; rows.length < max; page++) {
    let query = getSupabaseClient().from('purchases').select('*, product:products(id, name), list:shopping_lists(id, name), category:categories(name)')
      .gte('purchased_at', start).lt('purchased_at', end).eq('currency_code', currencyCode).order('purchased_at').order('id').range(page * pageSize, page * pageSize + pageSize - 1);
    query = 'groupId' in scope ? query.eq('group_id', scope.groupId) : query.eq('user_id', scope.userId);
    const batch = unwrap(await query);
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows.slice(0, max);
}

/** Writes CSV to the cache directory and opens the system share sheet (save to Files, email, Drive, …). */
export async function shareCsv(fileName: string, csv: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const uri = `${FileSystem.cacheDirectory}${slug(fileName)}.csv`;
  // A byte-order mark makes Excel read the file as UTF-8 (currency symbols, accented names).
  await FileSystem.writeAsStringAsync(uri, BYTE_ORDER_MARK + csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: title });
}

