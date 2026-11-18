import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const { cylinderStatuses, setCylinderStatus, selectable } = await bundle('app/cylinder-status.ts');
const all = { emptied: true, cleaned: true, certified: true, pressureTested: true };
const job = (id, serials, released) => ({ id, jobNumber: id, samples: serials.map((s, i) => ({ id: '1.0' + (i + 1), bottleSerial: s })), operations: released ? { cylindersReleased: { by: 'SALIM', at: released } } : {} });

test('cylinders start Not checked and cannot be chosen until the sampling team sets them Ready', () => {
  let records = {};
  let st = cylinderStatuses([], records);
  assert.equal(st('812888').state, 'not-checked');
  assert.equal(selectable(st('812888'), 'J1', '1.01'), false);
  assert.throws(() => setCylinderStatus(records, '812888', { state: 'ready', by: 'HUSSEINI', checks: { emptied: false, cleaned: false, certified: false, pressureTested: false } }, st('812888')), /Tick at least one/);
  records = setCylinderStatus(records, '812888', { state: 'ready', by: 'HUSSEINI', checks: all }, st('812888'));
  st = cylinderStatuses([], records);
  assert.equal(st('812888').state, 'ready');
  assert.equal(selectable(st('812888'), 'J1', '1.01'), true);
});

test('a cylinder chosen in a job is In use and blocked for every other job and sample', () => {
  const records = setCylinderStatus({}, '812888', { state: 'ready', by: 'HUSSEINI', checks: all }, cylinderStatuses([], {})('812888'));
  const st = cylinderStatuses([job('J1', ['812888'])], records);
  assert.equal(st('812888').state, 'in-use');
  assert.equal(st('812888').job.jobNumber, 'J1');
  assert.equal(selectable(st('812888'), 'J1', '1.01'), true, 'its own sample keeps it');
  assert.equal(selectable(st('812888'), 'J1', '1.02'), false, 'not a second sample of the same job');
  assert.equal(selectable(st('812888'), 'J2', '1.01'), false, 'not another job');
  assert.throws(() => setCylinderStatus(records, '812888', { state: 'damaged', by: 'HUSSEINI', note: 'Dent' }, st('812888')), /in use on job J1/);
  assert.equal(cylinderStatuses([{ ...job('J1', ['812888']), trash: { deletedBy: 'MA001', deletedAt: 'x' } }], records)('812888').state, 'ready', 'a job in Trash does not hold cylinders');
});

test('after release the cylinder is Returned until checked again; maintenance and damage need a note', () => {
  const ready = setCylinderStatus({}, '812888', { state: 'ready', by: 'HUSSEINI', checks: all, at: '2026-11-01T08:00:00Z' }, cylinderStatuses([], {})('812888'));
  const jobs = [job('J1', ['812888'], '2026-11-20T08:00:00Z')];
  let st = cylinderStatuses(jobs, ready);
  assert.equal(st('812888').state, 'returned');
  assert.equal(selectable(st('812888'), 'J2', '1.01'), false);
  assert.throws(() => setCylinderStatus(ready, '812888', { state: 'damaged', by: 'MOHSIN', note: ' ' }, st('812888')), /Describe the maintenance or damage/);
  const damaged = setCylinderStatus(ready, '812888', { state: 'damaged', by: 'MOHSIN', note: 'Valve leaking', at: '2026-11-21T08:00:00Z' }, st('812888'));
  st = cylinderStatuses(jobs, damaged);
  assert.equal(st('812888').state, 'damaged');
  assert.equal(damaged['812888'].history.at(-1).fromJob, 'J1');
  assert.equal(damaged['812888'].history.length, 2);
});

