// End-to-end test of the app's data-access layer (src/services) against a local Supabase stack.
// Runs the real service modules under Node, with React Native modules stubbed.
//
//   npx supabase start            # applies supabase/migrations
//   npm run test:services         # reads the local API URL and anon key from `supabase status`
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const Module = require('node:module');
require('sucrase/register');

// --- React Native stubs ------------------------------------------------------------------------------------------
const memory = new Map();
const stubs = {
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  '@react-native-async-storage/async-storage': { __esModule: true, default: {
    getItem: async (key) => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async (key) => { memory.delete(key); }
  } },
  'expo-linking': { createURL: (path) => `grocefy://${path.replace(/^\//, '')}` },
  'react-native-url-polyfill/auto': {}
};
const originalLoad = Module._load;
Module._load = function load(request, ...rest) { return request in stubs ? stubs[request] : originalLoad.call(this, request, ...rest); };

// --- Local stack configuration -----------------------------------------------------------------------------------
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const status = Object.fromEntries(execSync('npx supabase status -o env', { encoding: 'utf8' }).split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((match) => [match[1], match[2]]));
  if (!status.API_URL?.startsWith('http://127.0.0.1') && !status.API_URL?.startsWith('http://localhost')) throw new Error('Refusing to run against a non-local Supabase API');
  process.env.EXPO_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
}

const auth = require('../src/services/auth');
const settings = require('../src/services/settings');
const groups = require('../src/services/groups');
const categories = require('../src/services/categories');
const lists = require('../src/services/lists');
const purchases = require('../src/services/purchases');
const sharing = require('../src/services/sharing');
const finance = require('../src/services/finance');
const { ServiceError } = require('../src/services/errors');
const { getSupabaseClient } = require('../src/services/supabase');

const run = Date.now().toString(36);
const password = 'correct-horse-battery';
const email = (name) => `${name}.${run}@example.test`;
const username = (name) => `${name}_${run}`;
let step = 0;
const check = async (description, action) => { step += 1; await action(); console.log(`  ok ${step} - ${description}`); };
const rejectsWith = async (promise, code) => assert.equal(await promise.then(() => 'resolved', (error) => (error instanceof ServiceError ? error.code : error.message)), code);
const as = async (name) => { await auth.signOut().catch(() => undefined); await auth.signIn(email(name), password); return (await getSupabaseClient().auth.getUser()).data.user.id; };

