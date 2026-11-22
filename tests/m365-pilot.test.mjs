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
  files: 'app/api/files/route.ts', file: 'app/api/files/[id]/route.ts', sync: 'app/api/admin/sharepoint/route.ts', jobSync: 'app/api/jobs/[id]/sharepoint/route.ts',
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
const upload = async (name, purpose, content = name + ' sample content', jobId = id) => {
  const f = new FormData(); f.set('file', new File([content], name, { type: name.endsWith('.pdf') ? 'application/pdf' : 'text/csv' })); f.set('anyType', '1');
  if (purpose !== undefined) { f.set('jobId', jobId); f.set('purpose', purpose); }
  return call('files', 'POST', '/', { cookie: salim, body: f });
};
const folderCreates = () => graph.calls.filter((c) => /^POST \/drives\/drv1\/.*children$/.test(c)).length;
const tree = () => [...graph.items.values()].filter((i) => i.id !== 'root' && i.folder).map(pathOf).sort();
const inFolder = (folder) => children(byPath(id + '/' + folder).id).map((i) => i.name).sort();
const jobStatus = async (cookie = salim) => (await call('jobSync', 'GET', '/', { cookie, params: { id } })).data;

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

test('every supported job file reaches its folder: Sampling (scope, sampling sheet, sampling report) and Lab (workbook, external results, final report)', async () => {
  const sheet = await upload('G-sheet.csv', 'sampling-sheet', 'first G-sheet');
  assert.equal(sheet.status, 201); assert.deepEqual(sheet.data.sharepoint, { status: 'ok', name: 'G-sheet.csv', renamed: false, savedInVaps: true });
  for (const [name, purpose] of [['OM-P-26-901-Sampling-and-Analysis-Report-v1.pdf', 'sampling-report'], ['DL.csv', 'lab-workbook'], ['External-results.pdf', 'external-results'], ['Final-report.pdf', 'final-report']])
    assert.equal((await upload(name, purpose)).data.sharepoint.status, 'ok', purpose);
  // The scope-of-work attachment is kept in the job record (data URL); the save routes it to Sampling.
  const scope = { name: 'Scope of work.pdf', type: 'application/pdf', size: 16, dataUrl: 'data:application/pdf;base64,' + Buffer.from('sample scope v1').toString('base64') };
  await save({ ...sampleJob, scopeOfWorkAttachment: scope });
  assert.deepEqual(inFolder('Sampling'), ['G-sheet.csv', 'OM-P-26-901-Sampling-and-Analysis-Report-v1.pdf', 'Scope of work.pdf']);
  assert.deepEqual(inFolder('Lab'), ['DL.csv', 'External-results.pdf', 'Final-report.pdf']);
  assert.equal(byPath(id + '/Sampling/Scope of work.pdf').content, 'sample scope v1');
  // Saving again does not copy the same attachment twice; a replaced attachment is copied as a new file, not over the old one.
  await save({ ...sampleJob, scopeOfWorkAttachment: scope, description: 'Saved again.' });
  await save({ ...sampleJob, scopeOfWorkAttachment: { ...scope, dataUrl: 'data:application/pdf;base64,' + Buffer.from('sample scope v2').toString('base64') } });
  assert.equal(byPath(id + '/Sampling/Scope of work.pdf').content, 'sample scope v1');
  assert.equal(byPath(id + '/Sampling/Scope of work 1.pdf').content, 'sample scope v2');
  // The approved report PDF is copied once per version: a second copy returns the existing one.
  const report = await upload('OM-P-26-901-Sampling-and-Analysis-Report-v1.pdf', 'sampling-report');
  assert.equal(report.data.existing, true); assert.equal(inFolder('Sampling').filter((n) => n.includes('Report-v1')).length, 1);
  // The browser cannot choose a folder: only a known purpose is accepted, and the scope attachment only comes from the job record.
  for (const bad of ['sampling', 'lab', 'reports', 'scope-of-work']) assert.equal((await upload('x.csv', bad)).status, 400, bad);
});

test('a same-name upload never overwrites; the job status shows the name SharePoint used', async () => {
  const again = await upload('G-sheet.csv', 'sampling-sheet', 'second G-sheet');
  assert.deepEqual(again.data.sharepoint, { status: 'ok', name: 'G-sheet 1.csv', renamed: true, savedInVaps: true });
  assert.equal(byPath(id + '/Sampling/G-sheet.csv').content, 'first G-sheet', 'the existing file is unchanged');
  assert.equal(byPath(id + '/Sampling/G-sheet 1.csv').content, 'second G-sheet');
  assert.deepEqual(Object.keys(again.data).filter((k) => k !== 'sharepoint').sort(), ['id', 'name', 'size', 'type'], 'the job file reference is unchanged');
  const st = await jobStatus();
  assert.equal(st.configured, true); assert.equal(st.canRetry, false, 'only MA001 can retry'); assert.equal(st.job.status, 'ok');
  const row = st.files.find((f) => f.id === again.data.id);
  assert.deepEqual([row.folder, row.purpose, row.name, row.sharePointName, row.renamed, row.savedInVaps], ['Sampling', 'sampling-sheet', 'G-sheet.csv', 'G-sheet 1.csv', true, true]);
  assert.match(st.job.folderUrl, /\/Jobs\/OM-P-26-901$/);
});

