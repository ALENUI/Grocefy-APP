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
  'react-native-url-polyfill/auto': {},
  'expo-file-system': { cacheDirectory: 'file:///cache/', EncodingType: { UTF8: 'utf8' }, writeAsStringAsync: async () => undefined },
  'expo-sharing': { isAvailableAsync: async () => false, shareAsync: async () => undefined }
};
const originalLoad = Module._load;
Module._load = function load(request, ...rest) { return request in stubs ? stubs[request] : originalLoad.call(this, request, ...rest); };

// --- Local stack configuration -----------------------------------------------------------------------------------
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const status = Object.fromEntries(execSync('npx --yes supabase@latest status -o env', { encoding: 'utf8' }).split(/\r?\n/)
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
const activity = require('../src/services/activity');
const exportsService = require('../src/services/exports');
const { describeActivity } = require('../src/activity');
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
  await check('realtime: a collaborator\'s change reaches list members, and only them', async () => {
    const { createClient } = require('@supabase/supabase-js');
    const realtime = require('../src/services/realtime');
    const signedInClient = async (name, signUp = false) => {
      const other = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { error } = signUp
        ? await other.auth.signUp({ email: email(name), password, options: { data: { username: username(name), default_currency: 'XAF' } } })
        : await other.auth.signInWithPassword({ email: email(name), password });
      if (error) throw error;
      other.realtime.setAuth((await other.auth.getSession()).data.session.access_token);
      return other;
    };
    const waitFor = (predicate, ms) => new Promise((resolve) => { const started = Date.now(); const poll = setInterval(() => { if (predicate() || Date.now() - started > ms) { clearInterval(poll); resolve(predicate()); } }, 100); });
    const subscribed = (channel) => new Promise((resolve, reject) => channel.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status)); }));

    // The owner (the app's client) watches the list; an outsider listens to every list_items change.
    let ownerEvents = 0;
    const stopOwner = realtime.watchList(food.id, () => { ownerEvents += 1; });
    const outsider = await signedInClient('outsider', true);
    let outsiderEvents = 0;
    await subscribed(outsider.channel('outsider').on('postgres_changes', { event: '*', schema: 'public', table: 'list_items' }, () => { outsiderEvents += 1; }));
    assert.ok(await waitFor(() => getSupabaseClient().getChannels().every((channel) => channel.state === 'joined'), 15000), 'the owner\'s channel joins');

    const partnerClient = await signedInClient('partner');
    // Right after `supabase start`/`db reset`, Realtime's replication connection can take a few seconds to warm up,
    // so the partner keeps making changes (up to 3) until one is delivered.
    for (let attempt = 0; attempt < 3 && ownerEvents === 0; attempt++) {
      const { error } = await partnerClient.from('list_items').insert({ list_id: food.id, product_id: rice.product_id, budgeted_unit_price: 500 + attempt, created_by: ids.partner });
      if (error) throw error;
      await waitFor(() => ownerEvents > 0, 8000);
    }
    assert.ok(ownerEvents > 0, 'the owner receives the partner\'s new item live');
    assert.equal(await waitFor(() => outsiderEvents > 0, 2000), false, 'a non-member receives nothing (RLS applies to realtime)');
    stopOwner();
    await outsider.removeAllChannels();
    await Promise.all([outsider.auth.signOut(), partnerClient.auth.signOut()]);
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
  await check('the list activity feed names who did what', async () => {
    const entries = await activity.fetchActivity({ listId: food.id });
    const lines = entries.map(describeActivity);
    assert.ok(lines.some((line) => line.includes(' purchased Rice for ')), JSON.stringify(lines));
    const purchase = entries.find((entry) => entry.action === 'ITEM_PURCHASED' && entry.subject === 'Rice');
    assert.equal(purchase.actor.username, username('partner'));
    assert.ok(entries.some((entry) => entry.action === 'MEMBER_ROLE_CHANGED' && entry.subject === username('editor')));
    const groupEntries = await activity.fetchActivity({ groupId: group.id });
    assert.ok(groupEntries.some((entry) => entry.action === 'LIST_CREATED' && entry.subject === 'Food'), 'group feed includes its lists\' activity');
  });
  await check('duplicating a list refreshes budgets from same-currency purchases', async () => {
    const copy = await lists.duplicateList(food.id, 'Food again');
    const items = await lists.fetchListItems(copy.id);
    assert.equal(copy.group_id, group.id);
    assert.ok(items.every((item) => item.status === 'pending'));
    assert.equal(items.find((item) => item.product.name === 'Rice').budgeted_unit_price, 23500);
    await lists.archiveList(copy.id);
  });
  await check('monthly group report aggregates by category', async () => {
    const now = new Date();
    const [report] = await finance.generateMonthlyReport(now.getUTCFullYear(), now.getUTCMonth() + 1, { kind: 'group', groupId: group.id });
    assert.equal(report.currency_code, 'XAF');
    const [stored] = await finance.fetchMonthlyReports({ scope: { kind: 'group', groupId: group.id }, year: report.year, month: report.month });
    assert.equal(stored.total_budget, 31000);
    assert.equal(stored.total_purchased, 29500);
    assert.equal(stored.items[0].category_name_snapshot, 'Food Stuffs');
    const statement = exportsService.reportCsv(stored, 'House Shopping').split('\r\n');
    assert.equal(statement[0], 'Period,Scope,Currency,Category,Items,Budgeted,Purchased,Variance');
    assert.ok(statement.some((line) => line.endsWith(',TOTAL,2,31000,29500,-1500')), statement.join(' | '));
    const lines = await exportsService.fetchPurchasesInPeriod({ groupId: group.id }, stored.period_start, stored.period_end, 'XAF');
    assert.deepEqual(lines.map((line) => line.product.name).sort(), ['Cooking Oil', 'Rice']);
    assert.match(exportsService.purchasesCsv(lines), /,Rice,Food,Food Stuffs,1,25000,23500,XAF\r\n/);
    assert.equal((await exportsService.fetchPurchasesInPeriod({ groupId: group.id }, stored.period_start, stored.period_end, 'USD')).length, 0, 'exports are per currency');
  });

  await as('partner');
  await check('price book, price history, and spending trend are per currency', async () => {
    const insights = require('../src/services/insights');
    const [riceXaf] = (await insights.fetchPriceSummaries('Rice')).filter((summary) => summary.currencyCode === 'XAF');
    assert.equal(riceXaf.lastPrice, 23500);
    assert.equal(riceXaf.purchaseCount, 1);
    assert.equal(insights.priceChange(riceXaf), null, 'no previous price yet');
    const history = await insights.fetchPriceHistory(rice.product_id);
    assert.equal(history[0].purchase.list.name, 'Food');
    assert.equal(await insights.fetchProductName(rice.product_id), 'Rice');
    const now = new Date();
    const thisMonth = (await insights.fetchSpendingTrend(6, group.id)).find((month) => month.currencyCode === 'XAF' && month.month === now.getUTCMonth() + 1);
    assert.equal(thisMonth.purchased, 29500);
    assert.equal(thisMonth.budgeted, 31000);
  });
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

  await check('offline sync: client ids and purchase refs make retries safe, and offline times are kept', async () => {
    await as('owner');
    const list = await lists.createList({ ownerId: ids.owner, name: 'Offline trip', currencyCode: 'XAF' });
    const itemId = require('node:crypto').randomUUID();
    const added = await lists.addItem(ids.owner, { id: itemId, listId: list.id, productName: 'Eggs', budgetedUnitPrice: 2500 });
    assert.equal(added.id, itemId);
    await rejectsWith(lists.addItem(ids.owner, { id: itemId, listId: list.id, productName: 'Eggs', budgetedUnitPrice: 2500 }), 'ALREADY_EXISTS');
    const clientRef = require('node:crypto').randomUUID();
    const boughtAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const first = await purchases.purchaseListItem(itemId, { actualAmount: 2400, clientRef, purchasedAt: boughtAt });
    assert.equal(new Date(first.purchased_at).toISOString(), boughtAt, 'the time of an offline purchase is kept');
    const retry = await purchases.purchaseListItem(itemId, { actualAmount: 2400, clientRef, purchasedAt: boughtAt });
    assert.equal(retry.id, first.id, 'a retried purchase returns the original');
    assert.equal((await purchases.fetchPurchases({ listId: list.id })).length, 1);
    await lists.archiveList(list.id);
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
