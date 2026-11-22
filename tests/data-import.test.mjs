// Browser export (app/export-format.ts) and server import (server/import.ts) against the real migrations in SQLite.
// The jobs come from the workflow demo builder, so they are states the real commands produce.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { d1 } from '../scripts/d1-sqlite.mjs';

const bundle = async (entry) => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const { makeExport, verifyExport, sha256 } = await bundle('app/export-format.ts');
const { planImport, applyImport, planReport } = await bundle('server/import.ts');
const { getJob, runJobCommands } = await bundle('server/job-store.ts');
const { listAudit } = await bundle('server/d1.ts');
const { initialDirectory } = await bundle('app/employee-directory.ts');
const { defaultAuthorization, defaultResponsibilities } = await bundle('app/authorization.ts');
const { buildDemoJobs } = await bundle('app/demo-data.ts');

const T = '2026-11-22T09:00:00.000Z';
const directory = initialDirectory(); // seeded with the demo password, as in a real browser today
const ids = directory.employees.map((e) => e.id);
const files = [];
const demoJobs = await buildDemoJobs(async (name, content) => { const id = 'file-' + files.length; const bytes = new TextEncoder().encode(content); files.push({ id, name, type: 'text/csv', size: bytes.length, sha256: await sha256(bytes), base64: Buffer.from(bytes).toString('base64') }); return { id, name, size: bytes.length, type: 'text/csv' }; }, new Date('2026-11-20T08:00:00Z'));
/** "Real" jobs: the same workflow states under a real client code. */
const realJobs = demoJobs.slice(0, 3).map((j) => ({ ...j, clientCode: 'P', clientName: 'PDO' }));
const fresh = { id: 'OM-P-26-090', jobNumber: 'OM-P-26-090', samplingInstructions: 'Collect as specified.', clientCode: 'P', clientName: 'PDO', samplingSource: 'Wellhead Sampling', requiredTests: [], samples: [{ id: 'S1', bottle: 'PDS', bottleSerial: 'B1', dataComplete: true, fieldData: { sampleNature: 'WHS' } }], stages: [], status: 'Job Created', createdById: 'SALIM', events: [] };
const browser = (jobs = [...realJobs, fresh, ...demoJobs.slice(3)]) => ({
  'vaps-directory-v1': JSON.stringify(directory),
  'vaps-authorization-v1': JSON.stringify(defaultAuthorization(ids)),
  'vaps-responsibilities-v1': JSON.stringify(defaultResponsibilities),
  'vaps-demo-jobs-v1': JSON.stringify(jobs),
  'vaps-demo-clients-v1': JSON.stringify([{ code: 'P', shortName: 'PDO', name: 'Petroleum Development Oman', country: 'Oman', notes: '', active: true }]),
  'vaps-demo-activity-v1': JSON.stringify([{ id: '1', employeeId: 'SALIM', action: 'Created job', jobId: 'OM-P-26-090', timestamp: T }]),
  'vaps-job-summary-links-v1': JSON.stringify({ 'OM-P-26-090': { id: 'x', key: 'secret-edit-key' } }),
  'vaps-demo-setup-v1': JSON.stringify({ enabled: true }),
  'other-project-key': 'not VAPS',
});
const requests = [{ no: '5931', status: 'Received' }, { no: '593102', status: 'Completed' }];
const exportText = async (local = browser(), withFiles = files) => JSON.stringify(await makeExport({ local, files: withFiles, requests, exportedBy: 'MA001', exportedAt: T, origin: 'https://example.test' }));

test('the export keeps VAPS records byte for byte and leaves out passwords, sessions, share keys and the demo setup', async () => {
  const text = await exportText();
  const { data, problems } = await verifyExport(text);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(data.localStorage).sort(), ['vaps-authorization-v1', 'vaps-demo-activity-v1', 'vaps-demo-clients-v1', 'vaps-demo-jobs-v1', 'vaps-directory-v1', 'vaps-responsibilities-v1']);
  assert.equal(data.localStorage['vaps-demo-jobs-v1'], browser()['vaps-demo-jobs-v1']);
  assert.ok(JSON.parse(data.localStorage['vaps-directory-v1']).employees.every((e) => e.password === ''));
  assert.ok(!text.includes('secret-edit-key') && !text.includes('"1234"'));
  assert.equal(data.manifest.counts.jobs, demoJobs.length + 1);
});

