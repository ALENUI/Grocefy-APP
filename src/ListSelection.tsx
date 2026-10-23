import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { archiveLists, ListWithContext } from './services/lists';
import { Button, Card, palette } from './ui';

/**
 * Selecting several lists to delete them at once (long-press a list, or "Select"). Only lists you own can be deleted;
 * deleting archives them, so their purchase history and reports are kept.
 */
export function useListSelection(userId: string, onDeleted: () => void) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const canDelete = (list: ListWithContext) => list.owner_id === userId;
  const start = (list?: ListWithContext) => { setSelecting(true); setSelected(list && canDelete(list) ? [list.id] : []); };
  const cancel = () => { setSelecting(false); setSelected([]); };
  const toggle = (list: ListWithContext) => setSelected((ids) => (ids.includes(list.id) ? ids.filter((id) => id !== list.id) : [...ids, list.id]));
  /** Props for a ListCard: selectable while selecting, long-press starts selecting. */
  const cardProps = (list: ListWithContext) => ({
    selection: selecting ? { selected: canDelete(list) ? selected.includes(list.id) : null, onToggle: () => toggle(list) } : undefined,
    onLongPress: selecting ? undefined : () => start(list)
  });
  const remove = async () => {
    setBusy(true);
    try {
      const failed = await archiveLists(selected);
      if (failed.length) Alert.alert('Some lists were not deleted', `${failed.length} of ${selected.length} could not be deleted. Check your connection and try again.`);
      setSelected(failed);
      if (!failed.length) setSelecting(false);
      onDeleted();
    } finally { setBusy(false); }
  };
  const confirmRemove = () => {
    const count = selected.length;
    Alert.alert(`Delete ${count} ${count === 1 ? 'list' : 'lists'}?`, 'They are removed for everyone. Purchase history and reports are kept.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: remove }
    ]);
  };
  return { selecting, selected, busy, start, cancel, cardProps, confirmRemove };
}

/** Shown while selecting: how many are selected, Delete, and Cancel. */
export function SelectionBar({ selection }: { selection: ReturnType<typeof useListSelection> }) {
  const count = selection.selected.length;
  return <Card style={{ backgroundColor: palette.pale, borderColor: palette.pale, gap: 10 }}>
    <Text style={{ color: palette.ink, fontWeight: '800' }}>{count ? `${count} ${count === 1 ? 'list' : 'lists'} selected` : 'Tap the lists to delete'}</Text>
    <Text style={{ color: palette.muted, fontSize: 13 }}>You can delete the lists you created.</Text>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Button label="Cancel" variant="soft" onPress={selection.cancel} disabled={selection.busy}/></View>
      <View style={{ flex: 1 }}><Button label="Delete" variant="danger" icon="trash-outline" onPress={selection.confirmRemove} disabled={!count} loading={selection.busy}/></View>
    </View>
  </Card>;
}
