// Temporary OneDrive for Business pilot: one sample job through the real Sites API routes (local D1 + R2 via
// Miniflare). Microsoft sign-in (device code flow) and Microsoft Graph are replaced by an in-memory stand-in that
// follows their rules (pending → approved, rotating refresh tokens, folder conflicts, upload rename).
// Sample data only. No Microsoft service is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSitesApi } from './fixtures/sites-api.mjs';

const PARENT = 'https://vaps-my.sharepoint.com/:f:/g/personal/pilot_vaps_example/SAMPLE-PILOT-FOLDER';
const ENV = { ONEDRIVE_TENANT_ID: '00000000-0000-0000-0000-0000000000aa', ONEDRIVE_CLIENT_ID: '00000000-0000-0000-0000-0000000000bb', ONEDRIVE_PARENT_URL: PARENT, ONEDRIVE_TOKEN_KEY: 'sample-token-encryption-key-for-tests-only-0123456789', ONEDRIVE_ACCOUNT: 'pilot.owner@vaps.example' };

/* ---------- In-memory Microsoft identity + Graph ---------- */
const ms = { approved: false, account: 'pilot.owner@vaps.example', down: false, refresh: new Set(), access: new Set(), issued: [], items: new Map(), calls: [], seq: 0 };
ms.items.set('parent', { id: 'parent', name: 'VAPS OneDrive Pilot', parent: null, folder: true });
const children = (p) => [...ms.items.values()].filter((i) => i.parent === p);
const pathOf = (i) => i.parent === null ? '' : (i.parent === 'parent' ? '' : pathOf(ms.items.get(i.parent)) + '/') + i.name;
const byPath = (path) => [...ms.items.values()].find((i) => i.parent !== null && pathOf(i) === path);
const folders = () => [...ms.items.values()].filter((i) => i.parent !== null && i.folder).map(pathOf).sort();
const inFolder = (path) => children(byPath(path).id).map((i) => i.name).sort();
const view = (i) => ({ id: i.id, name: i.name, webUrl: 'https://vaps-my.sharepoint.com/personal/pilot/Documents/VAPS OneDrive Pilot/' + pathOf(i), ...(i.folder ? { folder: {} } : { file: {} }), parentReference: { driveId: 'drv1' } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const issue = () => { const a = 'at-' + ++ms.seq, r = 'rt-' + ms.seq; ms.access.add(a); ms.refresh.add(r); ms.issued.push(a, r); return { access_token: a, refresh_token: r, expires_in: 3600 }; };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url), method = init.method || 'GET';
  if (url.hostname === 'login.microsoftonline.com') {
    const form = new URLSearchParams(String(init.body));
    assert.equal(form.get('client_id'), ENV.ONEDRIVE_CLIENT_ID); assert.equal(form.get('client_secret'), null, 'public client: no secret');
    if (url.pathname.endsWith('/devicecode')) { assert.match(form.get('scope'), /offline_access/); assert.deepEqual(form.get('scope').split(' ').sort(), ['Files.ReadWrite', 'User.Read', 'offline_access'], 'least privilege: no Files.ReadWrite.All'); return json({ device_code: 'device-code-secret', user_code: 'SMPL-CODE', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5 }); }
    const grant = form.get('grant_type');
    if (grant === 'urn:ietf:params:oauth:grant-type:device_code') { assert.equal(form.get('device_code'), 'device-code-secret'); return ms.approved ? json(issue()) : json({ error: 'authorization_pending' }, 400); }
    if (grant === 'refresh_token') { const rt = form.get('refresh_token'); if (!ms.refresh.has(rt)) return json({ error: 'invalid_grant' }, 400); return json(issue()); }
    return json({ error: 'unsupported_grant_type' }, 400);
  }
  if (url.hostname !== 'graph.microsoft.com') return realFetch(input, init);
  const path = decodeURIComponent(url.pathname.replace('/v1.0', ''));
  ms.calls.push(method + ' ' + path);
  if (!ms.access.has((init.headers?.Authorization || '').replace('Bearer ', ''))) return json({}, 401);
  if (path === '/me') return json({ userPrincipalName: ms.account });
  if (ms.delayMs) await new Promise((ok) => setTimeout(ok, ms.delayMs));
  if (ms.down) return json({ error: 'serviceUnavailable' }, 503);
  let m;
  if ((m = /^\/shares\/u!([^/]+)\/driveItem$/.exec(path))) {
    const decoded = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    return decoded === PARENT ? json(view(ms.items.get('parent'))) : json({}, 404);
  }
  if (method === 'POST' && (m = /^\/drives\/drv1\/items\/([^/]+)\/children$/.exec(path))) {
    const body = JSON.parse(init.body);
    assert.equal(body['@microsoft.graph.conflictBehavior'], 'fail', 'folders are never replaced');
    if (children(m[1]).some((c) => c.name.toLowerCase() === body.name.toLowerCase())) return json({ error: { code: 'nameAlreadyExists' } }, 409);
    const item = { id: 'item' + ++ms.seq, name: body.name, parent: m[1], folder: true }; ms.items.set(item.id, item); return json(view(item), 201);
  }
  if (method === 'GET' && (m = /^\/drives\/drv1\/items\/([^/:]+):\/(.+)$/.exec(path))) { const item = children(m[1]).find((c) => c.name === m[2]); return item ? json({ ...view(item), ...(item.folder ? {} : { size: Buffer.byteLength(item.content || '') }) }) : json({}, 404); }
  if (method === 'PUT' && (m = /^\/drives\/drv1\/items\/([^/:]+):\/(.+):\/content$/.exec(path))) {
    if (!ms.items.has(m[1])) return json({ error: { code: 'itemNotFound' } }, 404);
    assert.equal(url.searchParams.get('@microsoft.graph.conflictBehavior'), 'rename', 'uploads never replace an existing file');
    let name = m[2]; const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    for (let n = 1; children(m[1]).some((c) => c.name.toLowerCase() === name.toLowerCase()); n++) name = `${stem} ${n}${ext}`;
    const item = { id: 'item' + ++ms.seq, name, parent: m[1], content: Buffer.from(init.body).toString() }; ms.items.set(item.id, item);
    if (ms.storeThenFail) { ms.storeThenFail = false; return json({ error: 'gatewayTimeout' }, 504); } // stored, but the answer is lost
    return json(view(item), 201);
  }
  return json({ error: 'unexpected ' + method + ' ' + path }, 400);
};