test('a directory never saved in the browser is exported as the built-in list the app uses, and flagged', async () => {
  const local = browser(); delete local['vaps-directory-v1'];
  const text = JSON.stringify(await makeExport({ local, files, requests, exportedBy: 'MA001', exportedAt: T, origin: 'x', defaults: { 'vaps-directory-v1': JSON.stringify(directory), 'vaps-demo-jobs-v1': '[]' } }));
  const { data } = await verifyExport(text);
  assert.deepEqual(data.manifest.defaults, ['vaps-directory-v1'], 'a saved value always wins over a default');
  assert.equal(data.localStorage['vaps-demo-jobs-v1'], local['vaps-demo-jobs-v1']);
  const plan = await planImport(d1(), text);
  assert.deepEqual(plan.problems, []);
  assert.ok(plan.warnings.some((w) => /vaps-directory-v1 was never saved/.test(w)));
});

test('a changed record or file is detected', async () => {
  const data = JSON.parse(await exportText());
  data.localStorage['vaps-demo-jobs-v1'] = data.localStorage['vaps-demo-jobs-v1'].replace('OM-P-26-090', 'OM-P-26-091');
  data.files[0].base64 = Buffer.from('changed').toString('base64');
  const { problems } = await verifyExport(JSON.stringify(data));
  assert.ok(problems.some((p) => /vaps-demo-jobs-v1 changed/.test(p)));
  assert.ok(problems.some((p) => /file .* changed/.test(p)));
  assert.match(planReport(await planImport(d1(), JSON.stringify(data))), /Result: blocked/);
});

