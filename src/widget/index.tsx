import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate, type WidgetTaskHandler } from 'react-native-android-widget';
import { fetchHomeItems } from '../services/home';
import { fetchLists } from '../services/lists';
import { getSupabaseClient } from '../services/supabase';
import { buildSnapshot, type WidgetSnapshot } from './snapshot';
import { ToBuyWidget, widgetName } from './ToBuyWidget';

// One snapshot per phone: the signed-in user's current home. Cleared on sign-out.
const storageKey = 'grocefy:widget';
let lastSaved = '';

async function readSnapshot(): Promise<WidgetSnapshot | null> {
  try { const raw = await AsyncStorage.getItem(storageKey); return raw ? JSON.parse(raw) as WidgetSnapshot : null; } catch { return null; }
}

/** Saves what the widget shows and redraws every Grocefy widget on the home screen. Android only; a no-op in Expo Go. */
export async function updateWidget(snapshot: WidgetSnapshot | null): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { updatedAt, ...content } = snapshot ?? { updatedAt: '' };
  const signature = JSON.stringify(content);
  if (signature === lastSaved) return; // nothing new to draw
  lastSaved = signature;
  try {
    if (snapshot) await AsyncStorage.setItem(storageKey, JSON.stringify({ ...snapshot, updatedAt }));
    else await AsyncStorage.removeItem(storageKey);
    await requestWidgetUpdate({ widgetName, renderWidget: (info) => <ToBuyWidget snapshot={snapshot} height={info.height}/> });
  } catch { /* no widget support in this build (e.g. Expo Go) */ }
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
export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED' || (widgetAction === 'WIDGET_CLICK' && clickAction !== 'REFRESH')) return;
  const saved = await readSnapshot();
  // Draw what is saved straight away, then fetch fresh data when the widget asks for it.
  renderWidget(<ToBuyWidget snapshot={saved} height={widgetInfo.height}/>);
  if (widgetAction === 'WIDGET_RESIZED') return;
  const fresh = await refreshSnapshot(saved);
  if (fresh !== saved) renderWidget(<ToBuyWidget snapshot={fresh} height={widgetInfo.height}/>);
};

export { buildSnapshot } from './snapshot';
