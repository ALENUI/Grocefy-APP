import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { signIn } from '@/src/services/auth';
import { friendlyError } from '@/src/services/errors';
import { Button, Card, Field, palette, Screen, styles } from '@/src/ui';

export default function SignIn() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const submit = async () => {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true); setError(undefined);
    try { await signIn(email, password); } // the auth gate navigates once the session changes
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Screen><View style={{ marginTop: 40, marginBottom: 10 }}><Text style={[styles.title, { fontSize: 34 }]}>Grocefy</Text><Text style={styles.subtitle}>Plan together, spend with confidence.</Text></View>
    <Card><View style={{ gap: 14 }}>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" hint="you@example.com"/>
      <Field label="Password" value={password} onChangeText={setPassword} secure autoCapitalize="none" autoComplete="password"/>
      {error && <Text style={{ color: palette.red }}>{error}</Text>}
      <Button label="Sign in" onPress={submit} loading={busy}/>
      <Link href="/forgot-password" style={{ color: palette.green, fontWeight: '700', textAlign: 'center' }}>Forgot your password?</Link>
    </View></Card>
    <Text style={{ color: palette.muted, textAlign: 'center' }}>New to Grocefy? <Link href="/sign-up" style={{ color: palette.green, fontWeight: '800' }}>Create an account</Link></Text>
  </Screen>;
}
