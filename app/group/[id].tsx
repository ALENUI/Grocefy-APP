import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { ListCard } from '@/src/ListCard';
import { fetchGroup } from '@/src/services/groups';
import { fetchLists } from '@/src/services/lists';
import { watchGroup } from '@/src/services/realtime';
import { useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { useLive } from '@/src/useLive';
import { BackHeader, Button, Card, EmptyState, ErrorNotice, IconButton, Loading, palette, Screen } from '@/src/ui';

/** A group's lists and totals. Totals are shown per currency because lists in a group may use different currencies. */
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const state = useAsync(async () => {
    const [group, lists] = await Promise.all([fetchGroup(userId, id), fetchLists({ groupId: id })]);
    return { group, lists };
  }, [userId, id]);
  useLive((onChange) => watchGroup(id, onChange), state.reload, [id]);

  if (!state.data) return <Screen><BackHeader title="Group"/>{state.error ? <ErrorNotice error={state.error} onRetry={state.reload}/> : <Loading/>}</Screen>;
  const { group, lists } = state.data;
  const canAddLists = group.role === 'owner' || group.role === 'partner';

  return <Screen refreshing={state.loading} onRefresh={state.reload}>
    <BackHeader title={group.name} subtitle={`${group.memberCount} members · You: ${group.role ?? 'member'}`}
      action={<IconButton icon="people-outline" label="Members" onPress={() => router.push({ pathname: '/members', params: { type: 'group', id: group.id, name: group.name } })}/>}/>
    {!!state.error && <ErrorNotice error={state.error} onRetry={state.reload}/>}
    {group.totals.length > 0 && <Card style={{ backgroundColor: palette.pale, borderColor: palette.pale, gap: 10 }}>
      <Text style={{ color: palette.green, fontWeight: '800', fontSize: 12 }}>GROUP TOTALS</Text>
      {group.totals.map((total) => <View key={total.currency_code} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View><Text style={{ color: palette.muted, fontSize: 12 }}>Budget · {total.currency_code}</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 18 }}>{formatCurrency(total.budgeted_total ?? 0, total.currency_code ?? '')}</Text></View>
        <View style={{ alignItems: 'flex-end' }}><Text style={{ color: palette.muted, fontSize: 12 }}>Paid</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 18 }}>{formatCurrency(total.purchased_total ?? 0, total.currency_code ?? '')}</Text></View>
      </View>)}
    </Card>}
    {lists.length === 0 ? <EmptyState title="No lists in this group" message={canAddLists ? 'Create a list here, for example Food or Cleaning.' : 'Lists added to this group will appear here.'}/>
      : <View style={{ gap: 11 }}>{lists.map((list) => <ListCard key={list.id} list={list} showGroup={false}/>)}</View>}
    {canAddLists && <Button label="New list in this group" icon="add-circle-outline" onPress={() => router.push({ pathname: '/create-list', params: { groupId: group.id } })}/>}
  </Screen>;
}