/* ---------- Workflow VAPS API ---------- */
const { mf, DB, api, call } = await startSitesApi({
  login: 'app/api/auth/login/route.ts', password: 'app/api/auth/password/route.ts', job: 'app/api/jobs/[id]/route.ts',
  files: 'app/api/files/route.ts', admin: 'app/api/admin/onedrive/route.ts', jobCopy: 'app/api/jobs/[id]/onedrive/route.ts', trash: 'app/api/jobs/[id]/trash/route.ts',
}, 'export * as auth from "./server/auth.ts"; export { resetOneDriveCache, oneDriveConfig } from "./server/onedrive.ts"; export { settleBackground } from "./server/background.ts";', ENV);

const cookieOf = (c) => c.split(';')[0];
async function account(employeeId, password) {
  const boot = await api.auth.createAccount(DB, { accountId: 'bootstrap', employeeId: 'MA001' }, { username: employeeId.toLowerCase(), employeeId }, () => true);
  const first = cookieOf((await call('login', 'POST', '/', { json: { username: employeeId.toLowerCase(), password: boot.temporaryPassword } })).setCookie);
  assert.equal((await call('password', 'POST', '/', { cookie: first, json: { currentPassword: boot.temporaryPassword, newPassword: password } })).status, 200);
  return cookieOf((await call('login', 'POST', '/', { json: { username: employeeId.toLowerCase(), password } })).setCookie);
}
// MA001 stays the Administrator (connects OneDrive, retries); SALIM, the default job creator, creates the sample job.
const ma = await account('MA001', 'Administrator pilot passphrase');
const salim = await account('SALIM', 'Coordinator pilot passphrase');
const admin = (json, cookie = ma) => call('admin', 'POST', '/', { cookie, json });

