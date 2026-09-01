import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CurrencyCode } from './currency';
import { ListItem, PriceHistoryEntry, ShoppingList, UserSettings } from './models';

type Store = {
  settings: UserSettings;
  lists: ShoppingList[];
  history: PriceHistoryEntry[];
  ready: boolean;
  setDefaultCurrency: (currency: CurrencyCode) => void;
  addList: (data: Omit<ShoppingList, 'id' | 'items'>) => void;
  addItem: (listId: string, item: Omit<ListItem, 'id'>) => void;
  purchaseItem: (listId: string, itemId: string, actual: number) => void;
};

const initialLists: ShoppingList[] = [
  { id: 'weekly', name: 'Weekly Groceries', category: 'Food', currencyCode: 'XAF', group: 'House Shopping', items: [
    { id: 'rice', name: 'Rice', budget: 25000 }, { id: 'vegetables', name: 'Fresh vegetables', budget: 12000 }, { id: 'milk', name: 'Milk', budget: 6500 }
  ] },
  { id: 'cleaning', name: 'Cleaning Essentials', category: 'Cleaning', currencyCode: 'XAF', group: 'House Shopping', items: [
    { id: 'soap', name: 'Laundry soap', budget: 8500, actual: 8000, purchasedAt: '2026-09-01' }
  ] }
];
const key = '@grocefy/state/v1';
const Context = createContext<Store | undefined>(undefined);

export function GrocefyProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>({ defaultCurrency: 'XAF' });
  const [lists, setLists] = useState(initialLists);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(key).then((saved) => { if (saved) { const parsed = JSON.parse(saved); setSettings(parsed.settings); setLists(parsed.lists); setHistory(parsed.history); } }).catch(() => undefined).finally(() => setReady(true)); }, []);
  useEffect(() => { if (ready) AsyncStorage.setItem(key, JSON.stringify({ settings, lists, history })).catch(() => undefined); }, [settings, lists, history, ready]);
  const value = useMemo<Store>(() => ({
    settings, lists, history, ready,
    setDefaultCurrency: (currency) => setSettings({ defaultCurrency: currency }),
    addList: (data) => setLists((current) => [{ ...data, id: String(Date.now()), items: [] }, ...current]),
    addItem: (listId, item) => setLists((current) => current.map((list) => list.id === listId ? { ...list, items: [...list.items, { ...item, id: String(Date.now()) }] } : list)),
    purchaseItem: (listId, itemId, actual) => setLists((current) => current.map((list) => {
      if (list.id !== listId) return list;
      const item = list.items.find((entry) => entry.id === itemId);
      if (item) setHistory((old) => [{ id: String(Date.now()), name: item.name, amount: actual, currencyCode: list.currencyCode, purchaseDate: new Date().toISOString().slice(0, 10) }, ...old]);
      return { ...list, items: list.items.map((entry) => entry.id === itemId ? { ...entry, actual, purchasedAt: new Date().toISOString() } : entry) };
    })),
  }), [settings, lists, history, ready]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useGrocefy = () => { const store = useContext(Context); if (!store) throw new Error('GrocefyProvider missing'); return store; };
