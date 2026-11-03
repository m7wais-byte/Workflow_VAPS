import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
// React stays external so the bundle and react-dom/server share one copy; the bundle is written beside node_modules to resolve it.
const bundle = async (entry) => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'], logLevel: 'silent' }); fs.mkdirSync('node_modules/.cache', { recursive: true }); const file = new URL('../node_modules/.cache/' + entry.replace(/\W/g, '_') + '.mjs', import.meta.url); fs.writeFileSync(file, out.outputFiles[0].text); return import(file.href + '?' + Date.now()); };
const model = await bundle('app/sampling-report-model.ts');
const view = await bundle('app/sampling-report.tsx');
const validation = await bundle('app/sampling-validation.ts');
const { renderToStaticMarkup } = await import('react-dom/server');
const { createElement } = await import('react');

const sample = (id, date, time, extra = {}, notes = 'Production data taken from Wireline Log.') => ({ id, bottle: 'PDS', bottleSerial: 'S' + id, depth: '1520.4 MDBRT(m)', notes,
  fieldData: { samplingDate: date, samplingTime: time, sampleNature: 'BHS', flowPeriod: 'N/A', formation: 'N/A', perforations: 'N/A', bhp: '13835', bhpUnit: 'kPa', bht: '64.9', bhtUnit: '°C',
    finalPressure: '27579', finalPressureUnit: 'kPa', finalTemperature: '64.9', finalTemperatureUnit: '°C', initialOpeningPressure: '1034', initialOpeningPressureUnit: 'kPa', initialOpeningTemperature: '25', initialOpeningTemperatureUnit: '°C',
    sampleBottleVolume: '700', sampleBottleVolumeUnit: 'cc', whp: 'N/A', whpUnit: 'psi', ...extra } });
const company = { name: 'Vision Advanced Petroleum Solutions L.L.C', displayName: 'VAPS', logo: '/vaps-logo.png', address: '', country: 'Oman' };
const input = (over = {}) => ({ jobNumber: 'OM-P-26-001', clientName: 'PDO', clientFullName: 'Petroleum Development Oman', company, field: 'F', well: 'W-1', installation: 'Rig 1', jobDate: '2026-10-01', source: 'Open Hole (MPSR - Lab Transfer)',
  samples: [sample('1.01', '2026-10-07', '04:07'), sample('1.02', '2026-10-07', '04:18'), sample('1.03', '2026-10-08', '03:17'), sample('1.04', '2026-10-08', '03:28')],
  events: [{ date: '2026-10-10', time: '13:00', description: 'Second' }, { date: '2026-10-10', time: '8:00', description: 'First' }, { date: '2026-10-11', time: '09:00', description: 'End Job' }],
  summary: 'Line one.\n\nLine two.', version: 1, status: 'Draft', approved: false, preparedBy: { name: 'Preparer', title: 'Engineer' }, preparedAt: '2026-10-12T10:00:00', ...over });
const text = (m) => JSON.stringify(m.pages);

