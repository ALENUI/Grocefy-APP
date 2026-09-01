import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CurrencyCode } from './currency';
import { CollaborationRole, GroupMember, ListItem, PriceHistoryEntry, ShoppingGroup, ShoppingList, UserSettings } from './models';

type Store = {
  settings: UserSettings;
  lists: ShoppingList[];
  history: PriceHistoryEntry[];
  groups: ShoppingGroup[];
  ready: boolean;
  setDefaultCurrency: (currency: CurrencyCode) => void;
  addList: (data: Omit<ShoppingList, 'id' | 'items'>) => void;
  addItem: (listId: string, item: Omit<ListItem, 'id'>) => void;
  purchaseItem: (listId: string, itemId: string, actual: number) => void;
  addGroup: (name: string) => void;
  addGroupMember: (groupId: string, name: string, role: CollaborationRole) => void;
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
const initialGroups: ShoppingGroup[] = [{ id: 'house', name: 'House Shopping', members: [{ id: 'owner', name: 'You', role: 'Owner' }, { id: 'partner', name: 'Alex', role: 'Partner' }] }];
const Context = createContext<Store | undefined>(undefined);

export function GrocefyProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>({ defaultCurrency: 'XAF' });
  const [lists, setLists] = useState(initialLists);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([
    { id: 'soap-history', name: 'Laundry soap', amount: 8000, currencyCode: 'XAF', purchaseDate: '2026-09-01' }
  ]);
  const [groups, setGroups] = useState<ShoppingGroup[]>(initialGroups);
  const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(key).then((saved) => { if (saved) { const parsed = JSON.parse(saved); if (parsed.settings) setSettings(parsed.settings); if (parsed.lists) setLists(parsed.lists); if (parsed.history) setHistory(parsed.history); if (parsed.groups) setGroups(parsed.groups); } }).catch(() => undefined).finally(() => setReady(true)); }, []);
  useEffect(() => { if (ready) AsyncStorage.setItem(key, JSON.stringify({ settings, lists, history, groups })).catch(() => undefined); }, [settings, lists, history, groups, ready]);
  const value = useMemo<Store>(() => ({
    settings, lists, history, groups, ready,
    setDefaultCurrency: (currency) => setSettings({ defaultCurrency: currency }),
    addList: (data) => setLists((current) => [{ ...data, id: String(Date.now()), items: [] }, ...current]),
    addItem: (listId, item) => setLists((current) => current.map((list) => list.id === listId ? { ...list, items: [...list.items, { ...item, id: String(Date.now()) }] } : list)),
    purchaseItem: (listId, itemId, actual) => {
      const list = lists.find((entry) => entry.id === listId);
      const item = list?.items.find((entry) => entry.id === itemId);
      const purchaseDate = new Date().toISOString();
      if (list && item) setHistory((old) => [{ id: String(Date.now()), name: item.name, amount: actual, currencyCode: list.currencyCode, purchaseDate: purchaseDate.slice(0, 10) }, ...old]);
      setLists((current) => current.map((entry) => entry.id === listId ? { ...entry, items: entry.items.map((listItem) => listItem.id === itemId ? { ...listItem, actual, purchasedAt: purchaseDate } : listItem) } : entry));
    },
    addGroup: (name) => setGroups((current) => [{ id: String(Date.now()), name, members: [{ id: `${Date.now()}-owner`, name: 'You', role: 'Owner' }] }, ...current]),
    addGroupMember: (groupId, name, role) => setGroups((current) => current.map((group) => group.id === groupId ? { ...group, members: [...group.members, { id: String(Date.now()), name, role }] } : group))
  }), [settings, lists, history, groups, ready]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useGrocefy = () => { const store = useContext(Context); if (!store) throw new Error('GrocefyProvider missing'); return store; };
