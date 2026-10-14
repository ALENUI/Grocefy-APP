import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency, parseAmount } from '@/src/currency';
import { features } from '@/src/features';
import { ListCard } from '@/src/ListCard';
import { friendlyError } from '@/src/services/errors';
import { addHomeItem, archiveHomeItem, createHome, fetchHomeItems, fetchMonthSpending, HomeItem, markHomeItem, StockStatus, updateHomeItem } from '@/src/services/home';
import { fetchLists } from '@/src/services/lists';
import { watchHome, watchInbox, watchLists } from '@/src/services/realtime';
import { fetchInbox } from '@/src/services/sharing';
import { useSession, useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { useHome } from '@/src/useHome';
import { useLive } from '@/src/useLive';
import { Button, Card, CurrencyPicker, EmptyState, ErrorNotice, Field, Heading, IconButton, Loading, palette, Screen, Sheet, styles } from '@/src/ui';

const statusLabel: Record<StockStatus, string> = { in_stock: 'In stock', low: 'Low', out: 'Finished' };

/** Home: what the household keeps, what is running low or finished, and this month's spending. */
export default function Home() {
  const userId = useUserId();
  const { session } = useSession();
  const { home, error: homeError, reload: reloadHome } = useHome();
  const homeId = home?.id;
  const items = useAsync(async () => (home ? fetchHomeItems(home.id, home.currency_code) : []), [homeId, home?.currency_code], { cacheKey: `home-items:${homeId ?? 'none'}` });
  const spending = useAsync(async () => (home && features.monthlySpending ? fetchMonthSpending(home.id) : []), [homeId]);
  const inbox = useAsync(() => fetchInbox(userId, session?.user.email), [userId, session?.user.email]);
  // Same lists (and offline cache) as the To-buy tab.
  const lists = useAsync(async () => (homeId ? fetchLists({ groupId: homeId }) : []), [homeId], { cacheKey: homeId ? `lists:${homeId}` : undefined });
  useLive(watchLists, lists.reload, []);
  useLive((onChange) => (homeId ? watchHome(homeId, onChange) : () => undefined), () => { items.reload(); spending.reload(); }, [homeId]);
  useLive((onChange) => watchInbox(userId, onChange), inbox.reload, [userId]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HomeItem | null>(null);
  const [notice, setNotice] = useState<{ text: string; listId?: string; error?: boolean }>();
  const [marking, setMarking] = useState<string>();

  const bell = <IconButton icon="notifications-outline" label="Inbox" badge={inbox.data?.unreadCount} onPress={() => router.push('/inbox')}/>;
  if (home === undefined) return <Screen><Heading title="Home" action={bell}/>{homeError ? <ErrorNotice error={homeError} onRetry={reloadHome}/> : <Loading/>}</Screen>;
  if (home === null) return <Screen><Heading title="Welcome" subtitle="Let's set up your home" action={bell}/><CreateHome onCreated={reloadHome}/></Screen>;

  const canEdit = home.role === 'owner' || home.role === 'partner' || home.role === 'editor';
  const all = items.data ?? [];
  const needed = all.filter((item) => item.status !== 'in_stock').sort((a, b) => (a.status === b.status ? 0 : a.status === 'out' ? -1 : 1));
  const stocked = all.filter((item) => item.status === 'in_stock');
  // Lists with something still to buy; finished lists stay on the To-buy tab.
  const toBuy = (lists.data ?? []).filter((list) => (list.totals?.purchased_count ?? 0) < (list.totals?.item_count ?? 0));

  const mark = async (item: HomeItem, status: StockStatus) => {
    if (item.status === status) return;
    setMarking(item.id); setNotice(undefined);
    try {
      const entry = await markHomeItem(item.id, status);
      await Promise.all([items.reload(), lists.reload()]);
      setNotice(entry ? { text: `${item.product?.name ?? 'Item'} is on your To-buy list${entry.budgeted_unit_price > 0 ? ` at ${formatCurrency(entry.budgeted_unit_price, home.currency_code)}` : ''}.`, listId: entry.list_id } : undefined);
    } catch (caught) { setNotice({ text: friendlyError(caught), error: true }); } finally { setMarking(undefined); }
  };

  return <Screen refreshing={items.loading && !!items.data} onRefresh={() => { items.reload(); spending.reload(); inbox.reload(); lists.reload(); }}>
    <Heading title={home.name} subtitle={`${home.memberCount} ${home.memberCount === 1 ? 'person' : 'people'}${canEdit ? '' : ' · view only'}`}
      action={<View style={{ flexDirection: 'row', gap: 8 }}>
        {bell}
        <IconButton icon="people-outline" label="People in this home" onPress={() => router.push({ pathname: '/members', params: { type: 'group', id: home.id, name: home.name } })}/>
        {canEdit && <IconButton icon="add" label="Add item" onPress={() => setAdding(true)}/>}
      </View>}/>
    {items.stale && <Text style={{ color: palette.muted }}>Offline · showing your home as saved {items.savedAt ? new Date(items.savedAt).toLocaleString() : 'earlier'}.</Text>}
    {features.monthlySpending && <Card style={{ backgroundColor: palette.green, borderColor: palette.green }}>
      <Text style={{ color: '#D5F1DF', fontWeight: '700', fontSize: 13 }}>SPENT THIS MONTH</Text>
      {(spending.data?.length ? spending.data : [{ currencyCode: home.currency_code, purchased: 0, purchaseCount: 0 }]).map((month) =>
        <Text key={month.currencyCode} style={{ color: 'white', fontWeight: '800', fontSize: 28, marginTop: 4 }}>{formatCurrency(month.purchased, month.currencyCode)}</Text>)}
      <Text style={{ color: '#D5F1DF', marginTop: 4 }}>{needed.length ? `${needed.length} ${needed.length === 1 ? 'thing needs' : 'things need'} buying` : 'Nothing needs buying'}</Text>
    </Card>}
    {notice && <Card style={{ backgroundColor: notice.error ? palette.redPale : palette.pale, borderColor: notice.error ? palette.redPale : palette.pale }}>
      <Text style={{ color: notice.error ? palette.red : palette.ink, fontWeight: '700' }}>{notice.text}</Text>
      {notice.listId && <Text onPress={() => router.push(`/list/${notice.listId}`)} style={{ color: palette.green, fontWeight: '800', marginTop: 6 }}>Open To-buy list</Text>}
    </Card>}
    {toBuy.length > 0 && <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: palette.muted, fontWeight: '800', fontSize: 13 }}>TO BUY</Text>
        <Text accessibilityRole="link" onPress={() => router.navigate('/lists')} style={{ color: palette.green, fontWeight: '800', fontSize: 13 }}>See all</Text></View>
      <View style={{ gap: 11 }}>{toBuy.map((list) => <ListCard key={list.id} list={list} showGroup={false}/>)}</View>
    </View>}
    {items.error ? <ErrorNotice error={items.error} onRetry={items.reload}/> : !items.data ? <Loading/> : all.length === 0
      ? <EmptyState title="What do you keep at home?" message="Add the things your household buys regularly, like rice, oil, soap, or toothpaste. Mark them when they run low and they go straight onto your To-buy list."
          action={canEdit ? <Button label="Add your first item" icon="add" onPress={() => setAdding(true)}/> : undefined}/>
      : <>
        {needed.length > 0 && <Section title="Needs buying">{needed.map((item) => <ItemRow key={item.id} item={item} currencyCode={home.currency_code} canEdit={canEdit} busy={marking === item.id} onMark={(status) => mark(item, status)} onEdit={() => setEditing(item)}/>)}</Section>}
        {stocked.length > 0 && <Section title="In stock">{stocked.map((item) => <ItemRow key={item.id} item={item} currencyCode={home.currency_code} canEdit={canEdit} busy={marking === item.id} onMark={(status) => mark(item, status)} onEdit={() => setEditing(item)}/>)}</Section>}
      </>}
    <AddItemSheet visible={adding} homeId={home.id} userId={userId} onClose={() => setAdding(false)} onAdded={items.reload}/>
    <EditItemSheet item={editing} onClose={() => setEditing(null)} onChanged={items.reload}/>
  </Screen>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ gap: 8 }}><Text style={{ color: palette.muted, fontWeight: '800', fontSize: 13 }}>{title.toUpperCase()}</Text><Card style={{ paddingVertical: 4 }}>{children}</Card></View>;
}

