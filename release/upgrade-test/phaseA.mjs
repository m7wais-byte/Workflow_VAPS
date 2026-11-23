// Phase A: run the CURRENT main build (0000–0005) and create real-looking records through its own API. Sample data only.
import assert from 'node:assert/strict'; import fs from 'node:fs';
import { start, routes, extra, cookieOf } from './harness.mjs';
const persist = process.argv[2];
const { DB, FILES, api, call, applied } = await start(routes, extra, { MAIL_PROVIDER: 'test', INVITE_TTL_HOURS: '72', APP_ORIGIN: 'https://vaps.example' }, persist);
const pw = {}; const login = async (u) => { const r = await call('login', 'POST', '/', { json: { username: u, password: pw[u] } }); assert.equal(r.status, 200, u + JSON.stringify(r.data)); return cookieOf(r.setCookie); };
const boot = await api.auth.createAccount(DB, { accountId: 'bootstrap', employeeId: 'MA001' }, { username: 'ma001', employeeId: 'MA001' }, () => true);
{ const r = await call('login', 'POST', '/', { json: { username: 'ma001', password: boot.temporaryPassword } }); pw.MA001 = 'Administrator sample passphrase 1';
  assert.equal((await call('password', 'POST', '/', { cookie: cookieOf(r.setCookie), json: { currentPassword: boot.temporaryPassword, newPassword: pw.MA001 } })).status, 200); }
const ma = await login('MA001');
for (const id of ['SALIM', 'SHEREIQI', 'WILFRED', 'BAHRI', 'MOHSIN', 'HUSSEINI', 'ALI', 'YAQEEN']) {
  const email = id.toLowerCase() + '@vaps.example.test';
  assert.equal((await call('invite', 'POST', '/', { cookie: ma, json: { employeeId: id, email } })).status, 200, id);
  const token = /#invite=([a-f0-9]{64})/.exec(api.testOutbox.filter((m) => m.to === email).at(-1).text)[1];
  pw[id] = 'Sample passphrase number ' + Object.keys(pw).length + ' of 2026';
  { const a = await call('invitation', 'POST', '/', { json: { action: 'accept', token, password: pw[id] } }); assert.equal(a.status, 200, id + JSON.stringify(a.data)); }
}
const salim = await login('SALIM'); const at = new Date().toISOString(), day = at.slice(0, 10);
const cyl = api.cylinderCatalog.find((b) => b.type === 'PDS');
const sample = { id: '1.01', sampler: '', bottle: cyl.type, samplerSerial: '', bottleSerial: cyl.serial, bottleCapacity: cyl.capacity, calibrationStatus: 'Passed', pressureTestStatus: 'Passed', equipmentCondition: 'Good', preparedBy: 'SALIM', preparedAt: at, preparationRemarks: '', fieldData: { ...api.defaultFieldData(), sampleNature: 'WHS' }, dataComplete: false, dataCompletedBy: '', dataCompletedAt: '', pressure: '', temperature: '', depth: '', notes: '' };
const id = 'OM-P-26-901';
const job = { id, globalSequence: 901, jobNumber: id, clientCode: 'P', clientName: 'Sample Client', countryCode: 'OM', dateReceived: day, description: 'Upgrade test job (sample data).', samplingInstructions: 'Sample.', samplingSource: 'Wellhead Sampling', well: 'SAMPLE-1', requiredTests: ['Black Oil — DL'], assignedEngineerId: 'MOHSIN', samplingTeamIds: ['HUSSEINI'], assignedDriverId: 'ALI', samples: [sample], stages: [], events: [], status: 'Job Created', currentStage: 'Sampling Preparation', nextAction: 'Start', ownerId: 'SALIM', responsibleId: 'MOHSIN', jobResponsibleId: 'SALIM', createdById: 'SALIM', createdAt: at, lastUpdatedById: 'SALIM', lastUpdatedAt: at, dueDate: day };
let r = await call('job', 'PUT', '/', { cookie: salim, params: { id }, json: { job, revision: 0, commands: [{ type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI', team: ['HUSSEINI'] }] } });
assert.equal(r.status, 200, JSON.stringify(r.data)); let rev = r.data.revision;
const step = async (who, commands) => { const res = await call('operations', 'POST', '/', { cookie: await login(who), params: { id }, json: { commands, revision: rev } }); assert.equal(res.status, 200, who + JSON.stringify(res.data)); rev = res.data.revision; return res.data.job; };
let cur = await step('MOHSIN', [{ type: 'start-job' }]);
const filled = { ...cur, samples: cur.samples.map((s) => ({ ...s, fieldData: { ...s.fieldData, samplingDate: day, samplingTime: '09:30', whp: '410', wht: '47', chokeSize: '30/64' }, dataComplete: true, dataCompletedBy: 'MOHSIN', dataCompletedAt: new Date().toISOString() })) };
r = await call('job', 'PUT', '/', { cookie: await login('MOHSIN'), params: { id }, json: { job: filled, revision: rev } }); assert.equal(r.status, 200); rev = r.data.revision;
await step('HUSSEINI', [{ type: 'data-review' }]);
const bytes = 'G-sheet,sample\nWHP,410\n';
const form = new FormData(); form.set('file', new File([bytes], 'G-sheet.csv', { type: 'text/csv' })); form.set('anyType', '1');
const gs = await call('files', 'POST', '/', { cookie: await login('MOHSIN'), body: form }); assert.equal(gs.status, 201);
cur = await step('MOHSIN', [{ type: 'report-draft', kind: 'sampling', text: 'Sample sampling report.', checker: '', file: { ...gs.data, version: 1, submittedBy: 'MOHSIN', submittedAt: new Date().toISOString(), status: 'Available', comments: '' } }]);
const snap = {
  applied,
  accounts: (await DB.prepare('SELECT id, username, employee_id, email, password_hash, active, activated_at FROM accounts ORDER BY employee_id').all()).results,
  jobs: (await DB.prepare('SELECT id, job_number, payload, revision, trashed FROM jobs').all()).results,
  files: (await DB.prepare('SELECT * FROM files').all()).results,
  sessions: (await DB.prepare('SELECT COUNT(*) n FROM sessions WHERE revoked_at IS NULL').first()).n,
  audit: (await DB.prepare('SELECT COUNT(*) n FROM audit_log').first()).n,
  fileId: gs.data.id, fileBytes: bytes, jobId: id, rev, pw,
};
fs.writeFileSync(persist + '/snapshot.json', JSON.stringify(snap, null, 1));
console.log('PHASE A (main) applied', applied.join(', '), '| accounts', snap.accounts.length, '| jobs', snap.jobs.length, 'rev', rev, '| files', snap.files.length, '| audit rows', snap.audit);
process.exit(0);
