// Example jobs for the published workflow demo. Every name, well and value here is fictional and marked DEMO.
// Jobs are advanced with the real workflow commands, so each one is a state the app can reach on its own.
import type { JobRecord } from './page';
import { applyOperation, type Command } from './operations-model';
import { initialDirectory } from './employee-directory';
import { defaultAuthorization, defaultResponsibilities } from './authorization';
import { cylinderCatalog } from './cylinder-catalog';
import { defaultFieldData } from './sample-defaults';
import { addDays, localDate } from './local-date';

export const demoClient = { code: 'X', shortName: 'DEMO', name: 'DEMO Operator (fictional)', country: 'Oman', notes: 'Fictional client used by the workflow demo.', active: true };
export const demoLogin = { id: 'MA001', password: '1234' };
/**
 * The labelled demo setup: fictional duties, team membership and test routing used only while the demo is on.
 * Stored separately from Settings (see demo-setup.ts) so a real configuration is never overwritten. QC reviewer Ahad
 * is not a team member, so no one QC-reviews their own work; demo assignments only use members of the matching team.
 */
export const demoConfiguration = {
 roles: { scopeSelector: 'SALIM', samplingApproval: 'SALIM', pvtSupervisor: 'WILFRED', pvtTeamLead: 'SHEREIQI', chemicalTeamLead: 'BAHRI', reporting: 'SHEREIQI', finalApproval: 'WILFRED', qcReviewer: 'AHAD', labReceipt: 'SHEREIQI' } as Record<string, string>,
 teams: { PVT: ['NASSER', 'RANJITH'], Chemical: ['YAQEEN'] },
 routing: Object.fromEntries([...['Validation', 'Recombination', 'DL', 'Sep Test', 'Viscosity'].map(t => ['Black Oil — ' + t, 'PVT']), ...['Validation', 'Recombination', 'Cryo', 'CCE', 'CVD', 'Sep Test'].map(t => ['Gas Condensates (GC) — ' + t, 'PVT']), ['Others — Water Analysis', 'Chemical'], ['Others — Compositional Analysis', 'Chemical']]) as Record<string, 'PVT' | 'Chemical' | 'Both'>,
};
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
  return { id, globalSequence: seq, jobNumber: id, clientCode: demoClient.code, clientName: demoClient.shortName, countryCode: 'OM', dateReceived: created.slice(0, 10), description: 'DEMO job with fictional data, for exploring the workflow.', samplingInstructions: 'DEMO instructions: confirm the sampling point with the client focal point before rig-up and record any discrepancies in the sequence of events. Fictional data.', clientFocalPoint: 'DEMO Focal Point', clientFocalPointContact: '+968 0000 0000', clientFocalPointEmail: 'demo@example.com', samplingRequired: true, fieldArea: 'DEMO Field', wellMode: 'single', requestedSampleCount: String(details.samples?.length || 0), otherTests: '', sampleCountNotes: '',
   status: 'Sampling In Progress', currentStage: stageNames[Math.min(stageDone, 4)], nextAction: 'Follow the job workspace', ownerId: 'SALIM', responsibleId: 'SALIM', jobResponsibleId: 'SALIM', createdById: 'SALIM', createdAt: created, lastUpdatedById: 'SALIM', lastUpdatedAt: created,
   stages: stageNames.map((name, i) => ({ name, assignedTo: details.assignedEngineerId || 'SALIM', status: i < stageDone ? 'Completed' : i === stageDone ? 'In Progress' : 'Not Started', ...(i <= stageDone ? { started: created } : {}), ...(i < stageDone ? { completed: created } : {}) })),
   events: [], dueDate: addDays(day, 14), ...details } as JobRecord;
 };
 const demoRoles = { ...defaultResponsibilities, ...demoConfiguration.roles };
 const demoTeams = demoConfiguration.teams;
 const run = (j: JobRecord, by: string, command: Command, at: string) => applyOperation(j, command, { id: by, employees, policy, roles: demoRoles, teams: demoTeams, routing: demoConfiguration.routing }, at);
 const workbook = (title: string, sampleId: string, v = 1) => storeFile(`DEMO ${title} ${sampleId} v${v}.csv`, `DEMO workbook,fictional data\nActivity,${title}\nSample,${sampleId}\nVersion,${v}\n`);
 /** Data submitted and reviewed first; the report is generated from approved data and approved separately. */
 const samplingReport = (j: JobRecord, engineer: string, tick: () => string, upTo: 'data-submitted' | 'report-approved') => {
  j = run(j, engineer, { type: 'data-submit', note: 'DEMO data submitted for review.' }, tick());
  if (upTo === 'data-submitted') return j;
  j = run(j, 'SALIM', { type: 'data-approve' }, tick());
  j = run(j, engineer, { type: 'report-draft', kind: 'sampling', text: 'DEMO sampling report. Samples collected under stable flow; fictional values.', checker: '' }, tick());
  j = run(j, engineer, { type: 'report-action', kind: 'sampling', action: 'submit', comments: '' }, tick());
  return run(j, 'SALIM', { type: 'report-action', kind: 'sampling', action: 'approve', comments: '' }, tick());
 };
 const handover = (j: JobRecord, driver: string, tick: () => string) => {
  j = run(j, driver, { type: 'handover-send', sampleIds: j.samples!.map(s => s.id), notes: 'DEMO transfer to the laboratory.' }, tick());
  return run(j, 'SHEREIQI', { type: 'handover-receive', notes: 'Containers checked against the sampling report.' }, tick());
 };
 const conditions = (pressure: string, temperature: string) => ({ pressure, pressureUnit: 'psi', temperature, temperatureUnit: '°C', notes: 'DEMO reservoir conditions, fictional.' });
 type Entry = { sampleId: string; destination: 'PVT' | 'Chemical' | 'Both'; pvtTests: string[]; chemicalTests: string[] };
 const release = (j: JobRecord, entries: Entry[], cond: ReturnType<typeof conditions>, tick: () => string) => run(j, 'SALIM', { type: 'lab-scope', action: 'release', reason: '', conditions: cond, samples: entries.map(e => ({ ...e, notes: '', excluded: false, exclusionReason: '' })) }, tick());
 const acts = (j: JobRecord) => j.operations!.activities;
 const find = (j: JobRecord, sampleId: string, title: string, stream: 'PVT' | 'Chemical' = 'PVT') => acts(j).find(a => a.sampleId === sampleId && a.title === title && a.stream === stream)!;
 const assign = (j: JobRecord, id: string, owner: string, start: number, due: number, tick: () => string, notes = 'DEMO instructions: follow the laboratory procedure for this test.') => { const a = acts(j).find(x => x.id === id)!; return run(j, a.stream === 'PVT' ? 'SHEREIQI' : 'BAHRI', { type: 'schedule', id, owner, start: addDays(day, start), due: addDays(day, due), conditions: a.conditions, notes }, tick()); };
 /** Workbook submitted, team-lead approved and QC approved. */
 async function complete(j: JobRecord, id: string, tick: () => string) {
  const a = acts(j).find(x => x.id === id)!;
  j = run(j, a.owner, { type: 'workbook', id, file: await workbook(a.title, a.sampleId), notes: 'Workbook submitted.' }, tick());
  j = run(j, a.stream === 'PVT' ? 'SHEREIQI' : 'BAHRI', { type: 'lead-review', id, decision: 'approve', target: '', comments: '' }, tick());
  return run(j, 'AHAD', { type: 'qc-review', id, decision: 'approve', target: '', comments: '' }, tick());
 }

 // 1 · Sampling in progress: dispatched to Mohsin (accountable) with Ahmed Al Husseini supporting; one of two sheets complete.
 let t = clock(2);
 let start = t();
 let j1 = job(1, { samplingSource: 'Wellhead Sampling', well: 'DEMO-WH-07', whp: '420', wht: '48', chokeSize: '32/64', requiredTests: ['Black Oil — Validation', 'Black Oil — Sep Test'], assignedEngineerId: 'MOHSIN', samplingTeamIds: ['HUSSEINI'], assignedDriverId: 'ALI',
  samples: [sample('1.01', 'WHS', true, { samplingDate: addDays(day, -1), samplingTime: '09:40', whp: '420', wht: '48', chokeSize: '32/64' }, 'MOHSIN', start), sample('1.02', 'WHS', false, {}, 'MOHSIN', start)],
  dueDate: addDays(day, 12) }, start, 2);
 j1 = run(j1, 'SALIM', { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI', team: ['HUSSEINI'] }, t());

 // 2 · Sampling data submitted, waiting for Salim's data review. Humaid is the driver (transport comes up after approval).
 t = clock(4); start = t();
 const sep = { separatorPressure: '145', separatorTemperature: '44' };
 let j2 = job(2, { samplingSource: 'Separator Sampling', well: 'DEMO-SP-12', facility: 'DEMO Station A', separatorId: 'DEMO-SEP-1', separatorStage: '1st stage', separatorPressure: '145', separatorTemperature: '44', requiredTests: ['Gas Condensates (GC) — Validation', 'Gas Condensates (GC) — CVD'], assignedEngineerId: 'HUSSEINI', assignedDriverId: 'HUMAID',
  samples: [sample('1.01', 'SEP', true, { samplingDate: addDays(day, -3), samplingTime: '10:15', ...sep }, 'HUSSEINI', start), sample('1.02', 'SEP', true, { samplingDate: addDays(day, -3), samplingTime: '11:05', ...sep }, 'HUSSEINI', start)],
  dueDate: addDays(day, 10) }, start, 3);
 j2 = run(j2, 'SALIM', { type: 'dispatch', engineer: 'HUSSEINI', driver: 'HUMAID' }, t());
 j2 = samplingReport(j2, 'HUSSEINI', t, 'data-submitted');

 // 3 · Mixed scope, per sample: 1.01 → PVT (Validation + DL); 1.02 → Both (PVT Validation + Chemical Water Analysis).
 //     Shows completed steps, a workbook awaiting team-lead review, a returned workbook, one awaiting QC, and parallel Chemical work.
 t = clock(9); start = t();
 const bh = { samplingDate: addDays(day, -8), formation: 'DEMO Formation', bhp: '3150', bht: '92', sampleBottleVolume: '700', sampleVolume: '600' };
 let j3 = job(3, { samplingSource: 'Cased Hole (Bottomhole / Downhole Sampling)', holeType: 'Cased Hole', well: 'DEMO-BH-03', formation: 'DEMO Formation', plannedDepth: '2450', requiredTests: ['Black Oil — Validation', 'Black Oil — DL', 'Others — Water Analysis'], assignedEngineerId: 'MOHSIN', assignedDriverId: 'ALI',
  samples: [sample('1.01', 'BHS', true, { ...bh, samplingTime: '06:20' }, 'MOHSIN', start), sample('1.02', 'BHS', true, { ...bh, samplingTime: '06:55' }, 'MOHSIN', start)],
  dueDate: addDays(day, 8) }, start, 4);
 j3 = run(j3, 'SALIM', { type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI' }, t());
 j3 = handover(samplingReport(j3, 'MOHSIN', t, 'report-approved'), 'ALI', t);
 j3 = release(j3, [{ sampleId: '1.01', destination: 'PVT', pvtTests: ['Black Oil — Validation', 'Black Oil — DL'], chemicalTests: [] }, { sampleId: '1.02', destination: 'Both', pvtTests: ['Black Oil — Validation'], chemicalTests: ['Others — Water Analysis'] }], conditions('3150', '92'), t);
 const v1 = acts(j3).filter(a => a.kind === 'validation' && a.sampleId === '1.01'), v2 = acts(j3).filter(a => a.kind === 'validation' && a.sampleId === '1.02');
 for (const [i, a] of v1.entries()) j3 = assign(j3, a.id, 'NASSER', -6 + i, -4 + i, t);
 for (const [i, a] of v2.entries()) j3 = assign(j3, a.id, 'RANJITH', -5 + i, -3 + i, t);
 j3 = assign(j3, find(j3, '1.01', 'Black Oil — DL').id, 'NASSER', 3, 6, t);
 j3 = assign(j3, find(j3, '1.02', 'Others — Water Analysis', 'Chemical').id, 'YAQEEN', -1, 2, t);
 for (const a of v1.slice(0, 5)) j3 = await complete(j3, a.id, t);
 j3 = run(j3, 'NASSER', { type: 'workbook', id: v1[5].id, file: await workbook(v1[5].title, '1.01'), notes: 'Charging complete.' }, t());
 j3 = run(j3, 'NASSER', { type: 'progress', id: v1[6].id, status: 'In Progress', notes: 'Flash started.' }, t());
 for (const a of v2.slice(0, 3)) j3 = await complete(j3, a.id, t);
 j3 = run(j3, 'RANJITH', { type: 'workbook', id: v2[3].id, file: await workbook(v2[3].title, '1.02'), notes: 'Water check done.' }, t());
 j3 = run(j3, 'SHEREIQI', { type: 'lead-review', id: v2[3].id, decision: 'return', target: 'Sheet "Readings", row 4', comments: 'Record the water volume in cm³ and attach the photo reference.' }, t());
 j3 = run(j3, 'RANJITH', { type: 'workbook', id: v2[4].id, file: await workbook(v2[4].title, '1.02'), notes: 'Agitation complete.' }, t());
 j3 = run(j3, 'SHEREIQI', { type: 'lead-review', id: v2[4].id, decision: 'approve', target: '', comments: '' }, t());
 j3 = run(j3, 'YAQEEN', { type: 'progress', id: find(j3, '1.02', 'Others — Water Analysis', 'Chemical').id, status: 'In Progress', notes: 'Sub-sample taken.' }, t());

 // 4 · Completed (PVT DL + Chemical Water Analysis, final report approved), then Validation added later as additional work.
 t = clock(20); start = t();
 const wh = { samplingDate: addDays(day, -19), samplingTime: '08:30', whp: '380', wht: '51', chokeSize: '28/64' };
 let j4 = job(4, { samplingSource: 'Wellhead Sampling', well: 'DEMO-WH-01', whp: '380', wht: '51', chokeSize: '28/64', requiredTests: ['Black Oil — DL', 'Others — Water Analysis'], assignedEngineerId: 'HUSSEINI', assignedDriverId: 'ALI',
  samples: [sample('1.01', 'WHS', true, wh, 'HUSSEINI', start)], dueDate: addDays(day, 4) }, start, 4);
 j4 = run(j4, 'SALIM', { type: 'dispatch', engineer: 'HUSSEINI', driver: 'ALI' }, t());
 j4 = handover(samplingReport(j4, 'HUSSEINI', t, 'report-approved'), 'ALI', t);
 j4 = release(j4, [{ sampleId: '1.01', destination: 'Both', pvtTests: ['Black Oil — DL'], chemicalTests: ['Others — Water Analysis'] }], conditions('2480', '78'), t);
 j4 = assign(j4, find(j4, '1.01', 'Black Oil — DL').id, 'NASSER', -15, -12, t);
 j4 = assign(j4, find(j4, '1.01', 'Others — Water Analysis', 'Chemical').id, 'YAQEEN', -15, -12, t);
 for (const a of acts(j4)) j4 = await complete(j4, a.id, t);
 const finalFile = await storeFile('DEMO Final Report.pdf', 'DEMO final report placeholder. Fictional data.');
 const submitted = t();
 j4 = run(j4, 'SHEREIQI', { type: 'report-draft', kind: 'final', text: 'DEMO final report: DL and water analysis complete. Fictional results.', checker: 'SHEREIQI', file: { ...finalFile, version: 1, submittedBy: 'SHEREIQI', submittedAt: submitted, status: 'Available', comments: '' } }, submitted);
 j4 = run(j4, 'SHEREIQI', { type: 'report-action', kind: 'final', action: 'submit', comments: '' }, t());
 j4 = run(j4, 'WILFRED', { type: 'report-action', kind: 'final', action: 'approve', comments: '' }, t());
 j4 = { ...j4, stages: j4.stages.map(s => ({ ...s, status: 'Completed' as const, completed: s.completed || j4.lastUpdatedAt })), currentStage: 'Final Report' };
 const later = clock(0); later();
 j4 = run(j4, 'SALIM', { type: 'add-validation', sampleIds: ['1.01'], steps: ['Opening Pressure', 'Restoration', 'Flash', 'PV'], reason: 'DEMO: client requested Validation of the retained sample before release.' }, later());

 // 5 · Chemical-only scope just released for a glass container: new Chemical scope, awaiting assignment by the Chemical Team Lead.
 t = clock(6); start = t();
 let j5 = job(5, { samplingSource: 'Wellhead Sampling', well: 'DEMO-WH-22', whp: '300', wht: '45', chokeSize: '24/64', requiredTests: ['Others — Water Analysis', 'Others — Compositional Analysis'], assignedEngineerId: 'HUSSEINI', assignedDriverId: 'ALI',
  samples: [{ ...sample('1.01', 'WHS', true, { samplingDate: addDays(day, -5), samplingTime: '07:45', whp: '300', wht: '45', chokeSize: '24/64' }, 'HUSSEINI', start), containerType: 'Glass container', containerId: 'DEMO-G-11', bottle: '', bottleSerial: '', bottleCapacity: '' }], dueDate: addDays(day, 9) }, start, 4);
 j5 = run(j5, 'SALIM', { type: 'dispatch', engineer: 'HUSSEINI', driver: 'ALI' }, t());
 j5 = handover(samplingReport(j5, 'HUSSEINI', t, 'report-approved'), 'ALI', t);
 j5 = release(j5, [{ sampleId: '1.01', destination: 'Chemical', pvtTests: [], chemicalTests: ['Others — Water Analysis', 'Others — Compositional Analysis'] }], conditions('', ''), clock(0));

 // 6 · PVT-only scope: CVD assigned to Nasser today (assignment alert); CCE still awaiting assignment (new PVT scope alert).
 t = clock(5); start = t();
 const sep6 = { separatorPressure: '160', separatorTemperature: '40' };
 let j6 = job(6, { samplingSource: 'Separator Sampling', well: 'DEMO-SP-30', facility: 'DEMO Station B', separatorId: 'DEMO-SEP-4', separatorStage: '1st stage', separatorPressure: '160', separatorTemperature: '40', requiredTests: ['Gas Condensates (GC) — CVD', 'Gas Condensates (GC) — CCE'], assignedEngineerId: 'MOHSIN', assignedDriverId: 'HUMAID',
  samples: [sample('1.01', 'SEP', true, { samplingDate: addDays(day, -4), samplingTime: '09:00', ...sep6 }, 'MOHSIN', start), sample('1.02', 'SEP', true, { samplingDate: addDays(day, -4), samplingTime: '09:40', ...sep6 }, 'MOHSIN', start)], dueDate: addDays(day, 11) }, start, 4);
 j6 = run(j6, 'SALIM', { type: 'dispatch', engineer: 'MOHSIN', driver: 'HUMAID' }, t());
 j6 = handover(samplingReport(j6, 'MOHSIN', t, 'report-approved'), 'HUMAID', t);
 const t6 = clock(0);
 j6 = release(j6, [{ sampleId: '1.01', destination: 'PVT', pvtTests: ['Gas Condensates (GC) — CVD'], chemicalTests: [] }, { sampleId: '1.02', destination: 'PVT', pvtTests: ['Gas Condensates (GC) — CCE'], chemicalTests: [] }], conditions('', ''), t6);
 j6 = assign(j6, find(j6, '1.01', 'Gas Condensates (GC) — CVD').id, 'NASSER', 0, 3, t6, 'DEMO: run CVD at reservoir temperature; report liquid dropout per stage.');

 return [j6, j5, j4, j3, j2, j1];
}
