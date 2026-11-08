import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const store = new Map(); globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } }; globalThis.localStorage = window.localStorage;
const { buildDemoJobs, demoConfiguration } = await bundle('app/demo-data.ts');
const { jobProgressView, clientProgress, combineProgress, workStatus, expectedCompletion, lastProgressUpdate } = await bundle('app/job-progress.ts');
const { normalizeEstimate, durationOf } = await bundle('app/schedule-estimate.ts');
const { applyOperation, estimatePlanner } = await bundle('app/operations-model.ts');
const { sanitizeSummary, sanitizeProgress } = await bundle('app/summary-validation.ts');
const { jobSummary } = await bundle('app/job-workflow-model.ts');
const { defaultResponsibilities, defaultAuthorization } = await bundle('app/authorization.ts');
const { initialDirectory } = await bundle('app/employee-directory.ts');
const employees = initialDirectory().employees;
const roles = { ...defaultResponsibilities, ...demoConfiguration.roles };
const policy = defaultAuthorization(employees.map(e => e.id));
const actor = id => ({ id, employees, policy, roles, teams: demoConfiguration.teams, routing: demoConfiguration.routing });
const jobs = await buildDemoJobs(async (name, content) => ({ id: name, name, size: content.length, type: 'text/plain' }), new Date('2026-10-28T10:00:00+04:00'));
const byId = Object.fromEntries(jobs.map(j => [j.id, j]));
const today = '2026-11-08';
const view = (job, audience = 'internal') => jobProgressView(job, { roles, employees, today, audience });
const row = (v, label) => v.rows.find(r => r.label.startsWith(label));
const estimate = (job, key, values, by = 'SALIM', at = '2026-11-08T08:00:00Z') => applyOperation(job, { type: 'estimate', key, start: '', days: '', finish: '', clientVisible: false, ...values }, actor(by), at);
const names = employees.map(e => e.name).filter(n => n && n.length > 3);

test('status language: internal states map to Not started / In progress / Under review / Completed', () => {
  assert.equal(workStatus('Unassigned'), 'not-started'); assert.equal(workStatus('Scheduled'), 'not-started');
  assert.equal(workStatus('In Progress'), 'in-progress'); assert.equal(workStatus('Changes Requested'), 'in-progress', 'returned internally reads as in progress');
  for (const s of ['Workbook Submitted', 'Awaiting QC', 'QC Returned']) assert.equal(workStatus(s), 'under-review');
  assert.equal(workStatus('Completed'), 'completed');
  assert.equal(combineProgress(['completed', 'completed']), 'completed');
  assert.equal(combineProgress(['not-started', 'not-started']), 'not-started');
  assert.equal(combineProgress(['completed', 'under-review']), 'under-review');
  assert.equal(combineProgress(['completed', 'not-started']), 'in-progress');
  assert.equal(combineProgress([]), 'not-started');
});

test('estimates: calendar days counting the start day; two values give the third; inconsistent or negative values are refused', () => {
  assert.deepEqual(normalizeEstimate({ start: '2026-11-10', days: '3' }), { start: '2026-11-10', days: 3, finish: '2026-11-12' });
  assert.deepEqual(normalizeEstimate({ start: '2026-11-10', finish: '2026-11-10' }), { start: '2026-11-10', days: 1, finish: '2026-11-10' });
  assert.deepEqual(normalizeEstimate({ finish: '2026-11-12', days: 3 }), { start: '2026-11-10', days: 3, finish: '2026-11-12' });
  assert.deepEqual(normalizeEstimate({ days: '5' }), { days: 5 });
  assert.equal(normalizeEstimate({ start: '', days: '', finish: '' }), null);
  assert.throws(() => normalizeEstimate({ days: '-2' }), /whole number/);
  assert.throws(() => normalizeEstimate({ days: '0' }), /between 1/);
  assert.throws(() => normalizeEstimate({ days: '1.5' }), /whole number/);
  assert.throws(() => normalizeEstimate({ start: '2026-11-12', finish: '2026-11-10' }), /cannot be before/);
  assert.throws(() => normalizeEstimate({ start: '2026-11-10', days: '5', finish: '2026-11-12' }), /do not agree/);
  assert.throws(() => normalizeEstimate({ start: '2026-02-30' }), /valid date/);
  assert.equal(durationOf('2026-12-30', '2027-01-02'), 4);
});

