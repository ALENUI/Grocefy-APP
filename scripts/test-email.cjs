// Unit tests for the send-emails Edge Function modules (templates, providers, worker, store). Runs under Node.
const assert = require('node:assert/strict');
const { test } = require('node:test');
require('sucrase/register');

const { renderInvitation, renderMonthlyReport, formatMoney } = require('../supabase/functions/_shared/email/templates.ts');
const { resendProvider, logProvider, createProvider } = require('../supabase/functions/_shared/email/providers.ts');
const { processOutbox } = require('../supabase/functions/_shared/email/worker.ts');
const { createSupabaseStore } = require('../supabase/functions/_shared/email/supabase-store.ts');

const invitation = { resourceName: 'House <Shopping>', resourceType: 'group', role: 'partner', inviterName: 'Amara (@amara)', expiresAt: '2026-10-06T10:00:00Z' };
const report = {
  year: 2026, month: 9, currencyCode: 'XAF', decimalDigits: 0, scopeName: 'House Shopping', totalBudget: 500000, totalPurchased: 470000, totalVariance: -30000,
  items: [{ categoryName: 'Food Stuffs', budgeted: 300000, purchased: 280000, variance: -20000 }, { categoryName: 'Kitchen', budgeted: 200000, purchased: 190000, variance: -10000 }]
};

test('money always shows its currency code and precision', () => {
  assert.equal(formatMoney(25000, 'XAF', 0), '25,000 XAF');
  assert.equal(formatMoney(25, 'USD', 2), '25.00 USD');
});

test('invitation email names the resource and role and escapes HTML', () => {
  const email = renderInvitation(invitation, 'grocefy://');
  assert.equal(email.subject, 'You have been invited to join House <Shopping>');
  assert.match(email.text, /Role: Partner/);
  assert.match(email.html, /House &lt;Shopping&gt;/);
  assert.doesNotMatch(email.html, /<Shopping>/);
  assert.match(email.html, /href="grocefy:\/\/inbox"/);
});

test('report email states the currency on every amount', () => {
  const email = renderMonthlyReport(report, 'https://app.example/');
  assert.equal(email.subject, 'September 2026 Finance Report — House Shopping (XAF)');
  for (const line of ['Currency: XAF', 'Budget: 500,000 XAF', 'Actual: 470,000 XAF', 'Savings: 30,000 XAF', '- Food Stuffs: 300,000 XAF / 280,000 XAF']) assert.ok(email.text.includes(line), line);
  assert.match(renderMonthlyReport({ ...report, totalVariance: 5000 }, 'grocefy://').text, /Over budget: 5,000 XAF/);
  assert.match(email.html, /href="https:\/\/app.example\/reports"/);
});

test('resend provider posts the message and surfaces API errors', async () => {
  const calls = [];
  const ok = resendProvider('re_key', 'Grocefy <n@example.test>', async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, text: async () => '' }; });
  await ok.send({ to: 'a@example.test', subject: 'S', html: '<p>H</p>', text: 'T' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: 'Grocefy <n@example.test>', to: ['a@example.test'], subject: 'S', html: '<p>H</p>', text: 'T' });
  const failing = resendProvider('re_key', 'x@example.test', async () => ({ ok: false, status: 422, text: async () => 'invalid from' }));
  await assert.rejects(failing.send({ to: 'a@example.test', subject: 'S', html: '', text: '' }), /Resend responded 422: invalid from/);
});

test('provider selection', () => {
  assert.equal(createProvider({}).name, 'log');
  assert.equal(createProvider({ RESEND_API_KEY: 'k', EMAIL_FROM: 'f@example.test' }).name, 'resend');
  assert.throws(() => createProvider({ EMAIL_PROVIDER: 'resend' }), /RESEND_API_KEY and EMAIL_FROM/);
  assert.throws(() => createProvider({ EMAIL_PROVIDER: 'pigeon' }), /Unknown EMAIL_PROVIDER/);
  const lines = [];
  logProvider((line) => lines.push(line)).send({ to: 'secret@example.test', subject: 'Hello', html: '', text: '' });
  assert.deepEqual(lines, ['[email:log] Hello']);
});

