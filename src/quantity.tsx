import React from 'react';
import { Text, View } from 'react-native';
import { Chip, palette, styles } from './ui';

type Quantity = { quantity: number; unit: string | null; is_bulk: boolean };

/** Per item: "3 items" (or "3 kg" with a unit). Bulk: "2 bulk packs" (or "2 bulk bags"). */
export function quantityLabel({ quantity, unit, is_bulk }: Quantity) {
  const count = Number(quantity);
  return is_bulk ? `${count} bulk ${unit ?? (count === 1 ? 'pack' : 'packs')}` : `${count} ${unit ?? (count === 1 ? 'item' : 'items')}`;
}

export const priceUnit = (isBulk: boolean) => (isBulk ? 'per pack' : 'each');

export function QuantityBadge({ isBulk }: { isBulk: boolean }) {
  return <View style={{ backgroundColor: isBulk ? '#FDF1E4' : palette.pale, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
    <Text style={{ color: isBulk ? palette.orange : palette.green, fontSize: 12, fontWeight: '800' }}>{isBulk ? 'Bulk' : 'Per item'}</Text></View>;
}

/** Whether the quantity counts single items or bulk packs (a carton, a bag, a crate). */
export function QuantityTypeChips({ isBulk, onChange }: { isBulk: boolean; onChange: (isBulk: boolean) => void }) {
  return <View style={styles.field}><Text style={styles.label}>Buy as</Text><View style={{ flexDirection: 'row', gap: 8 }}>
    <Chip label="Per item" selected={!isBulk} onPress={() => onChange(false)}/><Chip label="Bulk" selected={isBulk} onPress={() => onChange(true)}/></View></View>;
}
