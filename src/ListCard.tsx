import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from './currency';
import { leftToBuy, ListWithContext } from './services/lists';
import { Card, palette } from './ui';

/**
 * Summary card for a shopping list: name, group/category/currency, amount left to buy, budget, and purchase progress.
 * With `selection`, tapping selects the list instead of opening it; `selected: null` means it cannot be selected.
 */
export function ListCard({ list, showGroup = true, selection, onLongPress }: {
  list: ListWithContext; showGroup?: boolean; selection?: { selected: boolean | null; onToggle: () => void }; onLongPress?: () => void;
}) {
  const purchased = list.totals?.purchased_count ?? 0;
  const total = list.totals?.item_count ?? 0;
  const selected = selection?.selected;
  return <Pressable accessibilityRole={selection ? 'checkbox' : 'button'} accessibilityState={selection ? { checked: !!selected, disabled: selected === null } : undefined}
    disabled={selected === null} onPress={selection ? selection.onToggle : () => router.push(`/list/${list.id}`)} onLongPress={onLongPress}>
    <Card style={[selected && { borderColor: palette.green, backgroundColor: palette.pale }, selected === null && { opacity: 0.5 }]}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ backgroundColor: palette.pale, padding: 7, borderRadius: 9 }}><Ionicons name={list.category?.name === 'Food Stuffs' ? 'nutrition-outline' : 'basket-outline'} size={18} color={palette.green}/></View>
        <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 17, flexShrink: 1 }}>{list.name}</Text></View>
      <Text style={{ color: palette.muted, marginTop: 10 }}>{[showGroup ? list.group?.name ?? 'No group' : undefined, list.category?.name, list.currency_code].filter(Boolean).join(' · ')}</Text></View>
      {selection
        ? <Ionicons name={selected ? 'checkmark-circle' : selected === null ? 'lock-closed-outline' : 'ellipse-outline'} color={selected ? palette.green : '#A3ADA6'} size={24}/>
        : <Ionicons name="chevron-forward" color="#A3ADA6" size={20}/>}</View>
    <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <View><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 18 }}>{formatCurrency(leftToBuy(list.totals), list.currency_code)}</Text>
        <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>{purchased < total ? 'to buy' : 'all bought'} · budget {formatCurrency(list.totals?.budgeted_total ?? 0, list.currency_code)}</Text></View>
      <Text style={{ color: palette.muted }}>{purchased}/{total} purchased</Text></View>
    {total > 0 && <View style={{ height: 6, backgroundColor: palette.pale, borderRadius: 3, marginTop: 10, overflow: 'hidden' }}><View style={{ height: 6, width: `${Math.round((purchased / total) * 100)}%`, backgroundColor: palette.green }}/></View>}
  </Card></Pressable>;
}
