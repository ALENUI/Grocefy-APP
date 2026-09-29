import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { fetchCategories } from '@/src/services/categories';
import { friendlyError } from '@/src/services/errors';
import { fetchGroups } from '@/src/services/groups';
import { createList } from '@/src/services/lists';
import { useSession, useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { BackHeader, Button, Chip, CurrencyPicker, Field, palette, Screen, styles } from '@/src/ui';

export default function CreateList() {
  const userId = useUserId();
  const { defaultCurrency } = useSession();
  const { groupId: initialGroup } = useLocalSearchParams<{ groupId?: string }>();
  const categories = useAsync(() => fetchCategories(userId), [userId]);
  // Lists can be added to groups the user owns or partners in.
  const groups = useAsync(async () => (await fetchGroups(userId)).filter((group) => group.role === 'owner' || group.role === 'partner'), [userId]);
  const [name, setName] = useState(''); const [categoryId, setCategoryId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(initialGroup ?? null); const [currency, setCurrency] = useState(defaultCurrency);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { setCurrency(defaultCurrency); }, [defaultCurrency]);

  const create = async () => {
    if (!name.trim()) return setError('Give this shopping list a name first.');
    setBusy(true); setError(undefined);
    try { const list = await createList({ ownerId: userId, name: name.trim(), currencyCode: currency, groupId, categoryId }); router.replace(`/list/${list.id}`); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Screen><BackHeader title="Create shopping list" subtitle="Every price in this list uses its selected currency."/>
    <Field label="List name" value={name} onChangeText={setName} hint="e.g. Weekly Groceries"/>
    <View style={styles.field}><Text style={styles.label}>Category / purpose</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="None" selected={!categoryId} onPress={() => setCategoryId(null)}/>
      {(categories.data ?? []).map((entry) => <Chip key={entry.id} label={entry.name} selected={categoryId === entry.id} onPress={() => setCategoryId(entry.id)}/>)}
    </View></View>
    <View style={styles.field}><Text style={styles.label}>Currency</Text><CurrencyPicker value={currency} onChange={setCurrency}/><Text style={{ color: palette.muted, fontSize: 12 }}>Defaults to your preferred currency. It locks once the list has items.</Text></View>
    <View style={styles.field}><Text style={styles.label}>Group (optional)</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="No group" selected={!groupId} onPress={() => setGroupId(null)}/>
      {(groups.data ?? []).map((entry) => <Chip key={entry.id} label={entry.name} selected={groupId === entry.id} onPress={() => setGroupId(entry.id)}/>)}
    </View></View>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Create list" onPress={create} loading={busy}/>
  </Screen>;
}
