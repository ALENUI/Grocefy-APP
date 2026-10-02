import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { currencyLabel } from '@/src/currency';
import { signOut } from '@/src/services/auth';
import { friendlyError } from '@/src/services/errors';
import { setEmailNotifications, setTimezone } from '@/src/services/settings';
import { useOffline } from '@/src/offline/OfflineProvider';
import { useSession, useUserId } from '@/src/session';
import { Button, Card, CurrencyPicker, Heading, palette, Screen, styles } from '@/src/ui';

export default function Settings() {
  const userId = useUserId();
  const { profile, settings, session, defaultCurrency, changeDefaultCurrency, refreshAccount } = useSession();
  const [busy, setBusy] = useState(false);
  const { ops } = useOffline();
  const signOutNow = () => signOut().catch((caught) => Alert.alert('Could not sign out', friendlyError(caught)));
  // Unsynced changes stay on this phone and sync at the next sign-in, but warn before leaving them behind.
  const confirmSignOut = () => ops.length === 0 ? signOutNow() : Alert.alert('Changes not synced yet',
    `${ops.length} ${ops.length === 1 ? 'change has' : 'changes have'} not reached Grocefy. They will sync the next time you sign in on this phone.`,
    [{ text: 'Stay signed in', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOutNow }]);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const run = async (action: () => Promise<unknown>) => { setBusy(true); try { await action(); } catch (caught) { Alert.alert('Could not save', friendlyError(caught)); } finally { setBusy(false); } };

  return <Screen><Heading title="Settings" subtitle={profile ? `@${profile.username} · ${session?.user.email ?? ''}` : undefined}/>
    <Card><Text style={styles.label}>Default currency</Text>
      <Text style={{ color: palette.muted, fontSize: 13, marginTop: 5, marginBottom: 14, lineHeight: 19 }}>New lists and groups start with this currency. Existing lists, purchases, and reports keep their original currency; nothing is converted.</Text>
      <CurrencyPicker value={defaultCurrency} disabled={busy} onChange={(code) => run(() => changeDefaultCurrency(code))}/>
      <View style={{ marginTop: 14, backgroundColor: palette.pale, padding: 12, borderRadius: 11 }}><Text style={{ color: palette.green, fontWeight: '700' }}>Current default: {currencyLabel(defaultCurrency)}</Text></View>
    </Card>
    <Card><Text style={styles.label}>Report timezone</Text>
      <Text style={{ color: palette.muted, fontSize: 13, marginTop: 5, lineHeight: 19 }}>Monthly reports start and end at midnight in this timezone. Current: {settings?.timezone ?? 'UTC (not set)'}</Text>
      {deviceZone && settings?.timezone !== deviceZone && <View style={{ marginTop: 12 }}><Button label={`Use ${deviceZone}`} variant="soft" loading={busy} onPress={() => run(async () => { await setTimezone(userId, deviceZone); await refreshAccount(); })}/></View>}
    </Card>
    <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Text style={styles.label}>Email notifications</Text>
      <Text style={{ color: palette.muted, fontSize: 13, marginTop: 5, lineHeight: 19 }}>Invitations and monthly finance reports sent to {session?.user.email ?? 'your email'}. In-app notifications are always on.</Text></View>
      <Switch accessibilityLabel="Email notifications" value={settings?.email_notifications ?? true} disabled={busy || !settings} trackColor={{ true: palette.green }}
        onValueChange={(enabled) => run(async () => { await setEmailNotifications(userId, enabled); await refreshAccount(); })}/></View>
    </Card>
    <Button label="Manage categories" variant="soft" icon="pricetags-outline" onPress={() => router.push('/categories')}/>
    <Button label="Sign out" variant="danger" icon="log-out-outline" onPress={confirmSignOut}/>
  </Screen>;
}
