import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CurrencyCode, currencyLabel, getCurrencies } from './currency';
import { friendlyError } from './services/errors';

export const palette = { ink: '#1C2B22', muted: '#69756D', green: '#22784B', pale: '#EAF6EE', cream: '#F7F8F3', line: '#E2E7E1', white: '#FFFFFF', orange: '#E68A36', red: '#C84D4D', redPale: '#FBECEC' };

export function Screen({ children, refreshing, onRefresh }: { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  return <SafeAreaView style={styles.screen} edges={['top']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.green}/> : undefined}>{children}</ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
export function Heading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) { return <View style={styles.heading}><View style={{ flex: 1 }}><Text style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{action}</View>; }
export function BackHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={palette.ink}/></Pressable><View style={{ flex: 1 }}><Text style={styles.title} numberOfLines={2}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{action}</View>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
export function Button({ label, onPress, variant = 'primary', icon, disabled, loading }: { label: string; onPress: () => void; variant?: 'primary' | 'soft' | 'danger'; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; loading?: boolean }) {
  const color = variant === 'primary' ? palette.white : variant === 'danger' ? palette.red : palette.green;
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={[styles.button, variant === 'soft' && styles.softButton, variant === 'danger' && styles.dangerButton, (disabled || loading) && { opacity: 0.55 }]}>
    {loading ? <ActivityIndicator color={color}/> : icon && <Ionicons name={icon} size={18} color={color}/>}<Text style={[styles.buttonText, { color }]}>{label}</Text>
  </Pressable>;
}
export function IconButton({ icon, onPress, label, badge }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string; badge?: number }) {
  return <Pressable accessibilityLabel={label} hitSlop={8} onPress={onPress} style={{ backgroundColor: palette.pale, padding: 10, borderRadius: 12 }}><Ionicons name={icon} size={20} color={palette.green}/>
    {!!badge && <View style={styles.badge}><Text style={{ color: palette.white, fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text></View>}</Pressable>;
}
type FieldProps = { label: string; value: string; onChangeText: (v: string) => void; hint?: string; prefix?: string; secure?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address'; autoComplete?: 'email' | 'password' | 'new-password' | 'username' | 'off'; note?: string };
export function Field({ label, value, onChangeText, keyboardType = 'default', hint, prefix, secure, autoCapitalize, autoComplete, note }: FieldProps) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.inputRow}>{prefix && <Text style={styles.prefix}>{prefix}</Text>}
    <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} secureTextEntry={secure} autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'sentences')}
      autoComplete={autoComplete} autoCorrect={false} placeholderTextColor="#98A39B" style={styles.input} placeholder={hint} accessibilityLabel={label}/></View>
    {note && <Text style={styles.note}>{note}</Text>}</View>;
}
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && { backgroundColor: palette.green }]}><Text style={{ color: selected ? palette.white : palette.green, fontWeight: '700' }}>{label}</Text></Pressable>;
}
export function Sheet({ visible, title, subtitle, onClose, children }: { visible: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><KeyboardAvoidingView style={styles.modalShade} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[styles.sheet, { height: undefined, maxHeight: '90%' }]}><View style={styles.sheetHandle}/><View style={styles.sheetHeader}><View style={{ flex: 1 }}><Text style={styles.sheetTitle}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>
      <Pressable accessibilityLabel="Close" hitSlop={10} onPress={onClose}><Ionicons name="close" size={24} color={palette.ink}/></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 28 }}>{children}</ScrollView></View>
  </KeyboardAvoidingView></Modal>;
}
export function Loading() { return <View style={{ paddingVertical: 40 }}><ActivityIndicator color={palette.green} size="large"/></View>; }
export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <Card style={{ backgroundColor: palette.redPale, borderColor: palette.redPale }}><Text style={{ color: palette.red, fontWeight: '700' }}>{friendlyError(error)}</Text>
    {onRetry && <Text onPress={onRetry} style={{ color: palette.red, marginTop: 8, fontWeight: '800' }}>Try again</Text>}</Card>;
}
export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <Card><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{title}</Text><Text style={{ color: palette.muted, marginTop: 7, lineHeight: 20 }}>{message}</Text>{action && <View style={{ marginTop: 14 }}>{action}</View>}</Card>;
}
export function CurrencyPicker({ value, onChange, disabled }: { value: CurrencyCode; onChange: (value: CurrencyCode) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const entries = useMemo(() => getCurrencies().filter((currency) => `${currency.code} ${currency.name}`.toLowerCase().includes(query.toLowerCase())), [query, open]);
  return <><Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`Currency: ${currencyLabel(value)}`} onPress={() => setOpen(true)} style={[styles.picker, disabled && { opacity: 0.6 }]}><View><Text style={styles.pickerValue}>{currencyLabel(value)}</Text><Text style={styles.pickerHint}>{disabled ? 'Locked' : 'Tap to choose currency'}</Text></View>{!disabled && <Ionicons name="chevron-down" size={20} color={palette.green} />}</Pressable><Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}><View style={styles.modalShade}><View style={styles.sheet}><View style={styles.sheetHandle}/><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Choose currency</Text><Pressable accessibilityLabel="Close" onPress={() => setOpen(false)}><Ionicons name="close" size={24} color={palette.ink}/></Pressable></View><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search currencies..." placeholderTextColor="#98A39B" style={styles.search}/><ScrollView keyboardShouldPersistTaps="handled">{entries.map((currency) => <Pressable key={currency.code} onPress={() => { onChange(currency.code); setOpen(false); setQuery(''); }} style={styles.currencyRow}><View><Text style={styles.currencyCode}>{currency.code}</Text><Text style={styles.currencyName}>{currency.name}</Text></View>{currency.code === value && <Ionicons name="checkmark-circle" size={23} color={palette.green}/>}</Pressable>)}</ScrollView></View></View></Modal></>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.cream }, content: { padding: 20, paddingBottom: 42, gap: 16 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 6, gap: 12 }, title: { fontSize: 28, fontWeight: '800', color: palette.ink, letterSpacing: -0.6 }, subtitle: { color: palette.muted, fontSize: 14, marginTop: 4 }, card: { backgroundColor: palette.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: palette.line }, button: { backgroundColor: palette.green, borderRadius: 13, minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 }, softButton: { backgroundColor: palette.pale }, dangerButton: { backgroundColor: palette.redPale }, buttonText: { color: palette.white, fontSize: 15, fontWeight: '700' }, field: { gap: 7 }, label: { color: palette.ink, fontWeight: '700', fontSize: 14 }, inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, borderRadius: 12, paddingHorizontal: 14 }, prefix: { color: palette.green, fontWeight: '800', marginRight: 10 }, input: { flex: 1, height: 50, color: palette.ink, fontSize: 16 }, note: { color: palette.muted, fontSize: 12 }, chip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 20, backgroundColor: palette.pale }, badge: { position: 'absolute', top: -4, right: -4, backgroundColor: palette.red, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, picker: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white, borderRadius: 12, minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, pickerValue: { color: palette.ink, fontWeight: '700' }, pickerHint: { fontSize: 12, color: palette.muted, marginTop: 2 }, modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' }, sheet: { height: '76%', backgroundColor: palette.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20 }, sheetHandle: { width: 40, height: 5, borderRadius: 5, backgroundColor: '#C5CEC7', alignSelf: 'center', marginBottom: 14 }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, sheetTitle: { fontWeight: '800', fontSize: 21, color: palette.ink }, search: { height: 48, borderRadius: 12, backgroundColor: palette.white, paddingHorizontal: 14, color: palette.ink, marginBottom: 8 }, currencyRow: { flexDirection: 'row', paddingVertical: 15, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.line, alignItems: 'center' }, currencyCode: { fontWeight: '800', color: palette.ink, fontSize: 16 }, currencyName: { color: palette.muted, marginTop: 2 }
});
