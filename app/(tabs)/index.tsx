import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { fetchLists } from '@/src/services/lists';
import { fetchPendingInvitations } from '@/src/services/sharing';
import { useSession } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { Button, Card, EmptyState, ErrorNotice, Heading, IconButton, Loading, palette, Screen } from '@/src/ui';

export default function Lists() {
  const { profile, session } = useSession();
  const lists = useAsync(fetchLists, []);
  const invitations = useAsync(fetchPendingInvitations, []);
  const received = (invitations.data ?? []).filter((invitation) => invitation.invitee_user_id === session?.user.id
    || (!invitation.invitee_user_id && invitation.invitee_email === session?.user.email?.toLowerCase()));
  // Budgets are summed per currency only; different currencies are never added together.
  const budgets = Object.entries((lists.data ?? []).reduce<Record<string, number>>((all, list) => ({ ...all, [list.currency_code]: (all[list.currency_code] ?? 0) + (list.totals?.budgeted_total ?? 0) }), {}));

  return <Screen refreshing={lists.loading && !!lists.data} onRefresh={() => { lists.reload(); invitations.reload(); }}>
    <Heading title="My lists" subtitle={profile ? `Hi ${profile.display_name}` : 'Plan together, spend with confidence'}
      action={<View style={{ flexDirection: 'row', gap: 8 }}><IconButton icon="notifications-outline" label="Inbox" badge={received.length} onPress={() => router.push('/inbox')}/><IconButton icon="add" label="Create list" onPress={() => router.push('/create-list')}/></View>}/>
    {budgets.length > 0 && <Card style={{ backgroundColor: palette.green, borderColor: palette.green }}><Text style={{ color: '#D5F1DF', fontWeight: '700', fontSize: 13 }}>ACTIVE BUDGET</Text>
      {budgets.map(([code, amount]) => <Text key={code} style={{ color: 'white', fontWeight: '800', fontSize: budgets.length > 1 ? 22 : 29, marginTop: 5 }}>{formatCurrency(amount, code)}</Text>)}
      <Text style={{ color: '#D5F1DF', marginTop: 4 }}>{budgets.length > 1 ? 'Shown separately for each currency' : 'Across your active lists'}</Text></Card>}
    <Pressable onPress={() => router.push('/groups')}><Card style={{ backgroundColor: palette.pale, borderColor: palette.pale }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Text style={{ color: palette.green, fontWeight: '800', fontSize: 16 }}>Shopping groups</Text><Text style={{ color: palette.muted, marginTop: 4 }}>Organize lists and people by purpose</Text></View><Ionicons name="people-outline" size={25} color={palette.green}/></View></Card></Pressable>
    {lists.error ? <ErrorNotice error={lists.error} onRetry={lists.reload}/> : !lists.data ? <Loading/> : lists.data.length === 0
      ? <EmptyState title="No lists yet" message="Create your first shopping list to start planning budgets and tracking what you pay."/>
      : <View style={{ gap: 11 }}>{lists.data.map((list) => <Pressable key={list.id} onPress={() => router.push(`/list/${list.id}`)}><Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ backgroundColor: palette.pale, padding: 7, borderRadius: 9 }}><Ionicons name={list.category?.name === 'Food Stuffs' ? 'nutrition-outline' : 'basket-outline'} size={18} color={palette.green}/></View><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 17, flexShrink: 1 }}>{list.name}</Text></View>
          <Text style={{ color: palette.muted, marginTop: 10 }}>{[list.group?.name ?? 'No group', list.category?.name, list.currency_code].filter(Boolean).join(' · ')}</Text></View><Ionicons name="chevron-forward" color="#A3ADA6" size={20}/></View>
        <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 18 }}>{formatCurrency(list.totals?.budgeted_total ?? 0, list.currency_code)}</Text><Text style={{ color: palette.muted }}>{list.totals?.purchased_count ?? 0}/{list.totals?.item_count ?? 0} purchased</Text></View>
      </Card></Pressable>)}</View>}
    <Button label="Create a shopping list" icon="add-circle-outline" onPress={() => router.push('/create-list')}/>
  </Screen>;
}
