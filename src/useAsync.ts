import { useFocusEffect } from 'expo-router';
import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { peekCache, readCache, writeCache } from './offline/cache';
import { useOffline } from './offline/OfflineProvider';
import { isNetworkError } from './services/errors';

export type AsyncState<T> = {
  data: T | undefined; error: unknown; loading: boolean; reload: () => Promise<void>;
  /** True when `data` is the saved copy because the server could not be reached. */
  stale: boolean;
  /** When the saved copy was taken (only set while stale). */
  savedAt?: string;
};

/**
 * Loads data when the screen gains focus (and when deps change), so screens show fresh server state after navigation.
 * With `cacheKey`, the last successful result is saved on the device: it is shown on the first frame (then refreshed
 * in the background), and whenever the server cannot be reached. Offline, the saved copy is used without waiting on
 * the network, and the data refreshes as soon as the connection returns. With `enabled: false` nothing loads (the
 * saved copy stays on screen), e.g. while the inputs a request needs are not known yet.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList, options: { cacheKey?: string; enabled?: boolean } = {}): AsyncState<T> {
  const { cacheKey, enabled = true } = options;
  const [data, setData] = useState<T | undefined>(() => (cacheKey ? peekCache<T>(cacheKey)?.value : undefined));
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<{ stale: boolean; savedAt?: string }>({ stale: false });
  const latest = useRef(0);
  const { online } = useOffline();

  // A different key (another list, another home) shows its own saved copy straight away.
  useEffect(() => {
    if (!cacheKey) return;
    let active = true;
    readCache<T>(cacheKey).then((entry) => { if (active && entry) setData(entry.value); });
    return () => { active = false; };
  }, [cacheKey]);

  const showSaved = useCallback(async (request: number) => {
    const entry = cacheKey ? await readCache<T>(cacheKey) : null;
    if (request !== latest.current || !entry) return false;
    setData(entry.value); setError(undefined); setSaved({ stale: true, savedAt: entry.savedAt });
    return true;
  }, [cacheKey]);

  // The caller's deps decide when `load` is stale (like useEffect), so they are forwarded as-is.
  const reload = useCallback(async () => {
    const request = ++latest.current;
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    try {
      if (!online && await showSaved(request)) return;
      const next = await load();
      if (request !== latest.current) return;
      setData(next); setError(undefined); setSaved({ stale: false });
      if (cacheKey) writeCache(cacheKey, next);
    } catch (caught) {
      if (request !== latest.current) return;
      if (!(isNetworkError(caught) && await showSaved(request))) setError(caught);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, [...deps, cacheKey, enabled, online, showSaved]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { data, error, loading, reload, ...saved };
}
