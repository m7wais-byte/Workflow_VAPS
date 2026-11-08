import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const store = new Map(); globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } }; globalThis.localStorage = window.localStorage;
const { buildDemoJobs, demoConfiguration } = await bundle('app/demo-data.ts');
const { canOpenJob, jobAccessReasons, applyJobOperation, noJobAccessMessage } = await bundle('app/job-access.ts');
const { applyOperation } = await bundle('app/operations-model.ts');
const { defaultAuthorization, defaultResponsibilities } = await bundle('app/authorization.ts');
const { initialDirectory } = await bundle('app/employee-directory.ts');
const employees = initialDirectory().employees, basePolicy = defaultAuthorization(employees.map(e => e.id));
const jobs = await buildDemoJobs(async (name, content) => ({ id: name, name, size: content.length, type: 'text/plain' }), new Date('2026-10-28T10:00:00+04:00'));
const byId = Object.fromEntries(jobs.map(j => [j.id, j]));
const actor = (id, policy = basePolicy) => ({ id, employees, policy, roles: { ...defaultResponsibilities, ...demoConfiguration.roles }, teams: demoConfiguration.teams, routing: demoConfiguration.routing });
const open = (id, job, policy) => canOpenJob(byId[job], actor(id, policy));

test('assigned employees open only jobs where they hold work', () => {
  assert.equal(open('YAQEEN', 'OM-X-26-003'), true, 'Chemical test assigned');
  assert.equal(open('YAQEEN', 'OM-X-26-006'), false, 'PVT-only job, no assignment');
  assert.equal(open('YAQEEN', 'OM-X-26-005'), false, 'team membership alone grants nothing');
  assert.equal(open('NASSER', 'OM-X-26-003'), true);
  assert.equal(open('NASSER', 'OM-X-26-002'), false);
  assert.equal(open('HUSSEINI', 'OM-X-26-001'), true, 'supporting sampling employee');
  assert.equal(open('ALI', 'OM-X-26-001'), true, 'assigned driver');
  assert.equal(open('ALI', 'OM-X-26-006'), false);
});

test('duties give access to the jobs they supervise, review or approve', () => {
  assert.ok(jobAccessReasons(byId['OM-X-26-005'], actor('BAHRI')).includes('Chemical Team Lead'));
  assert.equal(open('BAHRI', 'OM-X-26-006'), false, 'no Chemical work on a PVT-only job');
  assert.ok(jobAccessReasons(byId['OM-X-26-003'], actor('AHAD')).includes('QC review'));
  assert.equal(open('AHAD', 'OM-X-26-001'), false, 'no laboratory work yet');
  for (const job of jobs) assert.equal(open('SALIM', job.id), true, 'sampling approver and scope selector');
});

test('administrator and company-overview holders keep supervisory access; removing the permission narrows it', () => {
  for (const job of jobs) { assert.equal(open('MA001', job.id), true); assert.equal(open('WILFRED', job.id), true); }
  const policy = { ...basePolicy, companyOverview: basePolicy.companyOverview.filter(id => id !== 'WILFRED') };
  assert.equal(open('WILFRED', 'OM-X-26-001', policy), false, 'nothing to supervise or approve yet');
  assert.equal(open('WILFRED', 'OM-X-26-003', policy), true, 'PVT supervisor and final approval');
});

test('drafts, Trash and missing job-details permission are refused', () => {
  const draft = { ...byId['OM-X-26-001'], id: 'D-1', status: 'Draft', operations: undefined, createdById: 'SALIM' };
  assert.equal(canOpenJob(draft, actor('MOHSIN')), false);
  assert.equal(canOpenJob(draft, actor('SALIM')), true);
  assert.equal(canOpenJob({ ...byId['OM-X-26-003'], trash: { deletedBy: 'MA001', deletedAt: '2026-10-28' } }, actor('NASSER')), false);
  assert.equal(open('NASSER', 'OM-X-26-003', { ...basePolicy, jobDetails: basePolicy.jobDetails.filter(id => id !== 'NASSER') }), false);
});

test('job commands are refused for employees without access, even where the area permission alone would pass', () => {
  const request = { type: 'request-addition', title: 'Extra test', reason: 'Probe', destination: 'Chemical' };
  assert.doesNotThrow(() => applyOperation(byId['OM-X-26-006'], request, actor('YAQEEN')), 'the model on its own only checks the laboratory permission');
  assert.throws(() => applyJobOperation(byId['OM-X-26-006'], request, actor('YAQEEN')), new RegExp(noJobAccessMessage.slice(0, 30)));
  assert.doesNotThrow(() => applyJobOperation(byId['OM-X-26-003'], request, actor('YAQEEN')));
});
