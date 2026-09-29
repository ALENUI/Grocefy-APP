import type { InvitationEmail, ReportEmail } from './templates.ts';
import type { Outcome, OutboxEmail, OutboxStore } from './worker.ts';

type Result<T> = { data: T | null; error: { message: string } | null };
// Structural subset of SupabaseClient so this module has no runtime dependency on the Deno/npm import.
type Query<T> = PromiseLike<Result<T>> & { eq(column: string, value: unknown): Query<T>; maybeSingle(): PromiseLike<Result<T>> };
export type ServiceClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result<unknown>>;
  from(table: string): { select(columns: string): Query<unknown> };
};

const unwrap = <T>({ data, error }: Result<T>): T | null => { if (error) throw new Error(error.message); return data; };

type InvitationRow = { status: string; expires_at: string; role: string; resource_type: 'group' | 'list'; resource_name: string | null; inviter: { username: string; display_name: string } | null };
type ReportRow = {
  year: number; month: number; currency_code: string; total_budget: number; total_purchased: number; total_variance: number;
  currency: { decimal_digits: number } | null; group: { name: string } | null; list: { name: string } | null;
  items: { category_name_snapshot: string; budgeted_amount: number; purchased_amount: number; variance: number }[];
};

/** Outbox access with the service-role client (bypasses RLS; only used inside the Edge Function). */
export function createSupabaseStore(client: ServiceClient): OutboxStore {
  return {
    async claim(batchSize) {
      return (unwrap(await client.rpc('claim_email_batch', { batch_size: batchSize })) as OutboxEmail[] | null) ?? [];
    },
    async complete(id: string, outcome: Outcome, error?: string) {
      unwrap(await client.rpc('complete_email', { email_id: id, outcome, error_message: error ?? null }));
    },
    async loadInvitation(id) {
      const row = unwrap(await client.from('invitations')
        .select('status, expires_at, role, resource_type, resource_name, inviter:profiles!invitations_inviter_id_fkey(username, display_name)')
        .eq('id', id).maybeSingle()) as InvitationRow | null;
      if (!row || row.status !== 'pending' || new Date(row.expires_at) <= new Date()) return null;
      return {
        resourceName: row.resource_name ?? `a shared ${row.resource_type}`, resourceType: row.resource_type, role: row.role,
        inviterName: row.inviter ? `${row.inviter.display_name} (@${row.inviter.username})` : 'A Grocefy user', expiresAt: row.expires_at
      };
    },
    async loadReport(id) {
      const row = unwrap(await client.from('monthly_reports')
        .select('year, month, currency_code, total_budget, total_purchased, total_variance, currency:currencies(decimal_digits), group:shopping_groups(name), list:shopping_lists(name), items:monthly_report_items(category_name_snapshot, budgeted_amount, purchased_amount, variance)')
        .eq('id', id).maybeSingle()) as ReportRow | null;
      if (!row) return null;
      return {
        year: row.year, month: row.month, currencyCode: row.currency_code, decimalDigits: row.currency?.decimal_digits ?? 2,
        scopeName: row.group?.name ?? row.list?.name ?? 'Your purchases',
        totalBudget: Number(row.total_budget), totalPurchased: Number(row.total_purchased), totalVariance: Number(row.total_variance),
        items: [...row.items].sort((a, b) => Number(b.purchased_amount) - Number(a.purchased_amount)).map((item) => ({
          categoryName: item.category_name_snapshot, budgeted: Number(item.budgeted_amount), purchased: Number(item.purchased_amount), variance: Number(item.variance)
        }))
      };
    }
  };
}
