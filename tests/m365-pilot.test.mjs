// Microsoft 365 pilot: one sample job through the real Sites API routes (local D1 + R2 via Miniflare), with Microsoft
// Graph replaced by an in-memory stand-in that follows Graph's folder, upload-conflict and list-item rules.
// Sample data only. No Microsoft tenant is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSitesApi } from './fixtures/sites-api.mjs';

const SECRET = 'test-client-secret-never-returned';
const M365 = { MS_TENANT_ID: '00000000-0000-0000-0000-000000000001', MS_CLIENT_ID: '00000000-0000-0000-0000-000000000002', MS_CLIENT_SECRET: SECRET, SHAREPOINT_SITE_URL: 'https://vaps.sharepoint.com/sites/VAPS-Jobs-Pilot' };

/* ---------- In-memory Microsoft Graph ---------- */
const graph = { items: new Map(), rows: new Map(), calls: [], down: false, tokens: 0 };
let seq = 0;
const newId = () => 'item' + ++seq;
graph.items.set('root', { id: 'root', name: 'root', parent: null, folder: true });
const children = (parent) => [...graph.items.values()].filter((i) => i.parent === parent);
const pathOf = (item) => item.parent === 'root' ? item.name : pathOf(graph.items.get(item.parent)) + '/' + item.name;
const byPath = (path) => [...graph.items.values()].find((i) => i.id !== 'root' && pathOf(i) === path);
const view = (i) => ({ id: i.id, name: i.name, webUrl: 'https://vaps.sharepoint.com/sites/VAPS-Jobs-Pilot/Jobs/' + pathOf(i), ...(i.folder ? { folder: {} } : { file: {} }) });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url), method = init.method || 'GET';
  if (url.hostname === 'login.microsoftonline.com') {
    const form = new URLSearchParams(String(init.body));
    if (form.get('client_secret') !== SECRET || form.get('grant_type') !== 'client_credentials') return json({ error: 'invalid_client' }, 401);
    graph.tokens++; return json({ access_token: 'token-' + graph.tokens, expires_in: 3600 });
  }
  if (url.hostname !== 'graph.microsoft.com') return realFetch(input, init);
  const path = decodeURIComponent(url.pathname.replace('/v1.0', ''));
  graph.calls.push(method + ' ' + path);
  if (!/^Bearer token-\d+$/.test(init.headers?.Authorization || '')) return json({}, 401);
  if (graph.down) return json({ error: 'serviceUnavailable' }, 503);
  if (path === '/sites/vaps.sharepoint.com:/sites/VAPS-Jobs-Pilot') return json({ id: 'site1' });
  if (path === '/sites/site1/drives') return json({ value: [{ id: 'drv-docs', name: 'Documents' }, { id: 'drv1', name: 'Jobs' }] });
  if (path === '/sites/site1/lists') return json({ value: [{ id: 'lst1', displayName: 'Job Register' }] });
  let m;
  if (method === 'POST' && (m = /^\/drives\/drv1\/(?:root|items\/([^/]+))\/children$/.exec(path))) {
    const parent = m[1] || 'root', body = JSON.parse(init.body);
    assert.equal(body['@microsoft.graph.conflictBehavior'], 'fail', 'folders are never replaced');
    if (children(parent).some((c) => c.name.toLowerCase() === body.name.toLowerCase())) return json({ error: { code: 'nameAlreadyExists' } }, 409);
    const item = { id: newId(), name: body.name, parent, folder: true }; graph.items.set(item.id, item); return json(view(item), 201);
  }
  if (method === 'GET' && (m = /^\/drives\/drv1\/root:\/(.+)$/.exec(path))) { const item = byPath(m[1]); return item ? json(view(item)) : json({}, 404); }
  if (method === 'PUT' && (m = /^\/drives\/drv1\/items\/([^/:]+):\/(.+):\/content$/.exec(path))) {
    assert.equal(url.searchParams.get('@microsoft.graph.conflictBehavior'), 'rename', 'uploads never replace an existing file');
    let name = m[2]; const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    for (let n = 1; children(m[1]).some((c) => c.name.toLowerCase() === name.toLowerCase()); n++) name = `${stem} ${n}${ext}`;
    const item = { id: newId(), name, parent: m[1], content: Buffer.from(init.body).toString() }; graph.items.set(item.id, item); return json(view(item), 201);
  }
  if (path === '/sites/site1/lists/lst1/items' && method === 'GET') {
    const title = /fields\/Title eq '(.+)'/.exec(url.searchParams.get('$filter'))[1].replace(/''/g, "'");
    return json({ value: [...graph.rows.values()].filter((r) => r.fields.Title === title).map((r) => ({ id: r.id })) });
  }
  if (path === '/sites/site1/lists/lst1/items' && method === 'POST') {
    const { fields } = JSON.parse(init.body);
    if ([...graph.rows.values()].some((r) => r.fields.Title === fields.Title)) return json({ error: 'unique' }, 409); // Title: Enforce unique values
    const row = { id: String(graph.rows.size + 1), fields }; graph.rows.set(row.id, row); return json(row, 201);
  }
  if (method === 'PATCH' && (m = /^\/sites\/site1\/lists\/lst1\/items\/([^/]+)\/fields$/.exec(path))) {
    const row = graph.rows.get(m[1]); if (!row) return json({}, 404);
    Object.assign(row.fields, JSON.parse(init.body)); return json(row.fields);
  }
  return json({ error: 'unexpected ' + method + ' ' + path }, 400);
};

