// Offline change queue: pure logic (no React Native imports) so it can be unit-tested under Node.
import type { HomeItem, HomeItemChanges, StockStatus } from '../services/home';
import type { ItemChanges, ListItem } from '../services/lists';

// Home changes use `listId` = homeListId(homeId), so list screens never mistake them for their own.
type OpBase = { id: string; createdAt: string; listId: string; label: string };
export const homeListId = (homeId: string) => `home:${homeId}`;
export type QueuedOp = OpBase & (
  | { kind: 'addItem'; itemId: string; productName: string; productId?: string; quantity: number; unit?: string | null; isBulk?: boolean; budgetedUnitPrice: number; categoryId: string | null; categoryName?: string | null }
  | { kind: 'updateItem'; itemId: string; changes: ItemChanges; categoryName?: string | null }
  | { kind: 'removeItem'; itemId: string }
  | { kind: 'purchase'; itemId: string; clientRef: string; actualAmount: number | null; purchasedAt: string }
  | { kind: 'addHomeItem'; itemId: string; homeId: string; name: string; usualQuantity: number; unit: string | null; isBulk: boolean; categoryId: string | null; categoryName?: string | null }
  | { kind: 'markHomeItem'; itemId: string; status: StockStatus }
  | { kind: 'updateHomeItem'; itemId: string; changes: HomeItemChanges; categoryName?: string | null }
  | { kind: 'archiveHomeItem'; itemId: string }
);
export type SyncProblem = { opId: string; label: string; message: string; at: string };
export type DisplayItem = ListItem & { pendingSync?: boolean };
export type DisplayHomeItem = HomeItem & { pendingSync?: boolean };

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
        id: op.itemId, list_id: listId, product_id: op.productId ?? '', category_id: op.categoryId, quantity: op.quantity, unit: op.unit ?? null, is_bulk: op.isBulk ?? false,
        budgeted_unit_price: op.budgetedUnitPrice, budgeted_total: total(op.quantity, op.budgetedUnitPrice), status: 'pending', notes: null,
        created_by: '', created_at: op.createdAt, updated_at: op.createdAt, purchased_at: null,
        product: { id: op.productId ?? '', name: op.productName }, category: op.categoryId ? { id: op.categoryId, name: op.categoryName ?? '' } : null, pendingSync: true
      });
    } else if (op.kind === 'removeItem') {
      result = result.filter((item) => item.id !== op.itemId);
    } else if (op.kind === 'purchase' || op.kind === 'updateItem') {
      result = result.map((item) => {
        if (item.id !== op.itemId || item.status === 'purchased') return item;
        if (op.kind === 'purchase') return { ...item, status: 'purchased', purchased_at: op.purchasedAt ?? now, pendingSync: true };
        const quantity = op.changes.quantity ?? item.quantity;
        const price = op.changes.budgetedUnitPrice ?? item.budgeted_unit_price;
        const categoryId = op.changes.categoryId === undefined ? item.category_id : op.changes.categoryId;
        return {
          ...item, quantity, budgeted_unit_price: price, budgeted_total: total(quantity, price), category_id: categoryId, is_bulk: op.changes.isBulk ?? item.is_bulk, unit: op.changes.unit === undefined ? item.unit : op.changes.unit,
          category: op.changes.categoryId === undefined ? item.category : categoryId ? { id: categoryId, name: op.categoryName ?? item.category?.name ?? '' } : null,
          pendingSync: true
        };
      });
    }
  }
  return result;
}

/** The home's inventory with unsynced Home changes applied, in order; touched items are flagged `pendingSync`. */
export function applyHomeQueue(items: HomeItem[], ops: QueuedOp[], homeId: string): DisplayHomeItem[] {
  let result: DisplayHomeItem[] = items.map((item) => ({ ...item }));
  for (const op of ops) {
    if (op.listId !== homeListId(homeId)) continue;
    if (op.kind === 'addHomeItem') {
      if (result.some((item) => item.id === op.itemId)) continue; // already synced and refetched
      result.push({
        id: op.itemId, group_id: homeId, product_id: '', category_id: op.categoryId, status: 'in_stock', usual_quantity: op.usualQuantity, unit: op.unit, is_bulk: op.isBulk,
        created_by: null, updated_by: null, created_at: op.createdAt, updated_at: op.createdAt, archived_at: null,
        product: { id: '', name: op.name }, category: op.categoryId ? { id: op.categoryId, name: op.categoryName ?? '' } : null, lastPrice: null, pendingSync: true
      });
    } else if (op.kind === 'archiveHomeItem') {
      result = result.filter((item) => item.id !== op.itemId);
    } else if (op.kind === 'markHomeItem') {
      result = result.map((item) => (item.id === op.itemId ? { ...item, status: op.status, pendingSync: true } : item));
    } else if (op.kind === 'updateHomeItem') {
      result = result.map((item) => {
        if (item.id !== op.itemId) return item;
        const { usualQuantity, unit, isBulk, categoryId } = op.changes;
        return {
          ...item, usual_quantity: usualQuantity ?? item.usual_quantity, unit: unit === undefined ? item.unit : unit, is_bulk: isBulk ?? item.is_bulk,
          category_id: categoryId === undefined ? item.category_id : categoryId,
          category: categoryId === undefined ? item.category : categoryId ? { id: categoryId, name: op.categoryName ?? item.category?.name ?? '' } : null,
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
    const creates = op.kind === 'addItem' || op.kind === 'addHomeItem';
    if (!creates && refusedItems.has(op.itemId)) {
      problems.push({ opId: op.id, label: op.label, message: 'Skipped because the item could not be added.', at: now() });
      continue;
    }
    const outcome = await send(op);
    if (outcome === 'retry') return { remaining: ops.slice(index), problems, synced };
    if (outcome === 'synced') { synced += 1; continue; }
    if (creates) refusedItems.add(op.itemId);
    problems.push({ opId: op.id, label: op.label, message: outcome.drop, at: now() });
  }
  return { remaining: [], problems, synced };
}
