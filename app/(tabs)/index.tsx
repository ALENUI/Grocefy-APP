import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { amountInputValue, formatCurrency, parseAmount } from '@/src/currency';
import { features } from '@/src/features';
import { CategoryOption, CategoryPicker, generalCategory } from '@/src/CategoryPicker';
import { ListCard } from '@/src/ListCard';
import { SelectionBar, useListSelection } from '@/src/ListSelection';
import { usePrefetchListDetails } from '@/src/listDetail';
import { useOffline } from '@/src/offline/OfflineProvider';
import { applyHomeQueue, DisplayHomeItem, homeListId } from '@/src/offline/queue';
import { priceUnit, quantityLabel, QuantityTypeChips, UnitField } from '@/src/quantity';
import { friendlyError } from '@/src/services/errors';
import { addHomeItem, archiveHomeItem, createHome, fetchHomeItems, fetchMonthSpending, HomeItem, markHomeItem, StockStatus, updateHomeItem } from '@/src/services/home';
import { Category, fetchCategories } from '@/src/services/categories';
import { createList, fetchLists, ListWithContext, updateItem } from '@/src/services/lists';
import { GroupSummary } from '@/src/services/groups';
import { watchHome, watchInbox, watchLists } from '@/src/services/realtime';
import { fetchInbox } from '@/src/services/sharing';
import { useSession, useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { useHome } from '@/src/useHome';
import { useLive } from '@/src/useLive';
import { buildSnapshot, updateWidget } from '@/src/widget';
import { Button, Card, Chip, CurrencyPicker, EmptyState, ErrorNotice, Field, Grid, Heading, IconButton, Loading, palette, Screen, SectionLabel, Sheet, styles } from '@/src/ui';
import { timeAgo } from '@/src/activity';

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
  // A full item being marked low or finished: which list it goes on, and how much at what price.
  const [restock, setRestock] = useState<{ item: HomeItem; status: StockStatus } | null>(null);
  const categoryList = useAsync(() => fetchCategories(userId), [userId], { cacheKey: 'categories' });
  // A category created in a sheet is shown (and named on the item) straight away, before the list reloads.
  const [created, setCreated] = useState<Category[]>([]);
  const onCategoryCreated = (category: Category) => { setCreated((all) => [...all, category]); categoryList.reload(); };
  const selection = useListSelection(userId, lists.reload);
  // Changes made offline show straight away and are replaced by server state once they sync.
  const { ops, syncedVersion, submit } = useOffline();
  const { reload: reloadItems } = items; const { reload: reloadLists } = lists;
  useEffect(() => { if (syncedVersion) { reloadItems(); reloadLists(); } }, [syncedVersion, reloadItems, reloadLists]);
  // The home-screen widget shows what this screen shows (offline changes included).
  useEffect(() => {
    if (home && items.data && lists.data) updateWidget(buildSnapshot(userId, home, applyHomeQueue(items.data, ops, home.id), lists.data));
  }, [home, items.data, lists.data, ops, userId]);

  const bell = <IconButton icon="notifications-outline" label="Inbox" badge={inbox.data?.unreadCount} onPress={() => router.push('/inbox')}/>;
  if (home === undefined) return <Screen><Heading title="Home" action={bell}/>{homeError ? <ErrorNotice error={homeError} onRetry={reloadHome}/> : <Loading/>}</Screen>;
  if (home === null) return <Screen><Heading title="Welcome" subtitle="Let's set up your home" action={bell}/><CreateHome onCreated={reloadHome}/></Screen>;

  const canEdit = home.role === 'owner' || home.role === 'partner' || home.role === 'editor';
  const all = applyHomeQueue(items.data ?? [], ops, home.id);
  const needed = all.filter((item) => item.status !== 'in_stock').sort((a, b) => (a.status === b.status ? 0 : a.status === 'out' ? -1 : 1));
  const stocked = all.filter((item) => item.status === 'in_stock');
  // Defaults, your own, and any a housemate used in this home.
  const categories = [...(categoryList.data ?? []), ...created, ...all.map((item) => item.category).filter((category): category is CategoryOption => !!category)]
    .filter((category, index, every) => every.findIndex((other) => other.id === category.id) === index);
  // Shown first in the category picker: the categories this home already uses.
  const inUse = all.map((item) => item.category_id).filter((id): id is string => !!id);
  const row = (item: DisplayHomeItem) => <ItemRow key={item.id} item={item} currencyCode={home.currency_code} canEdit={canEdit} busy={marking === item.id} onMark={(status) => mark(item, status)} onEdit={() => setEditing(item)}/>;
  // Lists with something still to buy; finished lists stay on the To-buy tab.
  const toBuy = (lists.data ?? []).filter((list) => (list.totals?.purchased_count ?? 0) < (list.totals?.item_count ?? 0));

  const mark = async (item: HomeItem, status: StockStatus) => {
    if (item.status === status) return;
    // Running low or out from full: choose the list, category, quantity, and price first. Between low and finished
    // (already on a list) the status just changes.
    if (item.status === 'in_stock' && canEdit) { setNotice(undefined); setRestock({ item, status }); return; }
    setMarking(item.id); setNotice(undefined);
    try {
      const name = item.product?.name ?? 'Item';
      const result = await submit({ kind: 'markHomeItem', listId: homeListId(home.id), label: `Mark ${name} ${statusLabel[status].toLowerCase()}`, itemId: item.id, status },
        () => markHomeItem(item.id, status));
      if (result.queued) {
        setNotice(status === 'in_stock' ? undefined : { text: `Saved on this phone. ${name} goes on your To-buy list when you are back online.` });
        return;
      }
      await Promise.all([items.reload(), lists.reload()]);
    } catch (caught) { setNotice({ text: friendlyError(caught), error: true }); } finally { setMarking(undefined); }
  };

  return <Screen refreshing={items.loading && !!items.data} onRefresh={() => { items.reload(); spending.reload(); inbox.reload(); lists.reload(); }}>
    <Heading title={home.name} subtitle={`${home.memberCount} ${home.memberCount === 1 ? 'person' : 'people'}${canEdit ? '' : ' · view only'}`}
      action={<View style={{ flexDirection: 'row', gap: 8 }}>
        {bell}
        <IconButton icon="people-outline" label="People in this home" onPress={() => router.push({ pathname: '/members', params: { type: 'group', id: home.id, name: home.name } })}/>
        {canEdit && <IconButton icon="add" label="Add item" onPress={() => setAdding(true)}/>}
      </View>}/>
    {items.stale && <Text style={{ color: palette.muted }}>Offline · showing your home as saved {items.savedAt ? timeAgo(items.savedAt) : 'earlier'}.</Text>}
    {features.monthlySpending && <Card style={{ backgroundColor: palette.green, borderColor: palette.green }}>
      <Text style={[styles.sectionLabel, { color: palette.onGreen }]}>SPENT THIS MONTH</Text>
      {(spending.data?.length ? spending.data : [{ currencyCode: home.currency_code, purchased: 0, purchaseCount: 0 }]).map((month) =>
        <Text key={month.currencyCode} style={{ color: palette.white, fontWeight: '800', fontSize: 28, marginTop: 4 }}>{formatCurrency(month.purchased, month.currencyCode)}</Text>)}
      <Text style={{ color: palette.onGreen, marginTop: 4 }}>{needed.length ? `${needed.length} ${needed.length === 1 ? 'thing needs' : 'things need'} buying` : 'Nothing needs buying'}</Text>
    </Card>}
    {notice && <Card style={{ backgroundColor: notice.error ? palette.redPale : palette.pale, borderColor: notice.error ? palette.redPale : palette.pale }}>
      <Text style={{ color: notice.error ? palette.red : palette.ink, fontWeight: '700' }}>{notice.text}</Text>
      {notice.listId && <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push(`/list/${notice.listId}`)} style={{ alignSelf: 'flex-start', marginTop: 6 }}><Text style={{ color: palette.green, fontWeight: '800' }}>Open To-buy list</Text></Pressable>}
    </Card>}
    {toBuy.length > 0 && <View style={{ gap: 8 }}>
      <SectionLabel title="To buy" action={!selection.selecting && <Pressable accessibilityRole="button" accessibilityLabel="Select lists to delete" hitSlop={10} onPress={() => selection.start()}>
        <Text style={{ color: palette.green, fontWeight: '800', fontSize: 13 }}>Select</Text></Pressable>}/>
      {selection.selecting && <SelectionBar selection={selection}/>}
      {/* While selecting, every list is shown so several can be deleted from here. */}
      <Grid>{(selection.selecting ? toBuy : toBuy.slice(0, homeListLimit)).map((list) => <ListCard key={list.id} list={list} showGroup={false} {...selection.cardProps(list)}/>)}</Grid>
      {!selection.selecting && toBuy.length > homeListLimit && <Button label={`View ${toBuy.length - homeListLimit} more ${toBuy.length - homeListLimit === 1 ? 'list' : 'lists'}`} variant="soft" icon="chevron-forward" onPress={() => router.navigate('/lists')}/>}
    </View>}
    {items.error ? <ErrorNotice error={items.error} onRetry={items.reload}/> : !items.data ? <Loading/> : all.length === 0
      ? <EmptyState title="What do you keep at home?" message="Add the things your household buys regularly, like rice, oil, soap, or toothpaste. Mark them when they run low and they go straight onto your To-buy list."
          action={canEdit ? <Button label="Add your first item" icon="add" onPress={() => setAdding(true)}/> : undefined}/>
      : <>
        {/* Side by side on tablets and in landscape. */}
        <Grid gap={16}>
          {needed.length > 0 && <Section title="Needs buying" items={needed} render={row}/>}
          {stocked.length > 0 && <Section title="In stock" items={stocked} render={row}/>}
        </Grid>
      </>}
    <AddItemSheet visible={adding} homeId={home.id} userId={userId} categories={categories} inUse={inUse} onCategoryCreated={onCategoryCreated} onClose={() => setAdding(false)} onAdded={items.reload}/>
    <EditItemSheet item={editing} userId={userId} categories={categories} inUse={inUse} onCategoryCreated={onCategoryCreated} onClose={() => setEditing(null)} onChanged={items.reload}/>
    <RestockSheet restock={restock} home={home} userId={userId} lists={lists.data ?? []} categories={categories} inUse={inUse} onCategoryCreated={onCategoryCreated}
      onClose={() => setRestock(null)} onDone={(text, listId) => { setNotice({ text, listId }); items.reload(); lists.reload(); }}/>
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
  return <View style={{ gap: 8 }}><SectionLabel title={title}/>
    <Card style={{ paddingVertical: 4 }}>{groups.map((group, index) => <View key={group.name}>
      <Text style={{ color: palette.green, fontWeight: '800', fontSize: 12, marginTop: index ? 12 : 8 }}>{group.name}</Text>
      {group.items.map(render)}
    </View>)}</Card></View>;
}

