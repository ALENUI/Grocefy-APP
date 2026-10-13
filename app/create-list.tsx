import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { features } from '@/src/features';
import { fetchCategories } from '@/src/services/categories';
import { friendlyError } from '@/src/services/errors';
import { fetchGroups } from '@/src/services/groups';
import { createList } from '@/src/services/lists';
import { useSession, useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { useHome } from '@/src/useHome';
import { BackHeader, Button, Chip, CurrencyPicker, Field, palette, Screen, styles } from '@/src/ui';

/** New shopping list. In the simple home app it belongs to the current home and uses the home's currency. */
export default function CreateList() {
  const userId = useUserId();
  const { defaultCurrency } = useSession();
  const { home } = useHome();
  const { groupId: initialGroup } = useLocalSearchParams<{ groupId?: string }>();
  const categories = useAsync(async () => (features.customCategories ? fetchCategories(userId) : []), [userId]);
  // Lists can be added to groups the user owns or partners in.
  const groups = useAsync(async () => (features.multipleHomes ? (await fetchGroups(userId)).filter((group) => group.role === 'owner' || group.role === 'partner') : []), [userId]);
  const [name, setName] = useState(''); const [categoryId, setCategoryId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(initialGroup ?? null); const [currency, setCurrency] = useState(defaultCurrency);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { setCurrency(defaultCurrency); }, [defaultCurrency]);
  // One home: the list always goes in it, priced in the home's currency.
  const targetGroup = features.multipleHomes ? groupId : groupId ?? home?.id ?? null;
  const targetCurrency = features.listCurrency ? currency : home?.currency_code ?? currency;

  const create = async () => {
    if (!name.trim()) return setError('Give this list a name, e.g. Weekly groceries.');
    if (!features.multipleHomes && !targetGroup) return setError('Set up your home on the Home tab first.');
    setBusy(true); setError(undefined);
    try { const list = await createList({ ownerId: userId, name: name.trim(), currencyCode: targetCurrency, groupId: targetGroup, categoryId }); router.replace(`/list/${list.id}`); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Screen><BackHeader title="New list" subtitle={features.listCurrency ? 'Every price in this list uses its selected currency.' : `Prices in ${targetCurrency}`}/>
    <Field label="List name" value={name} onChangeText={setName} hint="e.g. Weekly groceries"/>
    {features.customCategories && <View style={styles.field}><Text style={styles.label}>Category / purpose</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="None" selected={!categoryId} onPress={() => setCategoryId(null)}/>
      {(categories.data ?? []).map((entry) => <Chip key={entry.id} label={entry.name} selected={categoryId === entry.id} onPress={() => setCategoryId(entry.id)}/>)}
    </View></View>}
    {features.listCurrency && <View style={styles.field}><Text style={styles.label}>Currency</Text><CurrencyPicker value={currency} onChange={setCurrency}/><Text style={{ color: palette.muted, fontSize: 12 }}>Defaults to your preferred currency. It locks once the list has items.</Text></View>}
    {features.multipleHomes && <View style={styles.field}><Text style={styles.label}>Group (optional)</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="No group" selected={!groupId} onPress={() => setGroupId(null)}/>
      {(groups.data ?? []).map((entry) => <Chip key={entry.id} label={entry.name} selected={groupId === entry.id} onPress={() => setGroupId(entry.id)}/>)}
    </View></View>}
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Create list" onPress={create} loading={busy}/>
  </Screen>;
}
