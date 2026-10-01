import { decimalDigits } from './currency';

export type Cell = string | number | null | undefined;

/**
 * Serializes rows as RFC 4180 CSV. Text that a spreadsheet would treat as a formula (=, +, -, @, tab, CR) is
 * prefixed with an apostrophe: product and category names come from other users and must never execute in
 * someone's spreadsheet. Numbers are written as-is.
 */
export function toCsv(rows: Cell[][]): string {
  const cell = (value: Cell) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    // A plain number written as text (e.g. a variance of "-1500.00") is data, not a formula.
    const text = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** A machine-readable amount in the currency's precision (no symbols or grouping), e.g. 23500 or 12.50. */
export const csvAmount = (amount: number, currencyCode: string) => amount.toFixed(decimalDigits(currencyCode));

/** File-name-safe slug, e.g. "House Shopping" → "house-shopping". */
export const slug = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
