import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const book = await bundle('app/request-book.ts');
const imp = await bundle('app/request-import.ts');
const auth = await bundle('app/authorization.ts');
const today = '2026-11-11';
const draft = (over = {}) => book.blankDraft(today, { job: 'J-1', well: 'W-1', experiment: 'CVD stage', doneBy: 'Ranjith', h2s: false, ...over });

test('next request number follows the highest base across the old number formats', () => {
  assert.equal(book.baseNumber('5931'), 5931);
  assert.equal(book.baseNumber('593102'), 5931);
  assert.equal(book.baseNumber('4387-01'), 4387);
  assert.equal(book.baseNumber('44201'), null, '5-digit numbers follow no rule and are ignored');
  assert.equal(book.nextBase(['3317', '593004', '593103', '4387-01', '44201']), 5932);
  assert.equal(book.nextBase([]), 1);
});

test('a single request keeps the base number; stages are base x 100 + stage', () => {
  assert.deepEqual(book.stageNumbers(5932, [undefined]), ['5932']);
  assert.deepEqual(book.stageNumbers(5932, [undefined, undefined, undefined]), ['593201', '593202', '593203']);
  assert.equal(book.stageNumbers(5932, Array(8).fill(undefined)).at(-1), '593208');
});

test('editing keeps existing stage numbers and numbers added stages after them', () => {
  assert.deepEqual(book.stageNumbers(5931, ['593101', '593103', undefined]), ['593101', '593103', '593104']);
  assert.deepEqual(book.stageNumbers(5931, ['5931']), ['5931'], 'an unchanged single request keeps its number');
  assert.deepEqual(book.stageNumbers(5931, ['5931', undefined]), ['593101', '593102'], 'a single request that gains a stage becomes stage 01');
  assert.equal(book.groupKey('593102'), book.groupKey('5931'));
});

test('status sets and clears the completed and delivered dates', () => {
  const received = { status: 'Received', completed: '', delivered: '' };
  const completed = book.withStatus(received, 'Completed', today);
  assert.deepEqual([completed.completed, completed.delivered], [today, '']);
  const delivered = book.withStatus({ ...completed, completed: '2026-11-01' }, 'Delivered', today);
  assert.deepEqual([delivered.completed, delivered.delivered], ['2026-11-01', today], 'an existing completed date is kept');
  const reopened = book.withStatus(delivered, 'In progress', today);
  assert.deepEqual([reopened.completed, reopened.delivered], ['', '']);
  assert.equal(book.isOpen(reopened), true);
  assert.equal(book.isOpen(delivered), false);
});

test('a request cannot be saved without the required fields and the H2S answer', () => {
  assert.deepEqual(book.draftProblems(draft(), today), []);
  assert.match(book.draftProblems(book.blankDraft(today), today)[0], /Job No\., Well name, Experiment, Done by, the H2S question/);
  assert.match(book.draftProblems(draft({ h2s: null }), today)[0], /H2S question/);
  const stage = book.newStage(today);
  assert.match(book.draftProblems(draft({ stages: [{ ...stage, liquid: false, gas: false }] }), today)[0], /Liquid, Gas or both/);
  assert.match(book.draftProblems(draft({ stages: [{ ...stage, date: '2026-12-01' }] }), today)[0], /future/);
  assert.match(book.draftProblems(draft({ stages: Array(9).fill(stage) }), today)[0], /1 to 8 stages/);
});

test('each stage is stored with its own date, samples and balloon; H2S applies to the whole request', () => {
  const stage = book.newStage(today);
  const records = book.draftRecords(draft({ h2s: true, stages: [{ ...stage, balloon: ' 040M ' }, { ...stage, date: '2026-11-10', gas: false, balloon: '059M' }] }), ['593201', '593202'], 'Ranjith', today);
  assert.deepEqual(records.map(r => [r.no, r.date, r.liquid, r.gas, r.balloon, r.h2s, r.status]), [['593201', today, 1, 1, '040M', true, 'Received'], ['593202', '2026-11-10', 1, 0, 'None', true, 'Received']]);
  assert.equal(records[0].savedBy, 'Ranjith');
  const again = book.draftOf(records, '5932');
  assert.equal(again.stages.length, 2);
  assert.equal(again.h2s, true);
  assert.equal(again.stages[1].no, '593202');
});

test('dashboard figures count requests, samples, H2S, open items and turnaround', () => {
  const stage = book.newStage('2026-11-01');
  const records = [
    ...book.draftRecords(draft({ h2s: true, stages: [{ ...stage, status: 'Completed', completed: '2026-11-05' }, { ...stage, gas: false }] }), ['593201', '593202'], 'A', today),
    ...book.draftRecords(draft({ doneBy: 'Nasser', experiment: 'Cryo', stages: [{ ...stage, date: '2025-03-02', liquid: false, status: 'Delivered', completed: '2025-03-04', delivered: '2025-03-05' }] }), ['5933'], 'A', today),
  ];
  const all = book.requestStats(records);
  assert.deepEqual([all.requests, all.liquid, all.gas, all.h2s, all.open, all.completedCount, all.averageDays], [3, 2, 2, 2, 1, 2, 3]);
  assert.deepEqual(book.breakdown(records, r => r.doneBy).map(r => [r.label, r.requests]), [['Ranjith', 2], ['Nasser', 1]]);
  assert.deepEqual(book.breakdown(records, r => r.date.slice(0, 4), true).map(r => r.label), ['2025', '2026']);
  assert.equal(book.lastTwelveMonths(today)[0], '2025-12');
  assert.equal(book.lastTwelveMonths(today).at(-1), '2026-11');
  assert.equal(records.filter(r => book.inPeriod(r, '12m', today)).length, 2);
  assert.equal(records.filter(r => book.inPeriod(r, '2025', today)).length, 1);
});

