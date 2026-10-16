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

const { applyQueue, processQueue } = require('../src/offline/queue.ts');
const { toServiceError, isNetworkError } = require('../src/services/errors.ts');

const serverItem = (id, name, status = 'pending') => ({
  id, list_id: 'list', product_id: `p-${id}`, category_id: null, quantity: 1, unit: null, is_bulk: false, budgeted_unit_price: 100, budgeted_total: 100, status, notes: null,
  created_by: 'u', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', purchased_at: null, product: { id: `p-${id}`, name }, category: null
});
const op = (kind, fields) => ({ id: `op-${Math.random()}`, createdAt: '2026-10-04T10:00:00Z', listId: 'list', label: `${kind}`, kind, ...fields });

test('queued changes are shown on top of the saved list', () => {
  const ops = [
    op('addItem', { itemId: 'new', productName: 'Bread', quantity: 2, budgetedUnitPrice: 750, categoryId: null }),
    op('updateItem', { itemId: 'rice', changes: { quantity: 3 } }),
    op('removeItem', { itemId: 'soap' }),
    op('purchase', { itemId: 'new', clientRef: 'ref', actualAmount: 1400, purchasedAt: '2026-10-04T10:05:00Z' }),
    { ...op('addItem', { itemId: 'elsewhere', productName: 'Other list', quantity: 1, budgetedUnitPrice: 1, categoryId: null }), listId: 'other' }
  ];
  const items = applyQueue([serverItem('rice', 'Rice'), serverItem('soap', 'Soap')], ops, 'list');
  assert.deepEqual(items.map((item) => item.id), ['rice', 'new'], 'removed item hidden, other lists ignored');
  const rice = items.find((item) => item.id === 'rice');
  assert.equal(rice.budgeted_total, 300);
  assert.equal(rice.pendingSync, true);
  const bread = items.find((item) => item.id === 'new');
  assert.equal(bread.product.name, 'Bread');
  assert.equal(bread.budgeted_total, 1500);
  assert.equal(bread.status, 'purchased', 'a purchase queued after an offline add applies to it');
  assert.equal(bread.purchased_at, '2026-10-04T10:05:00Z');
});

test('offline adds and edits keep whether an item is counted in bulk', () => {
  const items = applyQueue([serverItem('rice', 'Rice')], [
    op('addItem', { itemId: 'sugar', productName: 'Sugar', quantity: 1, isBulk: true, budgetedUnitPrice: 9000, categoryId: null }),
    op('addItem', { itemId: 'salt', productName: 'Salt', quantity: 1, budgetedUnitPrice: 200, categoryId: null }),
    op('updateItem', { itemId: 'rice', changes: { isBulk: true } })
  ], 'list');
  assert.deepEqual(items.map((item) => [item.id, item.is_bulk]), [['rice', true], ['sugar', true], ['salt', false]]);
});

test('offline adds and edits keep the unit of measurement', () => {
  const items = applyQueue([serverItem('rice', 'Rice'), { ...serverItem('oil', 'Oil'), unit: 'bottle' }], [
    op('addItem', { itemId: 'flour', productName: 'Flour', quantity: 2, unit: 'kg', budgetedUnitPrice: 800, categoryId: null }),
    op('updateItem', { itemId: 'rice', changes: { unit: 'bag' } }),
    op('updateItem', { itemId: 'oil', changes: { unit: null } })
  ], 'list');
  assert.deepEqual(items.map((item) => [item.id, item.unit]), [['rice', 'bag'], ['oil', null], ['flour', 'kg']]);
});

test('an offline add is not shown twice once the server has it', () => {
  const items = applyQueue([serverItem('new', 'Bread')], [op('addItem', { itemId: 'new', productName: 'Bread', quantity: 1, budgetedUnitPrice: 100, categoryId: null })], 'list');
  assert.equal(items.length, 1);
});

