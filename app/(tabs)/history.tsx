import React from 'react';
import { Text, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { useGrocefy } from '@/src/store';
import { Card, Heading, palette, Screen } from '@/src/ui';

export default function PurchaseHistory() {
  const { history } = useGrocefy();
  const entries = [...history].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  return <Screen><Heading title="Purchase history" subtitle="Prices retain the original purchase currency"/>
    {entries.length === 0 ? <Card><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>No purchases yet</Text><Text style={{ color: palette.muted, marginTop: 7 }}>Confirm an item purchase from a shopping list to build its price history.</Text></Card> : entries.map((entry) => <Card key={entry.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{entry.name}</Text><Text style={{ color: palette.muted, marginTop: 5 }}>{new Date(`${entry.purchaseDate}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · {entry.currencyCode}</Text></View><Text style={{ color: palette.green, fontWeight: '800', fontSize: 17 }}>{formatCurrency(entry.amount, entry.currencyCode)}</Text></View></Card>)}
    <Card><Text style={{ color: palette.ink, fontWeight: '800' }}>Cross-currency safety</Text><Text style={{ color: palette.muted, lineHeight: 20, marginTop: 7 }}>Grocefy shows a historical price in its original currency. It never reuses, for example, an XAF amount as USD without an explicit conversion.</Text></Card>
  </Screen>;
}
