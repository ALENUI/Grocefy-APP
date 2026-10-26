import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../ui';
import { useOffline } from './OfflineProvider';

/** Floating status pill: offline, changes waiting to sync, syncing, or changes that could not be saved. */
export function OfflineBanner() {
  const { online, ops, problems, syncing, syncNow, dismissProblems } = useOffline();
  const { bottom, left, right } = useSafeAreaInsets();
  if (online && ops.length === 0 && problems.length === 0) return null;

  const showProblems = () => Alert.alert(
    problems.length === 1 ? 'A change could not be saved' : `${problems.length} changes could not be saved`,
    problems.map((problem) => `• ${problem.label}: ${problem.message}`).join('\n'),
    [{ text: 'OK', onPress: dismissProblems }]
  );
  const waiting = ops.length ? `${ops.length} ${ops.length === 1 ? 'change' : 'changes'} waiting to sync` : '';
  const [icon, text, onPress] = problems.length && online && !ops.length
    ? ['alert-circle-outline' as const, `${problems.length} ${problems.length === 1 ? 'change' : 'changes'} not saved · tap for details`, showProblems]
    : !online
      ? ['cloud-offline-outline' as const, `Offline${waiting ? ` · ${waiting}` : ' · showing saved data'}`, undefined]
      : ['sync-outline' as const, syncing ? 'Syncing your changes…' : `${waiting} · tap to retry`, syncing ? undefined : syncNow];

  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLiveRegion="polite" onPress={onPress}
    // Just above the tab bar (64 plus the gesture bar / home indicator).
    style={{ position: 'absolute', left: 16 + left, right: 16 + right, bottom: 84 + bottom, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.ink,
      paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 }}>
    <Ionicons name={icon} size={18} color={palette.white}/>
    <Text style={{ color: palette.white, fontWeight: '700', flex: 1 }}>{text}</Text>
  </Pressable>;
}
