import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

export type MonthlyReport = Tables<'monthly_reports'>;
export type MonthlyReportItem = Tables<'monthly_report_items'>;
export type MonthlyReportWithItems = MonthlyReport & { items: MonthlyReportItem[] };
/** Personal reports cover the caller's own purchases; group and list reports need the owner or partner role. */
export type ReportScope = { kind: 'personal' } | { kind: 'group'; groupId: string } | { kind: 'list'; listId: string };

/**
 * Generates the reports for a month (one per currency) or returns them unchanged if the month is closed and already
 * final. Variance is purchased − budgeted: negative is under budget, positive is over.
 */
export async function generateMonthlyReport(year: number, month: number, scope: ReportScope = { kind: 'personal' }): Promise<MonthlyReport[]> {
  return unwrap(await getSupabaseClient().rpc('generate_monthly_report', {
    target_year: year, target_month: month,
    ...(scope.kind === 'group' ? { target_group_id: scope.groupId } : {}),
    ...(scope.kind === 'list' ? { target_list_id: scope.listId } : {})
  }));
}

/** Reports visible to the caller, newest month first. Totals are per currency and must never be summed across reports. */
export async function fetchMonthlyReports({ scope, year, month, pageSize = 24, page = 0 }: { scope?: ReportScope; year?: number; month?: number; pageSize?: number; page?: number } = {}): Promise<MonthlyReportWithItems[]> {
  let query = getSupabaseClient().from('monthly_reports').select('*, items:monthly_report_items(*)')
    .order('year', { ascending: false }).order('month', { ascending: false }).order('currency_code')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (scope?.kind === 'group') query = query.eq('group_id', scope.groupId);
  if (scope?.kind === 'list') query = query.eq('list_id', scope.listId);
  if (scope?.kind === 'personal') query = query.is('group_id', null).is('list_id', null);
  if (year !== undefined) query = query.eq('year', year);
  if (month !== undefined) query = query.eq('month', month);
  return unwrap(await query);
}