function ItemRow({ item, currencyCode, canEdit, busy, onMark, onEdit }: { item: HomeItem; currencyCode: string; canEdit: boolean; busy: boolean; onMark: (status: StockStatus) => void; onEdit: () => void }) {
  return <View style={{ paddingVertical: 12, gap: 8, opacity: busy ? 0.5 : 1 }}>
    <Pressable disabled={!canEdit} onPress={onEdit} accessibilityHint="Edit this item">
      <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{item.product?.name ?? 'Item'}</Text>
      <Text style={{ color: palette.muted, marginTop: 2, fontSize: 13 }}>
        {item.lastPrice !== null ? `Last paid ${formatCurrency(item.lastPrice, currencyCode)}` : 'No price yet'} · buy {Number(item.usual_quantity)}{item.unit ? ` ${item.unit}` : ''} at a time
      </Text>
    </Pressable>
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
      {(['in_stock', 'low', 'out'] as StockStatus[]).map((status) => {
        const selected = item.status === status;
        const tone = status === 'out' ? palette.red : status === 'low' ? palette.orange : palette.green;
        return <Pressable key={status} accessibilityRole="radio" accessibilityState={{ selected, disabled: !canEdit }} disabled={!canEdit || busy} onPress={() => onMark(status)}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: selected ? tone : palette.line, backgroundColor: selected ? tone : palette.white }}>
          <Text style={{ color: selected ? palette.white : palette.muted, fontWeight: '700', fontSize: 13 }}>{statusLabel[status]}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

function CreateHome({ onCreated }: { onCreated: () => void }) {
  const { defaultCurrency, refreshAccount } = useSession();
  const [name, setName] = useState('My home'); const [currency, setCurrency] = useState(defaultCurrency);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { setCurrency(defaultCurrency); }, [defaultCurrency]);
  const create = async () => {
    if (!name.trim()) return setError('Give your home a name.');
    setBusy(true); setError(undefined);
    try { await createHome(name.trim(), currency); await refreshAccount(); onCreated(); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <>
    <Card><View style={{ gap: 14 }}>
      <Text style={{ color: palette.muted, lineHeight: 20 }}>Your home holds the things you keep in the house and your To-buy list. Invite the people you live with so everyone sees what is running out.</Text>
      <Field label="Home name" value={name} onChangeText={setName} hint="e.g. Our flat"/>
      <View style={styles.field}><Text style={styles.label}>Currency</Text><CurrencyPicker value={currency} onChange={setCurrency}/></View>
      {error && <Text style={{ color: palette.red }}>{error}</Text>}
      <Button label="Create my home" icon="home-outline" onPress={create} loading={busy}/>
    </View></Card>
    <EmptyState title="Joining someone's home?" message="Ask them to invite you by username or email. The invitation appears in your inbox." action={<Button label="Open inbox" variant="soft" onPress={() => router.push('/inbox')}/>}/>
  </>;
}

function AddItemSheet({ visible, homeId, userId, onClose, onAdded }: { visible: boolean; homeId: string; userId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState(''); const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (visible) { setName(''); setQuantity('1'); setError(undefined); } }, [visible]);
  const add = async () => {
    const count = parseAmount(quantity.replace(',', '.'), 'USD');
    if (!name.trim()) return setError('Enter what you keep at home, e.g. Rice.');
    if (count === null || count <= 0) return setError('Enter how many you usually buy.');
    setBusy(true); setError(undefined);
    try { await addHomeItem(userId, homeId, name.trim(), { usualQuantity: count }); onAdded(); onClose(); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Sheet visible={visible} title="Add to your home" subtitle="Something your household buys regularly." onClose={onClose}>
    <Field label="Item" value={name} onChangeText={setName} hint="e.g. Rice"/>
    <Field label="Usually buy" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" note="How many at a time, e.g. 1 bag or 4 bars."/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Add item" onPress={add} loading={busy}/>
  </Sheet>;
}

function EditItemSheet({ item, onClose, onChanged }: { item: HomeItem | null; onClose: () => void; onChanged: () => void }) {
  const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (item) { setQuantity(String(Number(item.usual_quantity))); setUnit(item.unit ?? ''); setError(undefined); } }, [item]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(undefined); try { await action(); onChanged(); onClose(); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); } };
  const save = () => {
    const count = parseAmount(quantity.replace(',', '.'), 'USD');
    if (!item || count === null || count <= 0) return setError('Enter how many you usually buy.');
    run(() => updateHomeItem(item.id, { usualQuantity: count, unit: unit.trim() || null }));
  };
  return <Sheet visible={!!item} title={item?.product?.name ?? 'Item'} onClose={onClose}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 110 }}><Field label="Usually buy" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/></View>
      <View style={{ flex: 1 }}><Field label="Unit (optional)" value={unit} onChangeText={setUnit} hint="e.g. bag, bottle, kg" autoCapitalize="none"/></View>
    </View>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Save" onPress={save} loading={busy}/>
    <Button label="Remove from home" variant="danger" icon="trash-outline" disabled={busy} onPress={() => item && run(() => archiveHomeItem(item.id))}/>
  </Sheet>;
}