/**
 * Marking a full item low or finished: the list it goes on (one of the home's lists, or a new one), its category, and
 * how much to buy at what price. Quantity and price apply to this trip only; the home keeps its full quantity.
 */
function RestockSheet({ restock, home, userId, lists, categories, inUse, onCategoryCreated, onClose, onDone }: {
  restock: { item: HomeItem; status: StockStatus } | null; home: GroupSummary; userId: string; lists: ListWithContext[]; categories: CategoryOption[]; inUse: string[];
  onCategoryCreated: (category: Category) => void; onClose: () => void; onDone: (notice: string, listId?: string) => void;
}) {
  const { submit } = useOffline();
  const code = home.currency_code;
  // Only owners and partners may add lists to a home.
  const canCreateList = home.role === 'owner' || home.role === 'partner';
  // The oldest list first, as the server picks it by default.
  const choices = [...lists].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [listId, setListId] = useState<string | null>(null); const [newList, setNewList] = useState('');
  const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState(''); const [isBulk, setIsBulk] = useState(false); const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const item = restock?.item;
  useEffect(() => {
    if (!item) return;
    setListId(choices[0]?.id ?? null); setNewList('');
    setQuantity(String(Number(item.usual_quantity))); setUnit(item.unit ?? ''); setIsBulk(item.is_bulk);
    setPrice(item.lastPrice !== null ? amountInputValue(item.lastPrice, code) : ''); setCategoryId(item.category_id); setError(undefined);
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when a new item opens the sheet
  const creating = listId === null && canCreateList;

  const confirm = async () => {
    if (!item || !restock) return;
    const name = item.product?.name ?? 'Item';
    const count = parseAmount(quantity.replace(',', '.'), 'USD');
    if (count === null || count <= 0) return setError('Enter how many to buy.');
    const amount = price.trim() ? parseAmount(price, code) : null;
    if (price.trim() && amount === null) return setError(`Enter a valid price in ${code}.`);
    if (creating && !newList.trim()) return setError('Give the new list a name.');
    setBusy(true); setError(undefined);
    try {
      const targetId = creating ? (await createList({ ownerId: userId, name: newList.trim(), currencyCode: code, groupId: home.id })).id : listId ?? undefined;
      const targetName = creating ? newList.trim() : choices.find((list) => list.id === targetId)?.name ?? 'your list';
      // The category is the home item's; its list entries follow it (also the one created next).
      if (categoryId && categoryId !== item.category_id) {
        const changes = { categoryId };
        await submit({ kind: 'updateHomeItem', listId: homeListId(home.id), label: `Edit ${name}`, itemId: item.id, changes, categoryName: categories.find((category) => category.id === categoryId)?.name ?? null },
          () => updateHomeItem(item.id, changes));
      }
      const result = await submit({ kind: 'markHomeItem', listId: homeListId(home.id), label: `Mark ${name} ${statusLabel[restock.status].toLowerCase()}`, itemId: item.id, status: restock.status, targetListId: targetId },
        () => markHomeItem(item.id, restock.status, targetId));
      if (result.queued) { onDone(`Saved on this phone. ${name} goes on ${targetName} when you are back online.`); onClose(); return; }
      const entry = result.value;
      if (entry?.status === 'pending') {
        const changes = {
          ...(count !== Number(entry.quantity) ? { quantity: count } : {}), ...((unit.trim() || null) !== entry.unit ? { unit: unit.trim() || null } : {}),
          ...(isBulk !== entry.is_bulk ? { isBulk } : {}), ...(amount !== null && amount !== entry.budgeted_unit_price ? { budgetedUnitPrice: amount } : {})
        };
        if (Object.keys(changes).length) await submit({ kind: 'updateItem', listId: entry.list_id, label: `Restock ${name}`, itemId: entry.id, changes }, () => updateItem(entry.id, changes));
        const already = entry.list_id !== targetId && targetId !== undefined;
        const shownPrice = amount ?? entry.budgeted_unit_price;
        onDone(already ? `${name} was already on ${lists.find((list) => list.id === entry.list_id)?.name ?? 'another list'}; it was updated there.`
          : `${name} is on ${targetName}${shownPrice > 0 ? ` at ${formatCurrency(shownPrice, code)} ${priceUnit(isBulk, unit.trim())}` : ''}.`, entry.list_id);
      } else onDone(`${name} is marked ${statusLabel[restock.status].toLowerCase()}.`);
      onClose();
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };

  return <Sheet visible={!!restock} title={`${item?.product?.name ?? 'Item'} · ${restock ? statusLabel[restock.status] : ''}`} subtitle="Add it to a list for the next shopping trip." onClose={onClose}>
    {(choices.length > 0 || canCreateList) && <View style={styles.field}>
      <Text style={styles.label}>Add to list</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {choices.map((list) => <Chip key={list.id} label={list.name} selected={listId === list.id} onPress={() => setListId(list.id)}/>)}
        {canCreateList && <Chip label="+ New list" selected={creating} onPress={() => setListId(null)}/>}
      </ScrollView>
      {creating && <Field label="New list name" value={newList} onChangeText={setNewList} hint="e.g. Market Saturday" autoCapitalize="words"/>}
    </View>}
    <CategoryPicker categories={categories} inUse={inUse} value={categoryId ?? generalCategory(categories)?.id ?? null} onChange={setCategoryId} userId={userId} onCreated={onCategoryCreated}/>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 96 }}><Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/></View>
      <View style={{ flex: 1 }}><Field label={`Price ${priceUnit(isBulk, unit.trim())}`} prefix={code} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint="0"
        note={item && item.lastPrice !== null ? `Last paid ${formatCurrency(item.lastPrice, code)}` : 'No price yet'}/></View>
    </View>
    <UnitField value={unit} onChange={setUnit}/>
    <QuantityTypeChips isBulk={isBulk} onChange={setIsBulk}/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label={creating ? 'Create list and add' : 'Add to list'} icon="cart-outline" onPress={confirm} loading={busy}/>
  </Sheet>;
}

function ItemRow({ item, currencyCode, canEdit, busy, onMark, onEdit }: { item: DisplayHomeItem; currencyCode: string; canEdit: boolean; busy: boolean; onMark: (status: StockStatus) => void; onEdit: () => void }) {
  return <View style={{ paddingVertical: 12, gap: 8, opacity: busy ? 0.5 : 1 }}>
    <Pressable disabled={!canEdit} onPress={onEdit} accessibilityRole={canEdit ? 'button' : undefined} accessibilityHint={canEdit ? 'Edit this item' : undefined}>
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
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: selected ? tone : palette.line, backgroundColor: selected ? tone : palette.surface }}>
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

