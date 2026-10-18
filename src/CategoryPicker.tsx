import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Category, createCategory } from './services/categories';
import { friendlyError } from './services/errors';
import { Button, Chip, Field, palette, styles } from './ui';

export type CategoryOption = Pick<Category, 'id' | 'name'> & { is_default?: boolean };

/** The default category for items filed without one (created by the home_categories migration). */
export const generalCategory = (categories: (CategoryOption & { is_default?: boolean })[]) =>
  categories.find((category) => category.name === 'General' && category.is_default !== false) ?? null;

/**
 * Categories already in use come first: the ones `inUse` names (e.g. used in this home or on this list) and your own,
 * then the default suggestions that are not used yet.
 */
export function orderCategories(categories: CategoryOption[], inUse: string[] = []) {
  const used = categories.filter((category) => inUse.includes(category.id) || category.is_default === false);
  const suggested = categories.filter((category) => !used.includes(category));
  const byName = (a: CategoryOption, b: CategoryOption) => a.name.localeCompare(b.name);
  return { used: used.sort(byName), suggested: suggested.sort(byName) };
}

/** Pick a category for an item, or create a new one when none fits. The new category is selected right away. */
export function CategoryPicker({ categories, value, onChange, userId, onCreated, inUse }: {
  categories: CategoryOption[]; value: string | null; onChange: (id: string) => void; userId: string; onCreated: (category: Category) => void; inUse?: string[];
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const { used, suggested } = orderCategories(categories, inUse);
  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the category a name.');
    const existing = categories.find((category) => category.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) { onChange(existing.id); setCreating(false); setName(''); return; }
    setBusy(true); setError(undefined);
    try {
      const category = await createCategory(userId, trimmed);
      onCreated(category); onChange(category.id); setCreating(false); setName('');
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <View style={styles.field}>
    <Text style={styles.label}>Category</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {used.map((category) => <Chip key={category.id} label={category.name} selected={value === category.id} onPress={() => onChange(category.id)}/>)}
      {used.length > 0 && suggested.length > 0 && <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', alignSelf: 'center', marginLeft: 4 }}>Suggested</Text>}
      {suggested.map((category) => <Chip key={category.id} label={category.name} selected={value === category.id} onPress={() => onChange(category.id)}/>)}
      <Chip label="+ New category" selected={creating} onPress={() => { setCreating(!creating); setError(undefined); }}/>
    </ScrollView>
    {creating && <View style={{ gap: 10, marginTop: 4 }}>
      <Field label="New category" value={name} onChangeText={setName} hint="e.g. Snacks, Baby, Drinks" autoCapitalize="words"/>
      {error && <Text style={{ color: palette.red }}>{error}</Text>}
      <Button label="Create category" variant="soft" icon="add" onPress={create} loading={busy}/>
    </View>}
  </View>;
}
