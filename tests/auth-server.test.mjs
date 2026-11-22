// Employee sign-in and server-side permission checks, exercised through the real API route handlers against a local
// D1 database and R2 bucket (Miniflare). Nothing here touches a deployed environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("") } }', d1Databases: ['DB'], r2Buckets: ['FILES'] });
const DB = await mf.getD1Database('DB');
const FILES = await mf.getR2Bucket('FILES');
for (const file of fs.readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort())
  for (const statement of fs.readFileSync('drizzle/' + file, 'utf8').split('--> statement-breakpoint')) if (statement.trim()) await DB.prepare(statement).run();
globalThis.__vapsTestEnv = { DB, FILES, AUTH_SESSION_IDLE_MINUTES: '60', AUTH_SESSION_MAX_HOURS: '8' };

// Bundle the route handlers as the Sites build does (import.meta.env defined → Sites edition), with the Worker env stubbed.
const routes = {
  login: 'app/api/auth/login/route.ts', logout: 'app/api/auth/logout/route.ts', session: 'app/api/auth/session/route.ts', password: 'app/api/auth/password/route.ts',
  accounts: 'app/api/admin/accounts/route.ts', account: 'app/api/admin/accounts/[id]/route.ts', workspace: 'app/api/workspace/route.ts', record: 'app/api/workspace/records/[key]/route.ts',
  job: 'app/api/jobs/[id]/route.ts', operations: 'app/api/jobs/[id]/operations/route.ts', trash: 'app/api/jobs/[id]/trash/route.ts', activities: 'app/api/activities/route.ts',
  files: 'app/api/files/route.ts', file: 'app/api/files/[id]/route.ts', requests: 'app/api/requests/route.ts', summary: 'app/api/job-summary/[id]/route.ts',
};
const entry = Object.entries(routes).map(([name, path]) => `export * as ${name} from ${JSON.stringify('./' + path)};`).join('\n')
  + '\nexport * as auth from "./server/auth.ts";\nexport { buildDemoJobs, demoConfiguration } from "./app/demo-data.ts";';
