import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandler } from 'react-native-android-widget';
import { fetchHomeItems } from '../services/home';
import { fetchLists } from '../services/lists';
import { getSupabaseClient } from '../services/supabase';
import { readThemePreference } from '../themePreference';
import { loadWidget } from './native';
import { buildSnapshot, type WidgetSnapshot } from './snapshot';

// One snapshot per phone: the signed-in user's current home. Cleared on sign-out.
const storageKey = 'grocefy:widget';
let lastSaved = '';

async function readSnapshot(): Promise<WidgetSnapshot | null> {
  try { const raw = await AsyncStorage.getItem(storageKey); return raw ? JSON.parse(raw) as WidgetSnapshot : null; } catch { return null; }
}

/**
 * Saves what the widget shows and redraws every Grocefy widget on the home screen, in the app's theme. A no-op without
 * widget support (Expo Go, iOS).
 */
export async function updateWidget(snapshot: WidgetSnapshot | null): Promise<void> {
  const loaded = loadWidget();
  if (!loaded) return;
  const theme = await readThemePreference();
  const { updatedAt, ...content } = snapshot ?? { updatedAt: '' };
  const signature = JSON.stringify({ content, theme });
  if (signature === lastSaved) return; // nothing new to draw
  lastSaved = signature;
  const { library, widget: { toBuyWidget, widgetName } } = loaded;
  try {
    if (snapshot) await AsyncStorage.setItem(storageKey, JSON.stringify({ ...snapshot, updatedAt }));
    else await AsyncStorage.removeItem(storageKey);
    await library.requestWidgetUpdate({ widgetName, renderWidget: (info) => toBuyWidget(snapshot, info.height, theme) });
  } catch { /* drawing is best-effort */ }
}

/** Redraws the widget with what it already shows, e.g. after the theme changed in Settings. */
export async function redrawWidget(): Promise<void> {
  if (loadWidget()) await updateWidget(await readSnapshot());
}

/** Fetches fresh data for the saved home while the app is closed. Keeps the saved snapshot if offline or signed out. */
async function refreshSnapshot(saved: WidgetSnapshot | null): Promise<WidgetSnapshot | null> {
  if (!saved) return null;
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    if (data.session?.user.id !== saved.userId) return saved;
    const [items, lists] = await Promise.all([fetchHomeItems(saved.homeId, saved.currencyCode), fetchLists({ groupId: saved.homeId })]);
    const fresh = buildSnapshot(saved.userId, { id: saved.homeId, name: saved.homeName, currency_code: saved.currencyCode }, items, lists);
    await AsyncStorage.setItem(storageKey, JSON.stringify(fresh));
    return fresh;
  } catch { return saved; }
}

/** Runs in the background when a widget is added, resized, due for its periodic update, or its refresh arrow is tapped. */
const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED' || (widgetAction === 'WIDGET_CLICK' && clickAction !== 'REFRESH')) return;
  const loaded = loadWidget();
  if (!loaded) return;
  const { toBuyWidget } = loaded.widget;
  const [saved, theme] = await Promise.all([readSnapshot(), readThemePreference()]);
  // Draw what is saved straight away, then fetch fresh data when the widget asks for it.
  renderWidget(toBuyWidget(saved, widgetInfo.height, theme));
  if (widgetAction === 'WIDGET_RESIZED') return;
  const fresh = await refreshSnapshot(saved);
  if (fresh !== saved) renderWidget(toBuyWidget(fresh, widgetInfo.height, theme));
};

/** Called once from the app entry (index.ts). */
export function registerWidget() {
  loadWidget()?.library.registerWidgetTaskHandler(widgetTaskHandler);
}

export { buildSnapshot } from './snapshot';
