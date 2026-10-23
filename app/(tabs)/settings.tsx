import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { installedVersionLabel, updatesSupported, useAppUpdate } from '@/src/appUpdate';
import { currencyLabel } from '@/src/currency';
import { deleteAccount, signOut } from '@/src/services/auth';
import { friendlyError } from '@/src/services/errors';
import { registerDevice, unregisterDevice } from '@/src/notifications';
import { setPushNotifications } from '@/src/services/push';
import { setEmailNotifications, setTimezone } from '@/src/services/settings';
import { useOffline } from '@/src/offline/OfflineProvider';
import { useSession, useUserId } from '@/src/session';
import { Button, Card, CurrencyPicker, Field, Heading, palette, Screen, Sheet, styles } from '@/src/ui';
import { features } from '@/src/features';

export default function Settings() {
  const userId = useUserId();
  const { profile, settings, session, defaultCurrency, changeDefaultCurrency, refreshAccount } = useSession();
  const [busy, setBusy] = useState(false);
  const update = useAppUpdate();
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const checkForUpdate = async () => {
    setChecking(true);
    const result = await update.check();
    setChecking(false);
    if (result === 'failed') Alert.alert('Could not check for updates', 'Check your connection and try again.');
    else if (result) update.prompt();
    else Alert.alert('You are up to date', `Grocefy ${installedVersionLabel} is the latest version.`);
  };
  const { ops } = useOffline();
  // Unregister this phone first (while still signed in) so the next person using it gets no pushes for this account.
  const signOutNow = () => unregisterDevice().catch(() => undefined).then(signOut).catch((caught) => Alert.alert('Could not sign out', friendlyError(caught)));
  const togglePush = (enabled: boolean) => run(async () => {
    if (enabled) {
      const result = await registerDevice({ ask: true });
      if (result === 'denied') Alert.alert('Notifications are off for Grocefy', 'Allow notifications for Grocefy in your phone settings, then try again.');
      if (result === 'unsupported') Alert.alert('Not available here', 'Push notifications need a physical iPhone or Android phone.');
      if (result === 'expo-go') Alert.alert('Not available in Expo Go', 'On Android, push notifications need a development build of Grocefy. Everything else works in Expo Go.');
      if (result === 'not-configured') Alert.alert('Push is not set up for this build', 'This build has no Expo project ID. See the README section on push notifications.');
      if (result !== 'registered') return;
    }
    await setPushNotifications(userId, enabled);
    await refreshAccount();
  });
  // Unsynced changes stay on this phone and sync at the next sign-in, but warn before leaving them behind.
  const confirmSignOut = () => ops.length === 0 ? signOutNow() : Alert.alert('Changes not synced yet',
    `${ops.length} ${ops.length === 1 ? 'change has' : 'changes have'} not reached Grocefy. They will sync the next time you sign in on this phone.`,
    [{ text: 'Stay signed in', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOutNow }]);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const run = async (action: () => Promise<unknown>) => { setBusy(true); try { await action(); } catch (caught) { Alert.alert('Could not save', friendlyError(caught)); } finally { setBusy(false); } };

  return <Screen><Heading title="Settings" subtitle={profile ? `@${profile.username} · ${session?.user.email ?? ''}` : undefined}/>
    <Card><Text style={styles.label}>Default currency</Text>
      <Text style={{ color: palette.muted, fontSize: 13, marginTop: 5, marginBottom: 14, lineHeight: 19 }}>Used when you create a home. Existing homes, lists, and purchases keep their currency; nothing is converted.</Text>
      <CurrencyPicker value={defaultCurrency} disabled={busy} onChange={(code) => run(() => changeDefaultCurrency(code))}/>
      <View style={{ marginTop: 14, backgroundColor: palette.pale, padding: 12, borderRadius: 11 }}><Text style={{ color: palette.green, fontWeight: '700' }}>Current default: {currencyLabel(defaultCurrency)}</Text></View>
    </Card>
    {features.financeReports && <Card><Text style={styles.label}>Report timezone</Text>
      <Text style={{ color: palette.muted, fontSize: 13, marginTop: 5, lineHeight: 19 }}>Monthly reports start and end at midnight in this timezone. Current: {settings?.timezone ?? 'UTC (not set)'}</Text>
      {deviceZone && settings?.timezone !== deviceZone && <View style={{ marginTop: 12 }}><Button label={`Use ${deviceZone}`} variant="soft" loading={busy} onPress={() => run(async () => { await setTimezone(userId, deviceZone); await refreshAccount(); })}/></View>}
    </Card>}
    {features.emailNotifications && <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Text style={styles.label}>Email notifications</Text>
      <Text style={{ color: palette.muted, fontSize: 13, marginTop: 5, lineHeight: 19 }}>Invitations and monthly finance reports sent to {session?.user.email ?? 'your email'}. In-app notifications are always on.</Text></View>
      <Switch accessibilityLabel="Email notifications" value={settings?.email_notifications ?? true} disabled={busy || !settings} trackColor={{ true: palette.green }}
        onValueChange={(enabled) => run(async () => { await setEmailNotifications(userId, enabled); await refreshAccount(); })}/></View>
    </Card>}
    {features.pushNotifications && <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Text style={styles.label}>Push notifications</Text>
      <Text style={{ color: palette.muted, fontSize: 13, marginTop: 5, lineHeight: 19 }}>Purchases on lists you share, invitations, and monthly reports, on every phone you are signed in on.</Text></View>
      <Switch accessibilityLabel="Push notifications" value={settings?.push_notifications ?? true} disabled={busy || !settings} trackColor={{ true: palette.green }} onValueChange={togglePush}/></View>
    </Card>}
    <Card><Text style={styles.label}>App version</Text>
      <Text style={{ color: palette.muted, fontSize: 13, marginTop: 5, lineHeight: 19 }}>Grocefy {installedVersionLabel}{update.available ? ` · version ${update.available.version} (build ${update.available.build_number}) is available` : ''}</Text>
      {updatesSupported && <View style={{ marginTop: 12 }}>{update.available
        ? <Button label="Update now" icon="cloud-download-outline" onPress={update.prompt}/>
        : <Button label="Check for updates" variant="soft" icon="refresh" loading={checking} onPress={checkForUpdate}/>}</View>}
    </Card>
    {features.customCategories && <Button label="Manage categories" variant="soft" icon="pricetags-outline" onPress={() => router.push('/categories')}/>}
    <Button label="Sign out" variant="danger" icon="log-out-outline" onPress={confirmSignOut}/>
    <Text accessibilityRole="button" onPress={() => setDeleting(true)} style={{ color: palette.red, fontWeight: '700', textAlign: 'center', paddingVertical: 8 }}>Delete account</Text>
    <DeleteAccountSheet visible={deleting} username={profile?.username} unsynced={ops.length} onClose={() => setDeleting(false)}/>
  </Screen>;
}

