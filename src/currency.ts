export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'XAF' | 'NGN' | 'GHS' | 'KES' | 'ZAR' | 'CAD' | 'AUD' | 'JPY';

export type Currency = { code: CurrencyCode; name: string; locale: string };

// This registry is deliberately data-driven so API-provided active currencies can replace it later.
export const currencies: Currency[] = [
  { code: 'XAF', name: 'Central African CFA Franc', locale: 'fr-CM' },
  { code: 'USD', name: 'US Dollar', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound', locale: 'en-GB' },
  { code: 'NGN', name: 'Nigerian Naira', locale: 'en-NG' },
  { code: 'GHS', name: 'Ghanaian Cedi', locale: 'en-GH' },
  { code: 'KES', name: 'Kenyan Shilling', locale: 'en-KE' },
  { code: 'ZAR', name: 'South African Rand', locale: 'en-ZA' },
  { code: 'CAD', name: 'Canadian Dollar', locale: 'en-CA' },
  { code: 'AUD', name: 'Australian Dollar', locale: 'en-AU' },
  { code: 'JPY', name: 'Japanese Yen', locale: 'ja-JP' }
];

export const currencyLabel = (code: CurrencyCode) => {
  const currency = currencies.find((entry) => entry.code === code);
  return currency ? `${currency.code} — ${currency.name}` : code;
};

/** The only supported way to render monetary amounts in the UI. */
export function formatCurrency(amount: number, code: CurrencyCode): string {
  const currency = currencies.find((entry) => entry.code === code);
  return new Intl.NumberFormat(currency?.locale ?? 'en-US', {
    style: 'currency',
    currency: code,
    currencyDisplay: 'symbol',
    maximumFractionDigits: code === 'XAF' || code === 'JPY' ? 0 : 2
  }).format(amount);
}