const at = new Date().toISOString(), day = at.slice(0, 10), id = 'OM-P-26-902';
const sampleJob = { id, globalSequence: 902, jobNumber: id, clientCode: 'P', clientName: 'Sample Client', countryCode: 'OM', dateReceived: day, description: 'OneDrive pilot sample job (sample data).', samplingSource: 'Wellhead Sampling', fieldArea: 'Sample Field', well: 'SAMPLE-2', requiredTests: [], samples: [], stages: [], events: [], status: 'Job Created', currentStage: 'Job Setup', nextAction: 'Send to Sampling', ownerId: 'SALIM', responsibleId: 'SALIM', jobResponsibleId: 'SALIM', createdById: 'SALIM', createdAt: at, lastUpdatedById: 'SALIM', lastUpdatedAt: at, dueDate: day };
let revision = 0;
const save = async (job) => { const r = await call('job', 'PUT', '/', { cookie: salim, params: { id }, json: { job, revision } }); assert.equal(r.status, 200, 'save: ' + JSON.stringify(r.data)); revision = r.data.revision; return r; };
const upload = async (name, purpose, content = name + ' sample content', cookie = salim) => {
  const f = new FormData(); f.set('file', new File([content], name, { type: 'text/csv' })); f.set('anyType', '1');
  if (purpose) { f.set('jobId', id); f.set('purpose', purpose); }
  return call('files', 'POST', '/', { cookie, body: f });
};
const jobCopy = async (cookie = salim) => (await call('jobCopy', 'GET', '/', { cookie, params: { id } })).data;
const folderCreates = () => ms.calls.filter((c) => /^POST \/drives\/drv1\/items\/.+\/children$/.test(c)).length;
const allReplies = [];

test('before connecting: the job saves in Workflow VAPS; the panel says OneDrive is not connected', async () => {
  const r = await save(sampleJob); allReplies.push(r);
  assert.equal(r.data.copy.status, 'error'); assert.match(r.data.copy.message, /not connected.*saved in Workflow VAPS/s);
  const st = await jobCopy();
  assert.deepEqual([st.configured, st.connected, st.canManage], [true, false, false]);
  assert.equal(folders().length, 0);
});

test('MA001 connects the VAPS Microsoft account with device sign-in; nobody else can', async () => {
  assert.equal((await admin({ action: 'connect' }, salim)).status, 403);
  const start = await admin({ action: 'connect' }); allReplies.push(start);
  assert.equal(start.status, 200);
  assert.deepEqual([start.data.status, start.data.signIn.url, start.data.signIn.code], ['pending', 'https://microsoft.com/devicelogin', 'SMPL-CODE']);
  assert.equal((await admin({ action: 'poll' })).data.status, 'pending', 'not approved yet');
  // A different Microsoft account approves: refused, nothing stored.
  ms.approved = true; ms.account = 'someone.else@vaps.example';
  let polled = await admin({ action: 'poll' });
  assert.equal(polled.data.status, 'not-connected'); assert.match(polled.data.error, /different Microsoft account/);
  ms.account = 'pilot.owner@vaps.example'; ms.approved = false;
  await admin({ action: 'connect' }); ms.approved = true;
  polled = await admin({ action: 'poll' }); allReplies.push(polled);
  assert.deepEqual([polled.data.status, polled.data.account], ['connected', 'pilot.owner@vaps.example']);
  const row = await DB.prepare("SELECT sealed, pending FROM onedrive_auth WHERE id = 'default'").first();
  assert.equal(row.pending, null);
  for (const t of ms.issued) assert.ok(!row.sealed.includes(t), 'the refresh token is stored encrypted');
});

test('first successful save: Workflow VAPS creates <Job ID>/Sampling and <Job ID>/Lab under the parent folder', async () => {
  const r = await save({ ...sampleJob, description: 'First save after connecting.' }); allReplies.push(r);
  assert.deepEqual(r.data.copy, { status: 'ok' });
  assert.deepEqual(folders(), [id, id + '/Lab', id + '/Sampling']);
  assert.match((await jobCopy()).job.folderUrl, /VAPS OneDrive Pilot\/OM-P-26-902$/);
});

test('a sample G-sheet and lab workbook uploaded through the app reach Sampling and Lab', async () => {
  const gs = await upload('G-sheet.csv', 'sampling-sheet', 'sample G-sheet v1'); allReplies.push(gs);
  assert.equal(gs.status, 201); assert.deepEqual(gs.data.copy, { status: 'ok', name: 'G-sheet.csv', renamed: false, savedInVaps: true });
  const wb = await upload('PVT-workbook.csv', 'lab-workbook', 'sample lab workbook');
  assert.equal(wb.data.copy.status, 'ok');
  assert.deepEqual(inFolder(id + '/Sampling'), ['G-sheet.csv']);
  assert.deepEqual(inFolder(id + '/Lab'), ['PVT-workbook.csv']);
  assert.equal(byPath(id + '/Sampling/G-sheet.csv').content, 'sample G-sheet v1');
  assert.deepEqual(Object.keys(gs.data).filter((k) => k !== 'copy').sort(), ['id', 'name', 'size', 'type'], 'the job file reference is unchanged');
});

