import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { PriceColumns } from '@/src/charts';
import { formatCurrency } from '@/src/currency';
import { fetchPriceHistory, fetchProductName, PricePoint } from '@/src/services/insights';
import { useAsync } from '@/src/useAsync';
import { BackHeader, Card, EmptyState, ErrorNotice, Loading, palette, Screen } from '@/src/ui';

/** A product's price history, one section per currency: prices in different currencies are never compared. */
export default function ProductPrices() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useAsync(async () => {
    const [name, history] = await Promise.all([fetchProductName(id), fetchPriceHistory(id)]);
    return { name, history };
  }, [id]);
  if (!state.data) return <Screen><BackHeader title="Price history"/>{state.error ? <ErrorNotice error={state.error} onRetry={state.reload}/> : <Loading/>}</Screen>;
  const { name, history } = state.data;
  const byCurrency = history.reduce<Record<string, PricePoint[]>>((all, point) => ({ ...all, [point.currency_code]: [...(all[point.currency_code] ?? []), point] }), {});

  return <Screen refreshing={state.loading} onRefresh={state.reload}>
    <BackHeader title={name} subtitle="Unit prices paid, newest first"/>
    {history.length === 0 && <EmptyState title="No purchases yet" message="The price is recorded the first time this item is purchased."/>}
    {Object.entries(byCurrency).map(([code, points]) => {
      const prices = points.map((point) => point.price);
      const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      return <View key={code} style={{ gap: 10 }}>
        <Card>
          <Text style={{ color: palette.green, fontWeight: '800', fontSize: 12 }}>CURRENCY: {code}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 10 }}>
            <Figure label="Last paid" value={formatCurrency(prices[0], code)}/>
            <Figure label="Average" value={formatCurrency(average, code)}/>
            <Figure label="Lowest" value={formatCurrency(Math.min(...prices), code)}/>
            <Figure label="Highest" value={formatCurrency(Math.max(...prices), code)}/>
          </View>
          {points.length > 1 && <View style={{ marginTop: 16 }}>
            <PriceColumns currencyCode={code} points={points.slice(0, 12).reverse().map((point) => ({ value: point.price, date: point.purchased_at }))}/>
          </View>}
        </Card>
        <Card style={{ paddingVertical: 4 }}>{points.map((point, index) => <View key={point.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderColor: palette.line }}>
          <View><Text style={{ color: palette.ink }}>{new Date(point.purchased_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</Text>
            <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>{point.purchase?.list?.name ?? 'Former list'}{point.purchase && Number(point.purchase.quantity) !== 1 ? ` · ${Number(point.purchase.quantity)} units` : ''}</Text></View>
          <Text style={{ color: palette.ink, fontWeight: '700' }}>{formatCurrency(point.price, code)}</Text>
        </View>)}</Card>
      </View>;
    })}
  </Screen>;
}

function Figure({ label, value }: { label: string; value: string }) {
  return <View style={{ width: '50%' }}><Text style={{ color: palette.muted, fontSize: 12 }}>{label}</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 17, marginTop: 2 }}>{value}</Text></View>;
}
