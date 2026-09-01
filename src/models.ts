import { CurrencyCode } from './currency';

export type Category = 'Food' | 'Kitchen' | 'Bathroom' | 'Cleaning' | 'Household' | 'Personal Care' | 'Office Supplies' | 'Custom';
export type ListItem = { id: string; name: string; budget: number; actual?: number; purchasedAt?: string };
export type ShoppingList = { id: string; name: string; category: Category; currencyCode: CurrencyCode; group?: string; items: ListItem[] };
export type PriceHistoryEntry = { id: string; name: string; amount: number; currencyCode: CurrencyCode; purchaseDate: string };
export type UserSettings = { defaultCurrency: CurrencyCode };
