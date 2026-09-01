import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { useGrocefy } from '@/src/store';
import { Button, Card, Heading, palette, Screen, styles } from '@/src/ui';

export default function Lists() {
  const { lists, settings, groups } = useGrocefy();
  const overallBudget = lists.reduce((total, list) => total + (list.currencyCode === settings.defaultCurrency ? list.items.reduce((sum, item) => sum + item.budget, 0) : 0), 0);
  return <Screen><Heading title="My lists" subtitle="Plan together, spend with confidence" action={<Pressable onPress={() => router.push('/create-list')} style={{ backgroundColor: palette.green, padding: 11, borderRadius: 13 }}><Ionicons name="add" color="white" size={21}/></Pressable>}/>
    <Card style={{ backgroundColor: palette.green, borderColor: palette.green }}><Text style={{ color: '#D5F1DF', fontWeight: '700', fontSize: 13 }}>YOUR ACTIVE BUDGET</Text><Text style={{ color: 'white', fontWeight: '800', fontSize: 29, marginTop: 5 }}>{formatCurrency(overallBudget, settings.defaultCurrency)}</Text><Text style={{ color: '#D5F1DF', marginTop: 4 }}>Across lists in your default currency</Text></Card>
    <Pressable onPress={() => router.push('/groups')}><Card style={{ backgroundColor: palette.pale, borderColor: palette.pale }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Text style={{ color: palette.green, fontWeight: '800', fontSize: 16 }}>Shopping groups</Text><Text style={{ color: palette.muted, marginTop: 4 }}>{groups.length} active groups · organize lists and people</Text></View><Ionicons name="people-outline" size={25} color={palette.green}/></View></Card></Pressable>
    <View style={{ gap: 11 }}>{lists.map((list) => { const budget = list.items.reduce((sum, item) => sum + item.budget, 0); const bought = list.items.filter((item) => item.actual !== undefined).length; return <Pressable key={list.id} onPress={() => router.push(`/list/${list.id}`)}><Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ backgroundColor: palette.pale, padding: 7, borderRadius: 9 }}><Ionicons name={list.category === 'Food' ? 'nutrition-outline' : 'sparkles-outline'} size={18} color={palette.green}/></View><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 17 }}>{list.name}</Text></View><Text style={{ color: palette.muted, marginTop: 10 }}>{list.group ?? 'No group'} · {list.currencyCode}</Text></View><Ionicons name="chevron-forward" color="#A3ADA6" size={20}/></View><View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 18 }}>{formatCurrency(budget, list.currencyCode)}</Text><Text style={{ color: palette.muted }}>{bought}/{list.items.length} purchased</Text></View></Card></Pressable>; })}</View>
    <Button label="Create a shopping list" icon="add-circle-outline" onPress={() => router.push('/create-list')}/>
  </Screen>;
}
