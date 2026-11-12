import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const store = new Map(); globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } }; globalThis.localStorage = window.localStorage;
const { buildDemoJobs, demoConfiguration } = await bundle('app/demo-data.ts');
const { jobFlow, scopeSummary, clientSections } = await bundle('app/job-flow.ts');
const { jobSummary } = await bundle('app/job-workflow-model.ts');
const { sanitizeSummary } = await bundle('app/summary-validation.ts');
const { defaultResponsibilities } = await bundle('app/authorization.ts');
const { initialDirectory } = await bundle('app/employee-directory.ts');
const employees = initialDirectory().employees;
const roles = { ...defaultResponsibilities, ...demoConfiguration.roles };
const jobs = await buildDemoJobs(async (name, content) => ({ id: name, name, size: content.length, type: 'text/plain' }), new Date('2026-10-28T10:00:00+04:00'));
const byId = Object.fromEntries(jobs.map(j => [j.id, j]));
const flow = id => jobFlow(byId[id], roles, employees);
const section = (f, id) => f.sections.find(s => s.id === id);
const steps = s => s.groups.flatMap(g => g.steps);
const step = (f, label) => f.sections.flatMap(steps).find(s => s.label === label);

test('a draft shows its planned stages immediately, with nothing started and laboratory tests to be confirmed', () => {
  const draft = { ...byId['OM-X-26-001'], id: 'D-1', status: 'Draft', operations: undefined };
  const f = jobFlow(draft, roles, employees);
  assert.deepEqual(f.sections.map(s => s.label), ['Sampling', 'Laboratory', 'Final report']);
  assert.equal(f.status, 'Draft'); assert.equal(f.done, 0);
  assert.ok(f.sections.every(s => s.state === 'not-started'));
  assert.equal(section(f, 'laboratory').pendingScope, true);
  assert.match(f.summary, /laboratory tests to be confirmed/);
});

test('sampling in progress: current stage, happening now and next step come from the sampling records', () => {
  const f = flow('OM-X-26-001');
  assert.equal(f.current, 'Sampling'); assert.equal(f.status, 'In progress');
  assert.equal(step(f, 'Field sampling & data sheets').detail, '1 of 2 data sheets complete');
  assert.equal(f.next, 'Data review & approval');
  const f2 = flow('OM-X-26-002');
  assert.equal(step(f2, 'Data review & approval').state, 'in-progress');
  assert.equal(step(f2, 'Sampling report approval').state, 'not-started');
});

test('mixed PVT and Chemical scope: parallel streams, Validation steps, a returned item and no false completion', () => {
  const f = flow('OM-X-26-003'), lab = section(f, 'laboratory');
  assert.deepEqual([...new Set(lab.groups.map(g => g.stream).filter(Boolean))], ['PVT', 'Chemical']);
  assert.ok(lab.groups.some(g => g.kind === 'validation' && g.steps.length === 18));
  assert.equal(f.status, 'Correction needed'); assert.equal(lab.state, 'blocked');
  const water = step(f, 'Water Check · Sample 1.02'); assert.equal(water.correction, true); assert.equal(water.state, 'blocked');
  // An uploaded workbook awaiting team-lead review is in progress, not complete.
  assert.equal(step(f, 'Charging · Sample 1.01').state, 'in-progress');
  assert.equal(step(f, 'Agitation · Sample 1.02').detail, 'Approved', 'team-lead approval completes the step');
  assert.ok(f.now.some(n => /Chemical tests/.test(n.text)) && f.now.some(n => /Validation/.test(n.text)), 'both teams are active now');
  assert.equal(f.next, 'Final report preparation');
});

test('Chemical-only and PVT-only scopes show only their own laboratory work', () => {
  const chem = section(flow('OM-X-26-005'), 'laboratory');
  assert.ok(chem.groups.every(g => g.stream !== 'PVT'));
  assert.deepEqual(steps(chem).filter(s => s.id.startsWith('act:')).map(s => s.label), ['Water Analysis · Sample 1.01', 'Compositional Analysis · Sample 1.01']);
  assert.notEqual(chem.state, 'completed', 'unassigned tests keep the laboratory open');
  const pvt = section(flow('OM-X-26-006'), 'laboratory');
  assert.ok(pvt.groups.every(g => g.stream !== 'Chemical'));
  assert.deepEqual(scopeSummary(byId['OM-X-26-006']).slice(1), ['PVT: CVD, CCE']);
});

test('additional work keeps completed results and the approved report, and requires a revision without calling it a correction', () => {
  const f = flow('OM-X-26-004');
  assert.equal(f.status, 'Additional work in progress'); assert.equal(f.additionalWork, true);
  assert.equal(step(f, 'DL · Sample 1.01').state, 'completed');
  assert.equal(step(f, 'Water Analysis · Sample 1.01').state, 'completed');
  assert.ok(steps(section(f, 'laboratory')).filter(s => s.label.endsWith('· Sample 1.01') && s.state === 'not-started').length >= 4, 'new Validation steps are listed');
  const prep = step(f, 'Revised final report preparation');
  assert.equal(prep.state, 'not-started'); assert.notEqual(prep.correction, true);
  assert.match(section(f, 'report').notes[0], /approved earlier and is kept/);
  assert.equal(section(f, 'report').current, false, 'the final report is not current while laboratory work is open');
});

test('transfer jobs are labelled as sample transfer, not field sampling', () => {
  const f = jobFlow({ ...byId['OM-X-26-002'], samplingSource: 'Open Hole (MPSR - Lab Transfer)' }, roles, employees);
  assert.equal(f.sections[0].label, 'Sample transfer');
  assert.equal(step(f, 'Sample transfer data').state, 'completed');
});

test('client progress uses the same flow but hides names, returns and internal review states', () => {
  const summary = jobSummary(byId['OM-X-26-003']);
  assert.equal(summary.version, 2); assert.equal(summary.done, flow('OM-X-26-003').done);
  const text = JSON.stringify(summary);
  for (const hidden of ['Ranjith', 'Nasser', 'Shereiqi', 'SHEREIQI', 'Returned', 'correction', 'QC review', 'Team-lead', 'workbook', 'blocked']) assert.ok(!text.includes(hidden), hidden + ' must not reach the client');
  assert.ok(clientSections(flow('OM-X-26-003')).every(s => s.groups.every(g => g.steps.every(x => x.state !== 'blocked'))));
  assert.deepEqual(sanitizeSummary(JSON.parse(text)), summary, 'the server accepts the v2 summary unchanged');
  assert.equal(sanitizeSummary({ ...summary, secret: 'x', nodes: summary.nodes }).secret, undefined);
});
