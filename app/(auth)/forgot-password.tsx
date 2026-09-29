import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { requestPasswordReset } from '@/src/services/auth';
import { friendlyError } from '@/src/services/errors';
import { BackHeader, Button, Card, Field, palette, Screen } from '@/src/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string>(); const [error, setError] = useState<string>();
  const submit = async () => {
    if (!email.trim()) return setError('Enter your email address.');
    setBusy(true); setError(undefined);
    // The same confirmation is shown whether or not the address has an account.
    try { await requestPasswordReset(email); setMessage('If an account exists for that address, a reset link is on its way. Open it on this device.'); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Screen><BackHeader title="Reset password" subtitle="We will email you a link to choose a new password"/>
    <Card><View style={{ gap: 14 }}>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" hint="you@example.com"/>
      {error && <Text style={{ color: palette.red }}>{error}</Text>}
      {message && <Text style={{ color: palette.green, fontWeight: '700' }}>{message}</Text>}
      <Button label="Send reset link" onPress={submit} loading={busy}/>
    </View></Card>
  </Screen>;
}
