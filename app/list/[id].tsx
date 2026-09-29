import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { amountInputValue, formatCurrency, parseAmount } from '@/src/currency';
import { friendlyError } from '@/src/services/errors';
import { addItem, archiveList, fetchList, fetchListItems, fetchListRole, findProduct, getPriceSuggestion, ListItem, PriceSuggestion, removeItem, updateItemBudget } from '@/src/services/lists';
import { Purchase, purchaseListItem } from '@/src/services/purchases';
import { useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { BackHeader, Button, Card, Chip, EmptyState, ErrorNotice, Field, IconButton, Loading, palette, Screen, Sheet } from '@/src/ui';

const parseQuantity = (input: string) => { const value = Number(input.replace(',', '.')); return Number.isFinite(value) && value > 0 ? value : null; };
const quantityLabel = (item: ListItem) => `${Number(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`;

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const state = useAsync(async () => {
    const [list, items, role] = await Promise.all([fetchList(id), fetchListItems(id), fetchListRole(id)]);
    return { list, items, role };
  }, [id]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [buying, setBuying] = useState<ListItem | null>(null);

  if (state.error && !state.data) return <Screen><BackHeader title="Shopping list"/><ErrorNotice error={state.error} onRetry={state.reload}/></Screen>;
  if (!state.data) return <Screen><BackHeader title="Shopping list"/><Loading/></Screen>;
  const { list, items, role } = state.data;
  const code = list.currency_code;
  const canEdit = role === 'owner' || role === 'partner' || role === 'editor';
  const canPurchase = role === 'owner' || role === 'partner';
  const totals = list.totals;
  const pending = items.filter((item) => item.status === 'pending');
  const purchased = items.filter((item) => item.status === 'purchased');
  const saved = (totals?.purchased_budgeted_total ?? 0) - (totals?.purchased_total ?? 0);

  const confirmArchive = () => Alert.alert('Archive list?', 'The list is hidden for everyone. Its purchase history and reports are kept.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive', style: 'destructive', onPress: () => archiveList(list.id).then(() => router.back()).catch((caught) => Alert.alert('Could not archive', friendlyError(caught))) }
  ]);

  return <Screen refreshing={state.loading} onRefresh={state.reload}>
    <BackHeader title={list.name} subtitle={[list.group?.name, list.category?.name, code, role && `You: ${role}`].filter(Boolean).join(' · ')}
      action={role === 'owner' ? <IconButton icon="person-add-outline" label="Share list" onPress={() => router.push({ pathname: '/members', params: { type: 'list', id: list.id, name: list.name } })}/> : undefined}/>
    <Card style={{ backgroundColor: palette.pale }}>
      <Text style={{ color: palette.green, fontWeight: '800', fontSize: 12 }}>LIST BUDGET · {code}</Text>
      <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 26, marginTop: 4 }}>{formatCurrency(totals?.budgeted_total ?? 0, code)}</Text>
      <Text style={{ color: palette.muted, marginTop: 5 }}>Paid {formatCurrency(totals?.purchased_total ?? 0, code)} · {totals?.purchased_count ?? 0}/{totals?.item_count ?? 0} items</Text>
      {(totals?.purchased_count ?? 0) > 0 && <Text style={{ color: saved >= 0 ? palette.green : palette.red, marginTop: 4, fontWeight: '700' }}>{saved >= 0 ? `Saved ${formatCurrency(saved, code)}` : `Over budget by ${formatCurrency(-saved, code)}`} on purchased items</Text>}
    </Card>
    {role === 'viewer' && <Text style={{ color: palette.muted }}>You can view this list. Ask the owner for Editor or Partner access to make changes.</Text>}
    {role === 'editor' && <Text style={{ color: palette.muted }}>Editors can add items and budgets. Partners and the owner confirm purchases.</Text>}
    {items.length === 0 && <EmptyState title="No items yet" message={canEdit ? 'Add what you need and set a budget for each item.' : 'Items added to this list will appear here.'}/>}
    <View style={{ gap: 10 }}>{pending.map((item) => <Card key={item.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <Pressable disabled={!canEdit} onPress={() => setEditing(item)} style={{ flex: 1 }}><Text style={{ color: palette.ink, fontSize: 16, fontWeight: '800' }}>{item.product?.name ?? 'Item'}</Text>
        <Text style={{ color: palette.muted, marginTop: 5 }}>{quantityLabel(item)} × {formatCurrency(item.budgeted_unit_price, code)} = {formatCurrency(item.budgeted_total ?? 0, code)}</Text></Pressable>
      {canPurchase && <Pressable accessibilityLabel={`Purchase ${item.product?.name}`} onPress={() => setBuying(item)} style={{ backgroundColor: palette.pale, padding: 12, borderRadius: 12 }}><Ionicons name="checkmark" color={palette.green} size={22}/></Pressable>}
    </View></Card>)}</View>
    {canEdit && list.archived_at === null && <Button label="Add item" icon="add" onPress={() => setAdding(true)}/>}
    {purchased.length > 0 && <View style={{ gap: 10 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16, marginTop: 6 }}>Purchased</Text>
      {purchased.map((item) => <Card key={item.id} style={{ opacity: 0.85 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ flex: 1 }}>
        <Text style={{ color: palette.ink, fontSize: 16, fontWeight: '800', textDecorationLine: 'line-through' }}>{item.product?.name ?? 'Item'}</Text>
        <Text style={{ color: palette.muted, marginTop: 5 }}>Budget {formatCurrency(item.budgeted_total ?? 0, code)} · {item.purchased_at ? new Date(item.purchased_at).toLocaleDateString() : ''}</Text></View>
        <Ionicons name="checkmark-circle" color={palette.green} size={24}/></View></Card>)}</View>}
    {role === 'owner' && <Button label="Archive list" variant="danger" icon="archive-outline" onPress={confirmArchive}/>}

    <AddItemSheet visible={adding} onClose={() => setAdding(false)} listId={list.id} currencyCode={code} userId={userId} onAdded={state.reload}/>
    <EditItemSheet item={editing} currencyCode={code} onClose={() => setEditing(null)} onChanged={state.reload}/>
    <PurchaseSheet item={buying} currencyCode={code} onClose={() => setBuying(null)} onPurchased={state.reload}/>
  </Screen>;
}

