import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const { buildDemoJobs, demoClient } = await bundle('app/demo-data.ts');
const { operationMilestones, operationComplete, samplingApproved, pendingActions } = await bundle('app/operations-model.ts');
const { initialDirectory } = await bundle('app/employee-directory.ts');
const { defaultAuthorization } = await bundle('app/authorization.ts');
const employees = initialDirectory().employees, policy = defaultAuthorization(employees.map(e => e.id));
const stored = [];
const storeFile = async (name, content) => { const file = { id: 'file-' + stored.length, name, size: content.length, type: 'text/plain' }; stored.push(file); return file; };
const jobs = await buildDemoJobs(storeFile, new Date('2026-10-28T10:00:00+04:00'));
const byId = Object.fromEntries(jobs.map(j => [j.id, j]));
const current = j => operationMilestones(j).find(m => !m.done)?.id;

test('four fictional demo jobs use the DEMO client and unique ids', () => {
 assert.deepEqual(jobs.map(j => j.id).sort(), ['OM-X-26-001', 'OM-X-26-002', 'OM-X-26-003', 'OM-X-26-004']);
 assert.ok(jobs.every(j => j.clientCode === demoClient.code && /DEMO/.test(j.well) && /DEMO/.test(j.description)));
});
test('each demo job sits at a different workflow stage', () => {
 assert.equal(current(byId['OM-X-26-001']), 'sampling');
 assert.equal(current(byId['OM-X-26-002']), 'sampling-report');
 assert.equal(byId['OM-X-26-002'].operations.samplingReports.at(-1).status, 'Awaiting Approval');
 assert.equal(current(byId['OM-X-26-003']), 'laboratory');
 assert.equal(samplingApproved(byId['OM-X-26-003']), true);
 assert.equal(operationComplete(byId['OM-X-26-004']), true);
 assert.equal(byId['OM-X-26-004'].status, 'Completed');
});
test('demo jobs give the right people something to do', () => {
 const actor = id => ({ id, employees, policy });
 assert.ok(pendingActions(byId['OM-X-26-002'], actor('SALIM')).some(a => a.id === 'sampling-report'));
 const lab = byId['OM-X-26-003'].operations.activities;
 assert.ok(lab.some(a => a.status === 'Completed') && lab.some(a => a.status === 'In Progress') && lab.some(a => a.stream === 'Chemical' && a.status === 'In Progress'));
});
test('every referenced workbook and report file was stored', () => {
 const refs = jobs.flatMap(j => [...(j.operations?.activities.flatMap(a => a.files.map(f => f.id)) || []), ...(j.operations?.finalReports.map(r => r.file?.id).filter(Boolean) || [])]);
 assert.ok(refs.length > 10);
 assert.ok(refs.every(id => stored.some(f => f.id === id)));
});
