import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { ListCard } from '@/src/ListCard';
import { fetchLists } from '@/src/services/lists';
import { watchInbox, watchLists } from '@/src/services/realtime';
import { fetchInbox } from '@/src/services/sharing';
import { useSession, useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { useLive } from '@/src/useLive';
import { Button, Card, EmptyState, ErrorNotice, Heading, IconButton, Loading, palette, Screen } from '@/src/ui';

export default function Lists() {
  const { profile, session } = useSession();
  const userId = useUserId();
  const lists = useAsync(() => fetchLists(), [], { cacheKey: 'lists' });
  const inbox = useAsync(() => fetchInbox(userId, session?.user.email), [userId, session?.user.email]);
  useLive(watchLists, lists.reload, []);
  useLive((onChange) => watchInbox(userId, onChange), inbox.reload, [userId]);
  // Budgets are summed per currency only; different currencies are never added together.
  const budgets = Object.entries((lists.data ?? []).reduce<Record<string, number>>((all, list) => ({ ...all, [list.currency_code]: (all[list.currency_code] ?? 0) + (list.totals?.budgeted_total ?? 0) }), {}));

  return <Screen refreshing={lists.loading && !!lists.data} onRefresh={() => { lists.reload(); inbox.reload(); }}>
    <Heading title="My lists" subtitle={profile ? `Hi ${profile.display_name}` : 'Plan together, spend with confidence'}
      action={<View style={{ flexDirection: 'row', gap: 8 }}><IconButton icon="pricetags-outline" label="Price book" onPress={() => router.push('/prices')}/><IconButton icon="notifications-outline" label="Inbox" badge={inbox.data?.unreadCount} onPress={() => router.push('/inbox')}/><IconButton icon="add" label="Create list" onPress={() => router.push('/create-list')}/></View>}/>
    {lists.stale && <Text style={{ color: palette.muted }}>Offline · showing your lists as saved {lists.savedAt ? new Date(lists.savedAt).toLocaleString() : 'earlier'}.</Text>}
    {budgets.length > 0 && <Card style={{ backgroundColor: palette.green, borderColor: palette.green }}><Text style={{ color: '#D5F1DF', fontWeight: '700', fontSize: 13 }}>ACTIVE BUDGET</Text>
      {budgets.map(([code, amount]) => <Text key={code} style={{ color: 'white', fontWeight: '800', fontSize: budgets.length > 1 ? 22 : 29, marginTop: 5 }}>{formatCurrency(amount, code)}</Text>)}
      <Text style={{ color: '#D5F1DF', marginTop: 4 }}>{budgets.length > 1 ? 'Shown separately for each currency' : 'Across your active lists'}</Text></Card>}
    <Pressable onPress={() => router.push('/groups')}><Card style={{ backgroundColor: palette.pale, borderColor: palette.pale }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Text style={{ color: palette.green, fontWeight: '800', fontSize: 16 }}>Shopping groups</Text><Text style={{ color: palette.muted, marginTop: 4 }}>Organize lists and people by purpose</Text></View><Ionicons name="people-outline" size={25} color={palette.green}/></View></Card></Pressable>
    {lists.error ? <ErrorNotice error={lists.error} onRetry={lists.reload}/> : !lists.data ? <Loading/> : lists.data.length === 0
      ? <EmptyState title="No lists yet" message="Create your first shopping list to start planning budgets and tracking what you pay."/>
      : <View style={{ gap: 11 }}>{lists.data.map((list) => <ListCard key={list.id} list={list}/>)}</View>}
    <Button label="Create a shopping list" icon="add-circle-outline" onPress={() => router.push('/create-list')}/>
  </Screen>;
}
