import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Chip, Field, palette, styles } from './ui';

type Quantity = { quantity: number; unit: string | null; is_bulk: boolean };

/** Per item: "3 items" (or "3 kg" with a unit). Bulk: "2 bulk packs" (or "2 bulk bags"). */
export function quantityLabel({ quantity, unit, is_bulk }: Quantity) {
  const count = Number(quantity);
  return is_bulk ? `${count} bulk ${unit ?? (count === 1 ? 'pack' : 'packs')}` : `${count} ${unit ?? (count === 1 ? 'item' : 'items')}`;
}

/** How the price is counted: "each", "per kg", "per pack", "per bag". */
export const priceUnit = (isBulk: boolean, unit?: string | null) => (unit ? `per ${unit}` : isBulk ? 'per pack' : 'each');

// Quick picks for the unit field; anything else can be typed.
const commonUnits = ['kg', 'g', 'L', 'ml', 'bag', 'bottle', 'pack', 'carton', 'crate', 'tin', 'dozen', 'bunch'];

export function QuantityBadge({ isBulk }: { isBulk: boolean }) {
  return <View style={{ backgroundColor: isBulk ? palette.orangePale : palette.pale, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
    <Text style={{ color: isBulk ? palette.orange : palette.green, fontSize: 12, fontWeight: '800' }}>{isBulk ? 'Bulk' : 'Per item'}</Text></View>;
}

/** Whether the quantity counts single items or bulk packs (a carton, a bag, a crate). */
export function QuantityTypeChips({ isBulk, onChange }: { isBulk: boolean; onChange: (isBulk: boolean) => void }) {
  return <View style={styles.field}><Text style={styles.label}>Buy as</Text><View style={{ flexDirection: 'row', gap: 8 }}>
    <Chip label="Per item" selected={!isBulk} onPress={() => onChange(false)}/><Chip label="Bulk" selected={isBulk} onPress={() => onChange(true)}/></View></View>;
}

/** Unit of measurement (kg, L, bag, …): typed, or picked from common units. Empty means items are simply counted. */
export function UnitField({ value, onChange }: { value: string; onChange: (unit: string) => void }) {
  return <View style={{ gap: 8 }}>
    <Field label="Unit (optional)" value={value} onChangeText={onChange} hint="e.g. kg, L, bag" autoCapitalize="none" note="Leave empty to count items."/>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {commonUnits.map((unit) => <Chip key={unit} label={unit} selected={value.trim() === unit} onPress={() => onChange(value.trim() === unit ? '' : unit)}/>)}
    </ScrollView>
  </View>;
}