/** Deleting the account for good, after reading what happens and typing DELETE. */
function DeleteAccountSheet({ visible, username, unsynced, onClose }: { visible: boolean; username?: string; unsynced: number; onClose: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (visible) { setConfirmation(''); setError(undefined); } }, [visible]);
  const confirmed = confirmation.trim().toUpperCase() === 'DELETE';
  const remove = async () => {
    setBusy(true); setError(undefined);
    try {
      await unregisterDevice().catch(() => undefined);
      await deleteAccount(); // signs out, which returns to the sign-in screen
    } catch (caught) { setError(friendlyError(caught)); setBusy(false); }
  };
  const point = (text: string) => <Text style={{ color: palette.ink, lineHeight: 20 }}>•  {text}</Text>;
  return <Sheet visible={visible} title="Delete your account?" subtitle={username ? `@${username} · this cannot be undone` : 'This cannot be undone'} onClose={onClose}>
    <View style={{ gap: 8 }}>
      {point('Homes and lists you share pass to the next person in them, so they keep everything.')}
      {point('Homes and lists only you use are deleted, with their items, purchases, and reports.')}
      {point('Purchases you made in shared homes stay for the others, without your name.')}
      {point('Your profile, categories, and settings are deleted.')}
    </View>
    {unsynced > 0 && <Text style={{ color: palette.red, fontWeight: '700' }}>{unsynced} {unsynced === 1 ? 'change on this phone has' : 'changes on this phone have'} not synced and will be lost.</Text>}
    <Field label='Type DELETE to confirm' value={confirmation} onChangeText={setConfirmation} autoCapitalize="none"/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Delete my account" variant="danger" icon="trash-outline" disabled={!confirmed} loading={busy} onPress={remove}/>
    <Button label="Keep my account" variant="soft" onPress={onClose} disabled={busy}/>
  </Sheet>;
}
