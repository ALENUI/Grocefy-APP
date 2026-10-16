import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Category, createCategory } from './services/categories';
import { friendlyError } from './services/errors';
import { Button, Chip, Field, palette, styles } from './ui';

export type CategoryOption = Pick<Category, 'id' | 'name'>;

/** The default category for items filed without one (created by the home_categories migration). */
export const generalCategory = (categories: (CategoryOption & { is_default?: boolean })[]) =>
  categories.find((category) => category.name === 'General' && category.is_default !== false) ?? null;

/** Pick a category for an item, or create a new one when none fits. The new category is selected right away. */
export function CategoryPicker({ categories, value, onChange, userId, onCreated }: {
  categories: CategoryOption[]; value: string | null; onChange: (id: string) => void; userId: string; onCreated: (category: Category) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
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
      {categories.map((category) => <Chip key={category.id} label={category.name} selected={value === category.id} onPress={() => onChange(category.id)}/>)}
      <Chip label="+ New category" selected={creating} onPress={() => { setCreating(!creating); setError(undefined); }}/>
    </ScrollView>
    {creating && <View style={{ gap: 10, marginTop: 4 }}>
      <Field label="New category" value={name} onChangeText={setName} hint="e.g. Snacks, Baby, Drinks" autoCapitalize="words"/>
      {error && <Text style={{ color: palette.red }}>{error}</Text>}
      <Button label="Create category" variant="soft" icon="add" onPress={create} loading={busy}/>
    </View>}
  </View>;
}
