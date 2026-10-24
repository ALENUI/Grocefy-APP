import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { friendlyError, isNetworkError, ServiceError } from '../services/errors';
import { addHomeItem, archiveHomeItem, markHomeItem, updateHomeItem } from '../services/home';
import { addItem, removeItem, updateItem } from '../services/lists';
import { purchaseListItem } from '../services/purchases';
import { useSession } from '../session';
import { clearCache, setCacheOwner } from './cache';
import { Outcome, processQueue, QueuedOp, SyncProblem } from './queue';
import { updateWidget } from '../widget';

type NewOp = QueuedOp extends infer Op ? Op extends QueuedOp ? Omit<Op, 'id' | 'createdAt'> : never : never;

type OfflineContext = {
  online: boolean;
  ops: QueuedOp[];
  problems: SyncProblem[];
  syncing: boolean;
  /** Increments after changes reach the server, so screens can refetch. */
  syncedVersion: number;
  /** Runs `direct` when it is safe to; otherwise (offline, a network failure, or older changes still queued) queues `op`. */
  submit: <T>(op: NewOp, direct: () => Promise<T>) => Promise<{ queued: false; value: T } | { queued: true }>;
  syncNow: () => Promise<void>;
  dismissProblems: () => void;
  newId: () => string;
};

const Context = createContext<OfflineContext | undefined>(undefined);
const queueKey = (userId: string) => `grocefy:queue:${userId}`;
const problemsKey = (userId: string) => `grocefy:sync-problems:${userId}`;

async function send(op: QueuedOp, userId: string): Promise<Outcome> {
  try {
    if (op.kind === 'addItem') {
      await addItem(userId, { id: op.itemId, listId: op.listId, productName: op.productName, productId: op.productId, quantity: op.quantity, unit: op.unit ?? undefined, isBulk: op.isBulk, budgetedUnitPrice: op.budgetedUnitPrice, categoryId: op.categoryId });
    } else if (op.kind === 'updateItem') {
      await updateItem(op.itemId, op.changes);
    } else if (op.kind === 'removeItem') {
      await removeItem(op.itemId);
    } else if (op.kind === 'addHomeItem') {
      await addHomeItem(userId, op.homeId, op.name, { id: op.itemId, usualQuantity: op.usualQuantity, unit: op.unit ?? undefined, isBulk: op.isBulk, categoryId: op.categoryId });
    } else if (op.kind === 'markHomeItem') {
      await markHomeItem(op.itemId, op.status, op.targetListId); // the server puts low and finished items on the chosen (else first) list
    } else if (op.kind === 'updateHomeItem') {
      await updateHomeItem(op.itemId, op.changes);
    } else if (op.kind === 'archiveHomeItem') {
      await archiveHomeItem(op.itemId);
    } else {
      const options = { clientRef: op.clientRef, purchasedAt: op.purchasedAt };
      await purchaseListItem(op.itemId, op.actualAmount === null ? { useBudgetedAmount: true, ...options } : { actualAmount: op.actualAmount, ...options });
    }
    return 'synced';
  } catch (error) {
    if (isNetworkError(error) || (error instanceof ServiceError && error.code === 'UNAUTHORIZED')) return 'retry';
    // An earlier attempt reached the server before the connection dropped.
    if ((op.kind === 'addItem' || op.kind === 'addHomeItem') && error instanceof ServiceError && error.code === 'ALREADY_EXISTS') return 'synced';
    if ((op.kind === 'removeItem' || op.kind === 'archiveHomeItem') && error instanceof ServiceError && error.code === 'NOT_FOUND') return 'synced';
    return { drop: friendlyError(error) };
  }
}

/** Queues list and Home changes made offline and syncs them in order when the connection returns. */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useSession();
  const [online, setOnline] = useState(true);
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [problems, setProblems] = useState<SyncProblem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncedVersion, setSyncedVersion] = useState(0);
  const queue = useRef<QueuedOp[]>([]);
  const running = useRef(false);
  const previousUser = useRef<string | null>(null);

  const persist = useCallback(async (next: QueuedOp[]) => {
    queue.current = next;
    setOps(next);
    if (userId) await AsyncStorage.setItem(queueKey(userId), JSON.stringify(next)).catch(() => undefined);
  }, [userId]);

  // Load this user's queue; clear the previous user's cached data on sign-out.
  useEffect(() => {
    setCacheOwner(userId);
    if (!userId && previousUser.current) { clearCache(previousUser.current); updateWidget(null); }
    previousUser.current = userId;
    queue.current = []; setOps([]); setProblems([]);
    if (!userId) return;
    Promise.all([AsyncStorage.getItem(queueKey(userId)), AsyncStorage.getItem(problemsKey(userId))]).then(([storedQueue, storedProblems]) => {
      if (storedQueue) { queue.current = JSON.parse(storedQueue); setOps(queue.current); }
      if (storedProblems) setProblems(JSON.parse(storedProblems));
    }).catch(() => undefined);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId || running.current || queue.current.length === 0) return;
    running.current = true; setSyncing(true);
    try {
      const snapshot = queue.current;
      const result = await processQueue(snapshot, (op) => send(op, userId));
      // Keep anything queued while this run was in progress.
      await persist([...result.remaining, ...queue.current.slice(snapshot.length)]);
      if (result.problems.length) {
        setProblems((current) => {
          const next = [...current, ...result.problems].slice(-20);
          AsyncStorage.setItem(problemsKey(userId), JSON.stringify(next)).catch(() => undefined);
          return next;
        });
      }
      if (result.synced || result.problems.length) setSyncedVersion((version) => version + 1);
    } finally { running.current = false; setSyncing(false); }
  }, [userId, persist]);

  // Sync when the connection returns, when the app comes to the foreground, and periodically while changes wait.
  useEffect(() => NetInfo.addEventListener((state) => {
    const reachable = state.isConnected !== false && state.isInternetReachable !== false;
    setOnline(reachable);
    if (reachable) syncNow();
  }), [syncNow]);
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') syncNow(); }); return () => subscription.remove(); }, [syncNow]);
  useEffect(() => { if (ops.length === 0) return; const timer = setInterval(syncNow, 30000); return () => clearInterval(timer); }, [ops.length, syncNow]);

  const enqueue = useCallback(async (op: NewOp) => {
    await persist([...queue.current, { ...op, id: Crypto.randomUUID(), createdAt: new Date().toISOString() } as QueuedOp]);
    if (online) syncNow();
  }, [persist, online, syncNow]);

  const submit = useCallback(async <T,>(op: NewOp, direct: () => Promise<T>): Promise<{ queued: false; value: T } | { queued: true }> => {
    // Older changes must reach the server first, so anything new waits behind them.
    if (!online || queue.current.length > 0) { await enqueue(op); return { queued: true }; }
    try { return { queued: false, value: await direct() }; } catch (error) {
      if (!isNetworkError(error)) throw error;
      await enqueue(op);
      return { queued: true };
    }
  }, [online, enqueue]);

  const dismissProblems = useCallback(() => {
    setProblems([]);
    if (userId) AsyncStorage.removeItem(problemsKey(userId)).catch(() => undefined);
  }, [userId]);

  const value = useMemo<OfflineContext>(() => ({ online, ops, problems, syncing, syncedVersion, submit, syncNow, dismissProblems, newId: () => Crypto.randomUUID() }),
    [online, ops, problems, syncing, syncedVersion, submit, syncNow, dismissProblems]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOffline() {
  const context = useContext(Context);
  if (!context) throw new Error('OfflineProvider missing');
  return context;
}
