// Offline change queue: pure logic (no React Native imports) so it can be unit-tested under Node.
import type { ItemChanges, ListItem } from '../services/lists';

type OpBase = { id: string; createdAt: string; listId: string; label: string };
export type QueuedOp = OpBase & (
  | { kind: 'addItem'; itemId: string; productName: string; productId?: string; quantity: number; isBulk?: boolean; budgetedUnitPrice: number; categoryId: string | null; categoryName?: string | null }
  | { kind: 'updateItem'; itemId: string; changes: ItemChanges; categoryName?: string | null }
  | { kind: 'removeItem'; itemId: string }
  | { kind: 'purchase'; itemId: string; clientRef: string; actualAmount: number | null; purchasedAt: string }
);
export type SyncProblem = { opId: string; label: string; message: string; at: string };
export type DisplayItem = ListItem & { pendingSync?: boolean };

const total = (quantity: number, price: number) => Math.round(quantity * price * 10000) / 10000;

/**
 * The list as the user expects to see it: the last server state with their unsynced changes applied, in order.
 * Items touched by a queued change are flagged `pendingSync`.
 */
export function applyQueue(items: ListItem[], ops: QueuedOp[], listId: string, now = new Date().toISOString()): DisplayItem[] {
  let result: DisplayItem[] = items.map((item) => ({ ...item }));
  for (const op of ops) {
    if (op.listId !== listId) continue;
    if (op.kind === 'addItem') {
      if (result.some((item) => item.id === op.itemId)) continue; // already synced and refetched
      result.push({
        id: op.itemId, list_id: listId, product_id: op.productId ?? '', category_id: op.categoryId, quantity: op.quantity, unit: null, is_bulk: op.isBulk ?? false,
        budgeted_unit_price: op.budgetedUnitPrice, budgeted_total: total(op.quantity, op.budgetedUnitPrice), status: 'pending', notes: null,
        created_by: '', created_at: op.createdAt, updated_at: op.createdAt, purchased_at: null,
        product: { id: op.productId ?? '', name: op.productName }, category: op.categoryId ? { id: op.categoryId, name: op.categoryName ?? '' } : null, pendingSync: true
      });
    } else if (op.kind === 'removeItem') {
      result = result.filter((item) => item.id !== op.itemId);
    } else {
      result = result.map((item) => {
        if (item.id !== op.itemId || item.status === 'purchased') return item;
        if (op.kind === 'purchase') return { ...item, status: 'purchased', purchased_at: op.purchasedAt ?? now, pendingSync: true };
        const quantity = op.changes.quantity ?? item.quantity;
        const price = op.changes.budgetedUnitPrice ?? item.budgeted_unit_price;
        const categoryId = op.changes.categoryId === undefined ? item.category_id : op.changes.categoryId;
        return {
          ...item, quantity, budgeted_unit_price: price, budgeted_total: total(quantity, price), category_id: categoryId, is_bulk: op.changes.isBulk ?? item.is_bulk,
          category: op.changes.categoryId === undefined ? item.category : categoryId ? { id: categoryId, name: op.categoryName ?? item.category?.name ?? '' } : null,
          pendingSync: true
        };
      });
    }
  }
  return result;
}

export type Outcome = 'synced' | 'retry' | { drop: string };
export type ProcessResult = { remaining: QueuedOp[]; problems: SyncProblem[]; synced: number };

/**
 * Sends queued changes in order. A change that cannot reach the server (`retry`) stops the run so order is kept;
 * a change the server refuses (`drop`) is discarded and reported, along with later changes to an item whose
 * offline creation was refused.
 */
export async function processQueue(ops: QueuedOp[], send: (op: QueuedOp) => Promise<Outcome>, now = () => new Date().toISOString()): Promise<ProcessResult> {
  const problems: SyncProblem[] = [];
  const refusedItems = new Set<string>();
  let synced = 0;
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index];
    if (op.kind !== 'addItem' && refusedItems.has(op.itemId)) {
      problems.push({ opId: op.id, label: op.label, message: 'Skipped because the item could not be added.', at: now() });
      continue;
    }
    const outcome = await send(op);
    if (outcome === 'retry') return { remaining: ops.slice(index), problems, synced };
    if (outcome === 'synced') { synced += 1; continue; }
    if (op.kind === 'addItem') refusedItems.add(op.itemId);
    problems.push({ opId: op.id, label: op.label, message: outcome.drop, at: now() });
  }
  return { remaining: [], problems, synced };
}