function AddItemSheet({ visible, homeId, userId, categories, inUse, onCategoryCreated, onClose, onAdded }: {
  visible: boolean; homeId: string; userId: string; categories: CategoryOption[]; inUse: string[]; onCategoryCreated: (category: Category) => void; onClose: () => void; onAdded: () => void;
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
    <CategoryPicker categories={categories} inUse={inUse} value={selected} onChange={setCategoryId} userId={userId} onCreated={onCategoryCreated}/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Add item" icon="add" onPress={add} loading={busy}/>
  </Sheet>;
}

function EditItemSheet({ item, userId, categories, inUse, onCategoryCreated, onClose, onChanged }: {
  item: HomeItem | null; userId: string; categories: CategoryOption[]; inUse: string[]; onCategoryCreated: (category: Category) => void; onClose: () => void; onChanged: () => void;
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
  const confirmRemove = () => item && Alert.alert(`Remove ${item.product?.name ?? 'this item'}?`, 'It is taken out of your home for everyone. Past purchases are kept.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => run(() => submit({ kind: 'archiveHomeItem', listId: homeListId(item.group_id), label: `Remove ${item.product?.name ?? 'item'}`, itemId: item.id }, () => archiveHomeItem(item.id))) }
  ]);
  return <Sheet visible={!!item} title={item?.product?.name ?? 'Item'} subtitle="Edit item" onClose={onClose}>
    <Field label="Full quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" note="How many you buy to fill up. Updated each time you buy it."/>
    <UnitField value={unit} onChange={setUnit}/>
    <QuantityTypeChips isBulk={isBulk} onChange={setIsBulk}/>
    <CategoryPicker categories={categories} inUse={inUse} value={categoryId ?? generalCategory(categories)?.id ?? null} onChange={setCategoryId} userId={userId} onCreated={onCategoryCreated}/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Save" onPress={save} loading={busy}/>
    <Button label="Remove from home" variant="danger" icon="trash-outline" disabled={busy} onPress={confirmRemove}/>
  </Sheet>;
}