function AddItemSheet({ visible, onClose, listId, currencyCode, userId, onAdded }: { visible: boolean; onClose: () => void; listId: string; currencyCode: string; userId: string; onAdded: () => void }) {
  const [name, setName] = useState(''); const [quantity, setQuantity] = useState('1'); const [price, setPrice] = useState('');
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (!visible) { setName(''); setQuantity('1'); setPrice(''); setSuggestion(null); setError(undefined); } }, [visible]);
  // Price memory: look up the product after the user pauses typing.
  useEffect(() => {
    setSuggestion(null);
    if (name.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(async () => {
      try { const product = await findProduct(name, userId); const next = product ? await getPriceSuggestion(product.id, currencyCode) : null; if (active) setSuggestion(next); } catch { /* suggestions are optional */ }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [name, currencyCode, userId]);

  const save = async () => {
    const amount = parseAmount(price, currencyCode); const count = parseQuantity(quantity);
    if (!name.trim()) return setError('Enter an item name.');
    if (count === null) return setError('Quantity must be greater than zero.');
    if (amount === null) return setError(`Enter a valid unit budget in ${currencyCode}.`);
    setBusy(true); setError(undefined);
    try { await addItem(userId, { listId, productName: name, quantity: count, budgetedUnitPrice: amount }); onAdded(); onClose(); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Sheet visible={visible} title="Add item" onClose={onClose}>
    <Field label="Item name" value={name} onChangeText={setName} hint="e.g. Rice"/>
    {suggestion && (suggestion.suggestedUnitPrice !== null
      ? <Card style={{ backgroundColor: palette.pale, borderColor: palette.pale }}><Text style={{ color: palette.green, fontWeight: '800' }}>Last paid {formatCurrency(suggestion.suggestedUnitPrice, currencyCode)} per unit</Text>
          <Text onPress={() => setPrice(amountInputValue(suggestion.suggestedUnitPrice ?? 0, currencyCode))} style={{ color: palette.green, fontWeight: '800', marginTop: 8 }}>Use this price</Text></Card>
      : <Card style={{ backgroundColor: palette.pale, borderColor: palette.pale }}><Text style={{ color: palette.ink, fontWeight: '800' }}>Last paid {formatCurrency(suggestion.latestUnitPrice, suggestion.latestCurrencyCode)} ({suggestion.latestCurrencyCode})</Text>
          <Text style={{ color: palette.muted, marginTop: 4 }}>This list uses {currencyCode}. Enter a budget in {currencyCode}; Grocefy does not convert currencies.</Text></Card>)}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 96 }}><Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/></View>
      <View style={{ flex: 1 }}><Field label="Unit budget" prefix={currencyCode} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint="0"/></View>
    </View>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Add to list" onPress={save} loading={busy}/>
  </Sheet>;
}

function EditItemSheet({ item, currencyCode, onClose, onChanged }: { item: ListItem | null; currencyCode: string; onClose: () => void; onChanged: () => void }) {
  const [quantity, setQuantity] = useState(''); const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (item) { setQuantity(String(Number(item.quantity))); setPrice(amountInputValue(item.budgeted_unit_price, currencyCode)); setError(undefined); } }, [item, currencyCode]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(undefined); try { await action(); onChanged(); onClose(); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); } };
  const save = () => {
    const amount = parseAmount(price, currencyCode); const count = parseQuantity(quantity);
    if (!item || count === null || amount === null) return setError(`Enter a quantity and a valid unit budget in ${currencyCode}.`);
    run(() => updateItemBudget(item.id, amount, count));
  };
  return <Sheet visible={!!item} title={item?.product?.name ?? 'Item'} subtitle="Edit budget" onClose={onClose}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 96 }}><Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad"/></View>
      <View style={{ flex: 1 }}><Field label="Unit budget" prefix={currencyCode} value={price} onChangeText={setPrice} keyboardType="decimal-pad"/></View>
    </View>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Save" onPress={save} loading={busy}/>
    <Button label="Remove from list" variant="danger" icon="trash-outline" disabled={busy} onPress={() => item && run(() => removeItem(item.id))}/>
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
