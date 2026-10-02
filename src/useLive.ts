import { useFocusEffect } from 'expo-router';
import { DependencyList, useCallback, useRef } from 'react';

/**
 * Keeps a screen live while it is focused: `subscribe` registers realtime listeners (see services/realtime) and
 * returns an unsubscribe function; every change calls `onChange` (usually the screen's reload). Unfocused screens
 * hold no subscriptions and refresh when they regain focus.
 */
export function useLive(subscribe: (onChange: () => void) => () => void, onChange: () => void, deps: DependencyList) {
  const latest = useRef(onChange);
  latest.current = onChange;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => subscribe(() => latest.current()), deps));
}