const stub = { name: 'workers-env', setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const env = globalThis.__vapsTestEnv;' })); } };
const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [stub], define: { 'import.meta.env': '{}' }, jsx: 'automatic' });
const api = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const ORIGIN = 'https://vaps.example';
/** Calls a route handler like a browser on the VAPS site would (same-origin marker header, JSON body, cookie). */
async function call(route, method, path, { json, cookie, params = {}, origin = ORIGIN, marker = true, body, headers = {} } = {}) {
  const h = new Headers(headers);
  if (json !== undefined) h.set('Content-Type', 'application/json');
  if (method !== 'GET') { if (origin) h.set('Origin', origin); if (marker) h.set('X-VAPS-Request', '1'); }
  if (cookie) h.set('Cookie', cookie);
  const request = new Request(ORIGIN + path, { method, headers: h, body: json !== undefined ? JSON.stringify(json) : body });
  const response = await api[route][method](request, { params: Promise.resolve(params) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, setCookie: response.headers.get('Set-Cookie') || '', headers: response.headers };
}
const cookieOf = (setCookie) => setCookie.split(';')[0];
const admin = { accountId: 'bootstrap', employeeId: 'MA001' };
const accounts = {};
/** Creates an account (as the bootstrap script would), signs in with the temporary password and sets a personal one. */
async function enrol(employeeId, username = employeeId.toLowerCase() + '.vaps') {
  const created = await api.auth.createAccount(DB, admin, { username, employeeId }, () => true);
  const first = await call('login', 'POST', '/api/auth/login', { json: { username, password: created.temporaryPassword } });
  assert.equal(first.status, 200); assert.equal(first.data.mustChangePassword, true);
  const password = 'Personal pass ' + employeeId + ' 2026';
  const changed = await call('password', 'POST', '/api/auth/password', { cookie: cookieOf(first.setCookie), json: { currentPassword: created.temporaryPassword, newPassword: password } });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  accounts[employeeId] = { id: created.id, username, password };
  return accounts[employeeId];
}
async function signIn(employeeId) {
  const a = accounts[employeeId];
  const r = await call('login', 'POST', '/api/auth/login', { json: { username: a.username, password: a.password } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return cookieOf(r.setCookie);
}

// Seed: the demo jobs and the duties/teams/routing they were built for, saved as shared settings (as a reviewed import would).
const now = new Date('2026-10-28T10:00:00+04:00');
const demoJobs = await api.buildDemoJobs(async (name, content) => ({ id: crypto.randomUUID(), name, size: content.length, type: 'text/plain' }), now);
for (const job of demoJobs) await DB.prepare('INSERT INTO jobs (id, payload, revision, updated_at) VALUES (?, ?, 1, ?)').bind(job.id, JSON.stringify(job), now.toISOString()).run();
const seed = { 'vaps-responsibilities-v1': { scopeSelector: 'SALIM', samplingApproval: 'SALIM', samplingReportChecker: 'SALIM', clientApproval: 'SALIM', ...api.demoConfiguration.roles }, 'vaps-lab-teams-v1': api.demoConfiguration.teams, 'vaps-test-routing-v1': api.demoConfiguration.routing };
for (const [key, value] of Object.entries(seed)) await DB.prepare('INSERT INTO workspace_records (key, value, revision, updated_at) VALUES (?, ?, 1, ?)').bind(key, JSON.stringify(value), now.toISOString()).run();
for (const id of ['MA001', 'SALIM', 'WILFRED', 'SHEREIQI', 'NASSER', 'YAQEEN', 'MOHSIN', 'HUSSEINI', 'ALI']) await enrol(id);

test('sign-in: correct credentials create an HttpOnly, SameSite=Strict session bound to the employee', async () => {
  const r = await call('login', 'POST', '/api/auth/login', { json: { username: '  SALIM.vaps ', password: accounts.SALIM.password } });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /^__Host-vaps_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
  const s = await call('session', 'GET', '/api/auth/session', { cookie: cookieOf(r.setCookie) });
  assert.deepEqual([s.status, s.data.employeeId, s.data.mustChangePassword], [200, 'SALIM', false]);
  const stored = await DB.prepare('SELECT password_hash FROM accounts WHERE employee_id = ?').bind('SALIM').first();
  assert.match(stored.password_hash, /^pbkdf2-sha256\$100000\$/); assert.ok(!stored.password_hash.includes(accounts.SALIM.password));
});

test('sign-in: wrong password, unknown user and inactive account fail with one message that reveals nothing', async () => {
  const wrong = await call('login', 'POST', '/api/auth/login', { json: { username: 'wilfred.vaps', password: 'not the password' } });
  const unknown = await call('login', 'POST', '/api/auth/login', { json: { username: 'nobody.vaps', password: 'whatever it is' } });
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401);
  assert.equal(wrong.data.error, unknown.data.error); assert.equal(wrong.setCookie, '');
  const temp = await api.auth.createAccount(DB, admin, { username: 'humaid.vaps', employeeId: 'HUMAID' }, () => true);
  await api.auth.setAccountActive(DB, admin, temp.id, false);
  const inactive = await call('login', 'POST', '/api/auth/login', { json: { username: 'humaid.vaps', password: temp.temporaryPassword } });
  assert.deepEqual([inactive.status, inactive.data.error], [401, wrong.data.error]);
});

test('sign-in: repeated guessing pauses the username, even for the correct password, then a reset clears it', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await call('login', 'POST', '/api/auth/login', { json: { username: 'ali.vaps', password: 'guess number ' + i } })).status, 401);
  const blocked = await call('login', 'POST', '/api/auth/login', { json: { username: 'ali.vaps', password: accounts.ALI.password } });
  assert.equal(blocked.status, 429); assert.equal(blocked.setCookie, '');
  const reset = await api.auth.resetAccountPassword(DB, admin, accounts.ALI.id);
  const again = await call('login', 'POST', '/api/auth/login', { json: { username: 'ali.vaps', password: reset.temporaryPassword } });
  assert.equal(again.status, 200); assert.equal(again.data.mustChangePassword, true);
  const forced = await call('workspace', 'GET', '/api/workspace', { cookie: cookieOf(again.setCookie) });
  assert.equal(forced.status, 403, 'a temporary password must be changed before anything else');
  assert.equal((await call('password', 'POST', '/api/auth/password', { cookie: cookieOf(again.setCookie), json: { currentPassword: reset.temporaryPassword, newPassword: accounts.ALI.password } })).status, 200);
  assert.equal((await call('workspace', 'GET', '/api/workspace', { cookie: cookieOf(again.setCookie) })).status, 200);
});

