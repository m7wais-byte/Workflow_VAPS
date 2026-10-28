// Example jobs for the published workflow demo. Every name, well and value here is fictional and marked DEMO.
// Jobs are advanced with the real workflow commands, so each one is a state the app can reach on its own.
import type { JobRecord } from './page';
import { applyOperation, type Command } from './operations-model';
import { initialDirectory } from './employee-directory';
import { defaultAuthorization } from './authorization';
import { cylinderCatalog } from './cylinder-catalog';
import { defaultFieldData } from './sample-defaults';
import { addDays, localDate } from './local-date';

export const demoClient = { code: 'X', shortName: 'DEMO', name: 'DEMO Operator (fictional)', country: 'Oman', notes: 'Fictional client used by the workflow demo.', active: true };
export const demoLogin = { id: 'MA001', password: '1234' };
export type StoredFile = { id: string; name: string; size: number; type: string };
/** Stores a placeholder file and returns its reference (IndexedDB in the browser). */
export type StoreFile = (name: string, content: string) => Promise<StoredFile>;

type Sample = NonNullable<JobRecord['samples']>[number];
const stageNames = ['Job Setup', 'Sampling Preparation', 'Sampling Data', 'Report Preview', 'Final Report'];
const bottles = cylinderCatalog.filter(b => b.type === 'PDS');

