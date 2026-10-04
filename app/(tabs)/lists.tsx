import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { features } from '@/src/features';
import { ListCard } from '@/src/ListCard';
import { fetchLists } from '@/src/services/lists';
import { watchLists } from '@/src/services/realtime';
import { useAsync } from '@/src/useAsync';
import { useHome } from '@/src/useHome';
import { useLive } from '@/src/useLive';
import { Button, Card, EmptyState, ErrorNotice, Heading, IconButton, Loading, palette, Screen } from '@/src/ui';

/** The home's shopping lists: what needs buying, ready to tick off at the market. */
export default function Lists() {
  const { home } = useHome();
  const homeId = features.multipleHomes ? undefined : home?.id;
  const lists = useAsync(async () => (features.multipleHomes || homeId ? fetchLists({ groupId: homeId }) : []), [homeId], { cacheKey: `lists:${homeId ?? 'all'}` });
  useLive(watchLists, lists.reload, []);
  const newList = () => router.push(homeId ? { pathname: '/create-list', params: { groupId: homeId } } : '/create-list');

  return <Screen refreshing={lists.loading && !!lists.data} onRefresh={lists.reload}>
    <Heading title="To buy" subtitle={home ? home.name : 'Your shopping lists'}
      action={<View style={{ flexDirection: 'row', gap: 8 }}>
        {features.priceInsights && <IconButton icon="pricetags-outline" label="Price book" onPress={() => router.push('/prices')}/>}
        {(features.multipleHomes || homeId) && <IconButton icon="add" label="New list" onPress={newList}/>}
      </View>}/>
    {lists.stale && <Text style={{ color: palette.muted }}>Offline · showing your lists as saved {lists.savedAt ? new Date(lists.savedAt).toLocaleString() : 'earlier'}.</Text>}
    {features.multipleHomes && <Pressable onPress={() => router.push('/groups')}><Card style={{ backgroundColor: palette.pale, borderColor: palette.pale }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Text style={{ color: palette.green, fontWeight: '800', fontSize: 16 }}>Shopping groups</Text><Text style={{ color: palette.muted, marginTop: 4 }}>Organize lists and people by purpose</Text></View><Ionicons name="people-outline" size={25} color={palette.green}/></View></Card></Pressable>}
    {!features.multipleHomes && home === null && <EmptyState title="Set up your home first" message="Create your home on the Home tab, or accept an invitation from someone you live with." action={<Button label="Go to Home" variant="soft" onPress={() => router.navigate('/')}/>}/>}
    {lists.error ? <ErrorNotice error={lists.error} onRetry={lists.reload}/> : !lists.data ? <Loading/> : lists.data.length === 0
      ? (home !== null && <EmptyState title="No lists yet" message="Mark items as running low on the Home tab, or create a list for a shopping trip."/>)
      : <View style={{ gap: 11 }}>{lists.data.map((list) => <ListCard key={list.id} list={list} showGroup={features.multipleHomes}/>)}</View>}
    {(features.multipleHomes || homeId) && <Button label="New list" icon="add-circle-outline" variant="soft" onPress={newList}/>}
  </Screen>;
}