test('sign-in: login is refused from another site or without the workspace marker header', async () => {
  const json = { username: 'salim.vaps', password: accounts.SALIM.password };
  assert.equal((await call('login', 'POST', '/api/auth/login', { json, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('login', 'POST', '/api/auth/login', { json, marker: false })).status, 403);
});

test('logout revokes the session on the server', async () => {
  const cookie = await signIn('NASSER');
  assert.equal((await call('workspace', 'GET', '/api/workspace', { cookie })).status, 200);
  const out = await call('logout', 'POST', '/api/auth/logout', { cookie, json: {} });
  assert.equal(out.status, 200); assert.match(out.setCookie, /Max-Age=0/);
  const after = await call('workspace', 'GET', '/api/workspace', { cookie });
  assert.deepEqual([after.status, after.data.reason], [401, 'revoked']);
});

test('sessions expire after the absolute limit and after inactivity', async () => {
  const absolute = await signIn('NASSER'), idle = await signIn('NASSER');
  const hash = async (cookie) => { const token = cookie.split('=')[1]; const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)); return Buffer.from(d).toString('hex'); };
  await DB.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').bind(new Date(Date.now() - 1000).toISOString(), await hash(absolute)).run();
  await DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').bind(new Date(Date.now() - 61 * 60_000).toISOString(), await hash(idle)).run();
  for (const cookie of [absolute, idle]) { const r = await call('workspace', 'GET', '/api/workspace', { cookie }); assert.deepEqual([r.status, r.data.reason], [401, 'expired']); assert.match(r.setCookie, /Max-Age=0/); }
});