export async function buildDemoJobs(storeFile: StoreFile, today = new Date()): Promise<JobRecord[]> {
 const employees = initialDirectory().employees, policy = defaultAuthorization(employees.map(e => e.id));
 const year = String(today.getFullYear()).slice(-2), day = localDate(today);
 let bottle = 0;
 // Each job keeps its own clock so its history reads in order, starting a number of days ago.
 const clock = (daysAgo: number) => { let t = new Date(`${addDays(day, -daysAgo)}T07:30:00`).getTime(); return () => new Date(t += 47 * 60000).toISOString(); };
 const sample = (id: string, nature: 'BHS' | 'WHS' | 'SEP', complete: boolean, field: Record<string, string>, by: string, at: string): Sample => {
  const b = bottles[bottle++ % bottles.length];
  return { id, sampler: nature === 'BHS' ? 'SPS' : '', bottle: b.type, samplerSerial: nature === 'BHS' ? 'DEMO-SPS-0' + bottle : '', bottleSerial: b.serial, bottleCapacity: b.capacity, calibrationStatus: 'Passed', pressureTestStatus: 'Passed', equipmentCondition: 'Good', preparedBy: by, preparedAt: at, preparationRemarks: 'DEMO preparation record.',
   fieldData: { ...defaultFieldData(), sampleNature: nature, ...(complete ? field : {}) }, dataComplete: complete, dataCompletedBy: complete ? by : '', dataCompletedAt: complete ? at : '', pressure: '', temperature: '', depth: '', notes: complete ? 'DEMO sample, fictional values.' : '' };
 };
 const job = (seq: number, details: Partial<JobRecord>, created: string, stageDone: number): JobRecord => {
  const id = `OM-X-${year}-${String(seq).padStart(3, '0')}`;
  return { id, globalSequence: seq, jobNumber: id, clientCode: demoClient.code, clientName: demoClient.shortName, countryCode: 'OM', dateReceived: created.slice(0, 10), description: 'DEMO job with fictional data, for exploring the workflow.', clientFocalPoint: 'DEMO Focal Point', clientFocalPointContact: '+968 0000 0000', clientFocalPointEmail: 'demo@example.com', samplingRequired: true, fieldArea: 'DEMO Field', wellMode: 'single', requestedSampleCount: String(details.samples?.length || 0), otherTests: '', sampleCountNotes: '',
   status: 'Sampling In Progress', currentStage: stageNames[Math.min(stageDone, 4)], nextAction: 'Follow the job workspace', ownerId: 'SALIM', responsibleId: 'SALIM', jobResponsibleId: 'SALIM', createdById: 'SALIM', createdAt: created, lastUpdatedById: 'SALIM', lastUpdatedAt: created,
   stages: stageNames.map((name, i) => ({ name, assignedTo: details.assignedEngineerId || 'SALIM', status: i < stageDone ? 'Completed' : i === stageDone ? 'In Progress' : 'Not Started', ...(i <= stageDone ? { started: created } : {}), ...(i < stageDone ? { completed: created } : {}) })),
   events: [], dueDate: addDays(day, 14), ...details } as JobRecord;
 };
 const run = (j: JobRecord, by: string, command: Command, at: string) => applyOperation(j, command, { id: by, employees, policy }, at);
 const workbook = (title: string, sampleId: string) => storeFile(`DEMO ${title} ${sampleId}.csv`, `DEMO workbook,fictional data\nActivity,${title}\nSample,${sampleId}\n`);
 const samplingReport = (j: JobRecord, engineer: string, checker: string, tick: () => string, approve: boolean) => {
  j = run(j, engineer, { type: 'report-draft', kind: 'sampling', text: 'DEMO sampling report. Samples collected under stable flow; fictional values.', checker }, tick());
  j = run(j, engineer, { type: 'report-action', kind: 'sampling', action: 'checking', comments: '' }, tick());
  j = run(j, checker, { type: 'report-action', kind: 'sampling', action: 'submit', comments: '' }, tick());
  return approve ? run(j, 'SALIM', { type: 'report-action', kind: 'sampling', action: 'approve', comments: '' }, tick()) : j;
 };
 const handover = (j: JobRecord, driver: string, tick: () => string) => {
  j = run(j, driver, { type: 'handover-send', sampleIds: j.samples!.map(s => s.id), notes: 'DEMO transfer to the laboratory.' }, tick());
  return run(j, 'SALIM', { type: 'handover-receive', notes: 'Bottle serials checked against the sampling report.' }, tick());
 };
 const conditions = (pressure: string, temperature: string) => ({ pressure, pressureUnit: 'psi', temperature, temperatureUnit: '°C', notes: 'DEMO reservoir conditions, fictional.' });
 /** Schedules every activity; completes the first `complete` of them with a workbook and starts the next one. */
 async function labWork(j: JobRecord, owners: Record<'BVT' | 'Chemical', string[]>, tick: () => string, complete: number) {
  const list = j.operations!.activities;
  for (const [i, a] of list.entries()) {
   const team = owners[a.stream], owner = team[i % team.length];
   j = run(j, a.stream === 'BVT' ? 'SALIM' : 'BAHRI', { type: 'schedule', id: a.id, owner, start: addDays(day, -3 + Math.floor(i / 4)), due: addDays(day, -1 + Math.floor(i / 4)), conditions: a.conditions, notes: 'DEMO instructions.' }, tick());
  }
  for (const [i, a] of list.entries()) {
   if (i > complete) break;
   const owner = j.operations!.activities[i].owner;
   j = run(j, owner, { type: 'progress', id: a.id, status: 'In Progress', notes: 'Started.' }, tick());
   if (i === complete) break;
   j = run(j, owner, { type: 'workbook', id: a.id, file: await workbook(a.title, a.sampleId), notes: 'Workbook submitted.' }, tick());
   j = run(j, owner, { type: 'progress', id: a.id, status: 'Completed', notes: 'Completed.' }, tick());
  }
  return j;
 }

 // 1 · Sampling in progress: dispatched, one of two sample sheets complete.
 let t = clock(2);
 let start = t();
 let j1 = job(1, { samplingSource: 'Wellhead Sampling', well: 'DEMO-WH-07', whp: '420', wht: '48', chokeSize: '32/64', requiredTests: ['Black Oil — Validation', 'Black Oil — Sep Test'], assignedEngineerId: 'MOHSIN', assignedDriverId: 'ALI',
  samples: [sample('1.01', 'WHS', true, { samplingDate: addDays(day, -1), samplingTime: '09:40', whp: '420', wht: '48', chokeSize: '32/64' }, 'MOHSIN', start), sample('1.02', 'WHS', false, {}, 'MOHSIN', start)],
  dueDate: addDays(day, 12) }, start, 2);
 j1 = run(j1, 'SALIM', { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI' }, t());

 // 2 · Sampling report waiting for Salim's approval.
 t = clock(4); start = t();
 const sep = { separatorPressure: '145', separatorTemperature: '44' };
 let j2 = job(2, { samplingSource: 'Separator Sampling', well: 'DEMO-SP-12', facility: 'DEMO Station A', separatorId: 'DEMO-SEP-1', separatorStage: '1st stage', separatorPressure: '145', separatorTemperature: '44', requiredTests: ['Gas Condensates (GC) — Validation', 'Gas Condensates (GC) — CVD'], assignedEngineerId: 'HUSSEINI', assignedDriverId: 'ALI',
  samples: [sample('1.01', 'SEP', true, { samplingDate: addDays(day, -3), samplingTime: '10:15', ...sep }, 'HUSSEINI', start), sample('1.02', 'SEP', true, { samplingDate: addDays(day, -3), samplingTime: '11:05', ...sep }, 'HUSSEINI', start)],
  dueDate: addDays(day, 10) }, start, 3);
 j2 = run(j2, 'SALIM', { type: 'dispatch', engineer: 'HUSSEINI', driver: 'ALI' }, t());
 j2 = samplingReport(j2, 'HUSSEINI', 'MOHSIN', t, false);

 // 3 · In the laboratory: BVT validation part done, Chemical analysis started.
 t = clock(9); start = t();
 const bh = { samplingDate: addDays(day, -8), formation: 'DEMO Formation', bhp: '3150', bht: '92', sampleBottleVolume: '700', sampleVolume: '600' };
 let j3 = job(3, { samplingSource: 'Cased Hole (Bottomhole / Downhole Sampling)', holeType: 'Cased Hole', well: 'DEMO-BH-03', formation: 'DEMO Formation', plannedDepth: '2450', requiredTests: ['Black Oil — Validation', 'Black Oil — DL', 'Others — Water Analysis'], assignedEngineerId: 'MOHSIN', assignedDriverId: 'ALI',
  samples: [sample('1.01', 'BHS', true, { ...bh, samplingTime: '06:20' }, 'MOHSIN', start), sample('1.02', 'BHS', true, { ...bh, samplingTime: '06:55' }, 'MOHSIN', start)],
  dueDate: addDays(day, 6) }, start, 4);
 j3 = run(j3, 'SALIM', { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI' }, t());
 j3 = handover(samplingReport(j3, 'MOHSIN', 'HUSSEINI', t, true), 'ALI', t);
 j3 = run(j3, 'SALIM', { type: 'scope', reason: 'Confirm the original request.', conditions: conditions('3150', '92'), items: [{ title: 'Black Oil — Validation', sampleIds: ['1.01', '1.02'], stream: 'BVT' }, { title: 'Black Oil — DL', sampleIds: ['1.01'], stream: 'BVT' }, { title: 'Others — Water Analysis', sampleIds: ['1.02'], stream: 'Chemical' }] }, t());
 j3 = await labWork(j3, { BVT: ['NASSER', 'AHAD'], Chemical: ['YAQEEN'] }, t, 6);
 const water = j3.operations!.activities.find(a => a.stream === 'Chemical')!;
 j3 = run(j3, water.owner, { type: 'progress', id: water.id, status: 'In Progress', notes: 'Started.' }, t());

 // 4 · Completed: all work done, final report approved by Wilfred.
 t = clock(20); start = t();
 const wh = { samplingDate: addDays(day, -19), samplingTime: '08:30', whp: '380', wht: '51', chokeSize: '28/64' };
 let j4 = job(4, { samplingSource: 'Wellhead Sampling', well: 'DEMO-WH-01', whp: '380', wht: '51', chokeSize: '28/64', requiredTests: ['Black Oil — Validation', 'Others — Water Analysis'], assignedEngineerId: 'HUSSEINI', assignedDriverId: 'ALI',
  samples: [sample('1.01', 'WHS', true, wh, 'HUSSEINI', start)], dueDate: addDays(day, -2) }, start, 4);
 j4 = run(j4, 'SALIM', { type: 'dispatch', engineer: 'HUSSEINI', driver: 'ALI' }, t());
 j4 = handover(samplingReport(j4, 'HUSSEINI', 'MOHSIN', t, true), 'ALI', t);
 j4 = run(j4, 'SALIM', { type: 'scope', reason: 'Confirm the original request.', conditions: conditions('2480', '78'), items: [{ title: 'Black Oil — Validation', sampleIds: ['1.01'], stream: 'BVT' }, { title: 'Others — Water Analysis', sampleIds: ['1.01'], stream: 'Chemical' }] }, t());
 j4 = await labWork(j4, { BVT: ['NASSER', 'RANJITH'], Chemical: ['YAQEEN'] }, t, Infinity);
 const finalFile = await storeFile('DEMO Final Report.pdf', 'DEMO final report placeholder. Fictional data.');
 const submitted = t();
 j4 = run(j4, 'SHEREIQI', { type: 'report-draft', kind: 'final', text: 'DEMO final report: validation and water analysis complete. Fictional results.', checker: 'SHEREIQI', file: { ...finalFile, version: 1, submittedBy: 'SHEREIQI', submittedAt: submitted, status: 'Available', comments: '' } }, submitted);
 j4 = run(j4, 'SHEREIQI', { type: 'report-action', kind: 'final', action: 'submit', comments: '' }, t());
 j4 = run(j4, 'WILFRED', { type: 'report-action', kind: 'final', action: 'approve', comments: '' }, t());
 j4 = { ...j4, stages: j4.stages.map(s => ({ ...s, status: 'Completed' as const, completed: s.completed || j4.lastUpdatedAt })), currentStage: 'Final Report' };

 return [j4, j3, j2, j1];
}
