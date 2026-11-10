import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const { cylinderStatuses, setCylinderStatus, selectable } = await bundle('app/cylinder-status.ts');
const all = { emptied: true, cleaned: true, calibrated: true, pressureTested: true };
const job = (id, serials, released) => ({ id, jobNumber: id, samples: serials.map((s, i) => ({ id: '1.0' + (i + 1), bottleSerial: s })), operations: released ? { cylindersReleased: { by: 'SALIM', at: released } } : {} });

test('cylinders start Not checked and cannot be chosen until the sampling team sets them Ready', () => {
  let records = {};
  let st = cylinderStatuses([], records);
  assert.equal(st('812888').state, 'not-checked');
  assert.equal(selectable(st('812888'), 'J1', '1.01'), false);
  assert.throws(() => setCylinderStatus(records, '812888', { state: 'ready', by: 'HUSSEINI', checks: { ...all, calibrated: false } }, st('812888')), /Tick every check/);
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
  const r = applyOperation(legacyDone, { type: 'release-cylinders', note: 'Shelf B' }, actor('SALIM'));
  assert.ok(r.operations.cylindersReleased.at);
  assert.match(r.events.at(-1).description, /Cylinders released .* 812888\. Note: Shelf B/);
  assert.throws(() => applyOperation(r, { type: 'release-cylinders' }, actor('SALIM')), /already released/);
});
