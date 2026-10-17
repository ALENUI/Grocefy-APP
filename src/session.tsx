import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setCurrencyRegistry } from './currency';
import { peekCache, preloadCache, writeCache } from './offline/cache';
import { fetchCurrencies, fetchProfile, fetchSettings, Profile, setDefaultCurrency, UserSettings } from './services/settings';
import { getSupabaseClient, isSupabaseConfigured } from './services/supabase';

type SessionContext = {
  status: 'unconfigured' | 'loading' | 'signedOut' | 'signedIn';
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  settings: UserSettings | null;
  /** Default currency for new lists and groups. */
  defaultCurrency: string;
  refreshAccount: () => Promise<void>;
  changeDefaultCurrency: (code: string) => Promise<void>;
};

const Context = createContext<SessionContext | undefined>(undefined);
const currenciesKey = 'grocefy:currencies';
type CurrencyRows = Awaited<ReturnType<typeof fetchCurrencies>>;
const applyCurrencies = (rows: CurrencyRows) => setCurrencyRegistry(rows.map((row) => ({ code: row.code, name: row.name, symbol: row.symbol, decimalDigits: row.decimal_digits })));

/**
 * The signed-in session, also when the app opens offline with an expired access token: the refresh then fails only
 * because the network is down, so the stored session is used (screens show saved data) until the client refreshes it
 * once the connection returns. A refresh the server refuses still signs the user out.
 */
async function loadSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (data.session || !error || !isAuthRetryableFetchError(error)) return data.session;
  try {
    const raw = await AsyncStorage.getItem((client.auth as unknown as { storageKey: string }).storageKey);
    const stored = raw ? JSON.parse(raw) as Session : null;
    return stored?.user?.id && stored.refresh_token ? stored : null;
  } catch { return null; }
}

/** Owns the auth session, the signed-in user's profile and settings, and the server currency registry. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const userId = session?.user.id ?? null;
  const adoptedUser = useRef<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    const client = getSupabaseClient();
    // Saved currencies first (amounts format correctly offline), then the server's.
    AsyncStorage.getItem(currenciesKey).then((raw) => { if (raw) applyCurrencies(JSON.parse(raw)); }).catch(() => undefined);
    fetchCurrencies().then((rows) => { applyCurrencies(rows); AsyncStorage.setItem(currenciesKey, JSON.stringify(rows)).catch(() => undefined); }).catch(() => undefined);
    // A newly signed-in user's saved data is loaded into memory before screens render, so they open instantly.
    const adopt = async (next: Session | null) => {
      const nextUser = next?.user.id ?? null;
      if (nextUser && nextUser !== adoptedUser.current) {
        await preloadCache(nextUser);
        const account = peekCache<{ profile: Profile; settings: UserSettings }>('account');
        if (account) { setProfile(account.value.profile); setSettings(account.value.settings); }
      }
      adoptedUser.current = nextUser;
      setSession(next);
    };
    loadSession().then(adopt).catch(() => setSession(null)).finally(() => setInitialized(true));
    // INITIAL_SESSION repeats what loadSession resolves (and would report no session in the offline case).
    const { data: subscription } = client.auth.onAuthStateChange((event, next) => { if (event !== 'INITIAL_SESSION') adopt(next); });
    return () => subscription.subscription.unsubscribe();
  }, [configured]);

  const refreshAccount = useCallback(async () => {
    if (!userId) { setProfile(null); setSettings(null); return; }
    const [nextProfile, nextSettings] = await Promise.all([fetchProfile(userId), fetchSettings(userId)]);
    setProfile(nextProfile);
    setSettings(nextSettings);
  }, [userId]);

  // Offline, the saved profile and settings stay in place.
  useEffect(() => { refreshAccount().catch(() => undefined); }, [refreshAccount]);
  useEffect(() => { if (userId && profile && settings) writeCache('account', { profile, settings }); }, [userId, profile, settings]);

  const value = useMemo<SessionContext>(() => ({
    status: !configured ? 'unconfigured' : !initialized ? 'loading' : session ? 'signedIn' : 'signedOut',
    session, userId, profile, settings,
    defaultCurrency: settings?.default_currency ?? 'XAF',
    refreshAccount,
    changeDefaultCurrency: async (code) => { if (userId) setSettings(await setDefaultCurrency(userId, code)); }
  }), [configured, initialized, session, userId, profile, settings, refreshAccount]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error('SessionProvider missing');
  return context;
}

/** For screens behind the auth gate, where a signed-in user is guaranteed. */
export function useUserId(): string {
  const { userId } = useSession();
  if (!userId) throw new Error('Signed-in user required');
  return userId;
}
