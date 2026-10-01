import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { amountInputValue, formatCurrency, parseAmount } from '@/src/currency';
import { Category, fetchCategories } from '@/src/services/categories';
import { friendlyError } from '@/src/services/errors';
import {
  addItem, archiveList, fetchList, fetchListItems, fetchListRole, findProduct, getPriceSuggestion, ListItem, ListWithContext, PriceSuggestion, removeItem, searchProducts, updateItem, updateList
} from '@/src/services/lists';
import { Purchase, purchaseListItem } from '@/src/services/purchases';
import { useUserId } from '@/src/session';
import { watchList } from '@/src/services/realtime';
import { useAsync } from '@/src/useAsync';
import { useLive } from '@/src/useLive';
import { BackHeader, Button, Card, Chip, CurrencyPicker, EmptyState, ErrorNotice, Field, IconButton, Loading, palette, Screen, Sheet, styles } from '@/src/ui';

const parseQuantity = (input: string) => { const value = Number(input.replace(',', '.')); return Number.isFinite(value) && value > 0 ? value : null; };
const quantityLabel = (item: ListItem) => `${Number(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`;

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const state = useAsync(async () => {
    const [list, items, role, categories] = await Promise.all([fetchList(id), fetchListItems(id), fetchListRole(id), fetchCategories(userId)]);
    return { list, items, role, categories };
  }, [id, userId]);
  // Collaborators' changes (new items, purchases, budget edits, role changes) appear without refreshing.
  useLive((onChange) => watchList(id, onChange), state.reload, [id]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [buying, setBuying] = useState<ListItem | null>(null);
  const [configuring, setConfiguring] = useState(false);

  if (state.error && !state.data) return <Screen><BackHeader title="Shopping list"/><ErrorNotice error={state.error} onRetry={state.reload}/></Screen>;
  if (!state.data) return <Screen><BackHeader title="Shopping list"/><Loading/></Screen>;
  const { list, items, role, categories } = state.data;
  const code = list.currency_code;
  const canEdit = role === 'owner' || role === 'partner' || role === 'editor';
  const canPurchase = role === 'owner' || role === 'partner';
  const totals = list.totals;
  const pending = items.filter((item) => item.status === 'pending');
  const purchased = items.filter((item) => item.status === 'purchased');
  const saved = (totals?.purchased_budgeted_total ?? 0) - (totals?.purchased_total ?? 0);
  // Group what is left to buy by category, like aisles in a store. Items without a category use the list's.
  const sections = pending.reduce<{ name: string; items: ListItem[] }[]>((all, item) => {
    const name = item.category?.name ?? list.category?.name ?? 'Uncategorized';
    const section = all.find((entry) => entry.name === name);
    if (section) section.items.push(item); else all.push({ name, items: [item] });
    return all;
  }, []);

  const confirmArchive = () => Alert.alert('Archive list?', 'The list is hidden for everyone. Its purchase history and reports are kept.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive', style: 'destructive', onPress: () => archiveList(list.id).then(() => router.back()).catch((caught) => Alert.alert('Could not archive', friendlyError(caught))) }
  ]);

  return <Screen refreshing={state.loading} onRefresh={state.reload}>
    <BackHeader title={list.name} subtitle={[list.group?.name, list.category?.name, code, role && `You: ${role}`].filter(Boolean).join(' · ')}
      action={<View style={{ flexDirection: 'row', gap: 8 }}>
        {canEdit && <IconButton icon="options-outline" label="List settings" onPress={() => setConfiguring(true)}/>}
        {role === 'owner' && <IconButton icon="person-add-outline" label="Share list" onPress={() => router.push({ pathname: '/members', params: { type: 'list', id: list.id, name: list.name } })}/>}
      </View>}/>
    {!!state.error && <ErrorNotice error={state.error} onRetry={state.reload}/>}
    <Card style={{ backgroundColor: palette.pale }}>
      <Text style={{ color: palette.green, fontWeight: '800', fontSize: 12 }}>LIST BUDGET · {code}</Text>
      <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 26, marginTop: 4 }}>{formatCurrency(totals?.budgeted_total ?? 0, code)}</Text>
      <Text style={{ color: palette.muted, marginTop: 5 }}>Paid {formatCurrency(totals?.purchased_total ?? 0, code)} · {totals?.purchased_count ?? 0}/{totals?.item_count ?? 0} items</Text>
      {(totals?.purchased_count ?? 0) > 0 && <Text style={{ color: saved >= 0 ? palette.green : palette.red, marginTop: 4, fontWeight: '700' }}>{saved >= 0 ? `Saved ${formatCurrency(saved, code)}` : `Over budget by ${formatCurrency(-saved, code)}`} on purchased items</Text>}
    </Card>
    {role === 'viewer' && <Text style={{ color: palette.muted }}>You can view this list. Ask the owner for Editor or Partner access to make changes.</Text>}
    {role === 'editor' && <Text style={{ color: palette.muted }}>Editors can add items and budgets. Partners and the owner confirm purchases.</Text>}
    {items.length === 0 && <EmptyState title="No items yet" message={canEdit ? 'Add what you need and set a budget for each item.' : 'Items added to this list will appear here.'}/>}
    {sections.map((section) => <View key={section.name} style={{ gap: 10 }}>
      {sections.length > 1 && <Text style={{ color: palette.muted, fontWeight: '800', fontSize: 13 }}>{section.name.toUpperCase()}</Text>}
      {section.items.map((item) => <Card key={item.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <Pressable disabled={!canEdit} onPress={() => setEditing(item)} style={{ flex: 1 }}><Text style={{ color: palette.ink, fontSize: 16, fontWeight: '800' }}>{item.product?.name ?? 'Item'}</Text>
          <Text style={{ color: palette.muted, marginTop: 5 }}>{quantityLabel(item)} × {formatCurrency(item.budgeted_unit_price, code)} = {formatCurrency(item.budgeted_total ?? 0, code)}</Text></Pressable>
        {canPurchase && <Pressable accessibilityLabel={`Purchase ${item.product?.name}`} onPress={() => setBuying(item)} style={{ backgroundColor: palette.pale, padding: 12, borderRadius: 12 }}><Ionicons name="checkmark" color={palette.green} size={22}/></Pressable>}
      </View></Card>)}
    </View>)}
    {canEdit && list.archived_at === null && <Button label="Add item" icon="add" onPress={() => setAdding(true)}/>}
    {purchased.length > 0 && <View style={{ gap: 10 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16, marginTop: 6 }}>Purchased</Text>
      {purchased.map((item) => <Card key={item.id} style={{ opacity: 0.85 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ flex: 1 }}>
        <Text style={{ color: palette.ink, fontSize: 16, fontWeight: '800', textDecorationLine: 'line-through' }}>{item.product?.name ?? 'Item'}</Text>
        <Text style={{ color: palette.muted, marginTop: 5 }}>Budget {formatCurrency(item.budgeted_total ?? 0, code)} · {item.purchased_at ? new Date(item.purchased_at).toLocaleDateString() : ''}</Text></View>
        <Ionicons name="checkmark-circle" color={palette.green} size={24}/></View></Card>)}</View>}
    {role === 'owner' && <Button label="Archive list" variant="danger" icon="archive-outline" onPress={confirmArchive}/>}

    <AddItemSheet visible={adding} onClose={() => setAdding(false)} list={list} categories={categories} userId={userId} onAdded={state.reload}/>
    <EditItemSheet item={editing} list={list} categories={categories} onClose={() => setEditing(null)} onChanged={state.reload}/>
    <PurchaseSheet item={buying} currencyCode={code} onClose={() => setBuying(null)} onPurchased={state.reload}/>
    <ListSettingsSheet visible={configuring} list={list} categories={categories} isOwner={role === 'owner'} hasItems={items.length > 0} onClose={() => setConfiguring(false)} onChanged={state.reload}/>
  </Screen>;
}

