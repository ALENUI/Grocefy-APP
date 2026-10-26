import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { CurrencyCode, currencyLabel, getCurrencies } from './currency';
import { friendlyError } from './services/errors';

// `white` is text and icons on green, red, or orange (white in both themes), and `onGreen` quieter text there; `surface` is
// cards, inputs, and the tab bar; `faint` is placeholders and chevrons; `handle` is the bar on top of a sheet.
const lightPalette = {
  ink: '#1C2B22', muted: '#69756D', green: '#22784B', pale: '#EAF6EE', cream: '#F7F8F3', line: '#E2E7E1', white: '#FFFFFF', surface: '#FFFFFF',
  orange: '#E68A36', red: '#C84D4D', redPale: '#FBECEC', orangePale: '#FDF1E4', onGreen: '#D5F1DF', faint: '#98A39B', handle: '#C5CEC7'
};
const darkPalette: typeof lightPalette = {
  ink: '#E6EEE8', muted: '#9BA79F', green: '#2F9A5E', pale: '#1B2E23', cream: '#0E1411', line: '#29332D', white: '#FFFFFF', surface: '#172019',
  orange: '#E8954A', red: '#E26D6D', redPale: '#3A2020', orangePale: '#36281A', onGreen: '#D5F1DF', faint: '#6B776F', handle: '#3A453E'
};
export type ColorScheme = 'light' | 'dark';
/** The current colors. Mutated in place by applyColorScheme, so read it while rendering (not once at import). */
export const palette = { ...lightPalette };
export let colorScheme: ColorScheme = 'light';

// Content never stretches wider than this on tablets and in landscape; it is centred instead.
const contentMaxWidth = 760;

