import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { signUp } from '@/src/services/auth';
import { friendlyError } from '@/src/services/errors';
import { BackHeader, Button, Card, CurrencyPicker, EmptyState, Field, palette, Screen, styles } from '@/src/ui';

export default function SignUp() {
  const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState('XAF');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [checkEmail, setCheckEmail] = useState(false);
  const submit = async () => {
    if (!/^[^@\s]+@[^@\s]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!/^[A-Za-z0-9_.]{3,32}$/.test(username)) return setError('Usernames are 3–32 letters, numbers, dots, or underscores.');
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true); setError(undefined);
    try { const { signedIn } = await signUp({ email, password, username, defaultCurrency: currency }); if (!signedIn) setCheckEmail(true); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  if (checkEmail) return <Screen><BackHeader title="Check your email"/><EmptyState title="Confirm your address" message={`We sent a confirmation link to ${email.trim()}. Open it on this device to finish creating your account.`}
    action={<Button label="Back to sign in" variant="soft" onPress={() => router.replace('/sign-in')}/>}/></Screen>;
  return <Screen><BackHeader title="Create account" subtitle="Your lists, budgets, and history in one place"/>
    <Card><View style={{ gap: 14 }}>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" hint="you@example.com"/>
      <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoComplete="username" hint="e.g. amara_k" note="Others can invite you by this name."/>
      <Field label="Password" value={password} onChangeText={setPassword} secure autoCapitalize="none" autoComplete="new-password" note="At least 8 characters."/>
      <View style={styles.field}><Text style={styles.label}>Default currency</Text><CurrencyPicker value={currency} onChange={setCurrency}/><Text style={{ color: palette.muted, fontSize: 12 }}>New lists use this currency. You can change it later in Settings.</Text></View>
      {error && <Text style={{ color: palette.red }}>{error}</Text>}
      <Button label="Create account" onPress={submit} loading={busy}/>
    </View></Card>
    <Text style={{ color: palette.muted, textAlign: 'center' }}>Already have an account? <Link href="/sign-in" style={{ color: palette.green, fontWeight: '800' }}>Sign in</Link></Text>
  </Screen>;
}