test('import into an empty database: IDs, job numbers and records preserved, demo jobs skipped, everything audited', async () => {
  const db = d1();
  const plan = await planImport(db, await exportText());
  assert.deepEqual(plan.problems, []);
  const count = (kind, outcome) => plan.items.filter((i) => i.kind === kind && i.outcome === outcome).length;
  assert.equal(count('setting', 'add'), 4, 'three workflow settings plus the client list the Sites app reads');
  assert.equal(count('file', 'add'), files.length);
  assert.equal(count('job', 'add'), 4);
  assert.equal(count('job', 'skipped-demo'), demoJobs.length - 3);
  assert.equal(count('request', 'add'), 2);
  assert.equal(count('archive', 'add'), 2, 'clients and the activity log are archived verbatim');
  assert.equal(plan.files.count, files.length);

  const { added, filesWaiting } = await applyImport(db, plan, 'MA001', T);
  assert.deepEqual(added, { setting: 4, job: 4, request: 2, archive: 2, file: 0 });
  assert.equal(filesWaiting, files.length, 'without file storage the files are only verified and counted');
  for (const job of [...realJobs, fresh]) {
    const row = db.sqlite.prepare('SELECT payload, job_number, revision FROM jobs WHERE id = ?').get(job.id);
    assert.equal(row.payload, JSON.stringify(job), job.id + ' stored exactly as exported');
    assert.equal(row.job_number, job.jobNumber); assert.equal(row.revision, 1);
  }
  const saved = JSON.parse(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'vaps-directory-v1'").get().value);
  assert.deepEqual(saved.employees.map((e) => e.id), ids);
  assert.ok(saved.employees.every((e) => e.password === ''));
  const [entry] = await listAudit(db, 'job', 'OM-P-26-090');
  assert.equal(entry.action, 'imported'); assert.equal(entry.actorId, 'MA001'); assert.equal(entry.detail.exportId, plan.exportId);
  assert.equal(db.sqlite.prepare("SELECT value FROM browser_archive WHERE key = 'vaps-demo-clients-v1'").get().value, browser()['vaps-demo-clients-v1']);
  assert.equal((await listAudit(db, 'import', plan.exportId)).length, 1);

  // The imported job is a working server record: the next workflow step runs as the server-side actor.
  const next = await runJobCommands(db, { jobId: 'OM-P-26-090', commands: { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI', team: [] }, expectedRevision: 1, actorId: 'SALIM', now: T });
  assert.equal(next.job.operations.history.at(-1).by, 'SALIM');
});

test('importing the same export again changes nothing', async () => {
  const db = d1(); const text = await exportText();
  await applyImport(db, await planImport(db, text), 'MA001', T);
  const audits = db.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  const again = await planImport(db, text);
  assert.ok(again.items.every((i) => i.outcome === 'unchanged' || i.outcome === 'skipped-demo' || i.kind === 'file'), 'files wait for file storage');
  assert.deepEqual((await applyImport(db, again, 'MA001', T)).added, { setting: 0, job: 0, request: 0, archive: 0, file: 0 });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, audits);
});

test('a second browser with a diverged job: reported as a conflict, the database copy kept, new jobs still added', async () => {
  const db = d1();
  await applyImport(db, await planImport(db, await exportText()), 'MA001', T);
  const changed = { ...fresh, samplingInstructions: 'Edited in another browser.', operations: { revision: 3 } };
  const other = { ...fresh, id: 'OM-P-26-091', jobNumber: 'OM-P-26-091' };
  const plan = await planImport(db, await exportText(browser([changed, other])));
  const item = (id) => plan.items.find((i) => i.kind === 'job' && i.id === id);
  assert.equal(item('OM-P-26-090').outcome, 'conflict'); assert.match(item('OM-P-26-090').note, /Decide which copy/);
  assert.equal(item('OM-P-26-091').outcome, 'add');
  await applyImport(db, plan, 'MA001', T);
  assert.equal((await getJob(db, 'OM-P-26-090')).job.samplingInstructions, 'Collect as specified.');
  assert.ok(await getJob(db, 'OM-P-26-091'));
  assert.match(planReport(plan), /CONFLICT job OM-P-26-090/);
});

test('blocking problems, demo opt-in, missing files and administrator-only import', async () => {
  const dup = { ...fresh, id: 'OM-P-26-090~2' };
  const blocked = await planImport(d1(), await exportText(browser([fresh, dup])));
  assert.ok(blocked.problems.some((p) => /both active with job number OM-P-26-090/.test(p)));
  await assert.rejects(applyImport(d1(), blocked, 'MA001', T), /problems/);

  const withDemo = await planImport(d1(), await exportText(), { includeDemo: true });
  assert.equal(withDemo.items.filter((i) => i.kind === 'job' && i.outcome === 'add').length, demoJobs.length + 1);

  const noFiles = await planImport(d1(), await exportText(browser(), []));
  assert.ok(noFiles.warnings.some((w) => /not in this export/.test(w)));

  const db = d1();
  await assert.rejects(applyImport(db, await planImport(db, await exportText()), 'SALIM', T), /administrator/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 0);
});

test('with file storage, uploaded files move to R2 under their existing IDs, once', async () => {
  const db = d1(); const text = await exportText();
  const bucket = new Map(); const r2 = { put: async (key, value) => { bucket.set(key, Buffer.from(value)); } };
  const { added, filesWaiting } = await applyImport(db, await planImport(db, text), 'MA001', T, { bucket: r2 });
  assert.equal(added.file, files.length); assert.equal(filesWaiting, 0);
  for (const f of files) {
    assert.equal(bucket.get(f.id).toString('base64'), f.base64, f.name + ' bytes unchanged');
    const row = db.sqlite.prepare('SELECT name, size FROM files WHERE id = ?').get(f.id);
    assert.deepEqual({ ...row }, { name: f.name, size: f.size });
    assert.equal((await listAudit(db, 'file', f.id))[0].action, 'imported');
  }
  const again = await planImport(db, text);
  assert.ok(again.items.filter((i) => i.kind === 'file').every((i) => i.outcome === 'unchanged'));
  assert.equal((await applyImport(db, again, 'MA001', T, { bucket: r2 })).added.file, 0);
});