test('worker sends, skips stale emails, and isolates failures', async () => {
  const completed = [];
  const store = {
    claim: async () => [
      { id: '1', kind: 'invitation', to_email: 'a@example.test', reference_id: 'inv-live' },
      { id: '2', kind: 'invitation', to_email: 'b@example.test', reference_id: 'inv-cancelled' },
      { id: '3', kind: 'monthly_report', to_email: 'c@example.test', reference_id: 'report' },
      { id: '4', kind: 'monthly_report', to_email: 'bounce@example.test', reference_id: 'report' }
    ],
    complete: async (id, outcome, error) => { completed.push([id, outcome, error]); },
    loadInvitation: async (id) => (id === 'inv-live' ? invitation : null),
    loadReport: async () => report
  };
  const sent = [];
  const provider = { name: 'fake', send: async (message) => { if (message.to.startsWith('bounce')) throw new Error('mailbox unavailable'); sent.push(message); } };
  const logs = [];
  const result = await processOutbox(store, provider, { appUrl: 'grocefy://', log: (line) => logs.push(line) });
  assert.deepEqual(result, { sent: 2, failed: 1, skipped: 1 });
  assert.deepEqual(completed, [['1', 'sent', undefined], ['2', 'skipped', 'no longer relevant'], ['3', 'sent', undefined], ['4', 'failed', 'mailbox unavailable']]);
  assert.deepEqual(sent.map((message) => message.to), ['a@example.test', 'c@example.test']);
  assert.ok(logs.every((line) => !line.includes('@')), 'logs never contain recipient addresses');
});

test('store skips invitations that are answered or expired', async () => {
  const rows = {
    answered: { status: 'accepted', expires_at: '2999-01-01T00:00:00Z', role: 'viewer', resource_type: 'list', resource_name: 'Food', inviter: null },
    expired: { status: 'pending', expires_at: '2000-01-01T00:00:00Z', role: 'viewer', resource_type: 'list', resource_name: 'Food', inviter: null },
    live: { status: 'pending', expires_at: '2999-01-01T00:00:00Z', role: 'editor', resource_type: 'list', resource_name: null, inviter: { username: 'amara', display_name: 'Amara' } }
  };
  const client = {
    rpc: async () => ({ data: [], error: null }),
    from: () => ({ select: () => { const query = { eq: (_column, id) => ({ ...query, maybeSingle: async () => ({ data: rows[id] ?? null, error: null }) }) }; return query; } })
  };
  const store = createSupabaseStore(client);
  assert.equal(await store.loadInvitation('answered'), null);
  assert.equal(await store.loadInvitation('expired'), null);
  assert.equal(await store.loadInvitation('missing'), null);
  assert.deepEqual(await store.loadInvitation('live'), { resourceName: 'a shared list', resourceType: 'list', role: 'editor', inviterName: 'Amara (@amara)', expiresAt: '2999-01-01T00:00:00Z' });
});

const { expoPushProvider, logPushProvider, createPushProvider } = require('../supabase/functions/_shared/push/providers.ts');
const { processPushOutbox } = require('../supabase/functions/_shared/push/worker.ts');
const { secretMatches } = require('../supabase/functions/_shared/worker-auth.ts');

test('worker secret comparison', () => {
  assert.equal(secretMatches('s3cret', 's3cret'), true);
  assert.equal(secretMatches('s3cre', 's3cret'), false);
  assert.equal(secretMatches(null, 's3cret'), false);
});