(async () => {
  console.log('Service end-to-end flow');
  const ids = {};
  await check('usernames can be checked before signup', async () => assert.equal(await auth.isUsernameAvailable(username('owner')), true));
  for (const name of ['partner', 'editor', 'owner']) {
    await check(`${name} signs up with XAF as default currency`, async () => {
      assert.deepEqual(await auth.signUp({ email: email(name), password, username: username(name), defaultCurrency: 'XAF' }), { signedIn: true });
      ids[name] = (await getSupabaseClient().auth.getUser()).data.user.id;
      assert.equal((await settings.fetchSettings(ids[name])).default_currency, 'XAF');
      assert.equal((await settings.fetchProfile(ids[name])).username, username(name));
    });
  }
  await check('duplicate usernames are rejected', () => rejectsWith(auth.signUp({ email: email('dupe'), password, username: username('owner'), defaultCurrency: 'XAF' }), 'USERNAME_TAKEN'));
  await as('owner');

  let group, food, rice;
  await check('owner creates a group and an XAF list in it', async () => {
    group = await groups.createGroup(ids.owner, 'House Shopping', 'XAF');
    const foodCategory = (await categories.fetchCategories(ids.owner)).find((category) => category.name === 'Food Stuffs');
    food = await lists.createList({ ownerId: ids.owner, name: 'Food', currencyCode: 'XAF', groupId: group.id, categoryId: foodCategory.id });
    assert.equal(food.currency_code, 'XAF');
  });
  await check('items are added and totals are computed server-side', async () => {
    rice = await lists.addItem(ids.owner, { listId: food.id, productName: 'Rice', budgetedUnitPrice: 25000 });
    await lists.addItem(ids.owner, { listId: food.id, productName: 'Cooking Oil', quantity: 2, budgetedUnitPrice: 3000 });
    const [list] = await lists.fetchLists();
    assert.equal(list.group.name, 'House Shopping');
    assert.equal(list.category.name, 'Food Stuffs');
    assert.equal(list.totals.budgeted_total, 31000);
    assert.equal(await lists.fetchListRole(food.id), 'owner');
  });
  await check('list currency is locked once it has items', () => rejectsWith(
    getSupabaseClient().from('shopping_lists').update({ currency_code: 'USD' }).eq('id', food.id).then(({ error }) => { if (error) throw require('../src/services/errors').toServiceError(error); }), 'CURRENCY_LOCKED'));
  await check('owner invites a partner by username and an editor by email', async () => {
    await sharing.inviteMember('list', food.id, 'partner', username('partner'));
    await sharing.inviteMember('list', food.id, 'editor', email('editor'));
    assert.equal((await sharing.fetchPendingInvitations()).length, 2);
  });

  await as('partner');
  await check('partner accepts the invitation from their inbox', async () => {
    const [invitation] = await sharing.fetchPendingInvitations();
    assert.equal(invitation.resource_name, 'Food');
    assert.ok((await sharing.fetchNotifications()).some((notification) => notification.type === 'INVITATION'));
    await sharing.respondToInvitation(invitation.id, true);
    assert.equal(await lists.fetchListRole(food.id), 'partner');
  });
  await check('partner adds an item and purchases Rice at 23,500 XAF', async () => {
    await lists.addItem(ids.partner, { listId: food.id, productName: 'Bread', budgetedUnitPrice: 1000 });
    const purchase = await purchases.purchaseListItem(rice.id, { actualAmount: 23500 });
    assert.equal(purchase.purchased_amount, 23500);
    assert.equal(purchase.budgeted_amount, 25000);
    assert.equal(purchase.currency_code, 'XAF');
  });
  await check('a second purchase of the same item is rejected', () => rejectsWith(purchases.purchaseListItem(rice.id, { actualAmount: 1 }), 'ALREADY_PURCHASED'));
  await check('use-budgeted-amount purchases pay quantity × unit budget', async () => {
    const oil = (await lists.fetchListItems(food.id)).find((item) => item.product.name === 'Cooking Oil');
    assert.equal((await purchases.purchaseListItem(oil.id, { useBudgetedAmount: true })).purchased_amount, 6000);
  });
  await check('purchase history includes product and list names and pages by keyset', async () => {
    const [newest] = await purchases.fetchPurchases({ pageSize: 1 });
    const [older] = await purchases.fetchPurchases({ pageSize: 1, after: newest });
    assert.deepEqual([newest.product.name, older.product.name].sort(), ['Cooking Oil', 'Rice']);
    assert.equal(newest.list.name, 'Food');
    assert.equal((await purchases.fetchPurchases({ pageSize: 1, after: older })).length, 0);
  });

  await as('editor');
  await check('editor accepts an email invitation but cannot purchase', async () => {
    const [invitation] = await sharing.fetchPendingInvitations();
    await sharing.respondToInvitation(invitation.id, true);
    const bread = (await lists.fetchListItems(food.id)).find((item) => item.product.name === 'Bread');
    await lists.updateItem(bread.id, { budgetedUnitPrice: 1200 });
    await rejectsWith(purchases.purchaseListItem(bread.id, { actualAmount: 1000 }), 'FORBIDDEN');
  });
  await check('editor cannot change member roles', async () => {
    const members = await sharing.fetchMembers('list', food.id);
    await rejectsWith(sharing.changeMemberRole('list', members.find((member) => member.userId === ids.editor).id, 'partner'), 'NOT_FOUND');
  });

  await as('owner');
  await check('owner sees members with profiles and can change roles', async () => {
    const members = await sharing.fetchMembers('list', food.id);
    assert.deepEqual(members.map((member) => member.profile.username).sort(), [username('editor'), username('partner')].sort());
    await sharing.changeMemberRole('list', members.find((member) => member.userId === ids.editor).id, 'viewer');
  });
  await check('a new XAF list suggests the last price; a USD list does not convert it', async () => {
    const nextWeek = await lists.createList({ ownerId: ids.owner, name: 'Next week', currencyCode: 'XAF' });
    const usd = await lists.createList({ ownerId: ids.owner, name: 'Imports', currencyCode: 'USD' });
    const product = await lists.findProduct('rice', ids.owner);
    assert.equal((await lists.getPriceSuggestion(product.id, nextWeek.currency_code)).suggestedUnitPrice, 23500);
    const cross = await lists.getPriceSuggestion(product.id, usd.currency_code);
    assert.equal(cross.suggestedUnitPrice, null);
    assert.equal(cross.latestCurrencyCode, 'XAF');
  });
  await check('product search ranks exact and prefix matches first', async () => {
    const results = await lists.searchProducts('ric');
    assert.equal(results[0].name, 'Rice');
    assert.ok((await lists.searchProducts('bre')).some((product) => product.name === 'Bread'), 'products added by collaborators are suggested');
    assert.deepEqual(await lists.searchProducts('  '), []);
  });
  await check('custom categories can be created, archived, and restored by name', async () => {
    const created = await categories.createCategory(ids.owner, 'Baby Care');
    await rejectsWith(categories.createCategory(ids.owner, 'Baby Care'), 'ALREADY_EXISTS');
    await categories.archiveCategory(created.id);
    assert.ok(!(await categories.fetchCategories(ids.owner)).some((category) => category.id === created.id));
    assert.equal((await categories.createCategory(ids.owner, 'Baby Care')).id, created.id);
    await rejectsWith(categories.renameCategory((await categories.fetchCategories(ids.owner)).find((category) => category.is_default).id, 'Mine'), 'NOT_FOUND');
  });
  await check('items take a chosen product and category; lists can be renamed and re-currencied while empty', async () => {
    const list = await lists.createList({ ownerId: ids.owner, name: 'Baby', currencyCode: 'USD' });
    await lists.updateList(list.id, { name: 'Baby things', currencyCode: 'EUR' });
    const babyCare = (await categories.fetchCategories(ids.owner)).find((category) => category.name === 'Baby Care');
    const product = (await lists.searchProducts('Rice'))[0];
    const item = await lists.addItem(ids.owner, { listId: list.id, productName: product.name, productId: product.id, budgetedUnitPrice: 12.5, categoryId: babyCare.id });
    assert.equal(item.product.id, product.id);
    assert.equal(item.category.name, 'Baby Care');
    await lists.updateItem(item.id, { categoryId: null, quantity: 2 });
    const [reloaded] = await lists.fetchListItems(list.id);
    assert.equal(reloaded.category, null);
    assert.equal(reloaded.budgeted_total, 25);
    const renamed = await lists.fetchList(list.id);
    assert.equal(renamed.name, 'Baby things');
    assert.equal(renamed.currency_code, 'EUR');
    await rejectsWith(lists.updateList(list.id, { currencyCode: 'USD' }), 'CURRENCY_LOCKED');
    await lists.archiveList(list.id);
  });
  await check('group summary reports role, totals per currency, and counts', async () => {
    const [summary] = await groups.fetchGroups(ids.owner);
    assert.equal(summary.role, 'owner');
    assert.equal(summary.listCount, 1);
    assert.equal(summary.totals[0].purchased_total, 29500);
  });
  await check('monthly group report aggregates by category', async () => {
    const now = new Date();
    const [report] = await finance.generateMonthlyReport(now.getUTCFullYear(), now.getUTCMonth() + 1, { kind: 'group', groupId: group.id });
    assert.equal(report.currency_code, 'XAF');
    const [stored] = await finance.fetchMonthlyReports({ scope: { kind: 'group', groupId: group.id }, year: report.year, month: report.month });
    assert.equal(stored.total_budget, 31000);
    assert.equal(stored.total_purchased, 29500);
    assert.equal(stored.items[0].category_name_snapshot, 'Food Stuffs');
  });

  await as('partner');
  await check('partner can read the list report and their personal report', async () => {
    const now = new Date();
    const [personal] = await finance.generateMonthlyReport(now.getUTCFullYear(), now.getUTCMonth() + 1);
    assert.equal(personal.total_purchased, 29500);
    const [listReport] = await finance.generateMonthlyReport(now.getUTCFullYear(), now.getUTCMonth() + 1, { kind: 'list', listId: food.id });
    assert.equal(listReport.total_variance, -1500);
  });
  await check('a partner who leaves keeps their purchase history', async () => {
    const members = await sharing.fetchMembers('list', food.id);
    await sharing.removeMember('list', members.find((member) => member.userId === ids.partner).id);
    assert.equal((await lists.fetchLists()).length, 0);
    assert.equal((await purchases.fetchPurchases()).length, 2);
  });
  await check('settings: default currency changes apply to new lists only', async () => {
    assert.equal((await settings.setDefaultCurrency(ids.partner, 'EUR')).default_currency, 'EUR');
    await rejectsWith(settings.setDefaultCurrency(ids.partner, 'ZZZ'), 'INVALID_CURRENCY');
    assert.ok((await purchases.fetchPurchases()).every((purchase) => purchase.currency_code === 'XAF'));
  });

  // Email delivery through the send-emails Edge Function (requires supabase/functions/.env; see .env.example).
  const functionEnv = (() => { try { return Object.fromEntries(require('node:fs').readFileSync('supabase/functions/.env', 'utf8').split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2]])); } catch { return null; } })();
  if (!functionEnv?.EMAIL_WORKER_SECRET) {
    console.log('  skip - send-emails checks (create supabase/functions/.env from .env.example)');
  } else {
    const worker = (headers) => fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-emails`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
    await check('the email worker rejects requests without the worker secret', async () => {
      assert.equal((await worker({})).status, 401);
      assert.equal((await worker({ 'x-worker-secret': 'wrong' })).status, 401);
    });
    await check('the email worker sends pending invitations and skips answered ones', async () => {
      await auth.signUp({ email: email('late'), password, username: username('late'), defaultCurrency: 'XAF' });
      await as('owner');
      await sharing.inviteMember('group', group.id, 'viewer', username('late'));
      const response = await worker({ 'x-worker-secret': functionEnv.EMAIL_WORKER_SECRET });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      assert.equal(result.failed, 0, JSON.stringify(result));
      assert.ok(result.sent >= 1, `expected the pending invitation to be sent: ${JSON.stringify(result)}`);
      assert.ok(result.skipped >= 2, `expected the two accepted invitations to be skipped: ${JSON.stringify(result)}`);
      assert.deepEqual(await (await worker({ 'x-worker-secret': functionEnv.EMAIL_WORKER_SECRET })).json(), { provider: functionEnv.EMAIL_PROVIDER ?? 'log', sent: 0, failed: 0, skipped: 0 });
    });
  }

  await auth.signOut();
  console.log(`\nAll ${step} service checks passed.`);
})().catch((error) => { console.error(`\nnot ok ${step + 1}:`, error); process.exit(1); });
