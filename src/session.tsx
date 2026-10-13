import { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setCurrencyRegistry } from './currency';
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

/** Owns the auth session, the signed-in user's profile and settings, and the server currency registry. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!configured) return;
    const client = getSupabaseClient();
    fetchCurrencies().then((rows) => setCurrencyRegistry(rows.map((row) => ({ code: row.code, name: row.name, symbol: row.symbol, decimalDigits: row.decimal_digits })))).catch(() => undefined);
    client.auth.getSession().then(({ data }) => setSession(data.session)).finally(() => setInitialized(true));
    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.subscription.unsubscribe();
  }, [configured]);

  const refreshAccount = useCallback(async () => {
    if (!userId) { setProfile(null); setSettings(null); return; }
    const [nextProfile, nextSettings] = await Promise.all([fetchProfile(userId), fetchSettings(userId)]);
    setProfile(nextProfile);
    setSettings(nextSettings);
  }, [userId]);

  useEffect(() => { refreshAccount().catch(() => undefined); }, [refreshAccount]);

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
