import { useFocusEffect } from 'expo-router';
import { DependencyList, useCallback, useEffect, useRef } from 'react';

/**
 * Keeps a screen live while it is focused: `subscribe` registers realtime listeners (see services/realtime) and
 * returns an unsubscribe function; every change calls `onChange` (usually the screen's reload). Unfocused screens
 * hold no subscriptions and refresh when they regain focus.
 */
export function useLive(subscribe: (onChange: () => void) => () => void, onChange: () => void, deps: DependencyList) {
  // Always call the latest onChange without resubscribing when it changes (the ref is updated after each render).
  const latest = useRef(onChange);
  useEffect(() => { latest.current = onChange; });
  // The caller's deps decide when to resubscribe, so they are forwarded as-is.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  useFocusEffect(useCallback(() => subscribe(() => latest.current()), deps));
}