test('Connect pressed again while connected: a new sign-in code is issued and the connection stays in place', async () => {
  const again = await admin({ action: 'connect' });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal(again.data.signIn.code, 'SMPL-CODE');
  assert.equal((await call('admin', 'GET', '/', { cookie: ma })).data.status, 'connected');
  await DB.prepare("UPDATE onedrive_auth SET pending = NULL, pending_expires = NULL WHERE id = 'default'").run();
});

test('access token expired: the stored refresh token is used and the rotated one is stored again, encrypted', async () => {
  const before = (await DB.prepare("SELECT sealed FROM onedrive_auth WHERE id = 'default'").first()).sealed;
  api.resetOneDriveCache();
  const up = await upload('After-refresh.csv', 'lab-workbook');
  assert.deepEqual(up.data.copy, { status: 'ok', name: 'After-refresh.csv', renamed: false, savedInVaps: true });
  const row = await DB.prepare("SELECT status, sealed FROM onedrive_auth WHERE id = 'default'").first();
  assert.equal(row.status, 'connected'); assert.notEqual(row.sealed, before, 'rotated refresh token stored');
  for (const t of ms.issued) assert.ok(!row.sealed.includes(t));
});

test('saving the job again reuses both folders', async () => {
  const before = folderCreates();
  await save({ ...sampleJob, description: 'Second save.' });
  await save({ ...sampleJob, description: 'Third save.' });
  assert.equal(folderCreates(), before);
  assert.deepEqual(folders(), [id, id + '/Lab', id + '/Sampling']);
});

test('two files with the same name: both are preserved; the job shows the name OneDrive used', async () => {
  const again = await upload('G-sheet.csv', 'sampling-sheet', 'sample G-sheet v2');
  assert.deepEqual(again.data.copy, { status: 'ok', name: 'G-sheet 1.csv', renamed: true, savedInVaps: true });
  assert.equal(byPath(id + '/Sampling/G-sheet.csv').content, 'sample G-sheet v1');
  assert.equal(byPath(id + '/Sampling/G-sheet 1.csv').content, 'sample G-sheet v2');
  const row = (await jobCopy()).files.find((f) => f.id === again.data.id);
  assert.deepEqual([row.folder, row.name, row.copyName, row.renamed], ['Sampling', 'G-sheet.csv', 'G-sheet 1.csv', true]);
});

test('OneDrive unavailable: the original stays saved in Workflow VAPS, the job shows the failed copy, MA001 retries', async () => {
  ms.down = true;
  const up = await upload('Lab-results.csv', 'lab-workbook');
  assert.equal(up.status, 201, 'stored in Workflow VAPS');
  assert.deepEqual([up.data.copy.status, up.data.copy.savedInVaps], ['error', true]); assert.match(up.data.copy.message, /OneDrive/);
  const failed = (await jobCopy()).files.find((f) => f.id === up.data.id);
  // A 5xx during the upload may still have stored the file, so the copy is "uncertain": the retry checks the folder first.
  assert.deepEqual([failed.status, failed.savedInVaps, failed.folder], ['uncertain', true, 'Lab']);
  assert.equal((await admin({ action: 'retry', jobId: id }, salim)).status, 403, 'retry is MA001 only');
  ms.down = false;
  const retry = await admin({ action: 'retry', jobId: id });
  assert.equal(retry.data.copy.status, 'ok');
  assert.equal(retry.data.files.find((f) => f.id === up.data.id).status, 'ok');
  assert.deepEqual(inFolder(id + '/Lab'), ['After-refresh.csv', 'Lab-results.csv', 'PVT-workbook.csv']);
});

test('lost bookkeeping: existing folders are found and reused, not duplicated', async () => {
  await DB.prepare('DELETE FROM onedrive_jobs').run(); api.resetOneDriveCache();
  await save({ ...sampleJob, description: 'After bookkeeping loss.' });
  assert.deepEqual(folders(), [id, id + '/Lab', id + '/Sampling']);
});

