import { formatCurrency } from './currency';

export type ActivityEntry = {
  action: string; subject: string | null; metadata: Record<string, unknown> | null; created_at: string;
  actor: { username: string; display_name: string } | null;
};

const amount = (metadata: Record<string, unknown>, key: string) => {
  const value = Number(metadata[key]);
  const code = typeof metadata.currency_code === 'string' ? metadata.currency_code : undefined;
  return code && Number.isFinite(value) ? formatCurrency(value, code) : undefined;
};
const role = (value: unknown) => (typeof value === 'string' ? value.charAt(0).toUpperCase() + value.slice(1) : 'member');

/** One readable line per activity entry, e.g. "Alex purchased Rice for FCFA 23,500 (budget FCFA 25,000)". */
export function describeActivity(entry: ActivityEntry): string {
  const who = entry.actor?.display_name ?? 'Grocefy';
  const what = entry.subject ?? 'an item';
  const metadata = entry.metadata ?? {};
  switch (entry.action) {
    case 'LIST_CREATED': return `${who} created the list ${what}`;
    case 'LIST_ARCHIVED': return `${who} archived the list ${what}`;
    case 'ITEM_ADDED': { const budget = amount(metadata, 'budgeted_total'); return `${who} added ${what}${budget ? ` (budget ${budget})` : ''}`; }
    case 'ITEM_EDITED': {
      const before = amount(metadata, 'previous_budgeted_total'); const after = amount(metadata, 'budgeted_total');
      return before && after && before !== after ? `${who} changed the budget for ${what} from ${before} to ${after}` : `${who} edited ${what}`;
    }
    case 'ITEM_REMOVED': return `${who} removed ${what}`;
    case 'ITEM_PURCHASED': {
      const paid = amount(metadata, 'purchased_amount'); const budget = amount(metadata, 'budgeted_amount');
      return `${who} purchased ${what}${paid ? ` for ${paid}` : ''}${budget ? ` (budget ${budget})` : ''}`;
    }
    case 'MEMBER_ADDED': return `@${what} joined as ${role(metadata.role)}`;
    case 'MEMBER_ROLE_CHANGED': return `${who} changed @${what} from ${role(metadata.previous_role)} to ${role(metadata.role)}`;
    case 'MEMBER_REMOVED': return `@${what} is no longer a member`;
    default: return `${who} updated ${what}`;
  }
}

/** "just now", "5 min ago", "3 h ago", then a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return shortDate(iso);
}

/** "26 Oct" (with the year only when it is not this year). */
export function shortDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
