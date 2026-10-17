import { fetchCurrentHome } from './services/home';
import { useSession, useUserId } from './session';
import { useAsync } from './useAsync';

/**
 * The home the user is using. `home` is undefined while loading and null when they have none yet. Resolution waits for
 * the user's settings so a saved home choice is never replaced by a default while the app starts.
 */
export function useHome() {
  const userId = useUserId();
  const { settings } = useSession();
  const loaded = settings !== null;
  // Until settings arrive (or while offline without them) the saved home stays on screen instead of being replaced.
  const state = useAsync(() => fetchCurrentHome(userId, settings?.current_home_id), [userId, settings?.current_home_id], { cacheKey: 'home', enabled: loaded });
  return { ...state, home: state.data };
}