/* ---------- VAPS API ---------- */
const { mf, DB, api, call } = await startSitesApi({
  login: 'app/api/auth/login/route.ts', password: 'app/api/auth/password/route.ts', job: 'app/api/jobs/[id]/route.ts', operations: 'app/api/jobs/[id]/operations/route.ts',
  files: 'app/api/files/route.ts', file: 'app/api/files/[id]/route.ts', sync: 'app/api/admin/sharepoint/route.ts',
}, 'export * as auth from "./server/auth.ts"; export { resetSharePointCache } from "./server/sharepoint.ts";', M365);

const cookieOf = (c) => c.split(';')[0];
async function account(employeeId, password) {
  const boot = await api.auth.createAccount(DB, { accountId: 'bootstrap', employeeId: 'MA001' }, { username: employeeId.toLowerCase(), employeeId }, () => true);
  const first = cookieOf((await call('login', 'POST', '/', { json: { username: employeeId.toLowerCase(), password: boot.temporaryPassword } })).setCookie);
  assert.equal((await call('password', 'POST', '/', { cookie: first, json: { currentPassword: boot.temporaryPassword, newPassword: password } })).status, 200);
  return cookieOf((await call('login', 'POST', '/', { json: { username: employeeId.toLowerCase(), password } })).setCookie);
}
// MA001 stays the Administrator (SharePoint sync status/retry); the default job creator (SALIM) creates the sample job.
const ma = await account('MA001', 'Administrator pilot passphrase');
const salim = await account('SALIM', 'Coordinator pilot passphrase');

const at = new Date().toISOString(), day = at.slice(0, 10), id = 'OM-P-26-901';
const sampleJob = { id, globalSequence: 901, jobNumber: id, clientCode: 'P', clientName: 'Sample Client', countryCode: 'OM', dateReceived: day, description: 'Microsoft 365 pilot sample job (sample data).', samplingSource: 'Wellhead Sampling', fieldArea: 'Sample Field', well: 'SAMPLE-1', requiredTests: [], samples: [], stages: [], events: [], status: 'Job Created', currentStage: 'Job Setup', nextAction: 'Send to Sampling', ownerId: 'SALIM', responsibleId: 'SALIM', jobResponsibleId: 'SALIM', createdById: 'SALIM', createdAt: at, lastUpdatedById: 'SALIM', lastUpdatedAt: at, dueDate: day };
let revision = 0;
const save = async (job) => { const r = await call('job', 'PUT', '/', { cookie: salim, params: { id }, json: { job, revision } }); assert.equal(r.status, 200, 'save: ' + JSON.stringify(r.data)); revision = r.data.revision; return r; };
const upload = async (name, section, content = name + ' sample content', jobId = id) => {
  const f = new FormData(); f.set('file', new File([content], name, { type: 'text/csv' })); f.set('anyType', '1');
  if (section !== undefined) { f.set('jobId', jobId); f.set('section', section); }
  return call('files', 'POST', '/', { cookie: salim, body: f });
};
const folderCreates = () => graph.calls.filter((c) => /^POST \/drives\/drv1\/.*children$/.test(c)).length;
const tree = () => [...graph.items.values()].filter((i) => i.id !== 'root').map(pathOf).sort();

test('first save creates <Job ID>/Sampling and <Job ID>/Lab and one register row', async () => {
  const r = await save(sampleJob);
  assert.deepEqual(r.data.sharepoint, { status: 'ok' });
  assert.deepEqual(tree(), [id, id + '/Lab', id + '/Sampling']);
  assert.equal(graph.rows.size, 1);
  const row = [...graph.rows.values()][0].fields;
  assert.deepEqual([row.Title, row.JobNumber, row.ClientName, row.Well, row.Status], [id, id, 'Sample Client', 'SAMPLE-1', 'Job Created']);
  assert.match(row.FolderUrl, /\/Jobs\/OM-P-26-901$/);
  assert.equal((await DB.prepare('SELECT status FROM sharepoint_jobs WHERE job_id = ?').bind(id).first()).status, 'ok');
});

test('a later save updates the same register row and creates no folders', async () => {
  const before = folderCreates();
  await save({ ...sampleJob, description: 'Updated sample description.', status: 'In Progress', currentStage: 'Sampling Preparation' });
  assert.equal(folderCreates(), before, 'folders known in D1 are reused');
  assert.equal(graph.rows.size, 1);
  assert.equal([...graph.rows.values()][0].fields.CurrentStage, 'Sampling Preparation');
});

