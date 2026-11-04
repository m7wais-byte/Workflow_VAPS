// Laboratory Scope of Work demo (scope-demo/): routing, release, Validation planning and additional requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = await build({ entryPoints: ['scope-demo/model.ts'], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const m = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const at = '2026-11-04T08:00:00.000Z';
const ready = () => { const s = m.seed(); s.samples[3].customFluid = 'Volatile Oil'; return s; };
const released = () => m.release(ready(), at);

test('seed uses catalogue tests and blocks release until S-04 has a fluid name', () => {
  const s = m.seed();
  for (const sm of s.samples) for (const id of sm.tests) assert.ok(m.catTest(id), id + ' is in the app catalogue');
  assert.equal(m.canRelease(s), false);
  assert.deepEqual(m.scopeBlockers(s).filter((b) => b.issues.length).map((b) => [b.sampleId, b.issues[0]]), [['S-04', 'Enter the custom fluid name']]);
  assert.equal(m.canRelease(ready()), true);
  assert.equal(m.sampleSummary(s.samples[0]).parts.join(' · '), 'S-01 · Black Oil · PVT + Chemical · Validation · 3 tests');
});

test('review routes each sample to the right lead; S-03 adds PVT for Validation only', () => {
  const s = ready();
  const r = Object.fromEntries(s.samples.map((x) => [x.id, m.routeSample(x)]));
  assert.deepEqual(r['S-01'].pvt.map((i) => i.key), ['Black Oil — DL']);
  assert.deepEqual(r['S-01'].chemical.map((i) => i.key), ['Specialised Analysis — SARA']);
  assert.equal(r['S-02'].validation, false); assert.equal(r['S-02'].pvt.length, 0);
  assert.equal(r['S-03'].validation, true); assert.equal(r['S-03'].pvt.length, 0);
  assert.deepEqual(r['S-03'].chemical.map((i) => i.key), ['Others — Compositional Analysis']);
  assert.ok(m.pvtAddedForValidation(s.samples[2]));
  assert.deepEqual(r['S-04'].outsourced.map((i) => [i.key, i.outsourced.coordinator]), [['Black Oil — Viscosity', 'RANJITH']]);
});

test('after release: S-02 stays out of Ahmed’s queue; S-03 reaches him with Validation only', () => {
  const s = released();
  assert.deepEqual(m.samplesForTeam(s, 'PVT'), ['S-01', 'S-03', 'S-04']);
  assert.deepEqual(m.samplesForTeam(s, 'Chemical'), ['S-01', 'S-02', 'S-03']);
  assert.equal(s.work.filter((w) => w.sampleId === 'S-03' && w.team === 'PVT').length, 0, 'no PVT tests on S-03');
  assert.deepEqual(m.plansFor(s, 'S-03').map((p) => p.sampleId), ['S-03']);
  assert.deepEqual(m.leadSummary(s, 'PVT').planning, ['S-01', 'S-03']);
  // Outsourced test keeps its coordinator as the accountable owner.
  assert.equal(s.work.find((w) => w.title.startsWith('Viscosity')).assignee, 'RANJITH');
  assert.throws(() => m.saveDraft(s, at) && m.release(s, at), /missing information/);
});

test('Validation plan: ordered steps, individual assignees, Restoration needs numeric P and T', () => {
  let s = released();
  const plan = m.plansFor(s, 'S-03')[0];
  const steps = Object.fromEntries(m.validationProcedure.map((x) => [x, null]));
  Object.assign(steps, { 'Opening Pressure': 'NASSER', Restoration: 'SHEREIQI', Flash: 'YAQEEN' });
  assert.equal(m.validationProcedure[0], 'Opening Pressure'); assert.equal(m.validationProcedure.at(-1), 'Recombination');
  assert.throws(() => m.saveValidationPlan(s, plan.id, steps, s.conditions, at), /numeric reservoir pressure and temperature/);
  s = m.saveValidationPlan(s, plan.id, steps, { ...s.conditions, pressure: '3150', temperature: '96' }, at);
  assert.deepEqual(s.work.filter((w) => w.planId === plan.id).map((w) => [w.title, w.assignee]), [['Opening Pressure', 'NASSER'], ['Restoration', 'SHEREIQI'], ['Flash', 'YAQEEN']]);
  assert.equal(s.conditions.pressure, '3150');
  assert.throws(() => m.assign(s, s.work[0].id, 'AHAD', 'BAHRI', at), /Only/);
});

test('additional requests reach the selected team and never overwrite existing work', () => {
  let s = released();
  const sara = s.work.find((w) => w.title === 'SARA');
  s = m.assign(s, sara.id, 'AHAD', 'BAHRI', at);
  s = m.act(s, sara.id, 'submit', 'AHAD', at);
  s = m.act(s, sara.id, 'approve', 'BAHRI', at);
  s = m.act(s, sara.id, 'qc', 'BAHRI', at);
  const before = JSON.stringify(s.work);
  const rows = [
    { sampleId: 'S-02', route: 'PVT', what: 'validation', reason: 'Client asked' },
    { sampleId: 'S-01', route: 'Chemical', what: 'Specialised Analysis — Pour Point', reason: 'Flow assurance' },
    { sampleId: 'S-04', route: 'Both', what: 'custom:Emulsion stability', reason: 'Field issue' },
  ];
  assert.throws(() => m.requestAdditional(s, [], 'SALIM', at), /between one and five/);
  assert.throws(() => m.requestAdditional(s, Array(6).fill(rows[1]), 'SALIM', at), /between one and five/);
  const next = m.requestAdditional(s, rows, 'SALIM', at);
  assert.equal(JSON.stringify(next.work.slice(0, s.work.length)), before, 'existing work, assignments and completed status unchanged');
  assert.deepEqual(next.scope.released, s.scope.released, 'released scope unchanged');
  assert.deepEqual(next.requests.map((r) => r.id), ['AR-01', 'AR-02', 'AR-03']);
  const added = next.work.slice(s.work.length);
  assert.deepEqual(added.map((w) => [w.sampleId, w.team, w.title, w.source]), [['S-01', 'Chemical', 'Pour Point', 'AR-02'], ['S-04', 'PVT', 'Emulsion stability', 'AR-03'], ['S-04', 'Chemical', 'Emulsion stability', 'AR-03']]);
  assert.ok(m.samplesForTeam(next, 'PVT').includes('S-02'), 'requested Validation now puts S-02 in the PVT queue');
  assert.match(m.requestStatus(next, next.requests[0]), /Awaiting Validation plan/);
  assert.match(m.requestStatus(next, next.requests[1]), /Needs assignment · Al Yaqdhan/);
  assert.equal(next.work.find((w) => w.id === sara.id).status, 'QC approved');
});