test('a newly created job with no scope shows its planned stages and "Laboratory scope awaiting confirmation"', () => {
  const draft = { ...byId['OM-X-26-001'], id: 'D-1', jobNumber: 'D-1', status: 'Draft', operations: undefined, samples: [] };
  const v = view(draft);
  assert.deepEqual(v.stages.map(s => s.label), ['Job created', 'Sampling', 'Laboratory testing', 'Final report']);
  const lab = v.stages.find(s => s.id === 'lab');
  assert.equal(lab.planned, true); assert.equal(lab.note, 'Laboratory scope awaiting confirmation'); assert.equal(lab.rows.length, 0, 'no tests invented');
  assert.ok(v.rows.every(r => r.status === 'not-started'));
  assert.ok(v.rows.every(r => !r.schedule), 'no dates invented');
  assert.equal(v.expected.kind, 'tbc'); assert.equal(v.draft, true);
  // An undecided sampling type is not assumed.
  const undecided = view({ ...draft, samplingSource: undefined, samplingRequired: undefined });
  assert.equal(undecided.stages[1].label, 'Sampling / sample receipt'); assert.equal(undecided.rows[0].label, 'Sampling type to be confirmed');
});

test('sampling job: saved sampling type label, location and stage status from the workflow records', () => {
  const v = view(byId['OM-X-26-001']);
  const s = row(v, 'Wellhead Sampling');
  assert.equal(s.group, 'sampling'); assert.equal(s.status, 'in-progress'); assert.match(s.detail, /DEMO-WH-07/);
  assert.equal(v.currentStage, 'Sampling');
  assert.equal(row(view(byId['OM-X-26-002']), 'Separator Sampling').status, 'under-review', 'submitted sampling data awaiting review');
});

test('samples delivered to the laboratory show Sample receipt instead of Sampling', () => {
  const job = { ...byId['OM-X-26-001'], samplingSource: 'Open Hole (MPSR - Lab Transfer)', samplingRequired: false };
  const v = view(job);
  assert.equal(v.stages[1].label, 'Sample receipt'); assert.equal(v.stages[1].id, 'receipt');
  assert.ok(row(v, 'Sample transfer — Open Hole (MPSR - Lab Transfer)'));
  assert.ok(!v.stages.some(s => s.id === 'sampling'));
});

test('PVT-only, Chemical-only and combined scopes list exactly the selected tests, grouped by team', () => {
  const pvt = view(byId['OM-X-26-006']), chem = view(byId['OM-X-26-005']), both = view(byId['OM-X-26-003']);
  assert.deepEqual(pvt.rows.filter(r => r.group === 'PVT').map(r => r.label), ['CVD — Sample 1.01', 'CCE — Sample 1.02']);
  assert.ok(!pvt.rows.some(r => r.group === 'Chemical'));
  assert.deepEqual(chem.rows.filter(r => r.group === 'Chemical').map(r => r.label), ['Water Analysis — Sample 1.01', 'Compositional Analysis — Sample 1.01']);
  assert.ok(!chem.rows.some(r => r.group === 'PVT'));
  assert.deepEqual([...new Set(both.rows.map(r => r.group))], ['sampling', 'PVT', 'Chemical', 'report']);
  const keys = both.rows.map(r => r.key); assert.equal(new Set(keys).size, keys.length, 'no duplicate rows');
});

test('parallel tests keep their own statuses; Validation is one summary row without step names', () => {
  const v = view(byId['OM-X-26-003']);
  const val = row(v, 'Validation'), dl = row(v, 'DL'), water = row(v, 'Water Analysis');
  assert.equal(val.label, 'Validation — 2 samples'); assert.equal(val.samples, 2); assert.equal(val.status, 'in-progress');
  assert.equal(val.attention, 'Returned for correction', 'internal view flags the return');
  assert.equal(dl.status, 'not-started'); assert.equal(water.status, 'in-progress');
  assert.ok(!v.rows.some(r => /Opening Pressure|Water Check|Agitation|Charging|Flash/.test(r.label)), 'validation steps stay internal');
  assert.match(v.sentence, /PVT and Chemical testing are in progress/);
  // Parallel estimates are not added together: the latest finish governs.
  let j = estimate(byId['OM-X-26-003'], dl.key, { start: '2026-11-10', days: '5', clientVisible: true });
  j = estimate(j, water.key, { start: '2026-11-10', days: '3', clientVisible: true });
  j = estimate(j, val.key, { start: '2026-11-01', finish: '2026-11-14', clientVisible: true });
  j = estimate(j, 'report', { start: '2026-11-15', days: '4', clientVisible: true });
  const e = view(j).expected;
  assert.deepEqual(e, { date: '2026-11-18', kind: 'confirmed' });
});

