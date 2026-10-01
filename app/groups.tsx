import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { friendlyError } from '@/src/services/errors';
import { archiveGroup, createGroup, fetchGroups, GroupSummary } from '@/src/services/groups';
import { useSession, useUserId } from '@/src/session';
import { watchLists } from '@/src/services/realtime';
import { useAsync } from '@/src/useAsync';
import { useLive } from '@/src/useLive';
import { BackHeader, Button, Card, CurrencyPicker, EmptyState, ErrorNotice, Field, IconButton, Loading, palette, Screen, Sheet, styles } from '@/src/ui';

export default function Groups() {
  const userId = useUserId();
  const groups = useAsync(() => fetchGroups(userId), [userId]);
  useLive(watchLists, groups.reload, []);
  const [creating, setCreating] = useState(false);
  return <Screen refreshing={groups.loading && !!groups.data} onRefresh={groups.reload}>
    <BackHeader title="Shopping groups" subtitle="Organize lists and collaborators by purpose"/>
    {groups.error ? <ErrorNotice error={groups.error} onRetry={groups.reload}/> : !groups.data ? <Loading/> : groups.data.length === 0
      ? <EmptyState title="No groups yet" message="Group related lists, like House Shopping or Office Shopping, and share them with the people who shop with you."/>
      : groups.data.map((group) => <GroupCard key={group.id} group={group} onChanged={groups.reload}/>)}
    <Button label="Create shopping group" icon="add-circle-outline" onPress={() => setCreating(true)}/>
    <CreateGroupSheet visible={creating} onClose={() => setCreating(false)} onCreated={groups.reload}/>
  </Screen>;
}

function GroupCard({ group, onChanged }: { group: GroupSummary; onChanged: () => void }) {
  const canAddLists = group.role === 'owner' || group.role === 'partner';
  const archive = () => Alert.alert('Archive group?', 'Its lists stay available and purchase history is kept.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive', style: 'destructive', onPress: () => archiveGroup(group.id).then(onChanged).catch((caught) => Alert.alert('Could not archive', friendlyError(caught))) }
  ]);
  return <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Pressable accessibilityRole="button" onPress={() => router.push(`/group/${group.id}`)} style={{ flex: 1 }}>
      <Text style={{ color: palette.ink, fontSize: 18, fontWeight: '800' }}>{group.name}</Text>
      <Text style={{ color: palette.muted, marginTop: 5 }}>{group.listCount} lists · {group.memberCount} members · You: {group.role}</Text></Pressable>
    <IconButton icon="people-outline" label="Members" onPress={() => router.push({ pathname: '/members', params: { type: 'group', id: group.id, name: group.name } })}/></View>
    {group.totals.length > 0 && <View style={{ marginTop: 12, gap: 4 }}>{group.totals.map((total) => <Text key={total.currency_code} style={{ color: palette.ink }}>
      Budget <Text style={{ fontWeight: '800' }}>{formatCurrency(total.budgeted_total ?? 0, total.currency_code ?? '')}</Text> · Paid <Text style={{ fontWeight: '800' }}>{formatCurrency(total.purchased_total ?? 0, total.currency_code ?? '')}</Text></Text>)}</View>}
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
      {canAddLists && <View style={{ flex: 1 }}><Button label="New list" variant="soft" icon="add" onPress={() => router.push({ pathname: '/create-list', params: { groupId: group.id } })}/></View>}
      {group.role === 'owner' && <View style={{ flex: 1 }}><Button label="Archive" variant="danger" icon="archive-outline" onPress={archive}/></View>}
    </View>
  </Card>;
}

function CreateGroupSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const userId = useUserId();
  const { defaultCurrency } = useSession();
  const [name, setName] = useState(''); const [currency, setCurrency] = useState(defaultCurrency);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const create = async () => {
    if (!name.trim()) return setError('Name your group before creating it.');
    setBusy(true); setError(undefined);
    try { await createGroup(userId, name.trim(), currency); setName(''); onCreated(); onClose(); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Sheet visible={visible} title="Create group" onClose={onClose}>
    <Field label="Group name" value={name} onChangeText={setName} hint="e.g. House Shopping"/>
    <View style={styles.field}><Text style={styles.label}>Group currency</Text><CurrencyPicker value={currency} onChange={setCurrency}/><Text style={{ color: palette.muted, fontSize: 12 }}>Lists in the group can still use their own currency; totals are shown per currency.</Text></View>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Create group" onPress={create} loading={busy}/>
  </Sheet>;
}