test('upload and status checks: the job must exist and be open to the employee', async () => {
  assert.equal((await upload('x.csv', 'lab-workbook', 'x', 'OM-P-26-999')).status, 404);
  const plain = await upload('no-job.csv', undefined);
  assert.equal(plain.status, 201); assert.equal(plain.data.sharepoint, undefined, 'no job given: stored in Workflow VAPS only, as before');
  const other = await account('RANJITH', 'Unassigned engineer pilot passphrase');
  const f = new FormData(); f.set('file', new File(['x'], 'x.csv')); f.set('anyType', '1'); f.set('jobId', id); f.set('purpose', 'lab-workbook');
  assert.equal((await call('files', 'POST', '/', { cookie: other, body: f })).status, 403, 'no access to the job: nothing is routed into it');
  assert.equal((await call('jobSync', 'GET', '/', { cookie: other, params: { id } })).status, 403, 'nor is its SharePoint status shown');
  assert.equal((await call('sync', 'GET', '/', { cookie: other })).status, 403);
  assert.equal((await call('sync', 'POST', '/', { cookie: salim, json: { jobId: id } })).status, 403, 'retry is MA001 only');
});

test('SharePoint outage: the original is saved in Workflow VAPS, the job shows the failure, MA001 retries', async () => {
  graph.down = true;
  const up = await upload('PVT-workbook.csv', 'lab-workbook');
  assert.equal(up.status, 201, 'the file is stored in Workflow VAPS');
  assert.equal(up.data.sharepoint.status, 'error'); assert.equal(up.data.sharepoint.savedInVaps, true);
  const r = await save({ ...sampleJob, description: 'Saved during outage.' });
  assert.equal(r.data.sharepoint.status, 'error'); assert.match(r.data.sharepoint.message, /saved in Workflow VAPS/);
  let st = await jobStatus(ma);
  assert.equal(st.canRetry, true);
  const failed = st.files.find((f) => f.id === up.data.id);
  assert.deepEqual([failed.status, failed.savedInVaps, failed.folder], ['error', true, 'Lab']); assert.match(failed.error, /SharePoint/);
  graph.down = false;
  const before = folderCreates();
  const retry = await call('sync', 'POST', '/', { cookie: ma, json: { jobId: id } });
  assert.equal(retry.status, 200); assert.equal(retry.data.sharepoint.status, 'ok');
  assert.equal(retry.data.files.find((f) => f.id === up.data.id).status, 'ok', 'the retry reply carries the refreshed job status');
  assert.ok(byPath(id + '/Lab/PVT-workbook.csv'));
  assert.equal(folderCreates(), before, 'existing folders are reused');
  assert.equal(graph.rows.size, 1);
  st = (await call('sync', 'GET', '/', { cookie: ma })).data;
  assert.deepEqual([st.configured, st.jobs.length, st.files.length], [true, 0, 0]);
});

test('lost bookkeeping: existing folders and the register row are found and reused, not duplicated', async () => {
  await DB.prepare('DELETE FROM sharepoint_jobs').run();
  api.resetSharePointCache();
  const r = await call('sync', 'POST', '/', { cookie: ma, json: { jobId: id } });
  assert.equal(r.status, 200); assert.equal(r.data.sharepoint.status, 'ok');
  assert.deepEqual(tree(), [id, id + '/Lab', id + '/Sampling']);
  assert.equal(graph.rows.size, 1);
  graph.rows.clear(); // Someone deleted the register row in SharePoint: it is added back once.
  await save({ ...sampleJob, description: 'Row re-added.' });
  assert.equal(graph.rows.size, 1);
});

test('every upload point in the app names its job and the right purpose', async () => {
  const fs = await import('node:fs');
  const src = ['app/operations-workspace.tsx', 'app/lab-planning.tsx'].map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  const calls = [...src.matchAll(/storeWorkbook\(([^;]*?)\)(?=;|\))/g)].map((m) => m[1]);
  assert.equal(calls.length, 4, calls.join('\n'));
  for (const c of calls) assert.match(c, /jobId: ?job\.id/, c);
  for (const p of ['lab-workbook', 'external-results', 'sampling-report']) assert.ok(calls.some((c) => c.includes(`'${p}'`)), p);
  assert.ok(calls.some((c) => c.includes("kind==='sampling'?'sampling-sheet':'final-report'")));
  const { filePurposes } = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('app/file-routing.ts', 'utf8').replace(/ as const/g, '').replace(/export type[^\n]*\n/g, '').replace(/\(v: unknown\): v is FilePurpose/, '(v)').replace(/: Record<FileSection, string>/, '')).toString('base64'));
  assert.deepEqual(Object.fromEntries(Object.entries(filePurposes).map(([k, v]) => [k, v.section])), { 'scope-of-work': 'sampling', 'sampling-sheet': 'sampling', 'sampling-report': 'sampling', 'lab-workbook': 'lab', 'external-results': 'lab', 'final-report': 'lab' });
});

test('credentials stay on the server; replies and the audit trail never contain them', async () => {
  const replies = JSON.stringify([await save({ ...sampleJob }), await upload('check.csv', 'lab-workbook'), await call('sync', 'GET', '/', { cookie: ma }), await jobStatus()]);
  assert.doesNotMatch(replies, new RegExp(SECRET + '|token-\\d|' + M365.MS_CLIENT_ID));
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE instr(detail, ?) > 0 OR instr(detail, ?) > 0').bind(SECRET, 'token-').first()).n, 0);
});

test('not configured: VAPS works as before and SharePoint is not contacted', async () => {
  for (const k of Object.keys(M365)) delete globalThis.__vapsTestEnv[k];
  const calls = graph.calls.length;
  assert.deepEqual((await save({ ...sampleJob, description: 'Pilot off.' })).data.sharepoint, { status: 'off' });
  assert.equal((await upload('off.csv', 'lab-workbook')).data.sharepoint.status, 'off');
  assert.equal((await jobStatus()).configured, false, 'the job panel stays hidden');
  assert.equal(graph.calls.length, calls);
});

test.after(() => mf.dispose());
