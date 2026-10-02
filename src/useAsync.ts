import { useFocusEffect } from 'expo-router';
import { DependencyList, useCallback, useRef, useState } from 'react';

export type AsyncState<T> = { data: T | undefined; error: unknown; loading: boolean; reload: () => Promise<void> };

/** Loads data when the screen gains focus (and when deps change), so screens show fresh server state after navigation. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  // The caller's deps decide when `load` is stale (like useEffect), so they are forwarded as-is.
  const reload = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    try {
      const next = await load();
      if (request === latest.current) { setData(next); setError(undefined); }
    } catch (caught) {
      if (request === latest.current) setError(caught);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { data, error, loading, reload };
}
