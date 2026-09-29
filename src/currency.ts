/** ISO 4217 code. Amounts are only meaningful together with their currency code. */
export type CurrencyCode = string;

export type Currency = { code: CurrencyCode; name: string; symbol: string; decimalDigits: number };

// Offline fallback; replaced at startup by the active currencies from the server registry (`public.currencies`).
let registry: Currency[] = [
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', decimalDigits: 0 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalDigits: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalDigits: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimalDigits: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', decimalDigits: 2 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimalDigits: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimalDigits: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimalDigits: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalDigits: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalDigits: 0 }
];

export const getCurrencies = () => registry;
export const setCurrencyRegistry = (currencies: Currency[]) => { if (currencies.length) registry = currencies; };
export const findCurrency = (code: CurrencyCode) => registry.find((entry) => entry.code === code);
export const decimalDigits = (code: CurrencyCode) => findCurrency(code)?.decimalDigits ?? 2;

export const currencyLabel = (code: CurrencyCode) => {
  const currency = findCurrency(code);
  return currency ? `${currency.code} — ${currency.name}` : code;
};

/** The only supported way to render monetary amounts in the UI. */
export function formatCurrency(amount: number, code: CurrencyCode): string {
  const digits = decimalDigits(code);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: 'symbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  } catch {
    // Engines without full Intl currency data still show an unambiguous amount.
    return `${amount.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${code}`;
  }
}

/**
 * Parses user input such as "25,000" or "12.50" into an amount for the given currency. Returns null for empty,
 * negative, or malformed input, or more decimal places than the currency allows (e.g. "25.5" XAF).
 */
export function parseAmount(input: string, code: CurrencyCode): number | null {
  const normalized = input.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [, fraction = ''] = normalized.split('.');
  if (fraction.length > decimalDigits(code)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

/** Plain number text for pre-filling an input in the currency's precision. */
export const amountInputValue = (amount: number, code: CurrencyCode) => amount.toFixed(decimalDigits(code)).replace(/\.0+$/, '');
