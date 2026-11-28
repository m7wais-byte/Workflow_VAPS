// "Final report approved internally" vs "Final report issued to the client" (builder item 29).
// VAPS's approval is internal. The coordinator records when the approved report reached the client; only then do the
// client-facing views, the weekly board and the client email call it issued, and only then is the client's approval
// (sample disposal) recorded. Demo data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const store = new Map(); globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } }; globalThis.localStorage = window.localStorage;
const { buildDemoJobs, demoConfiguration } = await bundle('app/demo-data.ts');
const { applyOperation, issuePending, finalIssued, omanDay } = await bundle('app/operations-model.ts');
const { jobProgressView, clientProgress } = await bundle('app/job-progress.ts');
const { jobSummary } = await bundle('app/job-workflow-model.ts');
const { sanitizeSummary } = await bundle('app/summary-validation.ts');
const { reportDate } = await bundle('app/weekly-board.ts');
const { defaultResponsibilities, defaultAuthorization } = await bundle('app/authorization.ts');
const { initialDirectory } = await bundle('app/employee-directory.ts');
const employees = initialDirectory().employees;
const roles = { ...defaultResponsibilities, ...demoConfiguration.roles };
const policy = defaultAuthorization(employees.map(e => e.id));
const actor = id => ({ id, employees, policy, roles, teams: demoConfiguration.teams, routing: demoConfiguration.routing });
const jobs = await buildDemoJobs(async (name, content) => ({ id: name, name, size: content.length, type: 'text/plain' }), new Date('2026-10-28T10:00:00+04:00'));
const demo = jobs.find(j => j.id === 'OM-X-26-004');

/** The demo's completed job before its additional work, with the final report approved but not yet issued. */
function approvedJob() {
  const o = structuredClone(demo.operations);
  const extra = new Set(o.scope.filter(s => s.source === 'Additional work').map(s => s.id));
  o.scope = o.scope.filter(s => !extra.has(s.id)); o.activities = o.activities.filter(a => !extra.has(a.scopeId)); o.additions = [];
  o.finalReports = o.finalReports.filter(r => r.status === 'Approved').map(r => { const c = { ...r }; delete c.issuedAt; delete c.issuedBy; delete c.issueNote; return c; });
  return { ...demo, operations: o, status: 'Completed' };
}
const now = '2026-11-25T09:00:00.000Z';
const run = (job, command, who = 'SALIM', at = now) => applyOperation(job, command, actor(who), at);
const reportNode = s => s.nodes.find(n => n.id === 'report');
const leaves = n => n.children?.length ? n.children.flatMap(leaves) : [n];

test('the coordinator records the issue: approval first, a real day, once; the client approval waits for it', () => {
  const job = approvedJob(), approvedAt = job.operations.finalReports.at(-1).approvedAt;
  assert.equal(issuePending(job), true); assert.equal(finalIssued(job), undefined);
  assert.throws(() => run(job, { type: 'client-disposal', note: '' }), /Record first that the final report was issued to the client/);
  assert.throws(() => run(job, { type: 'report-issue' }, 'NASSER'), /Only the job coordinator/);
  assert.throws(() => run(job, { type: 'report-issue', on: '2026-11-26' }), /not before its approval and not in the future/, 'no future day');
  assert.throws(() => run(job, { type: 'report-issue', on: '2026-01-01' }), /not before its approval/, 'not before the approval');
  assert.throws(() => run(job, { type: 'report-issue', on: '25/11/2026' }), /Enter the day/, 'yyyy-mm-dd only');
  // Back-dated to the approval day (Oman): stored as that day, recorded by the signed-in coordinator, with the note.
  const day = omanDay(approvedAt), issued = run(job, { type: 'report-issue', on: day, note: 'Transmittal T-0412' });
  const r = issued.operations.finalReports.at(-1);
  assert.equal(r.issuedAt, day + 'T08:00:00.000Z'); assert.equal(r.issuedBy, 'SALIM'); assert.equal(r.issueNote, 'Transmittal T-0412');
  assert.equal(r.status, 'Approved', 'the approval itself is unchanged');
  assert.match(issued.events.at(-1).description, new RegExp(`Final report v${r.version} issued to the client on ${day}\\. Recorded by .+Note: Transmittal T-0412`));
  assert.equal(issuePending(issued), false); assert.equal(finalIssued(issued).version, r.version);
  assert.throws(() => run(issued, { type: 'report-issue' }), /already recorded as issued/);
  // Today: the exact time is kept. Then the client's approval can be recorded.
  const today = run(job, { type: 'report-issue', note: '' });
  assert.equal(today.operations.finalReports.at(-1).issuedAt, now); assert.equal(today.operations.finalReports.at(-1).issueNote, undefined);
  assert.ok(run(today, { type: 'client-disposal', note: 'Client approved (test).' }).operations.clientDisposal);
});

