// Server data layer (server/*.ts) against the real migrations in SQLite. No browser globals are defined here, so these
// tests also prove the workflow model runs on the server without localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { d1 } from '../scripts/d1-sqlite.mjs';

const bundle = async (entry) => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const { putSetting, buildActor, loadSettings } = await bundle('server/settings-store.ts');
const { getJob, runJobCommands, moveJobToTrash, restoreJobFromTrash } = await bundle('server/job-store.ts');
const { listAudit } = await bundle('server/d1.ts');
const { initialDirectory } = await bundle('app/employee-directory.ts');
const { defaultAuthorization, defaultResponsibilities } = await bundle('app/authorization.ts');
const { labScopeProblems } = await bundle('app/operations-model.ts');
const { readLabTeams } = await bundle('app/lab-teams.ts');

assert.equal(typeof globalThis.window, 'undefined');
const T = '2026-11-22T08:00:00.000Z';
const directory = initialDirectory();
const ids = directory.employees.map((e) => e.id);

/** Simulates the administrator import (a later step): settings written directly, as the import will. */
function seed(db, extra = {}) {
  const rows = { 'vaps-directory-v1': { ...directory, employees: directory.employees.map((e) => ({ ...e, password: '' })) }, 'vaps-authorization-v1': defaultAuthorization(ids), 'vaps-responsibilities-v1': defaultResponsibilities, ...extra };
  for (const [key, value] of Object.entries(rows)) db.sqlite.prepare('INSERT INTO settings (key, value, revision, updated_by, updated_at) VALUES (?, ?, 1, ?, ?)').run(key, typeof value === 'string' ? value : JSON.stringify(value), 'IMPORT', T);
  return db;
}
const job = () => ({ id: 'OM-F-26-1', jobNumber: 'OM-F-26-1', samplingInstructions: 'Collect as specified.', clientCode: 'F', clientName: 'Test', samplingSource: 'Wellhead Sampling', requiredTests: [], samples: [{ id: 'S1', bottle: 'PDS', bottleSerial: 'B1', dataComplete: true, fieldData: { sampleNature: 'WHS' } }], stages: [], status: 'Job Created', createdById: 'SALIM', events: [] });
function insertJob(db, record = job(), revision = 1) { db.sqlite.prepare('INSERT INTO jobs (id, job_number, payload, revision, trashed, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(record.id, record.jobNumber, JSON.stringify(record), revision, record.trash ? 1 : 0, 'IMPORT', T); }
const dispatch = { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI', team: [] };
const rejects = (promise, status, pattern) => assert.rejects(promise, (e) => e.name === 'StoreError' && e.status === status && (!pattern || pattern.test(e.message)));

test('migrations create the server tables next to the existing share table', () => {
  const tables = d1().sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_vaps_%' ORDER BY name").all().map((r) => r.name);
  assert.deepEqual(tables, ['accounts', 'activity_log', 'audit_log', 'auth_throttle', 'browser_archive', 'files', 'invitations', 'job_summaries', 'jobs', 'mail_outbox', 'onedrive_auth', 'onedrive_files', 'onedrive_jobs', 'requests', 'sessions', 'settings']);
});

test('a workflow command runs as the server-side actor with server time and one audit entry', async () => {
  const db = seed(d1()); insertJob(db);
  const saved = await runJobCommands(db, { jobId: 'OM-F-26-1', commands: dispatch, expectedRevision: 1, actorId: 'SALIM', now: T });
  assert.equal(saved.revision, 2);
  const stored = await getJob(db, 'OM-F-26-1');
  assert.equal(stored.revision, 2);
  assert.equal(stored.job.assignedEngineerId, 'MOHSIN');
  assert.deepEqual(stored.job.operations.history.at(-1).by, 'SALIM');
  assert.equal(stored.job.operations.history.at(-1).at, T);
  assert.ok(stored.job.workflowHistory?.length, 'the shared save rules ran (workflow history appended)');
  const audit = await listAudit(db, 'job', 'OM-F-26-1');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorId, 'SALIM'); assert.equal(audit[0].at, T); assert.deepEqual(audit[0].detail.commands, ['dispatch']);
});

test('a refused command, a stale revision and an inactive employee change nothing and leave no audit entry', async () => {
  const db = seed(d1()); insertJob(db);
  await rejects(runJobCommands(db, { jobId: 'OM-F-26-1', commands: dispatch, expectedRevision: 1, actorId: 'MOHSIN', now: T }), 422);
  await rejects(runJobCommands(db, { jobId: 'OM-F-26-1', commands: dispatch, expectedRevision: 0, actorId: 'SALIM', now: T }), 409);
  await rejects(runJobCommands(db, { jobId: 'missing', commands: dispatch, expectedRevision: 1, actorId: 'SALIM', now: T }), 404);
  await rejects(runJobCommands(db, { jobId: 'OM-F-26-1', commands: dispatch, expectedRevision: 1, actorId: 'NOBODY', now: T }), 403);
  // A batch is all or nothing: a valid dispatch followed by a refused command saves neither.
  await rejects(runJobCommands(db, { jobId: 'OM-F-26-1', commands: [dispatch, { type: 'data-approve' }], expectedRevision: 1, actorId: 'SALIM', now: T }), 422);
  const stored = await getJob(db, 'OM-F-26-1');
  assert.equal(stored.revision, 1); assert.equal(stored.job.operations, undefined);
  assert.equal((await listAudit(db, 'job', 'OM-F-26-1')).length, 0);
});

test('two saves from the same revision: the second is refused, not merged', async () => {
  const db = seed(d1()); insertJob(db);
  const first = runJobCommands(db, { jobId: 'OM-F-26-1', commands: dispatch, expectedRevision: 1, actorId: 'SALIM', now: T });
  const second = runJobCommands(db, { jobId: 'OM-F-26-1', commands: dispatch, expectedRevision: 1, actorId: 'SALIM', now: T });
  const results = await Promise.allSettled([first, second]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
  assert.equal((await getJob(db, 'OM-F-26-1')).revision, 2);
  assert.equal((await listAudit(db, 'job', 'OM-F-26-1')).length, 1);
});

test('the demo setup and browser storage never affect the server actor', async () => {
  const db = seed(d1(), { 'vaps-demo-setup-v1': { enabled: true, roles: { samplingApproval: 'NASSER' }, teams: { PVT: ['NASSER'], Chemical: [] }, routing: {} } });
  const actor = await buildActor(db, 'SALIM');
  assert.equal(actor.roles.samplingApproval, 'SALIM');
  assert.deepEqual(actor.teams, readLabTeams(null, ids), 'saved (here: default) teams, not the demo teams');
  assert.ok(!actor.teams.PVT.every((id) => id === 'NASSER'));
  assert.equal('vaps-demo-setup-v1' in (await loadSettings(db)), false);
});

test('unreadable settings block like the browser: no access, empty duties, no routing', async () => {
  await rejects(buildActor(seed(d1(), { 'vaps-authorization-v1': 'not json' }), 'SALIM'), 503, /authorization/);
  const actor = await buildActor(seed(d1(), { 'vaps-responsibilities-v1': '[]', 'vaps-test-routing-v1': '[]' }), 'SALIM');
  assert.ok(Object.values(actor.roles).every((v) => v === ''));
  assert.equal(actor.routing, null);
  await rejects(buildActor(d1(), 'SALIM'), 503, /directory/);
});

test('settings: permission, validation, revision and before/after audit; passwords and employee removal refused', async () => {
  const db = seed(d1());
  const auth = defaultAuthorization(ids);
  await rejects(putSetting(db, 'vaps-authorization-v1', auth, 1, 'SALIM', T), 403);
  await rejects(putSetting(db, 'vaps-authorization-v1', { ...auth, createJob: ['GHOST'] }, 1, 'MA001', T), 400);
  await rejects(putSetting(db, 'vaps-authorization-v1', auth, 0, 'MA001', T), 409);
  await rejects(putSetting(db, 'vaps-demo-setup-v1', {}, 0, 'MA001', T), 404);
  const next = { ...auth, createJob: ['SALIM', 'WILFRED'] };
  assert.deepEqual(await putSetting(db, 'vaps-authorization-v1', next, 1, 'MA001', T), { revision: 2 });
  const [entry] = await listAudit(db, 'setting', 'vaps-authorization-v1');
  assert.equal(entry.actorId, 'MA001'); assert.deepEqual(entry.detail.before.createJob, ['SALIM']); assert.deepEqual(entry.detail.after.createJob, ['SALIM', 'WILFRED']);

  const withPassword = { ...directory, employees: directory.employees.map((e) => ({ ...e, password: 'secret' })) };
  await putSetting(db, 'vaps-directory-v1', withPassword, 1, 'MA001', T);
  const savedDirectory = JSON.parse((await loadSettings(db))['vaps-directory-v1'].value);
  assert.ok(savedDirectory.employees.every((e) => e.password === ''), 'passwords are never stored with the directory');
  const removed = { ...directory, employees: directory.employees.filter((e) => e.id !== 'RANJITH') };
  await rejects(putSetting(db, 'vaps-directory-v1', removed, 2, 'MA001', T), 400, /RANJITH/);
});

test('a test added in Settings → Tests is accepted at scope release on the server', async () => {
  const custom = { tests: [{ id: 'Specialised Analysis — Mercury', name: 'Mercury', group: 'Specialised Analysis', section: 'Specialised analysis' }] };
  const actor = await buildActor(seed(d1(), { 'vaps-test-catalogue-v1': custom }), 'SALIM');
  assert.ok(actor.catalogue.includes('Specialised Analysis — Mercury'));
  const sample = { sampleId: 'S1', fluidType: 'Black Oil', destination: 'Chemical', pvtTests: [], chemicalTests: ['Specialised Analysis — Mercury'] };
  const notInCatalogue = (a) => labScopeProblems(job(), [sample], { pressure: '', pressureUnit: 'psi', temperature: '', temperatureUnit: '°C', notes: '' }, actor.routing, actor.roles, undefined, a, 2).filter((p) => /not in the test catalog/.test(p));
  assert.deepEqual(notInCatalogue(actor), []);
  assert.equal(notInCatalogue({ ...actor, catalogue: undefined }).length, 1, 'without the server catalogue the custom test would be refused');
});

test('trash and restore follow the existing rules and keep job numbers unique among active jobs', async () => {
  const db = seed(d1()); insertJob(db);
  await rejects(moveJobToTrash(db, { jobId: 'OM-F-26-1', expectedRevision: 1, actorId: 'SALIM', now: T }), 422, /permission/);
  const trashed = await moveJobToTrash(db, { jobId: 'OM-F-26-1', expectedRevision: 1, actorId: 'MA001', now: T });
  assert.equal(trashed.job.trash.deletedBy, 'MA001');
  await rejects(moveJobToTrash(db, { jobId: 'OM-F-26-1', expectedRevision: 1, actorId: 'MA001', now: T }), 409);
  // The display number was reused by a new active job (distinct record key), so restoring is refused.
  insertJob(db, { ...job(), id: 'OM-F-26-1~2' });
  await rejects(restoreJobFromTrash(db, { jobId: 'OM-F-26-1', expectedRevision: 2, actorId: 'MA001', now: T }), 422, /already used/);
  db.sqlite.prepare("DELETE FROM jobs WHERE id = 'OM-F-26-1~2'").run();
  const restored = await restoreJobFromTrash(db, { jobId: 'OM-F-26-1', expectedRevision: 2, actorId: 'MA001', now: T });
  assert.equal(restored.job.trash, undefined);
  assert.deepEqual((await listAudit(db, 'job', 'OM-F-26-1')).map((a) => a.action), ['job-trashed', 'job-restored']);
});
