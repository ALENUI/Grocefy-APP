import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { completeEmailLink, updatePassword } from '@/src/services/auth';
import { friendlyError } from '@/src/services/errors';
import { Button, Card, EmptyState, Field, Heading, Loading, palette, Screen } from '@/src/ui';

/** Target of the password reset email (grocefy://reset-password?code=…). */
export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [ready, setReady] = useState(false); const [linkError, setLinkError] = useState<string>();
  const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => {
    if (!code) { setLinkError('This link is incomplete. Request a new one.'); return; }
    completeEmailLink(code).then(() => setReady(true)).catch((caught) => setLinkError(friendlyError(caught)));
  }, [code]);
  const submit = async () => {
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true); setError(undefined);
    try { await updatePassword(password); router.replace('/'); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  if (linkError) return <Screen><EmptyState title="Could not verify the link" message={linkError} action={<Button label="Request a new link" variant="soft" onPress={() => router.replace('/forgot-password')}/>}/></Screen>;
  if (!ready) return <Screen><Loading/></Screen>;
  return <Screen><Heading title="Choose a new password"/>
    <Card><View style={{ gap: 14 }}>
      <Field label="New password" value={password} onChangeText={setPassword} secure autoCapitalize="none" autoComplete="new-password" note="At least 8 characters."/>
      {error && <Text style={{ color: palette.red }}>{error}</Text>}
      <Button label="Save password" onPress={submit} loading={busy}/>
    </View></Card>
  </Screen>;
}
