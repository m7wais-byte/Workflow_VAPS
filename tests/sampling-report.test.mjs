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
  assert.equal(all['Cylinder No:'], 'PDS S1.01');
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
test('the generic Oil Rate keeps its own label; std/sep-condition rates are not assumed', () => {
  const m = model.buildSamplingReport(input({ samples: [sample('1.01', '2026-10-07', '04:07', { oilRate: '850 bbl/d', bsw: '0.5 %' })] }));
  const col = m.pages.find((p) => p.kind === 'sheet').sheet.production[2];
  const rows = Object.fromEntries(col);
  assert.equal(rows['Oil Rate:'], '850 bbl/d', 'value and units as entered');
  assert.equal(rows['Oil Rate (std cond):'], model.NOT_RECORDED);
  assert.equal(rows['Oil rate (sep cond):'], model.NOT_RECORDED);
  assert.equal(rows['BSW:'], '0.5 %');
  assert.ok(!col.some(([label]) => label === 'BSW (Choke):'), 'no sampling-point basis is claimed for BSW');
});
test('the default summary is built only from recorded information and adapts to the sampling type', () => {
  const s = (job) => validation.samplingSummary({ clientName: 'PDO', well: 'W-1', ...job });
  assert.equal(s({ samplingSource: 'Open Hole (MPSR - Lab Transfer)', samples: input().samples }),
    'Vision Advanced Petroleum Solutions was contracted by PDO for open hole sample transfer (laboratory transfer).\n\nA total of Four samples were recorded in Four PDS.\n\nAll of the samples are recorded for the well W-1.');
  const wellhead = s({ samplingSource: 'Wellhead Sampling', samples: [{ id: 'A', containerType: 'Glass container', containerId: 'G1' }, { id: 'B', bottle: 'SSB', bottleSerial: '9' }, { id: 'C' }] });
  assert.match(wellhead, /for wellhead sampling\./);
  assert.match(wellhead, /A total of Three samples were recorded in One glass container and One SSB\. The container type is not recorded for one sample\./);
  assert.doesNotMatch(wellhead, /MPSR|PDS|transfer/);
  const spmc = s({ samplingSource: 'Open Hole (SPMC - Field Sampling)', samples: [{ id: 'A', bottle: 'PDS', sampler: 'SPS' }, { id: 'B', bottle: 'PDS', sampler: 'SPS' }] });
  assert.match(spmc, /open hole field sampling\.[\s\S]*Two PDS\.[\s\S]*Samplers recorded: Two SPS\./);
  assert.match(s({ samplingSource: 'Other', otherSamplingType: 'Tank sampling', samples: [{ id: 'A' }] }), /for sampling \(Tank sampling\)\.\n\nA total of One sample was recorded\./);
  assert.match(s({ samplingSource: 'Separator Sampling', samples: [] }), /No samples are recorded for this job\.$/);
  assert.match(s({ samplingSource: 'Station Sampling', wellMode: 'multiple', wells: ['A-1', 'A-2'], samples: [{ id: 'x' }] }), /recorded for the wells A-1, A-2\.$/);
  for (const text of [wellhead, spmc]) assert.doesNotMatch(text, /IATA|shipped|approved|packed/i);
});
test('approved versions use the letterhead saved with them; later record edits do not change them', () => {
  const ctx = (company, position) => ({ company, clients: [{ code: 'P', name: 'Petroleum Development Oman', shortName: 'PDO' }], employeeName: (id) => ({ A: 'Preparer', B: 'Approver' })[id], positionName: (id) => ({ A: 'Engineer', B: position })[id] });
  const job = { jobNumber: 'J', clientCode: 'P', clientName: 'PDO', rigInstallation: 'Rig 7', dateReceived: '2026-10-01', samplingSource: 'Wellhead Sampling' };
  const letterhead = view.captureLetterhead(job, ctx(company, 'PVT Manager'), ['A', 'B'], '2026-10-13T10:00:00Z');
  const later = ctx({ ...company, displayName: 'Renamed', address: 'New address' }, 'Director');
  const changedJob = { ...job, rigInstallation: 'Rig 99', dateReceived: '2026-11-30', clientCode: 'Z' };
  const v = { snapshot: { samples: [], events: [] }, letterhead, summary: 'x', status: 'Approved', approved: true, preparedBy: 'A', approvedBy: 'B', approvedAt: '2026-10-13T10:00:00Z' };
  const i = view.samplingReportInput(changedJob, later, v);
  assert.equal(i.installation, 'Rig 7');
  assert.equal(i.jobDate, '2026-10-01');
  assert.equal(i.company.displayName, 'VAPS');
  assert.equal(i.clientFullName, 'Petroleum Development Oman');
  assert.equal(i.clientLogo, '/client-logos/pdo.png');
  assert.deepEqual(i.approvedBy, { name: 'Approver', title: 'PVT Manager' });
  assert.equal(i.notice, undefined);
  const old = view.samplingReportInput(changedJob, later, { ...v, letterhead: undefined });
  assert.equal(old.installation, 'Rig 99', 'an older version without a letterhead can only show current records');
  assert.equal(old.notice, view.letterheadNotice, 'and says so on the report');
  assert.ok(renderToStaticMarkup(createElement(view.SamplingReportDocument, { input: old })).includes('saved before report details were recorded'));
  assert.equal(view.samplingReportInput(changedJob, later, { ...v, letterhead: undefined, status: 'Draft', approved: false }).notice, undefined, 'drafts are refreshed at submission and approval');
});
test('the workflow saves the letterhead with the draft, refreshes it on submission and freezes it at approval', async () => {
  const ops = await bundle('app/operations-model.ts');
  const ts = (await import('typescript')).default;
  const load = (p) => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(fs.readFileSync(p, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
  const { initialDirectory } = await load('app/employee-directory.ts');
  const { defaultAuthorization, defaultResponsibilities } = await load('app/authorization.ts');
  const employees = initialDirectory().employees, policy = defaultAuthorization(employees.map((e) => e.id));
  let n = 0; const at = () => new Date(Date.UTC(2026, 9, 26, 10, 0, n++)).toISOString();
  const step = (job, c, id) => ops.applyOperation(job, c, { id, employees, policy, roles: { ...defaultResponsibilities } }, at());
  const lh = (installation) => ({ capturedAt: at(), installation, company, people: {} });
  let j = { id: 'J', samplingInstructions: 'x', jobNumber: 'J', clientCode: 'P', clientName: 'C', samplingSource: 'Wellhead Sampling', requiredTests: [], samples: [{ id: 'S1', bottle: 'PDS', bottleSerial: 'B1', dataComplete: true, fieldData: { sampleNature: 'WHS' } }], stages: [], status: 'Job Created', createdById: 'SALIM', events: [] };
  j = step(j, { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI' }, 'SALIM');
  j = step(j, { type: 'data-submit', note: '' }, 'MOHSIN'); j = step(j, { type: 'data-approve' }, 'SALIM');
  j = step(j, { type: 'report-draft', kind: 'sampling', text: 'v1', checker: '', letterhead: lh('Rig draft') }, 'MOHSIN');
  assert.equal(ops.latest(j.operations.samplingReports).letterhead.installation, 'Rig draft');
  j = step(j, { type: 'report-action', kind: 'sampling', action: 'checking', comments: '', letterhead: lh('Rig check') }, 'MOHSIN');
  j = step(j, { type: 'report-action', kind: 'sampling', action: 'submit', comments: '', letterhead: lh('Rig submit') }, 'SALIM');
  assert.equal(ops.latest(j.operations.samplingReports).letterhead.installation, 'Rig submit');
  j = step(j, { type: 'report-action', kind: 'sampling', action: 'approve', comments: '', letterhead: lh('Rig approve') }, 'SALIM');
  const approved = ops.latest(j.operations.samplingReports);
  assert.equal(approved.status, 'Approved');
  assert.equal(approved.letterhead.installation, 'Rig approve');
  const frozen = JSON.stringify(approved);
  j = step(j, { type: 'report-action', kind: 'sampling', action: 'revise', comments: 'Correction', letterhead: lh('Rig v2') }, 'MOHSIN');
  assert.equal(JSON.stringify(j.operations.samplingReports[0]), frozen, 'the approved version is untouched by a revision');
  assert.equal(ops.latest(j.operations.samplingReports).letterhead.installation, 'Rig v2', 'the new version records its own');
  // Commands without a letterhead (older callers) keep working and leave versions without one.
  let k = step({ ...j, operations: undefined, id: 'K' }, { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI' }, 'SALIM');
  k = step(k, { type: 'data-submit', note: '' }, 'MOHSIN'); k = step(k, { type: 'data-approve' }, 'SALIM');
  k = step(k, { type: 'report-draft', kind: 'sampling', text: 'v1', checker: '' }, 'MOHSIN');
  assert.equal('letterhead' in ops.latest(k.operations.samplingReports), false);
});
