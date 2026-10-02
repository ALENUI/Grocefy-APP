import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { friendlyError } from '@/src/services/errors';
import { watchInbox } from '@/src/services/realtime';
import { fetchInbox, markAllNotificationsRead, markNotificationRead, respondToInvitation } from '@/src/services/sharing';
import { useSession, useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { useLive } from '@/src/useLive';
import { BackHeader, Button, Card, EmptyState, ErrorNotice, Loading, palette, Screen } from '@/src/ui';

/** Invitations received by the user and their notifications. */
export default function Inbox() {
  const { session } = useSession();
  const userId = useUserId();
  const state = useAsync(() => fetchInbox(userId, session?.user.email), [userId, session?.user.email]);
  useLive((onChange) => watchInbox(userId, onChange), state.reload, [userId]);
  const [answering, setAnswering] = useState<string>();

  const respond = async (id: string, accept: boolean) => {
    setAnswering(id);
    try { await respondToInvitation(id, accept); await state.reload(); } catch (caught) { Alert.alert('Could not respond', friendlyError(caught)); } finally { setAnswering(undefined); }
  };
  const open = (id: string, read: boolean) => { if (!read) markNotificationRead(id).then(state.reload).catch(() => undefined); };

  return <Screen refreshing={state.loading && !!state.data} onRefresh={state.reload}>
    <BackHeader title="Inbox" subtitle="Invitations and updates"
      action={state.data?.notifications.some((notification) => !notification.read_at) ? <Button label="Mark all read" variant="soft" onPress={() => markAllNotificationsRead(userId).then(state.reload).catch(() => undefined)}/> : undefined}/>
    {state.error ? <ErrorNotice error={state.error} onRetry={state.reload}/> : !state.data ? <Loading/> : <>
      {state.data.invitations.map((invitation) => <Card key={invitation.id}>
        <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Join {invitation.resource_name ?? `a ${invitation.resource_type}`}</Text>
        <Text style={{ color: palette.muted, marginTop: 4 }}>{invitation.resource_type === 'group' ? 'Group' : 'List'} · Role: {invitation.role} · expires {new Date(invitation.expires_at).toLocaleDateString()}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <View style={{ flex: 1 }}><Button label="Accept" loading={answering === invitation.id} onPress={() => respond(invitation.id, true)}/></View>
          <View style={{ flex: 1 }}><Button label="Decline" variant="soft" disabled={answering === invitation.id} onPress={() => respond(invitation.id, false)}/></View>
        </View></Card>)}
      {state.data.invitations.length === 0 && state.data.notifications.length === 0 && <EmptyState title="All caught up" message="Invitations and updates about your lists will appear here."/>}
      {state.data.notifications.map((notification) => <Card key={notification.id} style={notification.read_at ? undefined : { borderColor: palette.green }}>
        <Text onPress={() => open(notification.id, !!notification.read_at)} style={{ color: palette.ink, fontWeight: notification.read_at ? '600' : '800' }}>{notification.title}</Text>
        <Text style={{ color: palette.muted, marginTop: 4 }}>{notification.message} · {new Date(notification.created_at).toLocaleDateString()}</Text></Card>)}
    </>}
  </Screen>;
}
