import React, { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { friendlyError } from '@/src/services/errors';
import { fetchPurchases, PurchaseWithProduct } from '@/src/services/purchases';
import { watchTables } from '@/src/services/realtime';
import { useAsync } from '@/src/useAsync';
import { useLive } from '@/src/useLive';
import { Button, Card, EmptyState, ErrorNotice, Heading, Loading, palette, Screen, SectionLabel } from '@/src/ui';
import { features } from '@/src/features';

const pageSize = 50;
const dayKey = (iso: string) => { const date = new Date(iso); return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; };
/** "Today", "Yesterday", then "Sat, 24 Oct" (with the year when it is not this year). */
function dayLabel(iso: string, now = new Date()) {
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(iso) === dayKey(now.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export default function PurchaseHistory() {
  const [older, setOlder] = useState<PurchaseWithProduct[]>([]);
  const [hasMore, setHasMore] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [moreError, setMoreError] = useState<string>();
  const first = useAsync(async () => { const page = await fetchPurchases({ pageSize }); setOlder([]); setHasMore(page.length === pageSize); return page; }, [], { cacheKey: 'purchases' });
  useLive((onChange) => watchTables([{ table: 'purchases' }], onChange), first.reload, []);
  const purchases = [...(first.data ?? []), ...older];

  const loadMore = async () => {
    const last = purchases[purchases.length - 1];
    if (!last) return;
    setLoadingMore(true); setMoreError(undefined);
    try { const page = await fetchPurchases({ after: last, pageSize }); setOlder((current) => [...current, ...page]); setHasMore(page.length === pageSize); }
    catch (caught) { setMoreError(friendlyError(caught)); } finally { setLoadingMore(false); }
  };
  // Purchases arrive newest first; group consecutive rows by local calendar day.
  const days = purchases.reduce<{ key: string; label: string; entries: PurchaseWithProduct[] }[]>((all, purchase) => {
    const key = dayKey(purchase.purchased_at);
    const last = all[all.length - 1];
    if (last?.key === key) last.entries.push(purchase);
    else all.push({ key, label: dayLabel(purchase.purchased_at), entries: [purchase] });
    return all;
  }, []);

  return <Screen refreshing={first.loading && !!first.data} onRefresh={first.reload}>
    <Heading title="History" subtitle="Everything bought, newest first"/>
    {first.error ? <ErrorNotice error={first.error} onRetry={first.reload}/> : !first.data ? <Loading/> : purchases.length === 0
      ? <EmptyState title="Nothing bought yet" message="Tick items off a To-buy list as you buy them, and they show up here with what you paid."/>
      : days.map((day) => <View key={day.key} style={{ gap: 8 }}><SectionLabel title={day.label}/>
        {day.entries.map((purchase) => { const difference = purchase.budgeted_amount - purchase.purchased_amount; const linked = features.priceInsights && !!purchase.product;
          return <Pressable key={purchase.id} accessibilityRole={linked ? 'button' : undefined} disabled={!linked} onPress={() => purchase.product && router.push(`/product/${purchase.product.id}`)}><Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{purchase.product?.name ?? 'Item'}</Text>
            <Text style={{ color: palette.muted, marginTop: 4 }}>{purchase.list?.name ?? 'Deleted list'} · quantity {Number(purchase.quantity)}</Text></View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{formatCurrency(purchase.purchased_amount, purchase.currency_code)}</Text>
            {difference !== 0 && <Text style={{ color: difference > 0 ? palette.green : palette.red, fontSize: 12, marginTop: 3 }}>{difference > 0 ? `${formatCurrency(difference, purchase.currency_code)} under` : `${formatCurrency(-difference, purchase.currency_code)} over`}</Text>}</View>
        </View></Card></Pressable>; })}</View>)}
    {moreError && <Text style={{ color: palette.red }}>{moreError}</Text>}
    {hasMore && purchases.length > 0 && <Button label="Load older purchases" variant="soft" loading={loadingMore} onPress={loadMore}/>}
  </Screen>;
}
