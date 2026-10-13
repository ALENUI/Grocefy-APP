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
  const state = useAsync(async () => (loaded ? fetchCurrentHome(userId, settings?.current_home_id) : undefined),
    [userId, loaded, settings?.current_home_id], { cacheKey: 'home' });
  return { ...state, home: state.data };
}