/** Horizontal category chips. `null` means "use the list's category". */
type CategoryOption = Pick<Category, 'id' | 'name'>;

function CategoryChips({ categories, value, onChange, defaultLabel }: { categories: CategoryOption[]; value: string | null; onChange: (id: string | null) => void; defaultLabel: string }) {
  return <View style={styles.field}><Text style={styles.label}>Category</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      <Chip label={defaultLabel} selected={value === null} onPress={() => onChange(null)}/>
      {categories.map((category) => <Chip key={category.id} label={category.name} selected={value === category.id} onPress={() => onChange(category.id)}/>)}
    </ScrollView></View>;
}

function AddItemSheet({ visible, onClose, list, categories, userId, onAdded }: { visible: boolean; onClose: () => void; list: ListWithContext; categories: Category[]; userId: string; onAdded: () => void }) {
  const currencyCode = list.currency_code;
  const [name, setName] = useState(''); const [productId, setProductId] = useState<string>(); const [quantity, setQuantity] = useState('1'); const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (!visible) { setName(''); setProductId(undefined); setQuantity('1'); setPrice(''); setCategoryId(null); setMatches([]); setSuggestion(null); setError(undefined); } }, [visible]);
  // Product suggestions while typing; hidden once a suggestion is chosen.
  useEffect(() => {
    if (productId || name.trim().length < 2) { setMatches([]); return; }
    let active = true;
    const timer = setTimeout(() => { searchProducts(name, 5).then((rows) => { if (active) setMatches(rows); }).catch(() => undefined); }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [name, productId]);
  // Price memory for the chosen or exactly-named product.
  useEffect(() => {
    setSuggestion(null);
    if (name.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const id = productId ?? (await findProduct(name, userId))?.id;
        const next = id ? await getPriceSuggestion(id, currencyCode) : null;
        if (active) setSuggestion(next);
      } catch { /* suggestions are optional */ }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [name, productId, currencyCode, userId]);

  const save = async () => {
    const amount = parseAmount(price, currencyCode); const count = parseQuantity(quantity);
    if (!name.trim()) return setError('Enter an item name.');
    if (count === null) return setError('Quantity must be greater than zero.');
    if (amount === null) return setError(`Enter a valid unit budget in ${currencyCode}.`);
    setBusy(true); setError(undefined);
    try { await addItem(userId, { listId: list.id, productName: name, productId, quantity: count, budgetedUnitPrice: amount, categoryId }); onAdded(); onClose(); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Sheet visible={visible} title="Add item" onClose={onClose}>
    <Field label="Item name" value={name} onChangeText={(text) => { setName(text); setProductId(undefined); }} hint="e.g. Rice"/>
    {matches.length > 0 && <Card style={{ paddingVertical: 4 }}>{matches.map((match, index) => <Pressable key={match.id} accessibilityRole="button" onPress={() => { setName(match.name); setProductId(match.id); setMatches([]); }}
      style={{ paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="time-outline" size={16} color={palette.muted}/><Text style={{ color: palette.ink, fontWeight: '600' }}>{match.name}</Text></Pressable>)}</Card>}
    {suggestion && (suggestion.suggestedUnitPrice !== null
      ? <Card style={{ backgroundColor: palette.pale, borderColor: palette.pale }}><Text style={{ color: palette.green, fontWeight: '800' }}>Last paid {formatCurrency(suggestion.suggestedUnitPrice, currencyCode)} per unit</Text>
          <Text onPress={() => setPrice(amountInputValue(suggestion.suggestedUnitPrice ?? 0, currencyCode))} style={{ color: palette.green, fontWeight: '800', marginTop: 8 }}>Use this price</Text></Card>
      : <Card style={{ backgroundColor: palette.pale, borderColor: palette.pale }}><Text style={{ color: palette.ink, fontWeight: '800' }}>Last paid {formatCurrency(suggestion.latestUnitPrice, suggestion.latestCurrencyCode)} ({suggestion.latestCurrencyCode})</Text>
          <Text style={{ color: palette.muted, marginTop: 4 }}>This list uses {currencyCode}. Enter a budget in {currencyCode}; Grocefy does not convert currencies.</Text></Card>)}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 96 }}><Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/></View>
      <View style={{ flex: 1 }}><Field label="Unit budget" prefix={currencyCode} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint="0"/></View>
    </View>
    <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} defaultLabel={list.category ? `Same as list (${list.category.name})` : 'None'}/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Add to list" onPress={save} loading={busy}/>
  </Sheet>;
}

function EditItemSheet({ item, list, categories, onClose, onChanged }: { item: ListItem | null; list: ListWithContext; categories: Category[]; onClose: () => void; onChanged: () => void }) {
  const currencyCode = list.currency_code;
  const [quantity, setQuantity] = useState(''); const [price, setPrice] = useState(''); const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (item) { setQuantity(String(Number(item.quantity))); setPrice(amountInputValue(item.budgeted_unit_price, currencyCode)); setCategoryId(item.category_id); setError(undefined); } }, [item, currencyCode]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(undefined); try { await action(); onChanged(); onClose(); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); } };
  const save = () => {
    const amount = parseAmount(price, currencyCode); const count = parseQuantity(quantity);
    if (!item || count === null || amount === null) return setError(`Enter a quantity and a valid unit budget in ${currencyCode}.`);
    run(() => updateItem(item.id, { quantity: count, budgetedUnitPrice: amount, categoryId }));
  };
  // A collaborator's custom category stays selectable on items that already use it.
  const choices: CategoryOption[] = item?.category && !categories.some((category) => category.id === item.category?.id) ? [...categories, item.category] : categories;
  return <Sheet visible={!!item} title={item?.product?.name ?? 'Item'} subtitle="Edit item" onClose={onClose}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 96 }}><Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/></View>
      <View style={{ flex: 1 }}><Field label="Unit budget" prefix={currencyCode} value={price} onChangeText={setPrice} keyboardType="decimal-pad"/></View>
    </View>
    <CategoryChips categories={choices} value={categoryId} onChange={setCategoryId} defaultLabel={list.category ? `Same as list (${list.category.name})` : 'None'}/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Save" onPress={save} loading={busy}/>
    <Button label="Remove from list" variant="danger" icon="trash-outline" disabled={busy} onPress={() => item && run(() => removeItem(item.id))}/>
  </Sheet>;
}

