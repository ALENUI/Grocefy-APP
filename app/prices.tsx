import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { fetchPriceSummaries, PriceSummary, priceChange } from '@/src/services/insights';
import { useAsync } from '@/src/useAsync';
import { BackHeader, Card, EmptyState, ErrorNotice, Loading, palette, Screen, styles } from '@/src/ui';
import { features } from '@/src/features';

/** Price book: the last price paid for everything you buy, with the change since the previous purchase. */
function Prices() {
  const [query, setQuery] = useState(''); const [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearch(query), 250); return () => clearTimeout(timer); }, [query]);
  const summaries = useAsync(() => fetchPriceSummaries(search), [search], { cacheKey: search.trim() ? undefined : 'prices' });
  return <Screen refreshing={summaries.loading && !!summaries.data} onRefresh={summaries.reload}>
    <BackHeader title="Price book" subtitle="What you last paid, per currency"/>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search products..." placeholderTextColor="#98A39B" style={styles.search} accessibilityLabel="Search products" autoCorrect={false}/>
    {summaries.error ? <ErrorNotice error={summaries.error} onRetry={summaries.reload}/> : !summaries.data ? <Loading/> : summaries.data.length === 0
      ? <EmptyState title={search ? 'No matching products' : 'No prices yet'} message="Prices are recorded each time an item is purchased from a list."/>
      : <Card style={{ paddingVertical: 4 }}>{summaries.data.map((summary, index) => <PriceRow key={`${summary.productId}-${summary.currencyCode}`} summary={summary} first={index === 0}/>)}</Card>}
  </Screen>;
}

function PriceRow({ summary, first }: { summary: PriceSummary; first: boolean }) {
  const change = priceChange(summary);
  return <Pressable accessibilityRole="button" onPress={() => router.push(`/product/${summary.productId}`)}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderColor: palette.line }}>
    <View style={{ flex: 1 }}>
      <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{summary.productName}</Text>
      <Text style={{ color: palette.muted, marginTop: 3, fontSize: 13 }}>{summary.purchaseCount} {summary.purchaseCount === 1 ? 'purchase' : 'purchases'} · {new Date(summary.lastPurchasedAt).toLocaleDateString()}</Text>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ color: palette.ink, fontWeight: '800' }}>{formatCurrency(summary.lastPrice, summary.currencyCode)}</Text>
      {change !== null && Math.abs(change) >= 0.05 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 }}>
        <Ionicons name={change > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={change > 0 ? palette.red : palette.green}/>
        <Text style={{ color: palette.muted, fontSize: 12 }}>{Math.abs(change).toFixed(1)}% vs previous</Text>
      </View>}
    </View>
    <Ionicons name="chevron-forward" size={18} color="#A3ADA6"/>
  </Pressable>;
}

/** Hidden while the "priceInsights" feature is off: old links and notifications land on Home instead. */
export default function PricesRoute() { return features.priceInsights ? <Prices/> : <Redirect href="/"/>; }
