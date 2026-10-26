import { router } from 'expo-router';
import React from 'react';
import { Button, EmptyState, Heading, Screen } from '@/src/ui';

/** A link to a screen that does not exist (an old notification, a mistyped grocefy:// link). */
export default function NotFound() {
  return <Screen><Heading title="Page not found"/>
    <EmptyState title="This link does not lead anywhere" message="It may be from an older version of Grocefy, or the thing it pointed to has been removed."
      action={<Button label="Go to Home" icon="home-outline" onPress={() => router.replace('/')}/>}/>
  </Screen>;
}
