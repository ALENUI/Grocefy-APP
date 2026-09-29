import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { friendlyError } from '@/src/services/errors';
import { fetchNotifications, fetchPendingInvitations, markNotificationRead, respondToInvitation } from '@/src/services/sharing';
import { useSession } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { BackHeader, Button, Card, EmptyState, ErrorNotice, Loading, palette, Screen } from '@/src/ui';

/** Invitations received by the user and their notifications. */
export default function Inbox() {
  const { session } = useSession();
  const email = session?.user.email?.toLowerCase();
  const state = useAsync(async () => {
    const [invitations, notifications] = await Promise.all([fetchPendingInvitations(), fetchNotifications()]);
    return {
      invitations: invitations.filter((invitation) => invitation.invitee_user_id === session?.user.id || (!invitation.invitee_user_id && invitation.invitee_email === email)),
      notifications
    };
  }, [session?.user.id, email]);
  const [answering, setAnswering] = useState<string>();

  const respond = async (id: string, accept: boolean) => {
    setAnswering(id);
    try { await respondToInvitation(id, accept); await state.reload(); } catch (caught) { Alert.alert('Could not respond', friendlyError(caught)); } finally { setAnswering(undefined); }
  };
  const open = (id: string, read: boolean) => { if (!read) markNotificationRead(id).then(state.reload).catch(() => undefined); };

  return <Screen refreshing={state.loading && !!state.data} onRefresh={state.reload}>
    <BackHeader title="Inbox" subtitle="Invitations and updates"/>
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