test('sync keeps order: it stops at the first change that cannot reach the server', async () => {
  const ops = [op('addItem', { itemId: 'a' }), op('purchase', { itemId: 'a' }), op('removeItem', { itemId: 'b' })];
  const sent = [];
  const result = await processQueue(ops, async (queued) => { sent.push(queued.kind); return queued.kind === 'purchase' ? 'retry' : 'synced'; });
  assert.deepEqual(sent, ['addItem', 'purchase'], 'nothing after the failed change is attempted');
  assert.deepEqual(result.remaining.map((queued) => queued.kind), ['purchase', 'removeItem']);
  assert.equal(result.synced, 1);
});

test('a refused change is reported and changes that depend on it are skipped', async () => {
  const ops = [op('addItem', { itemId: 'a', label: 'Add Bread' }), op('purchase', { itemId: 'a' }), op('removeItem', { itemId: 'b' })];
  const result = await processQueue(ops, async (queued) => (queued.kind === 'addItem' ? { drop: 'Your role does not allow this action.' } : 'synced'), () => 'now');
  assert.deepEqual(result.remaining, []);
  assert.equal(result.synced, 1, 'unrelated changes still sync');
  assert.deepEqual(result.problems.map((problem) => problem.message), ['Your role does not allow this action.', 'Skipped because the item could not be added.']);
});

test('connection failures are told apart from server refusals', () => {
  assert.equal(toServiceError({ message: 'TypeError: Network request failed' }).code, 'NETWORK');
  assert.equal(toServiceError({ message: 'FetchError: request to http://x failed, reason: fetch failed' }).code, 'NETWORK');
  assert.equal(toServiceError({ message: 'ALREADY_PURCHASED' }).code, 'ALREADY_PURCHASED');
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(toServiceError({ message: 'FORBIDDEN' })), false);
});

// Push must never crash app start-up: since SDK 55, importing expo-notifications in Expo Go on Android throws.
const Module = require('node:module');
function loadNotificationsModule({ expoGo, platform }) {
  const loads = { notifications: 0 };
  const stubs = {
    expo: { isRunningInExpoGo: () => expoGo },
    'react-native': { Platform: { OS: platform } },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project-id' } } } } },
    'expo-device': { isDevice: true },
    'expo-router': { router: { push: () => undefined } },
    react: { useEffect: () => undefined },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } },
    './services/push': { registerPushToken: async () => undefined, unregisterPushToken: async () => undefined },
    'expo-notifications': () => {
      loads.notifications += 1;
      if (expoGo && platform === 'android') throw new Error('expo-notifications: Android Push notifications ... removed from Expo Go');
      return {
        setNotificationHandler: () => undefined, setNotificationChannelAsync: async () => undefined, AndroidImportance: { DEFAULT: 3 },
        getPermissionsAsync: async () => ({ status: 'granted' }), requestPermissionsAsync: async () => ({ status: 'granted' }),
        getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[test]' })
      };
    }
  };
  const original = Module._load;
  Module._load = function load(request, ...rest) {
    if (request in stubs) return typeof stubs[request] === 'function' ? stubs[request]() : stubs[request];
    return original.call(this, request, ...rest);
  };
  const path = require.resolve('../src/notifications.ts');
  delete require.cache[path];
  // Stubs stay active until restore(): the module loads expo-notifications lazily, during the test.
  return { module: require(path), loads, restore: () => { Module._load = original; } };
}

test('push code loads safely in Expo Go on Android and is a no-op there', async () => {
  const { module, loads, restore } = loadNotificationsModule({ expoGo: true, platform: 'android' });
  try {
    assert.equal(loads.notifications, 0, 'expo-notifications is not imported at start-up');
    assert.equal(module.pushSupportedHere, false);
    assert.equal(await module.registerDevice({ ask: true }), 'expo-go');
    assert.equal(await module.pushPermissionStatus(), null);
    assert.equal(loads.notifications, 0, 'nor on use');
  } finally { restore(); }
});

test('push works in development and production builds, loading expo-notifications lazily', async () => {
  const { module, loads, restore } = loadNotificationsModule({ expoGo: false, platform: 'android' });
  try {
    assert.equal(loads.notifications, 0, 'not loaded until needed');
    assert.equal(await module.pushPermissionStatus(), 'granted');
    assert.equal(await module.registerDevice({ ask: false }), 'registered');
    assert.equal(loads.notifications, 1, 'loaded once and reused');
  } finally { restore(); }
});