test('client views never show the internal approval: in progress until issued, then the issue day', () => {
  const job = approvedJob();
  // Approved internally: the shared summary and the client progress keep the report in progress, with no dates.
  const s = jobSummary(job), node = reportNode(s);
  assert.equal(s.status, 'In progress'); assert.equal(s.current, 'Final report'); assert.equal(s.next, 'Final report to be issued to the client');
  assert.equal(node.state, 'active'); assert.equal(node.at, undefined);
  assert.ok(node.children.every(g => g.state === 'active' && g.at === undefined));
  assert.deepEqual(leaves(node).find(l => l.id === 'report:approval'), { id: 'report:approval', label: 'Final approval', state: 'active' }, 'the internal approval reads in progress, with no date');
  assert.deepEqual(leaves(node).at(-1), { id: 'report:issue', label: 'Issue to the client', state: 'pending' });
  assert.ok(!s.dates.some(d => /Final report/.test(d.label)), 'no final report date before the issue');
  assert.equal(s.done, s.total - 2, 'neither the approval nor the issue counts yet');
  // The approval is left out of the history sent to the client; earlier entries stay.
  const history = [{ label: 'Final report preparation', state: 'done', at: '2026-11-20T08:00:00.000Z' }, { label: 'Final approval', state: 'done', at: '2026-11-21T08:00:00.000Z' }];
  assert.deepEqual(jobSummary({ ...job, workflowHistory: history }).history, [history[0]]);
  assert.deepEqual(sanitizeSummary(JSON.parse(JSON.stringify(s))), JSON.parse(JSON.stringify(s)), 'the server accepts the summary unchanged');
  const c = clientProgress(jobProgressView(job, { roles, employees, today: '2026-11-25', audience: 'client' }));
  assert.equal(c.closed, false); assert.doesNotMatch(JSON.stringify(c), /approved internally|was issued|issued on/i);
  // Issued (back-dated to 24 Nov): every client view says issued on that day; the work counts as complete.
  const issued = run(job, { type: 'report-issue', on: '2026-11-24' }), t = jobSummary(issued), tn = reportNode(t);
  assert.equal(t.status, 'Completed'); assert.equal(tn.state, 'done'); assert.equal(tn.at, '2026-11-24T08:00:00.000Z');
  assert.equal(leaves(tn).at(-1).state, 'done'); assert.equal(leaves(tn).find(l => l.id === 'report:approval').state, 'done'); assert.equal(t.done, t.total);
  assert.equal(jobSummary({ ...issued, workflowHistory: history }).history.length, 2, 'once issued, the approval is history like any step');
  assert.deepEqual(t.dates.find(d => d.label === 'Final report issued'), { label: 'Final report issued', value: '2026-11-24T08:00:00.000Z' });
  const ci = clientProgress(jobProgressView(issued, { roles, employees, today: '2026-11-25', audience: 'client' }));
  assert.match(ci.sentence, /final report was issued on 24\/11\/2026/);
});

test('weekly board: "issued" only with the recorded issue day; older jobs keep their approval day', () => {
  const job = approvedJob(), approvedAt = job.operations.finalReports.at(-1).approvedAt;
  assert.notEqual(reportDate(job, true)?.kind, 'issued', 'approved internally is not issued');
  const issued = run(job, { type: 'report-issue', on: '2026-11-24' });
  assert.deepEqual(reportDate(issued, true), { date: '2026-11-24', kind: 'issued' });
  // Recorded before the issue step existed: the client approval implies the issue; the approval day is used.
  const legacy = { ...job, operations: { ...job.operations, clientDisposal: { by: 'SALIM', at: '2026-11-20T08:00:00.000Z' } } };
  assert.equal(issuePending(legacy), false);
  assert.deepEqual(reportDate(legacy, true), { date: approvedAt.slice(0, 10), kind: 'issued' });
  const ls = jobSummary(legacy);
  assert.equal(ls.status, 'Completed'); assert.equal(leaves(reportNode(ls)).at(-1).state, 'done');
});

test('additional work after the issue: the revised report is a new version to approve and issue again', () => {
  // The demo job was issued as v1, then the client asked for Validation: v2 reopens without the issue fields.
  const [v1, v2] = demo.operations.finalReports;
  assert.ok(v1.issuedAt && v1.issuedBy === 'SALIM'); assert.equal(v2.issuedAt, undefined); assert.equal(v2.issuedBy, undefined);
  assert.equal(issuePending(demo), false, 'nothing to issue while the revision is open');
  const internal = jobProgressView(demo, { roles, employees, today: '2026-11-08', audience: 'internal' });
  assert.match(internal.rows.find(r => r.key === 'report').detail, /^Earlier report issued \d{2}\/\d{2}\/\d{4} · revision for additional work$/);
});