test('uploads are routed by workflow section; a same-name upload never overwrites', async () => {
  const gs = await upload('G-sheet.csv', 'sampling', 'first G-sheet');
  assert.equal(gs.status, 201); assert.deepEqual(gs.data.sharepoint, { status: 'ok', name: 'G-sheet.csv', renamed: false });
  const lab = await upload('DL.csv', 'lab');
  assert.equal(lab.data.sharepoint.status, 'ok');
  const again = await upload('G-sheet.csv', 'sampling', 'second G-sheet');
  assert.deepEqual(again.data.sharepoint, { status: 'ok', name: 'G-sheet 1.csv', renamed: true });
  assert.equal(byPath(id + '/Sampling/G-sheet.csv').content, 'first G-sheet', 'the existing file is unchanged');
  assert.equal(byPath(id + '/Sampling/G-sheet 1.csv').content, 'second G-sheet');
  assert.ok(byPath(id + '/Lab/DL.csv'));
  // The VAPS copy (R2 + D1) is unchanged in behaviour: the reference has the same four fields as before.
  assert.deepEqual(Object.keys(gs.data).filter((k) => k !== 'sharepoint').sort(), ['id', 'name', 'size', 'type']);
  assert.equal((await DB.prepare('SELECT sp_name FROM sharepoint_files WHERE file_id = ?').bind(again.data.id).first()).sp_name, 'G-sheet 1.csv');
});

test('upload checks: section must be Sampling or Lab; the job must exist and be open to the employee', async () => {
  assert.equal((await upload('x.csv', 'reports')).status, 400);
  assert.equal((await upload('x.csv', 'lab', 'x', 'OM-P-26-999')).status, 404);
  const plain = await upload('no-job.csv', undefined);
  assert.equal(plain.status, 201); assert.equal(plain.data.sharepoint, undefined, 'no job given: stored in VAPS only, as before');
  const other = await account('RANJITH', 'Unassigned engineer pilot passphrase');
  const f = new FormData(); f.set('file', new File(['x'], 'x.csv')); f.set('anyType', '1'); f.set('jobId', id); f.set('section', 'lab');
  const denied = await call('files', 'POST', '/', { cookie: other, body: f });
  assert.equal(denied.status, 403, 'an employee without access to the job cannot route files into it');
  assert.equal((await call('sync', 'GET', '/', { cookie: other })).status, 403, 'sync status is Administrator only');
});

test('SharePoint outage: VAPS saves and uploads still succeed; the next save retries and reuses folders', async () => {
  graph.down = true;
  const up = await upload('PVT-workbook.csv', 'lab');
  assert.equal(up.status, 201, 'the file is stored in VAPS');
  assert.equal(up.data.sharepoint.status, 'error'); assert.match(up.data.sharepoint.message, /stored in VAPS/);
  const r = await save({ ...sampleJob, description: 'Saved during outage.' });
  assert.equal(r.data.sharepoint.status, 'error');
  assert.equal((await call('sync', 'GET', '/', { cookie: ma })).data.files.length, 1);
  graph.down = false;
  const before = folderCreates();
  assert.equal((await save({ ...sampleJob, description: 'Saved after outage.' })).data.sharepoint.status, 'ok');
  assert.ok(byPath(id + '/Lab/PVT-workbook.csv'), 'the failed copy was retried');
  assert.equal(folderCreates(), before);
  assert.equal(graph.rows.size, 1);
  const status = (await call('sync', 'GET', '/', { cookie: ma })).data;
  assert.deepEqual([status.configured, status.jobs.length, status.files.length], [true, 0, 0]);
});

test('lost bookkeeping: existing folders and the register row are found and reused, not duplicated', async () => {
  await DB.prepare('DELETE FROM sharepoint_jobs').run();
  api.resetSharePointCache();
  const r = await call('sync', 'POST', '/', { cookie: ma, json: { jobId: id } });
  assert.equal(r.status, 200); assert.equal(r.data.sharepoint.status, 'ok');
  assert.deepEqual(tree().filter((p) => !p.includes('.csv')), [id, id + '/Lab', id + '/Sampling']);
  assert.equal(graph.rows.size, 1);
  // Someone deleted the register row in SharePoint: it is added back once.
  graph.rows.clear();
  await save({ ...sampleJob, description: 'Row re-added.' });
  assert.equal(graph.rows.size, 1);
});

test('credentials stay on the server; replies and the audit trail never contain them', async () => {
  const replies = JSON.stringify([await save({ ...sampleJob }), await upload('check.csv', 'lab'), await call('sync', 'GET', '/', { cookie: ma })]);
  assert.doesNotMatch(replies, new RegExp(SECRET + '|token-\\d|' + M365.MS_CLIENT_ID));
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE instr(detail, ?) > 0 OR instr(detail, ?) > 0').bind(SECRET, 'token-').first()).n, 0);
});

test('not configured: VAPS works as before and SharePoint is not contacted', async () => {
  for (const k of Object.keys(M365)) delete globalThis.__vapsTestEnv[k];
  const calls = graph.calls.length;
  assert.deepEqual((await save({ ...sampleJob, description: 'Pilot off.' })).data.sharepoint, { status: 'off' });
  assert.equal((await upload('off.csv', 'lab')).data.sharepoint.status, 'off');
  assert.equal(graph.calls.length, calls);
});

test.after(() => mf.dispose());