function ListSettingsSheet({ visible, list, categories, isOwner, hasItems, onClose, onChanged }: { visible: boolean; list: ListWithContext; categories: Category[]; isOwner: boolean; hasItems: boolean; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(list.name); const [categoryId, setCategoryId] = useState<string | null>(list.category_id); const [currency, setCurrency] = useState(list.currency_code);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (visible) { setName(list.name); setCategoryId(list.category_id); setCurrency(list.currency_code); setError(undefined); } }, [visible, list]);
  const currencyEditable = isOwner && !hasItems;
  const save = async () => {
    if (!name.trim()) return setError('The list needs a name.');
    setBusy(true); setError(undefined);
    try {
      await updateList(list.id, { name: name.trim(), categoryId, ...(currencyEditable && currency !== list.currency_code ? { currencyCode: currency } : {}) });
      onChanged(); onClose();
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  const choices: CategoryOption[] = list.category && !categories.some((category) => category.id === list.category?.id) ? [...categories, list.category] : categories;
  return <Sheet visible={visible} title="List settings" onClose={onClose}>
    <Field label="List name" value={name} onChangeText={setName}/>
    <CategoryChips categories={choices} value={categoryId} onChange={setCategoryId} defaultLabel="None"/>
    <View style={styles.field}><Text style={styles.label}>Currency</Text><CurrencyPicker value={currency} onChange={setCurrency} disabled={!currencyEditable}/>
      <Text style={{ color: palette.muted, fontSize: 12 }}>{currencyEditable ? 'Can change until the first item is added.' : hasItems ? 'Locked: this list already has items priced in this currency.' : 'Only the owner can change the currency.'}</Text></View>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Save" onPress={save} loading={busy}/>
  </Sheet>;
}

function PurchaseSheet({ item, currencyCode, onClose, onPurchased }: { item: ListItem | null; currencyCode: string; onClose: () => void; onPurchased: () => void }) {
  const [useBudget, setUseBudget] = useState(true); const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [result, setResult] = useState<Purchase | null>(null);
  useEffect(() => { if (item) { setUseBudget(true); setActual(''); setError(undefined); setResult(null); } }, [item]);
  const budget = item?.budgeted_total ?? 0;
  const confirm = async () => {
    if (!item) return;
    const amount = useBudget ? null : parseAmount(actual, currencyCode);
    if (!useBudget && amount === null) return setError(`Enter the amount you paid in ${currencyCode}.`);
    setBusy(true); setError(undefined);
    try { setResult(await purchaseListItem(item.id, amount === null ? { useBudgetedAmount: true } : { actualAmount: amount })); onPurchased(); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  if (result) {
    const difference = result.budgeted_amount - result.purchased_amount;
    return <Sheet visible={!!item} title={`✓ ${item?.product?.name ?? 'Item'} purchased`} onClose={onClose}>
      <Card><Text style={{ color: palette.muted }}>Paid</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 24, marginTop: 4 }}>{formatCurrency(result.purchased_amount, result.currency_code)}</Text>
        <Text style={{ color: difference >= 0 ? palette.green : palette.red, fontWeight: '700', marginTop: 8 }}>{difference >= 0 ? `Saved ${formatCurrency(difference, result.currency_code)}` : `Over budget by ${formatCurrency(-difference, result.currency_code)}`}</Text></Card>
      <Button label="Done" onPress={onClose}/>
    </Sheet>;
  }
  return <Sheet visible={!!item} title="Confirm purchase" subtitle={item ? `${item.product?.name ?? 'Item'} · ${quantityLabel(item)}` : undefined} onClose={onClose}>
    <Text style={{ color: palette.muted }}>Budgeted: <Text style={{ color: palette.ink, fontWeight: '800' }}>{formatCurrency(budget, currencyCode)}</Text></Text>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Chip label={`Paid the budget (${formatCurrency(budget, currencyCode)})`} selected={useBudget} onPress={() => setUseBudget(true)}/>
      <Chip label="Paid a different amount" selected={!useBudget} onPress={() => setUseBudget(false)}/>
    </View>
    {!useBudget && <Field label="Actual amount paid" prefix={currencyCode} value={actual} onChangeText={setActual} keyboardType="decimal-pad" hint={amountInputValue(budget, currencyCode)}/>}
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Confirm purchase" onPress={confirm} loading={busy}/>
  </Sheet>;
}