test('Expo push provider maps tickets, including unregistered devices', async () => {
  const calls = [];
  const provider = expoPushProvider('expo-token', async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => '', json: async () => ({ data: [{ status: 'ok', id: '1' }, { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }, { status: 'error', message: 'rate limited' }] }) };
  });
  const results = await provider.send([1, 2, 3].map((n) => ({ to: `ExponentPushToken[${n}]`, title: 'Food', body: 'Alex bought Rice', data: { url: '/list/1' } })));
  assert.deepEqual(results, [{ status: 'ok' }, { status: 'invalid-token' }, { status: 'error', message: 'rate limited' }]);
  assert.equal(calls[0].url, 'https://exp.host/--/api/v2/push/send');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer expo-token');
  assert.equal(JSON.parse(calls[0].init.body)[0].sound, 'default');
  const failing = expoPushProvider(undefined, async () => ({ ok: false, status: 503, text: async () => 'down', json: async () => ({}) }));
  await assert.rejects(failing.send([{ to: 'ExponentPushToken[1]', title: 't', body: 'b', data: {} }]), /Expo push responded 503: down/);
  assert.equal(createPushProvider({}).name, 'expo');
  assert.equal(createPushProvider({ PUSH_PROVIDER: 'log' }).name, 'log');
});

test('push worker sends to every device, prunes unregistered ones, and isolates failures', async () => {
  const completed = []; const removed = [];
  const devices = { owner: ['ExponentPushToken[a]', 'ExponentPushToken[gone]'], viewer: [], partner: ['ExponentPushToken[b]'] };
  const store = {
    claim: async () => [
      { id: '1', user_id: 'owner', title: 'Food', body: 'Alex bought Rice', data: {} },
      { id: '2', user_id: 'viewer', title: 'Food', body: 'Alex bought Rice', data: {} },
      { id: '3', user_id: 'partner', title: 'Food', body: 'Sam bought Oil', data: {} }
    ],
    complete: async (id, outcome, error) => { completed.push([id, outcome, error]); },
    tokensFor: async (user) => devices[user],
    removeTokens: async (tokens) => { removed.push(...tokens); }
  };
  const provider = { name: 'fake', send: async (messages) => messages.map((message) => (message.to.includes('gone') ? { status: 'invalid-token' } : message.to.includes('[b]') ? { status: 'error', message: 'MessageRateExceeded' } : { status: 'ok' })) };
  const lines = [];
  assert.deepEqual(await processPushOutbox(store, provider, { log: (line) => lines.push(line) }), { sent: 1, failed: 1, skipped: 1 });
  assert.deepEqual(completed, [['1', 'sent', undefined], ['2', 'skipped', 'no registered devices'], ['3', 'failed', 'MessageRateExceeded']]);
  assert.deepEqual(removed, ['ExponentPushToken[gone]']);
  const logged = [];
  await logPushProvider((line) => logged.push(line)).send([{ to: 'ExponentPushToken[secret]', title: 'Food', body: 'private', data: {} }]);
  assert.deepEqual(logged, ['[push:log] Food'], 'the log provider never records tokens or bodies');
});

const { parseRelease } = require('../supabase/functions/_shared/release.ts');

test('app releases need a platform, positive build number, version, and https download', () => {
  const valid = { platform: 'android', build_number: '12', version: ' 1.0.0 ', download_url: 'https://expo.dev/builds/abc', notes: '  fix: things  ', eas_build_id: 'abc' };
  assert.deepEqual(parseRelease(valid), { platform: 'android', build_number: 12, version: '1.0.0', download_url: 'https://expo.dev/builds/abc', notes: 'fix: things', eas_build_id: 'abc' });
  assert.equal(parseRelease({ ...valid, notes: '' }).notes, null);
  assert.equal(parseRelease({ ...valid, platform: 'web' }), null);
  assert.equal(parseRelease({ ...valid, build_number: 0 }), null);
  assert.equal(parseRelease({ ...valid, build_number: '1.5' }), null);
  assert.equal(parseRelease({ ...valid, version: ' ' }), null);
  assert.equal(parseRelease({ ...valid, download_url: 'http://insecure.example/app.apk' }), null);
});
