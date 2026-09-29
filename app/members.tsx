import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { friendlyError } from '@/src/services/errors';
import { fetchGroupRole } from '@/src/services/groups';
import { fetchListRole } from '@/src/services/lists';
import { cancelInvitation, changeMemberRole, fetchMembers, fetchPendingInvitations, inviteMember, Member, MemberRole, removeMember, ResourceType } from '@/src/services/sharing';
import { useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { BackHeader, Button, Card, Chip, ErrorNotice, Field, Loading, palette, Screen, Sheet } from '@/src/ui';

const roles: { role: MemberRole; description: string }[] = [
  { role: 'viewer', description: 'Sees items, prices, and totals' },
  { role: 'editor', description: 'Adds and edits items and budgets' },
  { role: 'partner', description: 'Also purchases and receives finance reports' }
];
const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

/** Members and invitations for a group or a list: /members?type=group|list&id=…&name=… */
export default function Members() {
  const { type, id, name } = useLocalSearchParams<{ type: ResourceType; id: string; name?: string }>();
  const userId = useUserId();
  const state = useAsync(async () => {
    const [members, invitations, role] = await Promise.all([fetchMembers(type, id), fetchPendingInvitations(), type === 'list' ? fetchListRole(id) : fetchGroupRole(id)]);
    // RLS returns only invitations the caller sent, received, or owns the resource of.
    return { members, isOwner: role === 'owner', invitations: invitations.filter((invitation) => invitation.resource_type === type && invitation.resource_id === id) };
  }, [type, id, userId]);
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState<Member | null>(null);

  const leave = (member: Member) => Alert.alert('Leave?', `You will lose access to ${name ?? 'this'} ${type}. Your own purchase history is kept.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: () => removeMember(type, member.id).then(() => router.replace('/')).catch((caught) => Alert.alert('Could not leave', friendlyError(caught))) }
  ]);

  return <Screen refreshing={state.loading && !!state.data} onRefresh={state.reload}>
    <BackHeader title="Members" subtitle={`${name ?? ''} · ${type === 'group' ? 'Group members can access every list in the group' : 'List members'}`}/>
    {state.error ? <ErrorNotice error={state.error} onRetry={state.reload}/> : !state.data ? <Loading/> : <>
      {state.data.members.length === 0 && <Text style={{ color: palette.muted }}>No members yet. {state.data.isOwner ? 'Invite people by username or email.' : ''}</Text>}
      {state.data.members.map((member) => <Card key={member.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{member.profile?.display_name ?? 'Member'}{member.userId === userId ? ' (you)' : ''}</Text>
          <Text style={{ color: palette.muted, marginTop: 3 }}>@{member.profile?.username ?? '—'} · {roleLabel(member.role)}</Text></View>
        {state.data?.isOwner && <Button label="Manage" variant="soft" onPress={() => setManaging(member)}/>}
        {!state.data?.isOwner && member.userId === userId && <Button label="Leave" variant="danger" onPress={() => leave(member)}/>}
      </View></Card>)}
      {state.data.invitations.length > 0 && <View style={{ gap: 10 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Pending invitations</Text>
        {state.data.invitations.map((invitation) => <Card key={invitation.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontWeight: '700' }}>{invitation.invitee_email ?? 'Invited user'}</Text>
            <Text style={{ color: palette.muted, marginTop: 3 }}>{roleLabel(invitation.role)} · expires {new Date(invitation.expires_at).toLocaleDateString()}</Text></View>
          <Button label="Cancel" variant="danger" onPress={() => cancelInvitation(invitation.id).then(state.reload).catch((caught) => Alert.alert('Could not cancel', friendlyError(caught)))}/>
        </View></Card>)}</View>}
      {state.data.isOwner && <Button label="Invite someone" icon="person-add-outline" onPress={() => setInviting(true)}/>}
    </>}
    <InviteSheet visible={inviting} type={type} id={id} onClose={() => setInviting(false)} onInvited={state.reload}/>
    <ManageSheet member={managing} type={type} onClose={() => setManaging(null)} onChanged={state.reload}/>
  </Screen>;
}

function InviteSheet({ visible, type, id, onClose, onInvited }: { visible: boolean; type: ResourceType; id: string; onClose: () => void; onInvited: () => void }) {
  const [invitee, setInvitee] = useState(''); const [role, setRole] = useState<MemberRole>('editor');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const invite = async () => {
    if (!invitee.trim()) return setError('Enter a username or email address.');
    setBusy(true); setError(undefined);
    try { await inviteMember(type, id, role, invitee.trim()); setInvitee(''); onInvited(); onClose(); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Sheet visible={visible} title="Invite someone" subtitle="They get access after accepting the invitation." onClose={onClose}>
    <Field label="Username or email" value={invitee} onChangeText={setInvitee} autoCapitalize="none" keyboardType="email-address" hint="e.g. amara_k or amara@example.com"/>
    <View style={{ gap: 8 }}>{roles.map((entry) => <Chip key={entry.role} label={`${roleLabel(entry.role)} — ${entry.description}`} selected={role === entry.role} onPress={() => setRole(entry.role)}/>)}</View>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Send invitation" onPress={invite} loading={busy}/>
  </Sheet>;
}

function ManageSheet({ member, type, onClose, onChanged }: { member: Member | null; type: ResourceType; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(undefined); try { await action(); onChanged(); onClose(); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); } };
  return <Sheet visible={!!member} title={member?.profile?.display_name ?? 'Member'} subtitle={`Current role: ${member ? roleLabel(member.role) : ''}`} onClose={onClose}>
    <View style={{ gap: 8 }}>{roles.map((entry) => <Chip key={entry.role} label={`${roleLabel(entry.role)} — ${entry.description}`} selected={member?.role === entry.role}
      onPress={() => member && entry.role !== member.role && run(() => changeMemberRole(type, member.id, entry.role))}/>)}</View>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Remove member" variant="danger" icon="person-remove-outline" loading={busy} onPress={() => member && run(() => removeMember(type, member.id))}/>
  </Sheet>;
}