test('job folder deleted in OneDrive: the next copy re-creates <Job ID>/Sampling and Lab instead of failing forever', async () => {
  const gone = [...ms.items.values()].filter((i) => i.parent !== null && (pathOf(i) === id || pathOf(i).startsWith(id + '/')));
  for (const i of gone) ms.items.delete(i.id);
  assert.deepEqual(folders(), []);
  const up = await upload('After-delete.csv', 'sampling-sheet');
  assert.equal(up.status, 201); assert.deepEqual(up.data.copy, { status: 'ok', name: 'After-delete.csv', renamed: false, savedInVaps: true });
  assert.deepEqual(folders(), [id, id + '/Lab', id + '/Sampling']);
  assert.deepEqual(inFolder(id + '/Sampling'), ['After-delete.csv']);
  assert.equal((await jobCopy()).job.status, 'ok');
});

test('sign-in revoked: copies fail with "not connected", originals stay in Workflow VAPS; reconnecting resumes', async () => {
  ms.refresh.clear(); ms.access.clear(); api.resetOneDriveCache();
  const up = await upload('After-revoke.csv', 'lab-workbook');
  assert.equal(up.status, 201); assert.match(up.data.copy.message, /not connected/);
  assert.equal((await call('admin', 'GET', '/', { cookie: ma })).data.status, 'expired');
  assert.equal((await DB.prepare("SELECT sealed FROM onedrive_auth").first()).sealed, null, 'the dead token is removed');
  await admin({ action: 'connect' }); assert.equal((await admin({ action: 'poll' })).data.status, 'connected');
  await save({ ...sampleJob, description: 'After reconnecting.' });
  assert.ok(inFolder(id + '/Lab').includes('After-revoke.csv'));
});

test('tokens, codes and the folder link never reach a reply, the audit log or plain storage', async () => {
  allReplies.push(await call('admin', 'GET', '/', { cookie: ma }), { data: await jobCopy(ma) });
  const replies = JSON.stringify(allReplies.map((r) => r.data));
  assert.doesNotMatch(replies, /device-code-secret|\bat-\d|\brt-\d|SAMPLE-PILOT-FOLDER|sample-token-encryption-key/);
  const audit = JSON.stringify((await DB.prepare('SELECT detail FROM audit_log').all()).results);
  assert.doesNotMatch(audit, /device-code-secret|\bat-\d|\brt-\d|SMPL-CODE|SAMPLE-PILOT-FOLDER/);
  const stored = JSON.stringify((await DB.prepare('SELECT * FROM onedrive_auth').all()).results);
  assert.doesNotMatch(stored, /device-code-secret|\brt-\d|\bat-\d/);
});

test('every upload point in the app names its job and the right purpose', async () => {
  const fs = await import('node:fs');
  const src = ['app/operations-workspace.tsx', 'app/lab-planning.tsx'].map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  const calls = [...src.matchAll(/storeWorkbook\(([^;]*?)\)(?=;|\))/g)].map((m) => m[1]);
  assert.equal(calls.length, 4, calls.join('\n'));
  for (const c of calls) assert.match(c, /jobId: ?job\.id/, c);
  assert.ok(calls.some((c) => c.includes("kind==='sampling'?'sampling-sheet':'final-report'")));
  for (const p of ['lab-workbook', 'external-results', 'sampling-report']) assert.ok(calls.some((c) => c.includes(`'${p}'`)), p);
});

/* ---------- Reliability fixes (review of PR #68: O1, O2, O3, O4, O6, O9) ---------- */
const sampling = () => inFolder(id + '/Sampling'), lab = () => inFolder(id + '/Lab');
const connectAgain = async () => { ms.approved = true; await admin({ action: 'connect' }); assert.equal((await admin({ action: 'poll' })).data.status, 'connected'); };

test('O1: a Retry and a save at the same moment copy a failed file once (no "name 1" duplicate)', async () => {
  ms.down = true;
  const up = await upload('Concurrent.csv', 'lab-workbook');
  ms.down = false;
  await Promise.all([admin({ action: 'retry', jobId: id }), save({ ...sampleJob, description: 'Concurrent save.' })]);
  await api.settleBackground();
  assert.deepEqual(lab().filter((n) => n.startsWith('Concurrent')), ['Concurrent.csv']);
  assert.equal((await jobCopy()).files.find((f) => f.id === up.data.id).status, 'ok');
});

