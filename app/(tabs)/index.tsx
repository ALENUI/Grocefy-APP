import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency, parseAmount } from '@/src/currency';
import { features } from '@/src/features';
import { CategoryOption, CategoryPicker, generalCategory } from '@/src/CategoryPicker';
import { ListCard } from '@/src/ListCard';
import { usePrefetchListDetails } from '@/src/listDetail';
import { useOffline } from '@/src/offline/OfflineProvider';
import { applyHomeQueue, DisplayHomeItem, homeListId } from '@/src/offline/queue';
import { priceUnit, quantityLabel, QuantityTypeChips, UnitField } from '@/src/quantity';
import { friendlyError } from '@/src/services/errors';
import { addHomeItem, archiveHomeItem, createHome, fetchHomeItems, fetchMonthSpending, HomeItem, markHomeItem, StockStatus, updateHomeItem } from '@/src/services/home';
import { Category, fetchCategories } from '@/src/services/categories';
import { fetchLists, ListItem, updateItem } from '@/src/services/lists';
import { watchHome, watchInbox, watchLists } from '@/src/services/realtime';
import { fetchInbox } from '@/src/services/sharing';
import { useSession, useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { useHome } from '@/src/useHome';
import { useLive } from '@/src/useLive';
import { Button, Card, CurrencyPicker, EmptyState, ErrorNotice, Field, Heading, IconButton, Loading, palette, Screen, Sheet, styles } from '@/src/ui';

const statusLabel: Record<StockStatus, string> = { in_stock: 'Full', low: 'Low', out: 'Finished' };
// Home shows the first few To-buy lists; the rest are one tap away on the To-buy tab.
const homeListLimit = 2;

/** Home: what the household keeps, what is running low or finished, and this month's spending. */
export default function Home() {
  const userId = useUserId();
  const { session } = useSession();
  const { home, error: homeError, reload: reloadHome } = useHome();
  const homeId = home?.id;
  const items = useAsync(async () => (home ? fetchHomeItems(home.id, home.currency_code) : []), [homeId, home?.currency_code], { cacheKey: `home-items:${homeId ?? 'none'}` });
  const spending = useAsync(async () => (home && features.monthlySpending ? fetchMonthSpending(home.id) : []), [homeId], { cacheKey: `spending:${homeId ?? 'none'}` });
  const inbox = useAsync(() => fetchInbox(userId, session?.user.email), [userId, session?.user.email], { cacheKey: 'inbox' });
  // Same lists (and offline cache) as the To-buy tab.
  const lists = useAsync(async () => (homeId ? fetchLists({ groupId: homeId }) : []), [homeId], { cacheKey: homeId ? `lists:${homeId}` : undefined });
  useLive(watchLists, lists.reload, []);
  usePrefetchListDetails(lists, userId);
  useLive((onChange) => (homeId ? watchHome(homeId, onChange) : () => undefined), () => { items.reload(); spending.reload(); }, [homeId]);
  useLive((onChange) => watchInbox(userId, onChange), inbox.reload, [userId]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HomeItem | null>(null);
  const [notice, setNotice] = useState<{ text: string; listId?: string; error?: boolean }>();
  const [marking, setMarking] = useState<string>();
  // After something is marked low or finished: how much to restock (the To-buy entry it was put on).
  const [restock, setRestock] = useState<{ entry: ListItem; name: string } | null>(null);
  const categoryList = useAsync(() => fetchCategories(userId), [userId], { cacheKey: 'categories' });
  // Changes made offline show straight away and are replaced by server state once they sync.
  const { ops, syncedVersion, submit } = useOffline();
  const { reload: reloadItems } = items; const { reload: reloadLists } = lists;
  useEffect(() => { if (syncedVersion) { reloadItems(); reloadLists(); } }, [syncedVersion, reloadItems, reloadLists]);

  const bell = <IconButton icon="notifications-outline" label="Inbox" badge={inbox.data?.unreadCount} onPress={() => router.push('/inbox')}/>;
  if (home === undefined) return <Screen><Heading title="Home" action={bell}/>{homeError ? <ErrorNotice error={homeError} onRetry={reloadHome}/> : <Loading/>}</Screen>;
  if (home === null) return <Screen><Heading title="Welcome" subtitle="Let's set up your home" action={bell}/><CreateHome onCreated={reloadHome}/></Screen>;

  const canEdit = home.role === 'owner' || home.role === 'partner' || home.role === 'editor';
  const all = applyHomeQueue(items.data ?? [], ops, home.id);
  const needed = all.filter((item) => item.status !== 'in_stock').sort((a, b) => (a.status === b.status ? 0 : a.status === 'out' ? -1 : 1));
  const stocked = all.filter((item) => item.status === 'in_stock');
  // Defaults, your own, and any a housemate used in this home.
  const categories = [...(categoryList.data ?? []), ...all.map((item) => item.category).filter((category): category is CategoryOption => !!category)]
    .filter((category, index, every) => every.findIndex((other) => other.id === category.id) === index);
  const row = (item: DisplayHomeItem) => <ItemRow key={item.id} item={item} currencyCode={home.currency_code} canEdit={canEdit} busy={marking === item.id} onMark={(status) => mark(item, status)} onEdit={() => setEditing(item)}/>;
  // Lists with something still to buy; finished lists stay on the To-buy tab.
  const toBuy = (lists.data ?? []).filter((list) => (list.totals?.purchased_count ?? 0) < (list.totals?.item_count ?? 0));

  const mark = async (item: HomeItem, status: StockStatus) => {
    if (item.status === status) return;
    setMarking(item.id); setNotice(undefined);
    try {
      const name = item.product?.name ?? 'Item';
      const result = await submit({ kind: 'markHomeItem', listId: homeListId(home.id), label: `Mark ${name} ${statusLabel[status].toLowerCase()}`, itemId: item.id, status },
        () => markHomeItem(item.id, status));
      if (result.queued) {
        setNotice(status === 'in_stock' ? undefined : { text: `Saved on this phone. ${name} goes on your To-buy list when you are back online.` });
        return;
      }
      const entry = result.value;
      await Promise.all([items.reload(), lists.reload()]);
      setNotice(entry ? { text: `${item.product?.name ?? 'Item'} is on your To-buy list${entry.budgeted_unit_price > 0 ? ` at ${formatCurrency(entry.budgeted_unit_price, home.currency_code)}` : ''}.`, listId: entry.list_id } : undefined);
      if (entry && entry.status === 'pending') setRestock({ entry: entry as ListItem, name: item.product?.name ?? 'Item' });
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
      <Text style={{ color: palette.muted, fontWeight: '800', fontSize: 13 }}>TO BUY</Text>
      <View style={{ gap: 11 }}>{toBuy.slice(0, homeListLimit).map((list) => <ListCard key={list.id} list={list} showGroup={false}/>)}</View>
      {toBuy.length > homeListLimit && <Button label={`View ${toBuy.length - homeListLimit} more ${toBuy.length - homeListLimit === 1 ? 'list' : 'lists'}`} variant="soft" icon="chevron-forward" onPress={() => router.navigate('/lists')}/>}
    </View>}
    {items.error ? <ErrorNotice error={items.error} onRetry={items.reload}/> : !items.data ? <Loading/> : all.length === 0
      ? <EmptyState title="What do you keep at home?" message="Add the things your household buys regularly, like rice, oil, soap, or toothpaste. Mark them when they run low and they go straight onto your To-buy list."
          action={canEdit ? <Button label="Add your first item" icon="add" onPress={() => setAdding(true)}/> : undefined}/>
      : <>
        {needed.length > 0 && <Section title="Needs buying" items={needed} render={row}/>}
        {stocked.length > 0 && <Section title="In stock" items={stocked} render={row}/>}
      </>}
    <AddItemSheet visible={adding} homeId={home.id} userId={userId} categories={categories} onCategoryCreated={categoryList.reload} onClose={() => setAdding(false)} onAdded={items.reload}/>
    <EditItemSheet item={editing} userId={userId} categories={categories} onCategoryCreated={categoryList.reload} onClose={() => setEditing(null)} onChanged={items.reload}/>
    <RestockSheet restock={restock} onClose={() => setRestock(null)} onChanged={lists.reload}/>
  </Screen>;
}

/** A status section, with its items grouped under their categories (General last). */
function Section({ title, items, render }: { title: string; items: DisplayHomeItem[]; render: (item: DisplayHomeItem) => React.ReactNode }) {
  const groups = items.reduce<{ name: string; items: DisplayHomeItem[] }[]>((all, item) => {
    const name = item.category?.name ?? 'General';
    const group = all.find((entry) => entry.name === name);
    if (group) group.items.push(item); else all.push({ name, items: [item] });
    return all;
  }, []).sort((a, b) => Number(a.name === 'General') - Number(b.name === 'General') || a.name.localeCompare(b.name));
  return <View style={{ gap: 8 }}><Text style={{ color: palette.muted, fontWeight: '800', fontSize: 13 }}>{title.toUpperCase()}</Text>
    <Card style={{ paddingVertical: 4 }}>{groups.map((group, index) => <View key={group.name}>
      <Text style={{ color: palette.green, fontWeight: '800', fontSize: 12, marginTop: index ? 12 : 8 }}>{group.name}</Text>
      {group.items.map(render)}
    </View>)}</Card></View>;
}

/** Asked after an item goes on the To-buy list: keep the quantity bought last time, or change it for this trip. */
function RestockSheet({ restock, onClose, onChanged }: { restock: { entry: ListItem; name: string } | null; onClose: () => void; onChanged: () => void }) {
  const { submit } = useOffline();
  const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState(''); const [isBulk, setIsBulk] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const entry = restock?.entry;
  useEffect(() => { if (entry) { setQuantity(String(Number(entry.quantity))); setUnit(entry.unit ?? ''); setIsBulk(entry.is_bulk); setError(undefined); } }, [entry]);
  const update = async () => {
    const count = parseAmount(quantity.replace(',', '.'), 'USD');
    if (!entry || count === null || count <= 0) return setError('Enter how many to buy.');
    const changes = { quantity: count, unit: unit.trim() || null, isBulk };
    setBusy(true); setError(undefined);
    try {
      await submit({ kind: 'updateItem', listId: entry.list_id, label: `Restock ${restock?.name ?? 'item'}`, itemId: entry.id, changes }, () => updateItem(entry.id, changes));
      onChanged(); onClose();
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  const last = entry ? quantityLabel(entry) : '';
  return <Sheet visible={!!restock} title={`Restock ${restock?.name ?? ''}`} subtitle="It is on your To-buy list. How much should be bought?" onClose={onClose}>
    <Button label={`Keep ${last}`} icon="checkmark" onPress={onClose}/>
    <Text style={{ color: palette.muted, textAlign: 'center' }}>or change it for this trip</Text>
    <Field label="Quantity to buy" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/>
    <UnitField value={unit} onChange={setUnit}/>
    <QuantityTypeChips isBulk={isBulk} onChange={setIsBulk}/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Update quantity" variant="soft" onPress={update} loading={busy}/>
  </Sheet>;
}

function ItemRow({ item, currencyCode, canEdit, busy, onMark, onEdit }: { item: DisplayHomeItem; currencyCode: string; canEdit: boolean; busy: boolean; onMark: (status: StockStatus) => void; onEdit: () => void }) {
  return <View style={{ paddingVertical: 12, gap: 8, opacity: busy ? 0.5 : 1 }}>
    <Pressable disabled={!canEdit} onPress={onEdit} accessibilityHint="Edit this item">
      <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{item.product?.name ?? 'Item'}</Text>
      <Text style={{ color: palette.muted, marginTop: 2, fontSize: 13 }}>
        {/* The full quantity is what was bought last time (or set by hand); it is also what goes on the To-buy list. */}
        {item.status === 'in_stock' ? `Full: ${quantityLabel({ quantity: item.usual_quantity, unit: item.unit, is_bulk: item.is_bulk })}` : `Buy ${quantityLabel({ quantity: item.usual_quantity, unit: item.unit, is_bulk: item.is_bulk })}`} · {item.lastPrice !== null ? `last paid ${formatCurrency(item.lastPrice, currencyCode)} ${priceUnit(item.is_bulk, item.unit)}` : 'no price yet'}{item.pendingSync ? ' · waiting to sync' : ''}
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

function AddItemSheet({ visible, homeId, userId, categories, onCategoryCreated, onClose, onAdded }: {
  visible: boolean; homeId: string; userId: string; categories: CategoryOption[]; onCategoryCreated: (category: Category) => void; onClose: () => void; onAdded: () => void;
}) {
  const [name, setName] = useState(''); const [quantity, setQuantity] = useState('1'); const [isBulk, setIsBulk] = useState(false); const [unit, setUnit] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const { submit, newId } = useOffline();
  useEffect(() => { if (visible) { setName(''); setQuantity('1'); setIsBulk(false); setUnit(''); setCategoryId(null); setError(undefined); } }, [visible]);
  // Nothing picked means General (the database files it there too).
  const selected = categoryId ?? generalCategory(categories)?.id ?? null;
  const add = async () => {
    const count = parseAmount(quantity.replace(',', '.'), 'USD');
    if (!name.trim()) return setError('Enter what you keep at home, e.g. Rice.');
    if (count === null || count <= 0) return setError('Enter how many make it full.');
    setBusy(true); setError(undefined);
    const itemId = newId(); const itemName = name.trim(); const unitName = unit.trim() || null;
    try {
      await submit({ kind: 'addHomeItem', listId: homeListId(homeId), label: `Add ${itemName}`, itemId, homeId, name: itemName, usualQuantity: count, unit: unitName, isBulk, categoryId: selected,
        categoryName: categories.find((category) => category.id === selected)?.name ?? null },
      () => addHomeItem(userId, homeId, itemName, { id: itemId, usualQuantity: count, unit: unitName ?? undefined, isBulk, categoryId: selected }));
      onAdded(); onClose();
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Sheet visible={visible} title="Add to your home" subtitle="Something your household buys regularly." onClose={onClose}>
    <Field label="Item" value={name} onChangeText={setName} hint="e.g. Rice"/>
    <Field label="Full quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" note="How many you buy to fill up, e.g. 1 bag or 4 bars. Updated each time you buy it."/>
    <UnitField value={unit} onChange={setUnit}/>
    <QuantityTypeChips isBulk={isBulk} onChange={setIsBulk}/>
    <CategoryPicker categories={categories} value={selected} onChange={setCategoryId} userId={userId} onCreated={onCategoryCreated}/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Add item" onPress={add} loading={busy}/>
  </Sheet>;
}

function EditItemSheet({ item, userId, categories, onCategoryCreated, onClose, onChanged }: {
  item: HomeItem | null; userId: string; categories: CategoryOption[]; onCategoryCreated: (category: Category) => void; onClose: () => void; onChanged: () => void;
}) {
  const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState(''); const [isBulk, setIsBulk] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (item) { setQuantity(String(Number(item.usual_quantity))); setUnit(item.unit ?? ''); setIsBulk(item.is_bulk); setCategoryId(item.category_id); setError(undefined); } }, [item]);
  const { submit } = useOffline();
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(undefined); try { await action(); onChanged(); onClose(); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); } };
  const save = () => {
    const count = parseAmount(quantity.replace(',', '.'), 'USD');
    if (!item || count === null || count <= 0) return setError('Enter how many make it full.');
    const changes = { usualQuantity: count, unit: unit.trim() || null, isBulk, categoryId };
    run(() => submit({ kind: 'updateHomeItem', listId: homeListId(item.group_id), label: `Edit ${item.product?.name ?? 'item'}`, itemId: item.id, changes,
      categoryName: categories.find((category) => category.id === categoryId)?.name ?? null }, () => updateHomeItem(item.id, changes)));
  };
  return <Sheet visible={!!item} title={item?.product?.name ?? 'Item'} onClose={onClose}>
    <Field label="Full quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/>
    <UnitField value={unit} onChange={setUnit}/>
    <CategoryPicker categories={categories} value={categoryId ?? generalCategory(categories)?.id ?? null} onChange={setCategoryId} userId={userId} onCreated={onCategoryCreated}/>
    <QuantityTypeChips isBulk={isBulk} onChange={setIsBulk}/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Save" onPress={save} loading={busy}/>
    <Button label="Remove from home" variant="danger" icon="trash-outline" disabled={busy} onPress={() => item && run(() => submit({ kind: 'archiveHomeItem', listId: homeListId(item.group_id), label: `Remove ${item.product?.name ?? 'item'}`, itemId: item.id }, () => archiveHomeItem(item.id)))}/>
  </Sheet>;
}