test('additional work after completion: completed work and its date are kept, new work gets its own row, report revision shown', () => {
  const v = view(byId['OM-X-26-004']);
  const dl = row(v, 'DL'), val = row(v, 'Validation');
  assert.equal(dl.status, 'completed'); assert.ok(dl.actual, 'actual completion date kept');
  assert.equal(val.additional, true); assert.match(val.detail, /Additional work/); assert.equal(val.status, 'not-started');
  assert.notEqual(dl.key, val.key);
  assert.equal(row(v, 'Revised final report').status, 'not-started');
  assert.equal(v.closed, false);
});

test('completed job: every activity completed with actual dates and the report issue date as overall completion', () => {
  const j4 = byId['OM-X-26-004'], o = structuredClone(j4.operations);
  const extra = new Set(o.scope.filter(s => s.source === 'Additional work').map(s => s.id));
  o.scope = o.scope.filter(s => !extra.has(s.id)); o.activities = o.activities.filter(a => !extra.has(a.scopeId)); o.additions = [];
  o.finalReports = o.finalReports.filter(r => r.status === 'Approved');
  const v = view({ ...j4, operations: o, status: 'Completed' });
  assert.equal(v.closed, true); assert.equal(v.currentStage, 'Completed');
  assert.ok(v.rows.every(r => r.status === 'completed' && r.actual));
  assert.equal(v.expected.kind, 'actual'); assert.equal(v.expected.date, o.finalReports.at(-1).approvedAt.slice(0, 10));
  assert.equal(v.done, v.total); assert.match(v.sentence, /All planned work is completed/);
});

test('missing estimates read "To be confirmed"; the client view never uses internal team dates', () => {
  const internal = view(byId['OM-X-26-006']), client = view(byId['OM-X-26-006'], 'client');
  assert.equal(row(internal, 'CVD').schedule.source, 'team', 'internal view shows the team plan, labelled');
  assert.equal(row(client, 'CVD').schedule, undefined, 'internal due date is not a client commitment');
  assert.equal(client.expected.kind, 'tbc'); assert.match(client.sentence, /Expected report delivery: to be confirmed/);
});

test('overdue is a separate flag: a row stays "In progress" and is also overdue', () => {
  const water = row(view(byId['OM-X-26-003']), 'Water Analysis');
  const j = estimate(byId['OM-X-26-003'], water.key, { start: '2026-11-01', finish: '2026-11-05', clientVisible: true });
  const r = row(view(j), 'Water Analysis');
  assert.equal(r.status, 'in-progress'); assert.equal(r.overdue, true);
  assert.equal(view(j, 'client').overdue, 1, 'client count uses client-visible estimates only');
  assert.ok(view(j).overdue >= 1, 'internal view also flags lapsed team-plan dates');
  const hidden = estimate(byId['OM-X-26-003'], water.key, { start: '2026-11-01', finish: '2026-11-05', clientVisible: false });
  assert.equal(row(view(hidden, 'client'), 'Water Analysis').overdue, false, 'internal-only estimate is not shown to the client');
});