test('O1: an upload that reached OneDrive but whose answer was lost is recorded on the next save, not uploaded again', async () => {
  ms.storeThenFail = true;
  const up = await upload('Unconfirmed.csv', 'sampling-sheet');
  assert.equal(up.status, 201, 'stored in Workflow VAPS');
  assert.equal((await jobCopy()).files.find((f) => f.id === up.data.id).status, 'uncertain');
  await save({ ...sampleJob, description: 'After a lost upload answer.' });
  await api.settleBackground();
  assert.deepEqual(sampling().filter((n) => n.startsWith('Unconfirmed')), ['Unconfirmed.csv']);
  assert.equal((await jobCopy()).files.find((f) => f.id === up.data.id).status, 'ok');
});

test('O2: a job error from a save while disconnected clears once OneDrive works again', async () => {
  await admin({ action: 'disconnect' });
  await save({ ...sampleJob, description: 'Saved while disconnected.' });
  assert.equal((await jobCopy()).job.status, 'error');
  await connectAgain();
  await save({ ...sampleJob, description: 'Saved after reconnecting.' });
  await api.settleBackground();
  const after = await jobCopy();
  assert.equal(after.job.status, 'ok'); assert.equal(after.job.error, null);
});

test('O4: disconnecting stops copies everywhere at once, even where an access token is still cached', async () => {
  // Another Worker instance disconnected: only the stored connection changes; this instance keeps its cached token.
  await DB.prepare("UPDATE onedrive_auth SET status = 'not-connected', sealed = NULL").run();
  const up = await upload('After-disconnect.csv', 'sampling-sheet');
  assert.match(up.data.copy.message, /not connected/);
  assert.ok(!sampling().includes('After-disconnect.csv'));
  await connectAgain();
});

test('O3: a slow OneDrive does not hold the upload: the reply says "queued" and the copy finishes afterwards', async () => {
  ms.delayMs = 3500;
  const started = Date.now();
  const up = await upload('Slow.csv', 'lab-workbook');
  const waited = Date.now() - started;
  ms.delayMs = 0;
  assert.equal(up.status, 201); assert.equal(up.data.copy.status, 'queued');
  assert.ok(waited < 3500, `the reply did not wait for OneDrive (${waited} ms)`);
  await api.settleBackground();
  assert.ok(lab().includes('Slow.csv'));
  assert.equal((await jobCopy()).files.find((f) => f.id === up.data.id).status, 'ok');
});

test('O9: trashing a job never creates its OneDrive folders', async () => {
  const other = 'OM-P-26-903', env = globalThis.__vapsTestEnv, keep = env.ONEDRIVE_CLIENT_ID;
  delete env.ONEDRIVE_CLIENT_ID; // created while the pilot is off: no folders yet
  const made = await call('job', 'PUT', '/', { cookie: salim, params: { id: other }, json: { job: { ...sampleJob, id: other, jobNumber: other, globalSequence: 903 }, revision: 0 } });
  env.ONEDRIVE_CLIENT_ID = keep;
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const trashed = await call('trash', 'POST', '/', { cookie: ma, params: { id: other }, json: { mode: 'trash', revision: made.data.revision } });
  assert.equal(trashed.status, 200, JSON.stringify(trashed.data));
  await api.settleBackground();
  assert.ok(!folders().some((f) => f === other || f.startsWith(other + '/')), 'no folders for a trashed job');
});

test('O6: the account and the VAPS tenant are required; "common" and "organizations" are refused', () => {
  const base = { ...ENV };
  assert.ok(api.oneDriveConfig(base));
  assert.equal(api.oneDriveConfig({ ...base, ONEDRIVE_ACCOUNT: '' }), null);
  assert.equal(api.oneDriveConfig({ ...base, ONEDRIVE_TENANT_ID: '' }), null);
  for (const t of ['common', 'organizations', 'consumers']) assert.equal(api.oneDriveConfig({ ...base, ONEDRIVE_TENANT_ID: t }), null, t);
});

test('not configured: Workflow VAPS works as before and no Microsoft service is contacted', async () => {
  for (const k of Object.keys(ENV)) delete globalThis.__vapsTestEnv[k];
  const calls = ms.calls.length;
  assert.deepEqual((await save({ ...sampleJob, description: 'Pilot off.' })).data.copy, { status: 'off' });
  assert.equal((await upload('off.csv', 'lab-workbook')).data.copy.status, 'off');
  assert.equal((await jobCopy()).configured, false, 'the job panel stays hidden');
  assert.equal(ms.calls.length, calls);
});

test.after(() => mf.dispose());
