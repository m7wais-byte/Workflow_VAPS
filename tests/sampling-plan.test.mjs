import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const { planRecords, planRecordCount, planErrors, legacyPlan, newPlanRow, rowSummary } = await bundle('app/sampling-plan.ts');
const { ukDate, ukDateTime, parseUkDate, parseUkTime } = await bundle('app/uk-format.ts');
const { teamName } = await bundle('app/team-name.ts');

test('separator sets: one record per cylinder, extra cylinders spread over the sets', () => {
  const plan = [{ source: 'Separator Sampling', count: '3', oil: '3', gas: '6' }];
  const records = planRecords(plan);
  assert.equal(records.length, 9);
  assert.equal(planRecordCount(plan), 9);
  assert.deepEqual(records.slice(0, 3).map(r => [r.id, r.set, r.phase]), [['1.01', 1, 'Oil'], ['1.02', 1, 'Gas'], ['1.03', 1, 'Gas']]);
  assert.deepEqual(records.filter(r => r.set === 3).map(r => r.phase), ['Oil', 'Gas', 'Gas']);
  assert.equal(rowSummary(plan[0]), '3 sets · 3 oil + 6 gas cylinders');
});

test('several sampling types are numbered in one running sequence, each record keeps its type', () => {
  const plan = [{ source: 'Separator Sampling', count: '2', oil: '2', gas: '2' }, { source: 'Cased Hole (Bottomhole / Downhole Sampling)', count: '3' }];
  const records = planRecords(plan);
  assert.deepEqual(records.map(r => r.id), ['1.01', '1.02', '1.03', '1.04', '1.05', '1.06', '1.07']);
  assert.deepEqual(records.slice(4).map(r => r.source), Array(3).fill('Cased Hole (Bottomhole / Downhole Sampling)'));
  assert.equal(records[4].phase, undefined);
});

test('new rows: separator starts at 1 set (1 oil + 1 gas), cased hole keeps its 3-sample default', () => {
  assert.deepEqual(newPlanRow('Separator Sampling'), { source: 'Separator Sampling', count: '1', oil: '1', gas: '1', note: '' });
  assert.equal(newPlanRow('Cased Hole (Bottomhole / Downhole Sampling)').count, '3');
  assert.equal(newPlanRow('Wellhead Sampling').count, '1');
});

test('plan validation: types required, whole counts, cased-hole note below 3, cylinder limits', () => {
  assert.deepEqual(planErrors([]), ['Select at least one sampling type.']);
  assert.match(planErrors([{ source: 'Cased Hole (Bottomhole / Downhole Sampling)', count: '2' }]).join(), /fewer than 3 cased-hole samples/);
  assert.deepEqual(planErrors([{ source: 'Cased Hole (Bottomhole / Downhole Sampling)', count: '2', note: 'Client asked for 2' }]), []);
  assert.match(planErrors([{ source: 'Separator Sampling', count: '2', oil: '0', gas: '0' }]).join(), /at least one oil or gas cylinder/);
  assert.match(planErrors([{ source: 'Separator Sampling', count: '0', oil: '1', gas: '1' }]).join(), /whole number of sets/);
  assert.match(planErrors([{ source: 'Wellhead Sampling', count: '1.5' }]).join(), /whole sample count/);
});

test('older single-type jobs become a one-row plan', () => {
  assert.deepEqual(legacyPlan({ samplingSource: 'Wellhead Sampling', requestedSampleCount: '2' }), [{ source: 'Wellhead Sampling', count: '2', note: '' }]);
  assert.deepEqual(legacyPlan({}), []);
  const saved = [{ source: 'Station Sampling', count: '1' }];
  assert.equal(legacyPlan({ samplingPlan: saved, samplingSource: 'Wellhead Sampling' }), saved);
});

test('UK dates: dd/mm/yyyy and 24-hour time whatever the browser language', () => {
  assert.equal(ukDate('2026-11-09'), '09/11/2026');
  assert.equal(ukDate(''), '');
  assert.match(ukDateTime('2026-11-09T14:05:00'), /^09\/11\/2026 14:05$/);
  assert.equal(parseUkDate('9/11/2026'), '2026-11-09');
  assert.equal(parseUkDate('31/02/2026'), null);
  assert.equal(parseUkDate('11/31/2026'), null);
  assert.equal(parseUkTime('1430'), '14:30');
  assert.equal(parseUkTime('24:00'), null);
});

test('the Chemical stream is shown as Chemistry; the stored value is unchanged', () => {
  assert.equal(teamName('Chemical'), 'Chemistry');
  assert.equal(teamName('PVT'), 'PVT');
});

test('saved jobs and cylinders with tool or brand names are converted to the general names', async () => {
  const { migrateJobNames, migrateCylinder, renameSpecification } = await bundle('app/naming.ts');
  const job = { samplingSource: 'Open Hole (SPMC - Field Sampling)', samples: [{ id: '1.01', sampler: 'SPMC', bottle: 'PDS', fieldData: { sampleNature: 'SPMC' } }] };
  const out = migrateJobNames(job);
  assert.equal(out.samplingSource, 'Open Hole – Field Sampling');
  assert.deepEqual([out.samples[0].sampler, out.samples[0].bottle, out.samples[0].fieldData.sampleNature], ['Downhole sampling tool', 'Type A', 'OHS']);
  assert.equal(migrateJobNames(out), out, 'already converted jobs are left as they are');
  assert.equal(migrateJobNames({ samplingSource: 'Open Hole (MDT Transfer)' }).samplingSource, 'Open Hole – Lab Transfer');
  assert.deepEqual(migrateCylinder({ type: 'GSB', serial: 'X1', capacity: '20 L', specification: 'Cylinder - GAS 20 litre 3K Luxfer' }), { type: 'Type E', serial: 'X1', capacity: '20 L', specification: 'Cylinder Type E - 3K - 20 L' });
  assert.equal(renameSpecification('Cylinder - 15K SPS/PDS Steel Coated 830/1000 cc TPED', 'SPS-SAM'), 'Cylinder Type D - 15K - 830/1000 cc (TPED)');
});

test('open-hole field sampling with the general name still needs equipment preparation', async () => {
  const { preparesEquipment } = await bundle('app/sampling-validation.ts');
  assert.equal(preparesEquipment('Open Hole – Field Sampling'), true);
  assert.equal(preparesEquipment('Open Hole – Lab Transfer'), false);
});