test('dropdown lists start from the Excel lists and refuse empty or repeated values', () => {
  const lists = book.readRequestLists(null);
  assert.equal(lists.doneBy.length, 14);
  assert.equal(lists.experiments.length, 16);
  assert.deepEqual(lists.clients, ['PDO', 'OXY', 'Daleel', 'NA']);
  assert.deepEqual(book.addListValue(['Cryo'], '  New   test '), ['Cryo', 'New test']);
  assert.throws(() => book.addListValue(['Cryo'], 'cryo'), /already in the list/);
  assert.throws(() => book.addListValue(['Cryo'], '  '), /Type a value/);
  assert.throws(() => book.readRequestLists('{"clients":[]}'), /Invalid request list settings/);
  assert.equal(book.doneByFor('Nasser Al Saqri', lists.doneBy), 'Nasser');
  assert.equal(book.doneByFor('Al Yaqdhan Al Bahri', lists.doneBy), 'Al-Yaqdhan');
  assert.equal(book.doneByFor('Mohammed Al Awaisi', lists.doneBy), '');
});

test('importing the Request Log maps Ready?, H2S and dates without inventing values', () => {
  const head = ['Request No', 'Date', 'Job No.', 'Client', 'Well Name', 'Sample No.', 'Cylinder No.', 'Experiment', 'Liquid samples', 'Gas samples', 'Balloon No.', 'H2S', 'Done By', 'Ready?', 'Comments', 'Status', 'Date Completed', 'Date Delivered'];
  const rows = [['VAPS – PVT Request Log'], [], head,
    [3317, 42772, 'VPD1701', null, 'Well-1', 1.05, 816013, 'BHS Flash', 1, 1, '053M', 'Non_H2S', 'Nasser', 'READY', null, null, null, null],
    [593101, '13/9/20117', 'OMP1', 'PDO', 'Well-2', 'Recomb', 'SAM-1', 'Diff stage', 0, 1, 460857, 'H2S', 'Ranjith', 'NOT READY', 'repeat', null, null, null],
    ['4387-01', '14/5/2017', 'QA', 'NA', 'None', '1.01', 'Glass Bottle', 'STO', 1, 0, 'None', 'Non_H2S', 'Salim', 'READY', null, 'Delivered', 42875, 42876],
    [3317, 42772, 'dup'], [null, null]];
  const { records, notes } = imp.recordsFromRows(rows, 'Importer', today);
  assert.deepEqual(records.map(r => [r.no, r.date, r.status, r.h2s, r.completed]), [['3317', '2017-02-06', 'Completed', false, ''], ['593101', '', 'In progress', true, ''], ['4387-01', '2017-05-14', 'Delivered', false, '2017-05-20'], ['3317 (2)', '2017-02-06', 'In progress', false, '']]);
  assert.equal(records[0].sample, '1.05');
  assert.equal(records[1].balloon, '460857');
  assert.equal(notes.length, 3);
  assert.match(notes.join(' '), /1 record\(s\) repeat a request number/);
  assert.match(notes.join(' '), /1 record\(s\) have a date that could not be read/);
  assert.throws(() => imp.recordsFromRows([['Something else']], 'x', today), /Request No/);
  assert.match(imp.requestsCsv(records).split('\r\n')[2], /^593101,,OMP1,PDO,Well-2,Recomb,SAM-1,Diff stage,0,1,460857,H2S,Ranjith,NOT READY,repeat,In progress/);
});

test('request book dates read Excel serials and day/month/year text only when they are real dates', () => {
  assert.equal(imp.bookDate(42772), '2017-02-06');
  assert.equal(imp.bookDate('29-07-2026'), '2026-07-29');
  assert.equal(imp.bookDate('2026-11-03 00:00:00'), '2026-11-03');
  for (const bad of ['22/22/2024', '25///2018', '13/9/20117', '', null, 0]) assert.equal(imp.bookDate(bad), '');
});

test('request permissions: the lab works on requests, the overview is given to named employees', () => {
  const ids = ['MA001', 'SALIM', 'WILFRED', 'SHEREIQI', 'RANJITH', 'HUMAID'];
  const policy = auth.defaultAuthorization(ids);
  assert.equal(auth.allowed(policy, 'RANJITH', 'requests'), true);
  assert.equal(auth.allowed(policy, 'RANJITH', 'requestsOverview'), false);
  assert.equal(auth.allowed(policy, 'SHEREIQI', 'requestsOverview'), true);
  assert.equal(auth.allowed(policy, 'HUMAID', 'requests'), false, 'drivers do not get the request book');
  const saved = { ...policy }; delete saved.requests; delete saved.requestsOverview;
  const read = auth.readAuthorization(JSON.stringify(saved), ids);
  assert.deepEqual(read.requests, policy.requests, 'settings saved before the request book receive the defaults');
  assert.deepEqual(auth.readAuthorization(JSON.stringify({ ...policy, requestsOverview: [] }), ids).requestsOverview, [], 'a saved empty selection stays empty');
});
