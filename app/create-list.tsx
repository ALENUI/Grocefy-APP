import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Category } from '@/src/models';
import { useGrocefy } from '@/src/store';
import { Button, CurrencyPicker, Field, Heading, Screen, styles } from '@/src/ui';

const categories: Category[] = ['Food', 'Kitchen', 'Bathroom', 'Cleaning', 'Household', 'Personal Care', 'Office Supplies', 'Custom'];
export default function CreateList() { const { settings, addList } = useGrocefy(); const [name, setName] = useState(''); const [group, setGroup] = useState(''); const [category, setCategory] = useState<Category>('Food'); const [currency, setCurrency] = useState(settings.defaultCurrency);
  const create = () => { if (!name.trim()) return Alert.alert('List name required', 'Give this shopping list a name first.'); addList({ name: name.trim(), group: group.trim() || undefined, category, currencyCode: currency }); router.back(); };
  return <Screen><Heading title="Create shopping list" subtitle="Every price in this list uses its selected currency."/><Field label="List name" value={name} onChangeText={setName} hint="e.g. Weekly Groceries"/><View style={styles.field}><Text style={styles.label}>Category / purpose</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{categories.map((entry) => <Text key={entry} onPress={() => setCategory(entry)} style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 20, overflow: 'hidden', backgroundColor: category === entry ? '#22784B' : '#EAF6EE', color: category === entry ? 'white' : '#22784B', fontWeight: '700' }}>{entry}</Text>)}</View></View><View style={styles.field}><Text style={styles.label}>Currency</Text><CurrencyPicker value={currency} onChange={setCurrency}/></View><Field label="Group (optional)" value={group} onChangeText={setGroup} hint="e.g. House Shopping"/><Button label="Create list" onPress={create}/></Screen>; }