test('release-cylinders: only after the job is finished, by the coordinator, once', async () => {
  const { applyOperation } = await bundle('app/operations-model.ts');
  const { initialDirectory } = await bundle('app/employee-directory.ts');
  const { defaultAuthorization } = await bundle('app/authorization.ts');
  const employees = initialDirectory().employees;
  const actor = (id) => ({ id, employees, policy: defaultAuthorization(employees.map((e) => e.id)) });
  const legacyDone = { id: 'OM-P-26-090', jobNumber: 'OM-P-26-090', status: 'Completed', clientCode: 'P', stages: [], events: [], samples: [{ id: '1.01', bottleSerial: '812888' }] };
  assert.throws(() => applyOperation({ ...legacyDone, status: 'Sampling In Progress' }, { type: 'release-cylinders' }, actor('SALIM')), /after the job is finished/);
  assert.throws(() => applyOperation(legacyDone, { type: 'release-cylinders' }, actor('HUSSEINI')), /Only the job coordinator/);
  assert.throws(() => applyOperation(legacyDone, { type: 'release-cylinders', assignee: 'HUSSEINI' }, actor('SALIM')), /after the client approves the final report/, 'cylinders stay with the job until the client approves and instructs disposal');
  assert.throws(() => applyOperation(legacyDone, { type: 'client-disposal' }, actor('HUSSEINI')), /Only the job coordinator/);
  const approvedByClient = applyOperation(legacyDone, { type: 'client-disposal', note: 'Email 18/11' }, actor('SALIM'));
  assert.equal(approvedByClient.operations.clientDisposal.by, 'SALIM'); assert.match(approvedByClient.events.at(-1).description, /Client approved the final report and instructed disposal.*Email 18\/11/);
  assert.throws(() => applyOperation(approvedByClient, { type: 'client-disposal' }, actor('SALIM')), /already recorded/);
  assert.throws(() => applyOperation(approvedByClient, { type: 'release-cylinders', note: 'Shelf B' }, actor('SALIM')), /Select the sampling employee/, 'the coordinator names who redresses the cylinders');
  const r = applyOperation(approvedByClient, { type: 'release-cylinders', note: 'Shelf B', assignee: 'HUSSEINI' }, actor('SALIM'));
  assert.ok(r.operations.cylindersReleased.at); assert.equal(r.operations.cylindersReleased.assignee, 'HUSSEINI');
  assert.match(r.events.at(-1).description, /Cylinders released by .* to .* release and redress .* 812888\. Note: Shelf B/);
  assert.throws(() => applyOperation(r, { type: 'release-cylinders' }, actor('SALIM')), /already released/);
});

test('backup cylinders are reserved for their job, can be chosen for one of its samples, and are released with the job', async () => {
  const { backupCylinders, jobCylinders } = await bundle('app/cylinder-status.ts');
  const withBackups = (released) => ({ ...job('J1', ['A1'], released), coordinationDetails: { backupCylinders: 'B1, B2, A1' } });
  assert.deepEqual(backupCylinders(withBackups()), ['B1', 'B2'], 'a cylinder a sample uses is not listed as a backup');
  assert.deepEqual(jobCylinders(withBackups()), ['A1', 'B1', 'B2']);
  let st = cylinderStatuses([withBackups()], {});
  assert.equal(st('B1').state, 'in-use'); assert.deepEqual(st('B1').job.sampleIds, []);
  assert.equal(selectable(st('B1'), 'J2', '1.01'), false, 'another job cannot take a reserved backup');
  assert.equal(selectable(st('B1'), 'J1', '1.02'), true, 'the job may use its own backup for a sample');
  st = cylinderStatuses([withBackups('2026-11-01T08:00:00.000Z')], {});
  assert.equal(st('B2').state, 'returned', 'unused backups return for cleaning with the job cylinders');
});

test('partial checks save as Checks in progress, keep the ticks and stay blocked until all four are done', async () => {
  const { pendingChecks } = await bundle('app/cylinder-status.ts');
  const jobs = [job('J1', ['2829A'], '2026-11-17T16:08:00Z')];
  let st = cylinderStatuses(jobs, {});
  assert.equal(st('2829A').state, 'returned');
  let records = setCylinderStatus({}, '2829A', { state: 'ready', by: 'HUSSEINI', checks: { emptied: true, cleaned: true, certified: false, pressureTested: false }, at: '2026-11-18T08:00:00Z' }, st('2829A'));
  st = cylinderStatuses(jobs, records);
  assert.equal(st('2829A').state, 'checking');
  assert.equal(selectable(st('2829A'), 'J2', '1.01'), false);
  assert.deepEqual(pendingChecks(st('2829A').record.checks), ['Certified', 'Pressure tested']);
  records = setCylinderStatus(records, '2829A', { state: 'ready', by: 'HUSSEINI', checks: all, at: '2026-11-18T10:00:00Z' }, st('2829A'));
  st = cylinderStatuses(jobs, records);
  assert.equal(st('2829A').state, 'ready');
  assert.equal(records['2829a'].history.at(-1).fromJob, 'J1', 'the job reference carries through the in-progress step');
  assert.deepEqual(pendingChecks({ emptied: true, cleaned: true, calibrated: true, pressureTested: true }), [], 'older records with "calibrated" count as Certified');
});