test('revocation: administrator sign-out, deactivation and an inactive employee record end existing sessions', async () => {
  const cookie = await signIn('HUSSEINI');
  await api.auth.revokeSessionsByAdmin(DB, admin, accounts.HUSSEINI.id);
  assert.equal((await call('workspace', 'GET', '/api/workspace', { cookie })).data.reason, 'revoked');
  const second = await signIn('HUSSEINI');
  await api.auth.setAccountActive(DB, admin, accounts.HUSSEINI.id, false);
  assert.equal((await call('workspace', 'GET', '/api/workspace', { cookie: second })).status, 401);
  await api.auth.setAccountActive(DB, admin, accounts.HUSSEINI.id, true);
  const third = await signIn('HUSSEINI');
  // Deactivating the employee record (Settings → Employees) also blocks the account.
  const ma = await signIn('MA001');
  const ws = (await call('workspace', 'GET', '/api/workspace', { cookie: ma })).data;
  const directory = JSON.parse(ws.records['vaps-directory-v1'] || 'null') || null;
  const base = directory || { departments: [], positions: [], employees: [] };
  assert.ok(!directory, 'no directory saved yet: the built-in directory is used');
  const { initialDirectory } = await import('data:text/javascript;base64,' + Buffer.from((await build({ entryPoints: ['app/employee-directory.ts'], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', define: { 'import.meta.env': '{}' } })).outputFiles[0].text).toString('base64'));
  const next = { ...initialDirectory(), ...(directory ? base : {}) };
  next.employees = next.employees.map((e) => e.id === 'HUSSEINI' ? { ...e, active: false } : e);
  const saved = await call('record', 'PUT', '/api/workspace/records/vaps-directory-v1', { cookie: ma, params: { key: 'vaps-directory-v1' }, json: { value: JSON.stringify(next), revision: 0 } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.ok(!saved.data.value.includes('"password"'), 'passwords are never stored in the shared directory');
  assert.equal((await call('workspace', 'GET', '/api/workspace', { cookie: third })).data.reason, 'inactive');
  assert.equal((await call('login', 'POST', '/api/auth/login', { json: { username: accounts.HUSSEINI.username, password: accounts.HUSSEINI.password } })).status, 401);
  next.employees = next.employees.map((e) => e.id === 'HUSSEINI' ? { ...e, active: true } : e);
  assert.equal((await call('record', 'PUT', '/api/workspace/records/vaps-directory-v1', { cookie: ma, params: { key: 'vaps-directory-v1' }, json: { value: JSON.stringify(next), revision: 1 } })).status, 200);
  const removed = { ...next, employees: next.employees.filter((e) => e.id !== 'RANJITH') };
  assert.equal((await call('record', 'PUT', '/api/workspace/records/vaps-directory-v1', { cookie: ma, params: { key: 'vaps-directory-v1' }, json: { value: JSON.stringify(removed), revision: 2 } })).status, 400, 'employee IDs are never removed');
});

test('password change: the current password is verified and other sessions are signed out', async () => {
  const a = await signIn('MOHSIN'), b = await signIn('MOHSIN');
  assert.equal((await call('password', 'POST', '/api/auth/password', { cookie: a, json: { currentPassword: 'wrong current', newPassword: 'A brand new passphrase 1' } })).status, 400);
  assert.equal((await call('password', 'POST', '/api/auth/password', { cookie: a, json: { currentPassword: accounts.MOHSIN.password, newPassword: 'short' } })).status, 400);
  assert.equal((await call('password', 'POST', '/api/auth/password', { cookie: a, json: { currentPassword: accounts.MOHSIN.password, newPassword: 'A brand new passphrase 1' } })).status, 200);
  accounts.MOHSIN.password = 'A brand new passphrase 1';
  assert.equal((await call('workspace', 'GET', '/api/workspace', { cookie: a })).status, 200, 'the session that changed it stays signed in');
  assert.equal((await call('workspace', 'GET', '/api/workspace', { cookie: b })).data.reason, 'revoked');
});

test('no session: every internal API refuses access', async () => {
  const id = 'OM-X-26-003';
  for (const [route, method, path, opts] of [['workspace', 'GET', '/api/workspace', {}], ['job', 'PUT', '/api/jobs/' + id, { params: { id }, json: { job: {}, revision: 1 } }], ['operations', 'POST', `/api/jobs/${id}/operations`, { params: { id }, json: { commands: [{ type: 'start-job' }], revision: 1 } }],
    ['record', 'PUT', '/api/workspace/records/vaps-authorization-v1', { params: { key: 'vaps-authorization-v1' }, json: { value: '{}', revision: 0 } }], ['requests', 'GET', '/api/requests', {}], ['file', 'GET', '/api/files/x', { params: { id: crypto.randomUUID() } }],
    ['accounts', 'GET', '/api/admin/accounts', {}], ['summary', 'PUT', '/api/job-summary/' + crypto.randomUUID(), { params: { id: crypto.randomUUID() }, json: {}, headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } }]])
    assert.equal((await call(route, method, path, opts)).status, 401, route);
  const forged = await call('workspace', 'GET', '/api/workspace', { cookie: '__Host-vaps_session=' + 'f'.repeat(64) });
  assert.equal(forged.status, 401);
});

test('reads: each employee receives only the jobs they may open; drafts and other teams’ jobs stay on the server', async () => {
  const ids = async (who) => (await call('workspace', 'GET', '/api/workspace', { cookie: await signIn(who) })).data.jobs.map((j) => j.job.id).sort();
  const yaqeen = await ids('YAQEEN');
  assert.ok(yaqeen.includes('OM-X-26-003') && !yaqeen.includes('OM-X-26-006') && !yaqeen.includes('OM-X-26-001'));
  assert.ok((await ids('ALI')).includes('OM-X-26-001') && !(await ids('ALI')).includes('OM-X-26-006'));
  assert.equal((await ids('WILFRED')).length, demoJobs.length, 'company overview');
  const ws = (await call('workspace', 'GET', '/api/workspace', { cookie: await signIn('YAQEEN') })).data;
  assert.deepEqual(ws.jobIndex, [], 'job numbers go to job creators only');
  assert.equal(ws.me.employeeId, 'YAQEEN');
});

test('spoofing: the acting employee is always the session, never a value in the request', async () => {
  const yaqeen = await signIn('YAQEEN');
  // An activity claiming to be someone else is recorded under the session's employee.
  const act = await call('activities', 'POST', '/api/activities', { cookie: yaqeen, json: { action: 'Probe', jobId: 'X', employeeId: 'MA001' } });
  assert.equal(act.data.employeeId, 'YAQEEN');
  // A job created "as" Salim by someone without the Create jobs permission.
  const fake = { ...demoJobs[0], id: 'OM-X-26-099', jobNumber: 'OM-X-26-099', globalSequence: 99, operations: undefined, workflowHistory: undefined, samples: [], events: [], createdById: 'SALIM', ownerId: 'SALIM', status: 'Draft' };
  assert.equal((await call('job', 'PUT', '/api/jobs/OM-X-26-099', { cookie: yaqeen, params: { id: fake.id }, json: { job: fake, revision: 0 } })).status, 403);
  // Salim may create jobs, but only under his own name.
  const salim = await signIn('SALIM');
  assert.equal((await call('job', 'PUT', '/api/jobs/OM-X-26-099', { cookie: salim, params: { id: fake.id }, json: { job: { ...fake, createdById: 'WILFRED', ownerId: 'WILFRED' }, revision: 0 } })).status, 403);
  const created = await call('job', 'PUT', '/api/jobs/OM-X-26-099', { cookie: salim, params: { id: fake.id }, json: { job: { ...fake, lastUpdatedById: 'MA001' }, revision: 0 } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal(created.data.job.lastUpdatedById, 'SALIM', 'server stamps the update with the session employee');
  // Workflow state cannot be written directly; it changes only through commands run by the server.
  const job3 = (await call('workspace', 'GET', '/api/workspace', { cookie: salim })).data.jobs.find((j) => j.job.id === 'OM-X-26-003');
  const tampered = { ...job3.job, operations: { ...job3.job.operations, activities: job3.job.operations.activities.map((a) => ({ ...a, status: 'Completed' })) } };
  assert.equal((await call('job', 'PUT', '/api/jobs/OM-X-26-003', { cookie: salim, params: { id: 'OM-X-26-003' }, json: { job: tampered, revision: job3.revision } })).status, 400);
  // Recording a sample as prepared by someone else.
  const sample = { ...job3.job, samples: job3.job.samples.map((s, i) => i ? s : { ...s, dataCompletedBy: 'WILFRED' }) };
  assert.equal((await call('job', 'PUT', '/api/jobs/OM-X-26-003', { cookie: salim, params: { id: 'OM-X-26-003' }, json: { job: sample, revision: job3.revision } })).status, 403);
  // Audit events carry the authenticated account.
  const audited = await DB.prepare("SELECT account_id, employee_id FROM audit_events WHERE action = 'job.created' AND target = 'OM-X-26-099'").first();
  assert.deepEqual(audited, { account_id: accounts.SALIM.id, employee_id: 'SALIM' });
});

test('permissions: settings, accounts and Trash need their own permission', async () => {
  const nasser = await signIn('NASSER'), ma = await signIn('MA001');
  const policyPut = (cookie, revision = 0) => call('record', 'PUT', '/api/workspace/records/vaps-authorization-v1', { cookie, params: { key: 'vaps-authorization-v1' }, json: { value: JSON.stringify({ createJob: ['NASSER'] }), revision } });
  assert.equal((await policyPut(nasser)).status, 403, 'no Manage authorization');
  assert.equal((await call('accounts', 'GET', '/api/admin/accounts', { cookie: nasser })).status, 403);
  assert.equal((await call('accounts', 'GET', '/api/admin/accounts', { cookie: ma })).status, 200);
  assert.equal((await call('accounts', 'POST', '/api/admin/accounts', { cookie: nasser, json: { username: 'x.vaps', employeeId: 'RANJITH' } })).status, 403);
  const job6 = (await call('workspace', 'GET', '/api/workspace', { cookie: nasser })).data.jobs.find((j) => j.job.id === 'OM-X-26-006');
  assert.equal((await call('trash', 'POST', '/api/jobs/OM-X-26-006/trash', { cookie: nasser, params: { id: 'OM-X-26-006' }, json: { mode: 'trash', revision: job6.revision } })).status, 403);
  const record = await call('record', 'PUT', '/api/workspace/records/vaps-company-v1', { cookie: nasser, params: { key: 'vaps-company-v1' }, json: { value: JSON.stringify({ name: 'X', displayName: 'X', logo: '/x.png' }), revision: 0 } });
  assert.equal(record.status, 403);
});

test('workflow: laboratory, QC and final approval follow the configured duties on the server', async () => {
  const get = async (who, id) => (await call('workspace', 'GET', '/api/workspace', { cookie: await signIn(who) })).data.jobs.find((j) => j.job.id === id);
  const run = async (who, id, commands) => { const j = await get(who, id); return call('operations', 'POST', `/api/jobs/${id}/operations`, { cookie: await signIn(who), params: { id }, json: { commands, revision: j ? j.revision : 1 } }); };
  const job3 = await get('WILFRED', 'OM-X-26-003');
  const awaitingQc = job3.job.operations.activities.find((a) => a.status === 'Awaiting QC');
  assert.ok(awaitingQc, 'demo job 3 has a workbook awaiting QC');
  const qc = { type: 'qc-review', id: awaitingQc.id, decision: 'approve', target: '', comments: '' };
  const byLead = await run('SHEREIQI', 'OM-X-26-003', [qc]);
  assert.equal(byLead.status, 403, 'only the QC reviewer approves QC');
  const byQc = await run('WILFRED', 'OM-X-26-003', [qc]);
  assert.equal(byQc.status, 200, JSON.stringify(byQc.data));
  assert.equal(byQc.data.job.operations.activities.find((a) => a.id === awaitingQc.id).status, 'Completed');
  // Scope release belongs to the scope selector; a laboratory engineer cannot release or re-scope a job.
  const scope = await run('NASSER', 'OM-X-26-006', [{ type: 'request-addition', title: 'Extra', reason: 'Probe', destination: 'PVT' }]);
  assert.equal(scope.status, 200, 'request additional work is open to employees on the job');
  const release = await run('NASSER', 'OM-X-26-006', [{ type: 'lab-scope', action: 'release', samples: [], conditions: {}, reason: 'x', phase: 1 }]);
  assert.equal(release.status, 403);
  // Someone with no access to the job is refused even though the laboratory permission alone would pass.
  const outsider = await run('YAQEEN', 'OM-X-26-006', [{ type: 'request-addition', title: 'Extra', reason: 'Probe', destination: 'Chemical' }]);
  assert.equal(outsider.status, 403);
  // Sampling: the coordinator dispatches; the driver cannot start the sampling job.
  const start = await run('ALI', 'OM-X-26-001', [{ type: 'start-job' }]);
  assert.equal(start.status, 403);
  // A stale revision is refused instead of overwriting newer work.
  const stale = await call('operations', 'POST', '/api/jobs/OM-X-26-003/operations', { cookie: await signIn('WILFRED'), params: { id: 'OM-X-26-003' }, json: { commands: [qc], revision: 1 } });
  assert.equal(stale.status, 409);
});

test('sampling data: the assigned engineer edits sampling records; job details stay with the coordinator', async () => {
  const mohsin = await signIn('MOHSIN');
  const j = (await call('workspace', 'GET', '/api/workspace', { cookie: mohsin })).data.jobs.find((x) => x.job.id === 'OM-X-26-001');
  const notes = { ...j.job, samples: j.job.samples.map((s, i) => i ? s : { ...s, remarks: 'Probe note' }) };
  const saved = await call('job', 'PUT', '/api/jobs/OM-X-26-001', { cookie: mohsin, params: { id: 'OM-X-26-001' }, json: { job: notes, revision: j.revision } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const details = { ...saved.data.job, dueDate: '2030-01-01' };
  assert.equal((await call('job', 'PUT', '/api/jobs/OM-X-26-001', { cookie: mohsin, params: { id: 'OM-X-26-001' }, json: { job: details, revision: saved.data.revision } })).status, 403);
  const husseini = await signIn('HUSSEINI');
  const backup = { ...saved.data.job, samples: saved.data.job.samples.map((s, i) => i ? s : { ...s, remarks: 'Backup edit' }) };
  assert.equal((await call('job', 'PUT', '/api/jobs/OM-X-26-001', { cookie: husseini, params: { id: 'OM-X-26-001' }, json: { job: backup, revision: saved.data.revision } })).status, 403, 'a backup without work access views only');
});

test('files: workbooks are released only to employees with job access and the workbook permission', async () => {
  const nasser = await signIn('NASSER');
  const form = new FormData(); form.set('file', new File(['a,b\n1,2'], 'DL.csv', { type: 'text/csv' }));
  const up = await call('files', 'POST', '/api/files', { cookie: nasser, body: form });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.equal((await call('file', 'GET', '/api/files/' + up.data.id, { cookie: nasser, params: { id: up.data.id } })).status, 200, 'the uploader can check an unattached upload');
  assert.equal((await call('file', 'GET', '/api/files/' + up.data.id, { cookie: await signIn('YAQEEN'), params: { id: up.data.id } })).status, 403);
  // An attached laboratory workbook needs the View workbook permission (Ahmed Al Shereiqi by default), not just job access.
  const job3 = (await call('workspace', 'GET', '/api/workspace', { cookie: await signIn('WILFRED') })).data.jobs.find((j) => j.job.id === 'OM-X-26-003').job;
  const workbook = job3.operations.activities.flatMap((a) => a.files).find((f) => f.id && f.name);
  await FILES.put(workbook.id, 'demo'); await DB.prepare('INSERT OR IGNORE INTO files (id, name, size, type, uploaded_by, uploaded_at) VALUES (?, ?, 4, ?, ?, ?)').bind(workbook.id, workbook.name, 'text/plain', 'NASSER', now.toISOString()).run();
  assert.equal((await call('file', 'GET', '/api/files/' + workbook.id, { cookie: await signIn('WILFRED'), params: { id: workbook.id } })).status, 403, 'no View workbook permission');
  const lead = await call('file', 'GET', '/api/files/' + workbook.id, { cookie: await signIn('SHEREIQI'), params: { id: workbook.id } });
  assert.equal(lead.status, 200); assert.equal(lead.headers.get('Cache-Control'), 'private, no-store');
});

test('send to sampling: the coordinator saves and dispatches in one server step; a no-op save changes nothing', async () => {
  const salim = await signIn('SALIM');
  const fresh = { ...demoJobs[0], id: 'OM-X-26-098', jobNumber: 'OM-X-26-098', globalSequence: 98, operations: undefined, workflowHistory: undefined, samples: [{ id: '1.01', sampler: 'PDS', bottle: 'PDS', bottleSerial: '', fieldData: {} }], events: [], samplingInstructions: 'Two bottom-hole samples', createdById: 'SALIM', ownerId: 'SALIM', status: 'Job Created' };
  const dispatch = { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI', team: [] };
  const sent = await call('job', 'PUT', '/api/jobs/OM-X-26-098', { cookie: salim, params: { id: fresh.id }, json: { job: fresh, revision: 0, commands: [dispatch] } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.ok(sent.data.job.operations.dispatchedAt); assert.equal(sent.data.job.operations.dispatchedBy, 'SALIM');
  const again = await call('job', 'PUT', '/api/jobs/OM-X-26-098', { cookie: salim, params: { id: fresh.id }, json: { job: { ...sent.data.job, workflowHistory: [] }, revision: sent.data.revision } });
  assert.deepEqual([again.status, again.data.revision], [200, sent.data.revision], 'nothing changed, nothing stored');
  // The driver cannot dispatch a job created by someone else.
  const other = { ...fresh, id: 'OM-X-26-097', jobNumber: 'OM-X-26-097', globalSequence: 97, createdById: 'ALI', ownerId: 'ALI' };
  assert.equal((await call('job', 'PUT', '/api/jobs/OM-X-26-097', { cookie: await signIn('ALI'), params: { id: other.id }, json: { job: other, revision: 0, commands: [dispatch] } })).status, 403);
});

test.after(async () => { await mf.dispose(); });