test('four samples give the reference structure: cover, index, summary, listing, events and one sheet per sample', () => {
  const m = model.buildSamplingReport(input());
  assert.deepEqual(m.pages.map((p) => p.kind), ['cover', 'index', 'summary', 'listing', 'events', 'sheet', 'sheet', 'sheet', 'sheet']);
  assert.equal(m.totalPages, 9);
  assert.deepEqual(m.index.map((e) => [e.title, e.pages]), [['Summary', '3'], ['Sample Listing', '4'], ['Sequence Of Events', '5'], ['Sample Data Sheet', '6–9']]);
});
test('one sample gives one data sheet and the index follows', () => {
  const m = model.buildSamplingReport(input({ samples: [sample('2.01', '2026-10-07', '04:07')] }));
  assert.equal(m.totalPages, 6);
  assert.equal(m.index[3].pages, '6');
});
test('sample IDs and measurements match between listing and sheets; recorded units are kept', () => {
  const m = model.buildSamplingReport(input());
  const listing = m.pages.find((p) => p.kind === 'listing').rows.map((r) => r.sampleNo);
  const sheets = m.pages.filter((p) => p.kind === 'sheet').map((p) => p.sheet.sampleId);
  assert.deepEqual(listing, ['1.01', '1.02', '1.03', '1.04']);
  assert.deepEqual(sheets, listing);
  const s = m.pages[5].sheet;
  const all = Object.fromEntries([...s.identification.left, ...s.identification.right, ...s.shipping.left, ...s.shipping.right, ...s.matched.left, ...s.production.flat()]);
  assert.equal(all['BHP:'], '13835 kPa');
  assert.equal(all['BHT:'], '64.9 °C');
  assert.equal(all['Final Pressure:'], '27579 kPa @ 64.9 °C');
  assert.equal(all['Opening Pressure:'], '1034 kPa @ 25 °C');
  assert.equal(all['Bottle No:'], 'PDS S1.01');
  assert.equal(all['Sampling Date:'], '7-Oct-26');
  assert.equal(all['WHP:'], 'N/A', 'N/A is shown as entered, without a unit');
  assert.equal(all['At Depth:'], model.NOT_RECORDED, 'no data source: never copied from another field');
  assert.equal(all['Oil rate (sep cond):'], model.NOT_RECORDED);
  assert.equal(m.header.date, '7/10/2026', 'report date is the first recorded sampling date');
});
test('missing optional values read Not recorded and nothing is invented', () => {
  const m = model.buildSamplingReport(input({ samples: [{ id: '3.01', fieldData: {} }], events: [], installation: '' }));
  assert.equal(m.header.installation, 'Not recorded');
  const s = m.pages.find((p) => p.kind === 'sheet').sheet;
  assert.ok([...s.shipping.left, ...s.production.flat()].every(([, v]) => v === 'Not recorded'));
  assert.equal(m.pages.find((p) => p.kind === 'events').rows.length, 0);
  assert.equal(m.header.date, '1/10/2026', 'falls back to the job date');
});
test('events are recorded field events in chronological order with recorded times', () => {
  const rows = model.buildSamplingReport(input()).pages.find((p) => p.kind === 'events').rows;
  assert.deepEqual(rows.map((r) => [r.date, r.time, r.event]), [['10/10/2026', '8:00', 'First'], ['10/10/2026', '13:00', 'Second'], ['11/10/2026', '09:00', 'End Job']]);
});
test('long remarks continue on following pages without losing text', () => {
  const long = Array.from({ length: 400 }, (_, i) => 'word' + i).join(' ');
  const m = model.buildSamplingReport(input({ samples: [sample('1.01', '2026-10-07', '04:07', {}, long)] }));
  const sheet = m.pages.find((p) => p.kind === 'sheet');
  const cont = m.pages.filter((p) => p.kind === 'remarks');
  assert.ok(sheet.sheet.remarksContinue && cont.length >= 1);
  const joined = [model.unwrap(sheet.sheet.remarks), ...cont.map((p) => model.unwrap(p.lines))].join(' ');
  assert.equal(joined.split(/\s+/).join(' '), long);
  assert.equal(m.index[3].pages, `6–${m.totalPages}`);
});
test('many samples and events flow onto continuation pages', () => {
  const samples = Array.from({ length: 40 }, (_, i) => sample('1.' + String(i + 1).padStart(2, '0'), '2026-10-07', '04:07'));
  const events = Array.from({ length: 60 }, (_, i) => ({ date: '2026-10-10', time: '10:' + String(i).padStart(2, '0'), description: 'Event ' + i }));
  const m = model.buildSamplingReport(input({ samples, events }));
  const listing = m.pages.filter((p) => p.kind === 'listing');
  assert.ok(listing.length > 1 && listing[1].continued);
  assert.equal(listing.flatMap((p) => p.rows).length, 40, 'each sample listed once');
  assert.equal(m.pages.filter((p) => p.kind === 'events').flatMap((p) => p.rows).length, 60);
  assert.equal(m.pages.filter((p) => p.kind === 'sheet').length, 40);
});
test('only open-hole jobs are labelled Open Hole', () => {
  assert.equal(model.sheetTitle('Open Hole (SPMC - Field Sampling)'), 'Bottomhole Sample Data Sheet – Open Hole');
  assert.equal(model.sheetTitle('Cased Hole (Bottomhole / Downhole Sampling)'), 'Bottomhole Sample Data Sheet – Cased Hole');
  assert.equal(model.sheetTitle('Wellhead Sampling'), 'Wellhead Sample Data Sheet');
  assert.ok(!text(model.buildSamplingReport(input({ source: 'Separator Sampling' }))).includes('Open Hole'));
});
test('a draft never shows approval; an approved version shows its recorded approval', () => {
  const ctx = { company, clients: [{ code: 'P', name: 'Petroleum Development Oman', shortName: 'PDO' }], employeeName: (id) => ({ A: 'Preparer', B: 'Approver' })[id] || id, positionName: (id) => ({ A: 'Engineer', B: 'Manager' })[id] || '' };
  const job = { jobNumber: 'OM-P-26-001', clientCode: 'P', clientName: 'PDO', fieldArea: 'F', well: 'W-1', rigInstallation: 'Rig 1', dateReceived: '2026-10-01', samplingSource: 'Open Hole (MPSR - Lab Transfer)' };
  const snapshot = { samples: input().samples, events: [], source: job.samplingSource, jobNumber: job.jobNumber, clientName: 'PDO', well: 'W-1', fieldArea: 'F' };
  const frozen = JSON.stringify(snapshot);
  const draft = view.samplingReportInput(job, ctx, { snapshot, summary: 'x', status: 'Awaiting Approval', approved: false, preparedBy: 'A', preparedAt: '2026-10-12T10:00:00', approvedBy: 'B', approvedAt: '2026-10-13T10:00:00' });
  assert.equal(draft.approvedBy, undefined);
  assert.equal(model.buildSamplingReport(draft).cover.approval, null);
  const html = renderToStaticMarkup(createElement(view.SamplingReportDocument, { input: draft }));
  assert.ok(html.includes('DRAFT — NOT APPROVED') && html.includes('Pending approval') && !html.includes('Approver'));
  const approved = view.samplingReportInput(job, ctx, { snapshot, summary: 'x', status: 'Approved', approved: true, preparedBy: 'A', preparedAt: '2026-10-12T10:00:00', approvedBy: 'B', approvedAt: '2026-10-13T10:00:00' });
  assert.deepEqual(model.buildSamplingReport(approved).cover.approval, { name: 'Approver', title: 'Manager', date: '13/10/2026' });
  assert.equal(approved.clientFullName, 'Petroleum Development Oman');
  assert.equal(approved.clientLogo, '/client-logos/pdo.png', 'PDO branding for a PDO job');
  const other = view.samplingReportInput({ ...job, clientCode: 'X', clientName: 'DEMO' }, { ...ctx, clients: [{ code: 'X', name: 'DEMO Operator', shortName: 'DEMO' }] }, { snapshot: { ...snapshot, clientName: 'DEMO' }, summary: 'x', status: 'Approved', approved: true });
  assert.ok(!JSON.stringify(other).includes('pdo') && !JSON.stringify(other).includes('Petroleum Development Oman'), 'no PDO branding on other clients');
  assert.equal(JSON.stringify(snapshot), frozen, 'saved evidence is not modified');
  const approvedHtml = renderToStaticMarkup(createElement(view.SamplingReportDocument, { input: approved }));
  assert.ok(!approvedHtml.includes('DRAFT') && approvedHtml.includes('VAPS Confidential') && (approvedHtml.match(/class="sr-page/g) || []).length === 9);
});
test('the default summary states only recorded facts', () => {
  const s = validation.samplingSummary({ clientName: 'PDO', well: 'W-1', samplingSource: 'Open Hole (MPSR - Lab Transfer)', samples: input().samples });
  assert.equal(s, 'Vision Advanced Petroleum Solutions was contracted by PDO to transfer a total of Four MPSR into Four PDS.\n\nAll of the samples were collected from the well W-1.');
  assert.doesNotMatch(s, /IATA|shipped|approved/i);
});
