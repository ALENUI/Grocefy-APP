import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { archiveCategory, Category, createCategory, fetchCategories, renameCategory } from '@/src/services/categories';
import { friendlyError } from '@/src/services/errors';
import { useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { BackHeader, Button, Card, ErrorNotice, Field, Loading, palette, Screen, Sheet } from '@/src/ui';
import { Redirect } from 'expo-router';
import { features } from '@/src/features';

/** Built-in categories plus the user's own. Custom categories are archived, never deleted, so history keeps its labels. */
function Categories() {
  const userId = useUserId();
  const categories = useAsync(() => fetchCategories(userId), [userId]);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const custom = (categories.data ?? []).filter((category) => !category.is_default);
  const builtIn = (categories.data ?? []).filter((category) => category.is_default);

  const archive = (category: Category) => Alert.alert(`Archive "${category.name}"?`, 'It disappears from pickers. Items, purchases, and reports that use it keep it.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive', style: 'destructive', onPress: () => archiveCategory(category.id).then(categories.reload).catch((caught) => Alert.alert('Could not archive', friendlyError(caught))) }
  ]);

  return <Screen refreshing={categories.loading && !!categories.data} onRefresh={categories.reload}>
    <BackHeader title="Categories" subtitle="Organize items and see spending by category in reports"/>
    {categories.error ? <ErrorNotice error={categories.error} onRetry={categories.reload}/> : !categories.data ? <Loading/> : <>
      <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Your categories</Text>
      {custom.length === 0 && <Text style={{ color: palette.muted }}>Add categories that fit how you shop, like Baby Care or Pet Supplies.</Text>}
      {custom.map((category) => <Card key={category.id}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ color: palette.ink, fontWeight: '700', fontSize: 16, flex: 1 }}>{category.name}</Text>
        <Button label="Rename" variant="soft" onPress={() => setEditing(category)}/>
        <Button label="Archive" variant="danger" onPress={() => archive(category)}/>
      </View></Card>)}
      <Button label="Add category" icon="add" onPress={() => setEditing('new')}/>
      <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16, marginTop: 8 }}>Built in</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{builtIn.map((category) => <Text key={category.id} style={{ color: palette.green, backgroundColor: palette.pale, borderRadius: 16, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, fontWeight: '700' }}>{category.name}</Text>)}</View>
    </>}
    <CategorySheet target={editing} userId={userId} onClose={() => setEditing(null)} onSaved={categories.reload}/>
  </Screen>;
}

function CategorySheet({ target, userId, onClose, onSaved }: { target: Category | 'new' | null; userId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const [openedFor, setOpenedFor] = useState<typeof target>(null);
  if (target !== openedFor) { setOpenedFor(target); setName(target && target !== 'new' ? target.name : ''); setError(undefined); }
  const save = async () => {
    if (!name.trim()) return setError('Enter a category name.');
    setBusy(true); setError(undefined);
    try {
      if (target === 'new') await createCategory(userId, name); else if (target) await renameCategory(target.id, name);
      onSaved(); onClose();
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  };
  return <Sheet visible={!!target} title={target === 'new' ? 'New category' : 'Rename category'} subtitle={target === 'new' ? undefined : 'Finalized monthly reports keep the old name.'} onClose={onClose}>
    <Field label="Name" value={name} onChangeText={setName} hint="e.g. Baby Care" autoCapitalize="words"/>
    {error && <Text style={{ color: palette.red }}>{error}</Text>}
    <Button label="Save" onPress={save} loading={busy}/>
  </Sheet>;
}

/** Hidden while the "customCategories" feature is off: old links and notifications land on Home instead. */
export default function CategoriesRoute() { return features.customCategories ? <Categories/> : <Redirect href="/"/>; }
