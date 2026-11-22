// One-time Administrator setup through the real route handlers against a local D1 (Miniflare).
// No email: MAIL_PROVIDER is not set, so invitations stay disabled throughout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSitesApi } from './fixtures/sites-api.mjs';

const { mf, DB, call } = await startSitesApi({
  setup: 'app/api/setup/route.ts', login: 'app/api/auth/login/route.ts', session: 'app/api/auth/session/route.ts',
  invite: 'app/api/admin/invitations/route.ts', accounts: 'app/api/admin/accounts/route.ts', workspace: 'app/api/workspace/route.ts',
});
const env = globalThis.__vapsTestEnv;
const SECRET = 'test-setup-secret-' + 'x'.repeat(30);
const PASSWORD = 'Administrator chosen passphrase';
const setup = (json) => call('setup', 'POST', '/', { json });
const accounts = async () => (await DB.prepare('SELECT employee_id, username, active, must_change_password, activated_at FROM accounts').all()).results.map((r) => ({ ...r }));

test('without a configured secret, setup is off and creates nothing', async () => {
  delete env.ADMIN_SETUP_TOKEN;
  for (const json of [{ action: 'check' }, { action: 'complete', token: '', password: PASSWORD }, { action: 'complete', token: 'anything', password: PASSWORD }]) {
    const r = await setup(json);
    assert.equal(r.status, 404, JSON.stringify(json)); assert.match(r.data.error, /not available/);
  }
  env.ADMIN_SETUP_TOKEN = 'too-short-secret';
  assert.equal((await setup({ action: 'check' })).status, 404, 'a secret under 32 characters counts as not configured');
  assert.deepEqual(await accounts(), []);
});

test('a wrong secret is refused and repeated guessing is paused; a weak password creates nothing', async () => {
  env.ADMIN_SETUP_TOKEN = SECRET;
  assert.deepEqual((await setup({ action: 'check' })).data, { open: true });
  const wrong = await setup({ action: 'complete', token: SECRET + 'x', password: PASSWORD });
  assert.equal(wrong.status, 403); assert.equal(wrong.setCookie, '');
  assert.equal((await setup({ action: 'complete', token: SECRET, password: 'short' })).status, 400);
  assert.equal((await setup({ action: 'complete', token: SECRET, password: 'ma001 is my password' })).status, 400, 'cannot contain the sign-in ID');
  assert.deepEqual(await accounts(), []);
  for (let i = 0; i < 4; i++) assert.equal((await setup({ action: 'complete', token: 'guess-' + i, password: PASSWORD })).status, 403);
  assert.equal((await setup({ action: 'complete', token: SECRET, password: PASSWORD })).status, 429, 'paused after 5 wrong secrets, even with the right one');
  await DB.prepare("DELETE FROM auth_throttle WHERE key LIKE 'setup:%'").run(); // the 15-minute pause has passed
  assert.deepEqual(await accounts(), []);
  // The secret never appears in the audit trail.
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE instr(detail, ?) > 0').bind(SECRET).first()).n, 0);
});

test('simultaneous setups: exactly one creates MA001; the request cannot choose another employee', async () => {
  const attempt = (password) => setup({ action: 'complete', token: SECRET, password, employeeId: 'SALIM', username: 'salim' });
  // Five requests at once; all pass the "is setup open?" check before any account exists.
  const results = await Promise.all([attempt(PASSWORD), attempt('A different simultaneous passphrase'), attempt('Third simultaneous passphrase'), attempt('Fourth simultaneous passphrase'), attempt('Fifth simultaneous passphrase')]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 409, 409, 409, 409], JSON.stringify(results.map((r) => r.data)));
  const winner = results.find((r) => r.status === 201);
  assert.equal(winner.data.employeeId, 'MA001');
  const rows = await accounts();
  assert.equal(rows.length, 1, 'one account only');
  assert.deepEqual({ ...rows[0], activated_at: !!rows[0].activated_at }, { employee_id: 'MA001', username: 'ma001', active: 1, must_change_password: 0, activated_at: true });
  // The winner is signed in, and the chosen password works for MA001 (whichever request won).
  const cookie = winner.setCookie.split(';')[0];
  assert.equal((await call('session', 'GET', '/', { cookie })).data.employeeId, 'MA001');
  const passwordUsed = ['Administrator chosen passphrase', 'A different simultaneous passphrase', 'Third simultaneous passphrase', 'Fourth simultaneous passphrase', 'Fifth simultaneous passphrase'][results.indexOf(winner)];
  globalThis.__setupPassword = passwordUsed;
  assert.equal((await call('login', 'POST', '/', { json: { username: 'MA001', password: passwordUsed } })).status, 200);
  assert.equal((await call('login', 'POST', '/', { json: { username: 'salim', password: passwordUsed } })).status, 401, 'no Salim account was created');
});

test('after the account exists, setup cannot run again, even with the secret still configured', async () => {
  assert.deepEqual((await setup({ action: 'check' })).data, { open: false });
  const again = await setup({ action: 'complete', token: SECRET, password: 'Attempt to take over the admin' });
  assert.equal(again.status, 409); assert.match(again.data.error, /already been completed/);
  assert.equal((await accounts()).length, 1);
  const audit = (await DB.prepare("SELECT action, detail FROM audit_log WHERE action LIKE 'account.setup%'").all()).results;
  assert.equal(audit.filter((a) => a.action === 'account.setup').length, 1);
  for (const a of audit) assert.ok(!a.detail.includes(PASSWORD) && !a.detail.includes(SECRET));
});

test('MA001 stays the Administrator; invitation email stays disabled', async () => {
  assert.equal((await call('login', 'POST', '/', { json: { username: 'ma001', password: 'not the chosen password' } })).status, 401);
  const rows = await accounts();
  assert.equal(rows[0].employee_id, 'MA001');
  // Sign in as the Administrator (either simultaneous password may have won; try both).
  const s = await call('login', 'POST', '/', { json: { username: 'MA001', password: globalThis.__setupPassword } });
  assert.equal(s.status, 200); const cookie = s.setCookie.split(';')[0];
  assert.equal((await call('accounts', 'GET', '/', { cookie })).status, 200, 'the Administrator manages accounts');
  const invite = await call('invite', 'POST', '/', { cookie, json: { employeeId: 'SALIM', email: 'salim@vaps.example.test' } });
  assert.equal(invite.status, 503); assert.match(invite.data.error, /Email is not configured/);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM invitations').first()).n, 0);
});

test.after(async () => { await mf.dispose(); });
