import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const { buildDemoJobs, demoClient } = await bundle('app/demo-data.ts');
const { operationMilestones, operationComplete, samplingApproved } = await bundle('app/operations-model.ts');
const { initialDirectory } = await bundle('app/employee-directory.ts');
const { defaultAuthorization } = await bundle('app/authorization.ts');
const employees = initialDirectory().employees, policy = defaultAuthorization(employees.map(e => e.id));
const stored = [];
const storeFile = async (name, content) => { const file = { id: 'file-' + stored.length, name, size: content.length, type: 'text/plain' }; stored.push(file); return file; };
const jobs = await buildDemoJobs(storeFile, new Date('2026-10-28T10:00:00+04:00'));
const byId = Object.fromEntries(jobs.map(j => [j.id, j]));
const current = j => operationMilestones(j).find(m => !m.done)?.id;

const { workItems } = await bundle('app/work-items.ts');
const { defaultResponsibilities } = await bundle('app/authorization.ts');
const { demoConfiguration } = await bundle('app/demo-data.ts');
const today = '2026-10-28';
const demoActor = id => ({ id, employees, policy, roles: { ...defaultResponsibilities, ...demoConfiguration.roles }, teams: demoConfiguration.teams, routing: demoConfiguration.routing });
const work = id => workItems(jobs, demoActor(id), today);

test('six fictional demo jobs use the DEMO client and unique ids', () => {
 assert.deepEqual(jobs.map(j => j.id).sort(), ['OM-X-26-001', 'OM-X-26-002', 'OM-X-26-003', 'OM-X-26-004', 'OM-X-26-005', 'OM-X-26-006']);
 assert.ok(jobs.every(j => j.clientCode === demoClient.code && /DEMO/.test(j.well) && /DEMO/.test(j.description)));
});
test('the demo covers PVT-only, Chemical-only and Both destinations through the per-sample scope', () => {
 const scopes = id => byId[id].operations.labScopes?.at(-1)?.samples.map(s => s.destination);
 assert.deepEqual(scopes('OM-X-26-003'), ['PVT', 'Both']);
 assert.deepEqual(scopes('OM-X-26-005'), ['Chemical']);
 assert.deepEqual(scopes('OM-X-26-006'), ['PVT', 'PVT']);
 assert.ok(byId['OM-X-26-005'].samples[0].containerType === 'Glass container', 'a glass container is included');
});
test('each demo job sits at a coherent stage, including Validation added to a completed job', () => {
 assert.equal(current(byId['OM-X-26-001']), 'sampling');
 assert.equal(current(byId['OM-X-26-002']), 'sampling-report');
 assert.equal(byId['OM-X-26-002'].operations.samplingData.at(-1).status, 'Submitted', 'waiting for the data review');
 assert.equal(samplingApproved(byId['OM-X-26-003']), true);
 const j4 = byId['OM-X-26-004'], o4 = j4.operations;
 assert.ok(o4.finalReports.some(r => r.status === 'Approved' && r.approvedBy === 'WILFRED'), 'the approved report version is kept');
 assert.equal(operationComplete(j4), false, 'added Validation reopens the job as additional work');
 const added = o4.activities.filter(a => a.id.startsWith('addval:'));
 assert.deepEqual(added.map(a => a.title), ['Opening Pressure', 'Restoration', 'Flash', 'PV']);
 assert.ok(added.every(a => a.status === 'Unassigned' && a.stream === 'PVT'));
 assert.ok(o4.activities.filter(a => !a.id.startsWith('addval:')).every(a => a.status === 'Completed' && a.files.some(f => f.qcApprovedAt)), 'earlier completed work is unchanged');
});
test('demo assignments always match the demo team setup, and QC is independent of the teams', () => {
 for (const j of jobs) for (const a of j.operations?.activities || []) if (a.owner) assert.ok(demoConfiguration.teams[a.stream].includes(a.owner), `${j.id} ${a.title} → ${a.owner}`);
 assert.ok(!demoConfiguration.teams.PVT.includes(demoConfiguration.roles.qcReviewer) && !demoConfiguration.teams.Chemical.includes(demoConfiguration.roles.qcReviewer));
});
test('demo jobs show assigned work, review, returns, QC, new scope alerts and coming-up responsibilities', () => {
 const lab = byId['OM-X-26-003'].operations.activities;
 for (const status of ['Completed', 'Workbook Submitted', 'Changes Requested', 'Awaiting QC', 'In Progress', 'Scheduled']) assert.ok(lab.some(a => a.status === status), status);
 assert.ok(work('SALIM').actions.some(i => i.action === 'Review sampling data'));
 assert.ok(work('SHEREIQI').actions.some(i => /^Review workbook/.test(i.action)), 'team lead review');
 assert.ok(work('RANJITH').actions.some(i => i.kind === 'returned'), 'returned work');
 assert.ok(work('AHAD').actions.some(i => i.area === 'QC'), 'QC review');
 assert.ok(work('YAQEEN').actions.some(i => i.stream === 'Chemical'), 'Chemical work');
 assert.deepEqual(work('BAHRI').alerts.map(a => [a.jobNumber, a.headline]), [['OM-X-26-005', 'New Chemistry scope added'], ['OM-X-26-001', 'Job in sampling · DEMO'], ['OM-X-26-002', 'Job in sampling · DEMO']]);
 assert.ok(work('SHEREIQI').alerts.some(a => a.headline === 'Validation added' && a.jobNumber === 'OM-X-26-004'));
 assert.ok(work('NASSER').alerts.some(a => a.kind === 'assignment' && a.jobNumber === 'OM-X-26-006'));
 assert.equal(work('HUMAID').actions.length + work('HUMAID').upcoming.length, 0, 'no sample handover step for the driver');
 assert.ok(work('WILFRED').upcoming.some(u => u.role === 'Final report approval'), 'approver sees approvals coming up, without an approve button');
 assert.equal(work('WILFRED').actions.length, 0);
});
test('every referenced workbook and report file was stored', () => {
 const refs = jobs.flatMap(j => [...(j.operations?.activities.flatMap(a => a.files.map(f => f.id).filter(Boolean)) || []), ...(j.operations?.finalReports.map(r => r.file?.id).filter(Boolean) || [])]);
 assert.ok(refs.length > 0);
 assert.ok(jobs.some(j => j.operations?.activities.some(a => !a.external && a.files.length && a.files.every(f => !f.id))), 'internal tests are marked finished without an upload');
 assert.ok(refs.every(id => stored.some(f => f.id === id)));
});
