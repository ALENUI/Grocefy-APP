import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { completeEmailLink } from '@/src/services/auth';
import { friendlyError } from '@/src/services/errors';
import { Button, EmptyState, Loading, Screen } from '@/src/ui';

/** Target of the signup confirmation email (grocefy://auth-callback?code=…). */
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!code) { setError('This link is incomplete. Request a new one.'); return; }
    completeEmailLink(code).then(() => router.replace('/')).catch((caught) => setError(friendlyError(caught)));
  }, [code]);
  return <Screen>{error ? <EmptyState title="Could not verify the link" message={error} action={<Button label="Back to sign in" variant="soft" onPress={() => router.replace('/sign-in')}/>}/> : <Loading/>}</Screen>;
}
