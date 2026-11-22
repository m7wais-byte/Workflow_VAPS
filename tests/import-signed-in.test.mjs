// Browser export → administrator import through the Sites API → the records are what signed-in employees get.
// Test data only; runs against a local D1 + R2 (Miniflare).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSitesApi } from './fixtures/sites-api.mjs';

const { mf, DB, FILES, api, call } = await startSitesApi({
  login: 'app/api/auth/login/route.ts', password: 'app/api/auth/password/route.ts', workspace: 'app/api/workspace/route.ts', importer: 'app/api/admin/import/route.ts',
  operations: 'app/api/jobs/[id]/operations/route.ts', file: 'app/api/files/[id]/route.ts', requests: 'app/api/requests/route.ts',
}, 'export * as auth from "./server/auth.ts";\nexport { buildDemoJobs, demoConfiguration } from "./app/demo-data.ts";\nexport { makeExport, sha256 } from "./app/export-format.ts";\nexport { initialDirectory } from "./app/employee-directory.ts";\nexport { defaultAuthorization, defaultResponsibilities } from "./app/authorization.ts";');

const T = '2026-11-20T08:00:00.000Z';
const cookieOf = (c) => c.split(';')[0];
const passwords = {};
const usernameOf = (id) => id.length > 30 ? 'new.hire' : id.toLowerCase() + '.vaps';
async function enrol(employeeId) {
  const username = usernameOf(employeeId);
  const created = await api.auth.createAccount(DB, { accountId: 'bootstrap', employeeId: 'MA001' }, { username, employeeId }, () => true);
  const first = await call('login', 'POST', '/', { json: { username, password: created.temporaryPassword } });
  passwords[employeeId] = 'Import test passphrase ' + employeeId;
  assert.equal((await call('password', 'POST', '/', { cookie: cookieOf(first.setCookie), json: { currentPassword: created.temporaryPassword, newPassword: passwords[employeeId] } })).status, 200);
}
async function signIn(employeeId) {
  const r = await call('login', 'POST', '/', { json: { username: usernameOf(employeeId), password: passwords[employeeId] } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); return cookieOf(r.setCookie);
}

// A browser that held real work: the built-in employees plus one added later (new internal ID), one renamed,
// a client, company details, jobs whose workbooks were uploaded in that browser, and the request book.
const directory = api.initialDirectory();
directory.employees = directory.employees.map((e) => e.id === 'NASSER' ? { ...e, name: 'Nasser Al Saqri (renamed)' } : e);
directory.employees.push({ id: '7f3c2a1e-0000-4000-8000-000000000001', name: 'New Hire', role: '', password: '', initials: 'NH', departmentId: 'analysis', positionId: 'analysis', employeeCode: 'VAPS-042', email: '', phone: '', active: true });
const ids = directory.employees.map((e) => e.id);
const files = [];
const demo = await api.buildDemoJobs(async (name, content) => { const id = crypto.randomUUID(); const bytes = new TextEncoder().encode(content); files.push({ id, name, type: 'text/csv', size: bytes.length, sha256: await api.sha256(bytes), base64: Buffer.from(bytes).toString('base64') }); return { id, name, size: bytes.length, type: 'text/csv' }; }, new Date(T));
const jobs = demo.map((j) => ({ ...j, clientCode: 'P', clientName: 'PDO' }));
const local = {
  'vaps-directory-v1': JSON.stringify(directory),
  'vaps-authorization-v1': JSON.stringify(api.defaultAuthorization(ids)),
  'vaps-responsibilities-v1': JSON.stringify({ ...api.defaultResponsibilities, ...api.demoConfiguration.roles }),
  'vaps-lab-teams-v1': JSON.stringify(api.demoConfiguration.teams),
  'vaps-test-routing-v1': JSON.stringify(api.demoConfiguration.routing),
  'vaps-demo-clients-v1': JSON.stringify([{ code: 'P', shortName: 'PDO', name: 'Petroleum Development Oman', country: 'Oman', notes: '', active: true }, { code: 'Z', shortName: 'TestCo', name: 'Test Client Co', country: 'Oman', notes: '', active: true }]),
  'vaps-company-v1': JSON.stringify({ name: 'VAPS', displayName: 'VAPS Test', logo: '/vaps-logo.png', address: 'Muscat', country: 'Oman', email: '', phone: '', website: '' }),
  'vaps-demo-jobs-v1': JSON.stringify(jobs),
};
const requests = [{ no: '5931', status: 'Received' }];
const exportText = JSON.stringify(await api.makeExport({ local, files, requests, exportedBy: 'MA001', exportedAt: T, origin: 'https://old-browser.example' }));
for (const id of ['MA001', 'SALIM', 'WILFRED', 'SHEREIQI', 'NASSER', 'YAQEEN']) await enrol(id);

test('only the administrator can check or run an import', async () => {
  assert.equal((await call('importer', 'POST', '/', { cookie: await signIn('SALIM'), json: { action: 'plan', exportText } })).status, 403);
  assert.equal((await call('importer', 'POST', '/', { json: { action: 'plan', exportText } })).status, 401);
});

test('import through the Sites API, then each signed-in employee gets the imported records', async () => {
  const ma = await signIn('MA001');
  const plan = await call('importer', 'POST', '/', { cookie: ma, json: { action: 'plan', exportText } });
  assert.equal(plan.status, 200, JSON.stringify(plan.data)); assert.equal(plan.data.problems, 0); assert.match(plan.data.report, /Result: ready to import/);
  const applied = await call('importer', 'POST', '/', { cookie: ma, json: { action: 'apply', exportText } });
  assert.equal(applied.status, 200, JSON.stringify(applied.data));
  assert.deepEqual(applied.data.added, { setting: 7, job: jobs.length, request: 1, archive: 2, file: files.length });
  assert.equal(applied.data.filesWaiting, 0);

  // Administrator (company overview): every job, the imported settings, employee IDs (including the one added later).
  const admin = (await call('workspace', 'GET', '/', { cookie: await signIn('MA001') })).data;
  assert.deepEqual(admin.jobs.map((j) => j.job.id).sort(), jobs.map((j) => j.id).sort());
  for (const j of admin.jobs) assert.equal(JSON.stringify(j.job), JSON.stringify(jobs.find((x) => x.id === j.job.id)), j.job.id + ' unchanged, byte for byte');
  const dir = JSON.parse(admin.records['vaps-directory-v1']);
  assert.deepEqual(dir.employees.map((e) => e.id), ids, 'employee IDs preserved, none added or removed');
  assert.ok(dir.employees.every((e) => !e.password), 'no passwords in the shared directory');
  assert.equal(dir.employees.find((e) => e.id === 'NASSER').name, 'Nasser Al Saqri (renamed)');
  assert.equal(JSON.parse(admin.records['vaps-demo-clients-v1'])[1].name, 'Test Client Co');
  assert.equal(JSON.parse(admin.records['vaps-company-v1']).displayName, 'VAPS Test');
  assert.equal(JSON.parse(admin.records['vaps-responsibilities-v1']).qcReviewer, 'WILFRED');

  // A renamed employee keeps their login: the account is tied to the internal ID.
  const nasser = (await call('workspace', 'GET', '/', { cookie: await signIn('NASSER') })).data;
  assert.equal(nasser.me.employeeId, 'NASSER');
  assert.ok(nasser.jobs.length > 0);
  assert.ok(nasser.jobs.length < jobs.length, 'a laboratory engineer gets only the jobs they work on');
  // A new employee from the export can be given an account by internal ID and signs in as themselves.
  await enrol('7f3c2a1e-0000-4000-8000-000000000001');
  const hire = (await call('workspace', 'GET', '/', { cookie: await signIn('7f3c2a1e-0000-4000-8000-000000000001') })).data;
  assert.equal(hire.me.employeeId, '7f3c2a1e-0000-4000-8000-000000000001'); assert.equal(hire.jobs.length, 0);

  // Imported jobs are working records: the QC reviewer approves an imported workbook on the server.
  const wil = await signIn('WILFRED');
  const job3 = (await call('workspace', 'GET', '/', { cookie: wil })).data.jobs.find((j) => j.job.operations?.activities.some((a) => a.status === 'Awaiting QC'));
  const pending = job3.job.operations.activities.find((a) => a.status === 'Awaiting QC');
  const qc = await call('operations', 'POST', '/', { cookie: wil, params: { id: job3.job.id }, json: { commands: [{ type: 'qc-review', id: pending.id, decision: 'approve', target: '', comments: '' }], revision: job3.revision } });
  assert.equal(qc.status, 200, JSON.stringify(qc.data));

  // Workbooks uploaded in the old browser are now served from shared storage under the same IDs.
  const workbook = pending.files.at(-1);
  const lead = await call('file', 'GET', '/', { cookie: await signIn('SHEREIQI'), params: { id: workbook.id } });
  assert.equal(lead.status, 200); assert.equal(lead.data, Buffer.from(files.find((f) => f.id === workbook.id).base64, 'base64').toString());
  assert.equal((await call('file', 'GET', '/', { cookie: await signIn('YAQEEN'), params: { id: workbook.id } })).status, 403);
  assert.ok(await FILES.get(workbook.id));
  // Request book entries arrive too.
  assert.equal((await call('requests', 'GET', '/', { cookie: ma })).data.records[0].no, '5931');

  // Running the same import again adds nothing.
  const again = await call('importer', 'POST', '/', { cookie: ma, json: { action: 'apply', exportText } });
  assert.deepEqual(again.data.added, { setting: 0, job: 0, request: 0, archive: 0, file: 0 });
  const audit = await DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'imported' AND actor_id = 'MA001'").first();
  assert.equal(audit.n, 7 + jobs.length + 1 + 2 + files.length);
});

test.after(async () => { await mf.dispose(); });
