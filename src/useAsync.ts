import { useFocusEffect } from 'expo-router';
import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { readCache, writeCache } from './offline/cache';
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
 * With `cacheKey`, the last successful result is saved on the device and shown while loading and whenever the
 * server cannot be reached.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList, options: { cacheKey?: string } = {}): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<{ stale: boolean; savedAt?: string }>({ stale: false });
  const latest = useRef(0);
  const { cacheKey } = options;

  // Show the saved copy immediately while the first request is in flight.
  useEffect(() => {
    if (!cacheKey) return;
    let active = true;
    readCache<T>(cacheKey).then((entry) => { if (active && entry) setData((current) => current ?? entry.value); });
    return () => { active = false; };
  }, [cacheKey]);

  // The caller's deps decide when `load` is stale (like useEffect), so they are forwarded as-is.
  const reload = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    try {
      const next = await load();
      if (request !== latest.current) return;
      setData(next); setError(undefined); setSaved({ stale: false });
      if (cacheKey) writeCache(cacheKey, next);
    } catch (caught) {
      if (request !== latest.current) return;
      const entry = cacheKey && isNetworkError(caught) ? await readCache<T>(cacheKey) : null;
      if (entry) { setData(entry.value); setError(undefined); setSaved({ stale: true, savedAt: entry.savedAt }); }
      else setError(caught);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, [...deps, cacheKey]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { data, error, loading, reload, ...saved };
}