test('estimates are separate from operational records and restricted to planners', () => {
  const base = byId['OM-X-26-004'], dl = row(view(base), 'DL');
  const j = estimate(base, dl.key, { start: '2026-11-20', days: '2', clientVisible: true });
  assert.deepEqual(j.operations.activities.map(a => [a.id, a.status, a.owner, a.start, a.due]), base.operations.activities.map(a => [a.id, a.status, a.owner, a.start, a.due]), 'statuses and assignments unchanged');
  assert.equal(row(view(j), 'DL').actual, dl.actual, 'actual completion preserved when estimates change');
  assert.equal(lastProgressUpdate(j), lastProgressUpdate(base), 'an estimate edit is not reported as workflow progress');
  assert.throws(() => estimate(base, 'report', { days: '-1' }), /whole number/);
  assert.throws(() => estimate(base, 'report', { days: '3' }, 'NASSER'), /job coordinator/);
  assert.equal(estimatePlanner(actor('BAHRI'), dl.key), false, 'Chemical Team Lead cannot schedule PVT rows');
  assert.equal(estimatePlanner(actor('BAHRI'), row(view(base), 'Water Analysis').key), true);
  assert.throws(() => estimate(base, 'nonsense', { days: '3' }), /cannot be scheduled/);
  const legacy = { ...base, operations: undefined, status: 'Sampling In Progress' };
  assert.throws(() => estimate(legacy, 'report', { days: '3' }), /earlier workflow/);
  // Clearing removes the estimate.
  const cleared = estimate(j, dl.key, {});
  assert.equal(cleared.operations.progressPlan[dl.key], undefined);
});

test('expected completion is provisional when the scope or upstream estimates do not support it', () => {
  const j = estimate(byId['OM-X-26-001'], 'report', { finish: '2026-12-01', clientVisible: true });
  assert.deepEqual(view(j).expected, { date: '2026-12-01', kind: 'provisional', reason: 'Laboratory scope awaiting confirmation' });
  const k = estimate(byId['OM-X-26-005'], 'report', { finish: '2026-12-01', clientVisible: true });
  assert.equal(view(k).expected.kind, 'provisional'); assert.match(view(k).expected.reason, /without an expected completion/);
  assert.match(view(k).sentence, /Expected report delivery: 01 Dec 2026 \(provisional\)/);
  assert.deepEqual(expectedCompletion([], [], false), { kind: 'tbc' });
});

test('client view: no names, assignments, internal flags, team dates or supplier names', () => {
  const j3 = structuredClone(byId['OM-X-26-003']);
  const wa = j3.operations.activities.find(a => a.title === 'Others — Water Analysis');
  wa.external = { provider: 'ACME PRIVATE LABS', notes: 'internal coordination note', expectedReturn: '2026-11-20' };
  const v = clientProgress(view(j3, 'client'));
  const text = JSON.stringify(v);
  assert.equal(row(v, 'Water Analysis').thirdParty, true);
  assert.match(row(v, 'Water Analysis').detail, /Third-party laboratory/);
  for (const secret of ['ACME', 'internal coordination', 'Returned for correction', 'attention', '"team"', ...names]) assert.ok(!text.includes(secret), 'client view leaks ' + secret);
  // The shared summary carries the same client block, and the server sanitiser drops anything internal even if sent.
  const summary = jobSummary(j3);
  assert.ok(summary.progress); assert.equal(summary.progress.audience, 'client');
  const forged = structuredClone(summary.progress); forged.rows[0].attention = 'Returned for correction'; forged.rows[0].schedule = { source: 'team', start: '2026-11-01', finish: '2026-11-02', clientVisible: false };
  const clean = sanitizeProgress(forged);
  assert.equal(clean.rows[0].attention, undefined); assert.equal(clean.rows[0].schedule, undefined);
  assert.ok(sanitizeSummary(JSON.parse(JSON.stringify(summary))).progress, 'progress survives the shared-summary sanitiser');
});

test('the job page and client tab use the shared progress model; external sharing stays off', async () => {
  const ws = fs.readFileSync('app/operations-workspace.tsx', 'utf8');
  assert.match(ws, /jobProgressView\(job,\{roles,employees:actor\.employees,today,flow\}\)/);
  assert.match(ws, /<OverallProgress view=\{progress\}/);
  assert.match(ws, /<JobFlowTracker flow=\{flow\}/, 'detailed internal workflow stays available');
  assert.match(fs.readFileSync('app/client-progress.tsx', 'utf8'), /<ProgressBody view=\{p\}/);
  assert.match(ws, /Print or save as PDF/);
  const { clientSharingEnabled } = await bundle('app/deployment.ts');
  assert.equal(clientSharingEnabled, false);
});
