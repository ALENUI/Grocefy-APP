import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from './currency';
import { features } from './features';
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
  // The currency only tells lists apart when lists can have different ones.
  const details = [showGroup ? list.group?.name ?? 'No group' : undefined, list.category?.name, features.listCurrency ? list.currency_code : undefined].filter(Boolean).join(' · ');
  return <Pressable accessibilityRole={selection ? 'checkbox' : 'button'} accessibilityState={selection ? { checked: !!selected, disabled: selected === null } : undefined}
    disabled={selected === null} onPress={selection ? selection.onToggle : () => router.push(`/list/${list.id}`)} onLongPress={onLongPress}>
    <Card style={[selected && { borderColor: palette.green, backgroundColor: palette.pale }, selected === null && { opacity: 0.5 }]}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ backgroundColor: palette.pale, padding: 7, borderRadius: 8 }}><Ionicons name={list.category?.name === 'Food Stuffs' ? 'nutrition-outline' : 'basket-outline'} size={18} color={palette.green}/></View>
        <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 17, flexShrink: 1 }}>{list.name}</Text></View>
      {!!details && <Text style={{ color: palette.muted, marginTop: 10 }}>{details}</Text>}</View>
      {selection
        ? <Ionicons name={selected ? 'checkmark-circle' : selected === null ? 'lock-closed-outline' : 'ellipse-outline'} color={selected ? palette.green : palette.faint} size={24}/>
        : <Ionicons name="chevron-forward" color={palette.faint} size={20}/>}</View>
    {total === 0 ? <Text style={{ color: palette.muted, marginTop: 14 }}>Nothing on it yet</Text>
      : <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flexShrink: 1 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 18 }}>{purchased < total ? formatCurrency(leftToBuy(list.totals), list.currency_code) : 'All bought'}</Text>
          {purchased < total && <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>left to buy</Text>}</View>
        <Text style={{ color: palette.muted }}>{purchased} of {total} bought</Text></View>}
    {total > 0 && <View style={{ height: 6, backgroundColor: palette.pale, borderRadius: 3, marginTop: 10, overflow: 'hidden' }}><View style={{ height: 6, width: `${Math.round((purchased / total) * 100)}%`, backgroundColor: palette.green }}/></View>}
  </Card></Pressable>;
}