/** Screen size class: phones in portrait get one column; tablets and landscape get a centred, wider layout. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const contentWidth = Math.min(width, contentMaxWidth);
  return { landscape: width > height, tablet: Math.min(width, height) >= 600, wide: width >= 700, columns: contentWidth >= 640 ? 2 : 1 };
}

export function Screen({ children, refreshing, onRefresh }: { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const { tablet } = useLayout();
  // Scrolls the focused field above the keyboard on both platforms (Android is edge-to-edge, so the window never resizes).
  // Left and right insets keep content clear of the notch in landscape.
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[styles.content, styles.centered, tablet && { padding: 28 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.green}/> : undefined}>{children}</KeyboardAwareScrollView>
  </SafeAreaView>;
}
export function Heading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) { return <View style={styles.heading}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{action}</View>; }
export function BackHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><Ionicons name="arrow-back" size={24} color={palette.ink}/></Pressable><View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.title} numberOfLines={2}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{action}</View>;
}
/** Lays children out in columns when there is room (tablets, landscape), otherwise one per row. */
export function Grid({ children, gap = 11 }: { children: React.ReactNode; gap?: number }) {
  const { columns } = useLayout();
  const cells = React.Children.toArray(children);
  if (columns === 1) return <View style={{ gap }}>{cells}</View>;
  const rows = Array.from({ length: Math.ceil(cells.length / columns) }, (_, row) => cells.slice(row * columns, row * columns + columns));
  return <View style={{ gap }}>{rows.map((row, index) => <View key={index} style={{ flexDirection: 'row', gap }}>
    {row.map((cell, column) => <View key={column} style={{ flex: 1 }}>{cell}</View>)}
    {Array.from({ length: columns - row.length }, (_, filler) => <View key={`filler-${filler}`} style={{ flex: 1 }}/>)}
  </View>)}</View>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
export function Button({ label, onPress, variant = 'primary', icon, disabled, loading }: { label: string; onPress: () => void; variant?: 'primary' | 'soft' | 'danger'; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; loading?: boolean }) {
  const color = variant === 'primary' ? palette.white : variant === 'danger' ? palette.red : palette.green;
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={[styles.button, variant === 'soft' && styles.softButton, variant === 'danger' && styles.dangerButton, (disabled || loading) && { opacity: 0.55 }]}>
    {loading ? <ActivityIndicator color={color}/> : icon && <Ionicons name={icon} size={18} color={color}/>}<Text style={[styles.buttonText, { color }]}>{label}</Text>
  </Pressable>;
}
export function IconButton({ icon, onPress, label, badge }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string; badge?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} unread` : label} hitSlop={8} onPress={onPress} style={{ backgroundColor: palette.pale, padding: 10, borderRadius: 12 }}><Ionicons name={icon} size={20} color={palette.green}/>
    {!!badge && <View style={styles.badge}><Text style={{ color: palette.white, fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text></View>}</Pressable>;
}
type FieldProps = { label: string; value: string; onChangeText: (v: string) => void; hint?: string; prefix?: string; secure?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address'; autoComplete?: 'email' | 'password' | 'new-password' | 'username' | 'off'; note?: string };
export function Field({ label, value, onChangeText, keyboardType = 'default', hint, prefix, secure, autoCapitalize, autoComplete, note }: FieldProps) {
  // Passwords are hidden until the eye is tapped.
  const [revealed, setRevealed] = useState(false);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.inputRow}>{prefix && <Text style={styles.prefix}>{prefix}</Text>}
    <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} secureTextEntry={secure && !revealed} autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'sentences')}
      autoComplete={autoComplete} autoCorrect={false} placeholderTextColor={palette.faint} style={styles.input} placeholder={hint} accessibilityLabel={label}/>
    {secure && <Pressable accessibilityRole="button" accessibilityLabel={revealed ? 'Hide password' : 'Show password'} hitSlop={10} onPress={() => setRevealed(!revealed)} style={{ paddingLeft: 10 }}>
      <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={22} color={palette.muted}/></Pressable>}</View>
    {note && <Text style={styles.note}>{note}</Text>}</View>;
}
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && { backgroundColor: palette.green }]}><Text style={{ color: selected ? palette.white : palette.green, fontWeight: '700' }}>{label}</Text></Pressable>;
}
// A drag past this distance (or a fast downward flick) closes the sheet; anything less springs back.
const dismissDistance = 120, dismissVelocity = 900;

/** Bottom sheet: slides up, rises above the keyboard, and closes by dragging it down, tapping outside, back, or the X. */
export function Sheet({ visible, title, subtitle, onClose, children, top }: { visible: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; top?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  // Keep showing the last content while the sheet slides away (callers often clear the item that fills it on close).
  const [snapshot, setSnapshot] = useState({ title, subtitle, children, top });
  if (visible && (snapshot.title !== title || snapshot.subtitle !== subtitle || snapshot.children !== children || snapshot.top !== top)) setSnapshot({ title, subtitle, children, top });
  const offset = useSharedValue(screenHeight);

  useEffect(() => {
    if (visible) { setMounted(true); offset.set(screenHeight); offset.set(withTiming(0, { duration: 260 })); }
    else offset.set(withTiming(screenHeight, { duration: 220 }, (finished) => { if (finished) scheduleOnRN(setMounted, false); }));
  }, [visible, screenHeight, offset]);

  const drag = Gesture.Pan()
    .onUpdate((event) => { offset.set(event.translationY > 0 ? event.translationY : event.translationY / 6); })
    .onEnd((event) => {
      if (event.translationY > dismissDistance || event.velocityY > dismissVelocity) offset.set(withTiming(screenHeight, { duration: 200 }, (finished) => { if (finished) scheduleOnRN(onClose); }));
      else offset.set(withSpring(0, { damping: 20, stiffness: 220 }));
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: interpolate(offset.get(), [0, screenHeight / 2], [1, 0], 'clamp') }));
  const shown = visible ? { title, subtitle, children, top } : snapshot;

  return <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior="padding" style={[styles.sheetFrame, { paddingTop: insets.top + 12, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, shadeStyle]}><Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose}/></Animated.View>
        <Animated.View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }, sheetStyle]}>
          <GestureDetector gesture={drag}><View style={{ paddingTop: 10 }}><View style={styles.sheetHandle}/>
            <View style={styles.sheetHeader}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.sheetTitle}>{shown.title}</Text>{shown.subtitle && <Text style={styles.subtitle}>{shown.subtitle}</Text>}</View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}><Ionicons name="close" size={24} color={palette.ink}/></Pressable></View>
            {shown.top}</View></GestureDetector>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>{shown.children}</ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  </Modal>;
}
export function Loading() { return <View style={{ paddingVertical: 40 }}><ActivityIndicator color={palette.green} size="large"/></View>; }
export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <Card style={{ backgroundColor: palette.redPale, borderColor: palette.redPale }}><Text style={{ color: palette.red, fontWeight: '700' }}>{friendlyError(error)}</Text>
    {onRetry && <Pressable accessibilityRole="button" hitSlop={8} onPress={onRetry} style={{ alignSelf: 'flex-start', marginTop: 8 }}><Text style={{ color: palette.red, fontWeight: '800' }}>Try again</Text></Pressable>}</Card>;
}
/** Small uppercase label above a group of cards, with an optional action on the right. */
export function SectionLabel({ title, action }: { title: string; action?: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
    <Text accessibilityRole="header" style={styles.sectionLabel}>{title.toUpperCase()}</Text>{action}</View>;
}
export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <Card><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>{title}</Text><Text style={{ color: palette.muted, marginTop: 7, lineHeight: 20 }}>{message}</Text>{action && <View style={{ marginTop: 14 }}>{action}</View>}</Card>;
}
export function CurrencyPicker({ value, onChange, disabled }: { value: CurrencyCode; onChange: (value: CurrencyCode) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const entries = getCurrencies().filter((currency) => `${currency.code} ${currency.name}`.toLowerCase().includes(query.toLowerCase()));
  const close = () => { setOpen(false); setQuery(''); };
  return <><Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`Currency: ${currencyLabel(value)}`} onPress={() => setOpen(true)} style={[styles.picker, disabled && { opacity: 0.6 }]}><View><Text style={styles.pickerValue}>{currencyLabel(value)}</Text><Text style={styles.pickerHint}>{disabled ? 'Locked' : 'Tap to choose currency'}</Text></View>{!disabled && <Ionicons name="chevron-down" size={20} color={palette.green} />}</Pressable>
    <Sheet visible={open} title="Choose currency" onClose={close} top={<TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search currencies..." placeholderTextColor={palette.faint} style={styles.search}/>}>
      <View>{entries.map((currency) => <Pressable key={currency.code} accessibilityRole="button" accessibilityState={{ selected: currency.code === value }} onPress={() => { onChange(currency.code); close(); }} style={styles.currencyRow}><View><Text style={styles.currencyCode}>{currency.code}</Text><Text style={styles.currencyName}>{currency.name}</Text></View>{currency.code === value && <Ionicons name="checkmark-circle" size={23} color={palette.green}/>}</Pressable>)}</View>
    </Sheet></>;
}
const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.cream }, content: { padding: 20, paddingBottom: 42, gap: 16 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 6, gap: 12 }, title: { fontSize: 28, fontWeight: '800', color: palette.ink, letterSpacing: -0.6 }, subtitle: { color: palette.muted, fontSize: 14, marginTop: 4 }, sectionLabel: { color: palette.muted, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 }, card: { backgroundColor: palette.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: palette.line }, button: { backgroundColor: palette.green, borderRadius: 12, minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 }, softButton: { backgroundColor: palette.pale }, dangerButton: { backgroundColor: palette.redPale }, buttonText: { color: palette.white, fontSize: 15, fontWeight: '700' }, field: { gap: 7 }, label: { color: palette.ink, fontWeight: '700', fontSize: 14 }, inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 12, paddingHorizontal: 14 }, prefix: { color: palette.green, fontWeight: '800', marginRight: 10 }, input: { flex: 1, height: 50, color: palette.ink, fontSize: 16 }, note: { color: palette.muted, fontSize: 12 }, chip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 20, backgroundColor: palette.pale }, badge: { position: 'absolute', top: -4, right: -4, backgroundColor: palette.red, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, picker: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, borderRadius: 12, minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, pickerValue: { color: palette.ink, fontWeight: '700' }, pickerHint: { fontSize: 12, color: palette.muted, marginTop: 2 }, sheetFrame: { flex: 1, justifyContent: 'flex-end' }, centered: { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }, shade: { backgroundColor: '#00000055' }, sheet: { flexShrink: 1, width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: palette.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20 }, sheetHandle: { width: 40, height: 5, borderRadius: 5, backgroundColor: palette.handle, alignSelf: 'center', marginBottom: 14 }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, sheetTitle: { fontWeight: '800', fontSize: 21, color: palette.ink }, search: { height: 48, borderRadius: 12, backgroundColor: palette.surface, paddingHorizontal: 14, color: palette.ink, marginBottom: 8 }, currencyRow: { flexDirection: 'row', paddingVertical: 15, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.line, alignItems: 'center' }, currencyCode: { fontWeight: '800', color: palette.ink, fontSize: 16 }, currencyName: { color: palette.muted, marginTop: 2 }
});
/** Shared styles for the current colors; rebuilt in place by applyColorScheme. */
export const styles = { ...makeStyles() };

/** Switches palette and styles to light or dark. The caller re-renders the app afterwards (ThemeProvider remounts it). */
export function applyColorScheme(scheme: ColorScheme) {
  colorScheme = scheme;
  Object.assign(palette, scheme === 'dark' ? darkPalette : lightPalette);
  Object.assign(styles, makeStyles());
}
