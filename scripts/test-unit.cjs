// Unit tests for the app's pure modules (currency, CSV, activity text). Runs under Node.
const assert = require('node:assert/strict');
const { test } = require('node:test');
require('sucrase/register');

const { formatCurrency, parseAmount, amountInputValue, decimalDigits } = require('../src/currency.ts');
const { toCsv, csvAmount, slug } = require('../src/csv.ts');
const { describeActivity, timeAgo } = require('../src/activity.ts');

test('amounts are parsed in the currency\'s precision', () => {
  assert.equal(parseAmount('25,000', 'XAF'), 25000);
  assert.equal(parseAmount(' 12.50 ', 'USD'), 12.5);
  assert.equal(parseAmount('25.5', 'XAF'), null, 'XAF has no minor unit');
  assert.equal(parseAmount('1.005', 'USD'), null, 'more decimals than the currency allows');
  for (const bad of ['', '-5', 'abc', '1e3', '1.2.3']) assert.equal(parseAmount(bad, 'USD'), null, bad);
  assert.equal(decimalDigits('JPY'), 0);
  assert.equal(decimalDigits('ZZZ'), 2, 'unknown codes default to two decimals');
});

test('formatted amounts always identify their currency', () => {
  assert.match(formatCurrency(25000, 'XAF'), /FCFA|XAF/);
  assert.match(formatCurrency(25000, 'XAF'), /25.000/);
  assert.match(formatCurrency(12.5, 'USD'), /\$\s?12\.50/, 'the device locale decides the exact symbol, e.g. $ or US$');
  assert.equal(amountInputValue(12.5, 'USD'), '12.50');
  assert.equal(amountInputValue(25000, 'XAF'), '25000');
});

test('CSV quotes separators, quotes, and newlines', () => {
  assert.equal(toCsv([['a', 'b,c', 'say "hi"', 'line\nbreak', 3, null]]), 'a,"b,c","say ""hi""","line\nbreak",3,\r\n');
});

test('CSV neutralizes spreadsheet formulas in text but not numbers', () => {
  assert.equal(toCsv([['=HYPERLINK("http://evil")', '+1', '-2+3', '@SUM(A1)', -5]]), '"\'=HYPERLINK(""http://evil"")",\'+1,\'-2+3,\'@SUM(A1),-5\r\n');
  assert.equal(toCsv([['-1500', '-12.50', csvAmount(-4.5, 'USD')]]), '-1500,-12.50,-4.50\r\n', 'negative amounts stay numbers');
});

test('CSV amounts use plain numbers in the currency precision', () => {
  assert.equal(csvAmount(23500, 'XAF'), '23500');
  assert.equal(csvAmount(4.5, 'USD'), '4.50');
  assert.equal(slug('House Shopping 2026-09 XAF'), 'house-shopping-2026-09-xaf');
  assert.equal(slug('Épicerie & Café'), 'epicerie-cafe');
  assert.equal(slug('***'), 'export');
});

test('activity entries read as sentences with currencies', () => {
  const actor = { username: 'alex', display_name: 'Alex' };
  const at = new Date().toISOString();
  assert.equal(describeActivity({ action: 'ITEM_PURCHASED', subject: 'Rice', metadata: { purchased_amount: 23500, budgeted_amount: 25000, currency_code: 'USD' }, created_at: at, actor }),
    `Alex purchased Rice for ${formatCurrency(23500, 'USD')} (budget ${formatCurrency(25000, 'USD')})`);
  assert.equal(describeActivity({ action: 'ITEM_EDITED', subject: 'Milk', metadata: { previous_budgeted_total: 2, budgeted_total: 3, currency_code: 'USD' }, created_at: at, actor }),
    `Alex changed the budget for Milk from ${formatCurrency(2, 'USD')} to ${formatCurrency(3, 'USD')}`);
  assert.equal(describeActivity({ action: 'MEMBER_ROLE_CHANGED', subject: 'sam', metadata: { previous_role: 'viewer', role: 'editor' }, created_at: at, actor }),
    'Alex changed @sam from Viewer to Editor');
  assert.equal(describeActivity({ action: 'ITEM_ADDED', subject: 'Soap', metadata: {}, created_at: at, actor: null }), 'Grocefy added Soap');
});

test('relative times', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  assert.equal(timeAgo('2026-10-02T11:59:40Z', now), 'just now');
  assert.equal(timeAgo('2026-10-02T11:55:00Z', now), '5 min ago');
  assert.equal(timeAgo('2026-10-02T09:00:00Z', now), '3 h ago');
});
