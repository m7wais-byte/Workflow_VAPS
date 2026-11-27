// Invitation-only onboarding, access roles and a full job lifecycle run by onboarded demo accounts, through the real
// Sites API route handlers against a local D1 + R2 (Miniflare). Mail runs in test mode: nothing is sent; messages are
// captured in memory. All addresses are example.test addresses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSitesApi } from './fixtures/sites-api.mjs';

const { mf, DB, api, call } = await startSitesApi({
  login: 'app/api/auth/login/route.ts', logout: 'app/api/auth/logout/route.ts', session: 'app/api/auth/session/route.ts', password: 'app/api/auth/password/route.ts',
  invitation: 'app/api/auth/invitation/route.ts', invite: 'app/api/admin/invitations/route.ts', accounts: 'app/api/admin/accounts/route.ts', account: 'app/api/admin/accounts/[id]/route.ts',
  workspace: 'app/api/workspace/route.ts', record: 'app/api/workspace/records/[key]/route.ts', job: 'app/api/jobs/[id]/route.ts', operations: 'app/api/jobs/[id]/operations/route.ts', files: 'app/api/files/route.ts', file: 'app/api/files/[id]/route.ts',
}, [
  'export * as auth from "./server/auth.ts";', 'export { testOutbox } from "./server/mail.ts";', 'export { initialDirectory, nextEmployeeId } from "./app/employee-directory.ts";',
  'export { defaultAuthorization, defaultResponsibilities } from "./app/authorization.ts";', 'export { demoConfiguration, buildDemoJobs } from "./app/demo-data.ts";',
  'export { defaultFieldData } from "./app/sample-defaults.ts";', 'export { cylinderCatalog } from "./app/cylinder-catalog.ts";',
].join('\n'), { MAIL_PROVIDER: 'test', INVITE_TTL_HOURS: '72' });

const cookieOf = (c) => c.split(';')[0];
const mailTo = (email) => api.testOutbox.filter((m) => m.to === email).at(-1);
const tokenIn = (mail) => /#invite=([a-f0-9]{64})/.exec(mail.text)[1];
const passwords = {};
const emailOf = (id) => id.toLowerCase() + '@vaps.example.test';
async function signIn(name, password) {
  const r = await call('login', 'POST', '/', { json: { username: name, password } });
  assert.equal(r.status, 200, name + ' ' + JSON.stringify(r.data)); return cookieOf(r.setCookie);
}
const as = async (id) => signIn(id, passwords[id]);
async function invite(adminCookie, employeeId, email = emailOf(employeeId)) {
  return call('invite', 'POST', '/', { cookie: adminCookie, json: { employeeId, email } });
}
/** The employee opens the emailed link and sets a password. */
async function activate(employeeId, email = emailOf(employeeId)) {
  const token = tokenIn(mailTo(email));
  passwords[employeeId] = 'Demo passphrase number ' + (Object.keys(passwords).length + 1) + ' of the test';
  const r = await call('invitation', 'POST', '/', { json: { action: 'accept', token, password: passwords[employeeId] } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); return cookieOf(r.setCookie);
}

// The Administrator (MA001) is bootstrapped with a temporary password, as scripts/create-account.mjs does.
const boot = await api.auth.createAccount(DB, { accountId: 'bootstrap', employeeId: 'MA001' }, { username: 'ma001', employeeId: 'MA001' }, () => true);
{
  const first = await signIn('ma001', boot.temporaryPassword);
  passwords.MA001 = 'Administrator demo passphrase';
  assert.equal((await call('password', 'POST', '/', { cookie: first, json: { currentPassword: boot.temporaryPassword, newPassword: passwords.MA001 } })).status, 200);
}

test('invitation: one-time link by email, account active only after the employee sets a password', async () => {
  const ma = await as('MA001');
  const sent = await invite(ma, 'SALIM', 'Salim.AlMaqbali@VAPS.example.test');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.email, 'salim.almaqbali@vaps.example.test');
  const mail = mailTo('salim.almaqbali@vaps.example.test');
  assert.match(mail.subject, /VAPS/); assert.match(mail.text, /employee ID \(SALIM\)/); assert.doesNotMatch(mail.text, /password:/i);
  const token = tokenIn(mail);
  assert.equal(sent.data.testLink, `https://vaps.example/#invite=${token}`, 'one dashboard URL, token only in the #fragment');
  // Stored as a hash only; never in the audit trail.
  const row = await DB.prepare('SELECT token_hash FROM invitations').first();
  assert.notEqual(row.token_hash, token);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE instr(detail, ?) > 0').bind(token).first()).n, 0);
  // Not active yet: nothing signs in.
  const acct = await DB.prepare("SELECT active, activated_at, password_hash FROM accounts WHERE employee_id = 'SALIM'").first();
  assert.deepEqual([acct.active, acct.activated_at, acct.password_hash], [0, null, '!invited']);
  assert.equal((await call('login', 'POST', '/', { json: { username: 'SALIM', password: 'anything at all 123' } })).status, 401);
  // The link page shows who it is for; a weak password is refused; the right one activates and signs in.
  const check = await call('invitation', 'POST', '/', { json: { action: 'check', token } });
  assert.deepEqual([check.data.employeeId, check.data.name, check.data.email], ['SALIM', 'Salim Al Maqbali', 'salim.almaqbali@vaps.example.test']);
  assert.equal((await call('invitation', 'POST', '/', { json: { action: 'accept', token, password: 'short' } })).status, 400);
  passwords.SALIM = 'Coordinator demo passphrase';
  const accepted = await call('invitation', 'POST', '/', { json: { action: 'accept', token, password: passwords.SALIM } });
  assert.equal(accepted.status, 200);
  assert.equal((await call('session', 'GET', '/', { cookie: cookieOf(accepted.setCookie) })).data.employeeId, 'SALIM');
  // The link works once.
  assert.equal((await call('invitation', 'POST', '/', { json: { action: 'accept', token, password: 'Another passphrase 2026' } })).status, 410);
  assert.equal((await call('invitation', 'POST', '/', { json: { action: 'check', token } })).status, 410);
  // Afterwards: work email (any capitalisation) or employee ID (any capitalisation), same password.
  for (const name of ['SALIM.ALMAQBALI@vaps.example.test', 'SALIM', 'salim']) {
    const c = await signIn(name, passwords.SALIM);
    assert.equal((await call('session', 'GET', '/', { cookie: c })).data.employeeId, 'SALIM', name);
  }
  const list = (await call('accounts', 'GET', '/', { cookie: ma })).data.accounts.find((a) => a.employeeId === 'SALIM');
  assert.ok(list.activatedAt && list.lastSignInAt); assert.equal(list.invitationExpiresAt, null);
  assert.equal((await invite(ma, 'SALIM')).status, 409, 'an active account is not re-invited');
});

test('invitation: resend replaces the old link; expired, unknown and cancelled links fail the same way', async () => {
  const ma = await as('MA001');
  assert.equal((await invite(ma, 'WILFRED')).status, 200);
  const first = tokenIn(mailTo(emailOf('WILFRED')));
  assert.equal((await invite(ma, 'WILFRED')).status, 200);
  const second = tokenIn(mailTo(emailOf('WILFRED')));
  assert.notEqual(first, second);
  const old = await call('invitation', 'POST', '/', { json: { action: 'check', token: first } });
  assert.equal(old.status, 410);
  await DB.prepare('UPDATE invitations SET expires_at = ? WHERE used_at IS NULL AND revoked_at IS NULL').bind(new Date(Date.now() - 1000).toISOString()).run();
  const expired = await call('invitation', 'POST', '/', { json: { action: 'accept', token: second, password: 'Supervisor passphrase 2026' } });
  assert.deepEqual([expired.status, expired.data.error], [410, old.data.error]);
  const unknown = await call('invitation', 'POST', '/', { json: { action: 'check', token: 'a'.repeat(64) } });
  assert.deepEqual([unknown.status, unknown.data.error], [410, old.data.error]);
  const list = (await call('accounts', 'GET', '/', { cookie: ma })).data.accounts.find((a) => a.employeeId === 'WILFRED');
  assert.equal(list.invitationExpiresAt, null, 'shown as expired');
  assert.equal((await invite(ma, 'WILFRED')).status, 200);
  await activate('WILFRED');
  // Cancelling a pending invitation (deactivate) stops its link.
  assert.equal((await invite(ma, 'AHAD')).status, 200);
  const ahad = (await call('accounts', 'GET', '/', { cookie: ma })).data.accounts.find((a) => a.employeeId === 'AHAD');
  assert.equal((await call('account', 'POST', '/', { cookie: ma, params: { id: ahad.id }, json: { action: 'deactivate' } })).status, 200);
  assert.equal((await call('invitation', 'POST', '/', { json: { action: 'check', token: tokenIn(mailTo(emailOf('AHAD'))) } })).status, 410);
  assert.equal((await call('account', 'POST', '/', { cookie: ma, params: { id: ahad.id }, json: { action: 'reactivate' } })).status, 409, 'cannot be switched on without the employee setting a password');
});

test('invitation: administrator only, valid email, no duplicates, no public registration, no mail service = nothing sent', async () => {
  const ma = await as('MA001');
  assert.equal((await call('invite', 'POST', '/', { json: { employeeId: 'NASSER', email: emailOf('NASSER') } })).status, 401, 'no session');
  // Salim holds Manage authorization here, yet invitations and access roles stay with the Administrator.
  const ws = (await call('workspace', 'GET', '/', { cookie: ma })).data;
  const ids = api.initialDirectory().employees.map((e) => e.id);
  const policy = { ...api.defaultAuthorization(ids) }; policy.authorization = [...policy.authorization, 'SALIM'];
  assert.equal((await call('record', 'PUT', '/', { cookie: ma, params: { key: 'vaps-authorization-v1' }, json: { value: JSON.stringify(policy), revision: ws.revisions['vaps-authorization-v1'] ?? 0 } })).status, 200);
  const salim = await as('SALIM');
  assert.equal((await invite(salim, 'NASSER')).status, 403);
  assert.equal((await call('record', 'PUT', '/', { cookie: salim, params: { key: 'vaps-access-roles-v1' }, json: { value: JSON.stringify({ superUsers: ['SALIM', 'NASSER'] }), revision: 0 } })).status, 403);
  assert.equal((await invite(ma, 'NASSER', 'not an email')).status, 400);
  assert.equal((await invite(ma, 'NASSER', 'WILFRED@vaps.example.test')).status, 409, 'email already used by another account');
  assert.equal((await invite(ma, 'NOBODY')).status, 400, 'only employees in the directory');
  // The invitation route cannot create anything without a valid link.
  assert.equal((await call('invitation', 'POST', '/', { json: { action: 'accept', token: 'b'.repeat(64), password: 'Registration attempt 2026' } })).status, 410);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM accounts WHERE employee_id = 'NASSER'").first()).n, 0);
  const env = globalThis.__vapsTestEnv; const saved = env.MAIL_PROVIDER; delete env.MAIL_PROVIDER;
  try {
    const r = await invite(ma, 'NASSER');
    assert.equal(r.status, 503); assert.match(r.data.error, /not configured/);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM accounts WHERE employee_id = 'NASSER'").first()).n, 0);
  } finally { env.MAIL_PROVIDER = saved; }
});

test('new employee: fixed ID assigned on creation, invited, signs in with that ID; IDs never change', async () => {
  const ma = await as('MA001');
  const ws = (await call('workspace', 'GET', '/', { cookie: ma })).data;
  const directory = ws.records['vaps-directory-v1'] ? JSON.parse(ws.records['vaps-directory-v1']) : api.initialDirectory();
  const id = api.nextEmployeeId(directory.employees);
  assert.equal(id, 'VAPS-001');
  const next = { ...directory, employees: [...directory.employees.map((e) => ({ ...e, password: undefined })), { id, name: 'Demo New Hire', role: '', initials: 'DN', departmentId: 'analysis', positionId: 'analysis', employeeCode: id, email: 'new.hire@vaps.example.test', phone: '', active: true }] };
  const saved = await call('record', 'PUT', '/', { cookie: ma, params: { key: 'vaps-directory-v1' }, json: { value: JSON.stringify(next), revision: ws.revisions['vaps-directory-v1'] ?? 0 } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(api.nextEmployeeId(next.employees), 'VAPS-002');
  const clash = { ...next, employees: [...next.employees, { ...next.employees.at(-1), id: 'vaps-001', name: 'Clash' }] };
  assert.equal((await call('record', 'PUT', '/', { cookie: ma, params: { key: 'vaps-directory-v1' }, json: { value: JSON.stringify(clash), revision: saved.data.revision } })).status, 400, 'IDs differ by more than capitalisation');
  assert.equal((await invite(ma, id, 'new.hire@vaps.example.test')).status, 200);
  await activate(id, 'new.hire@vaps.example.test');
  for (const name of ['vaps-001', 'VAPS-001', 'new.hire@vaps.example.test']) assert.equal((await call('session', 'GET', '/', { cookie: await signIn(name, passwords[id]) })).data.employeeId, id);
  // A Normal User with no assignments sees no jobs and no settings.
  const hire = (await call('workspace', 'GET', '/', { cookie: await as(id) })).data;
  assert.equal(hire.jobs.length, 0); assert.deepEqual(hire.jobIndex, []);
});

test('full workflow with onboarded demo accounts; Normal Users see only assigned jobs; duties unchanged', async () => {
  const ma = await as('MA001');
  for (const id of ['SHEREIQI', 'BAHRI', 'MOHSIN', 'HUSSEINI', 'ALI', 'NASSER', 'YAQEEN', 'RANJITH']) { assert.equal((await invite(ma, id)).status, 200, id); await activate(id); }
  // Duties and lab teams as configured for the demo (QC review by Wilfred, Yaqeen in Chemistry).
  let ws = (await call('workspace', 'GET', '/', { cookie: ma })).data;
  const put = async (key, value) => { const r = await call('record', 'PUT', '/', { cookie: ma, params: { key }, json: { value: JSON.stringify(value), revision: ws.revisions[key] ?? 0 } }); assert.equal(r.status, 200, key + JSON.stringify(r.data)); ws = (await call('workspace', 'GET', '/', { cookie: ma })).data; };
  await put('vaps-responsibilities-v1', { ...api.defaultResponsibilities, ...api.demoConfiguration.roles });
  await put('vaps-lab-teams-v1', api.demoConfiguration.teams);

  // 1. Coordinator (Salim, Super User) creates the job and sends it to Sampling in one step.
  const salim = await as('SALIM');
  const at = new Date().toISOString(), day = at.slice(0, 10);
  const cyl = api.cylinderCatalog.find((b) => b.type === 'PDS');
  const sample = { id: '1.01', sampler: '', bottle: cyl.type, samplerSerial: '', bottleSerial: cyl.serial, bottleCapacity: cyl.capacity, calibrationStatus: 'Passed', pressureTestStatus: 'Passed', equipmentCondition: 'Good', preparedBy: 'SALIM', preparedAt: at, preparationRemarks: '', fieldData: { ...api.defaultFieldData(), sampleNature: 'WHS' }, dataComplete: false, dataCompletedBy: '', dataCompletedAt: '', pressure: '', temperature: '', depth: '', notes: '' };
  const id = 'OM-P-26-101';
  const job = { id, globalSequence: 101, jobNumber: id, clientCode: 'P', clientName: 'PDO', countryCode: 'OM', dateReceived: day, description: 'Onboarding test job (test data).', samplingInstructions: 'Test instructions.', samplingSource: 'Wellhead Sampling', well: 'TEST-WH-1', requiredTests: ['Black Oil — DL', 'Others — Water Analysis'], assignedEngineerId: 'MOHSIN', samplingTeamIds: ['HUSSEINI'], assignedDriverId: 'ALI', samples: [sample], stages: [], events: [], status: 'Job Created', currentStage: 'Sampling Preparation', nextAction: 'Start', ownerId: 'SALIM', responsibleId: 'MOHSIN', jobResponsibleId: 'SALIM', createdById: 'SALIM', createdAt: at, lastUpdatedById: 'SALIM', lastUpdatedAt: at, dueDate: day };
  let r = await call('job', 'PUT', '/', { cookie: salim, params: { id }, json: { job, revision: 0, commands: [{ type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI', team: ['HUSSEINI'] }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let rev = r.data.revision, current = r.data.job;
  const step = async (who, commands) => { const res = await call('operations', 'POST', '/', { cookie: await as(who), params: { id }, json: { commands, revision: rev } }); assert.equal(res.status, 200, who + ' ' + commands[0].type + ' ' + JSON.stringify(res.data)); rev = res.data.revision; current = res.data.job; return current; };
  const refused = async (who, commands) => { const res = await call('operations', 'POST', '/', { cookie: await as(who), params: { id }, json: { commands, revision: rev } }); assert.ok([403, 404].includes(res.status), who + ' should be refused: ' + res.status); };

  // 2. Accountable engineer (Mohsin, Normal User) starts the job and completes the sampling data sheet.
  await refused('ALI', [{ type: 'start-job' }]);
  await step('MOHSIN', [{ type: 'start-job' }]);
  const filled = { ...current, samples: current.samples.map((s) => ({ ...s, fieldData: { ...s.fieldData, samplingDate: day, samplingTime: '09:30', whp: '410', wht: '47', chokeSize: '30/64' }, dataComplete: true, dataCompletedBy: 'MOHSIN', dataCompletedAt: new Date().toISOString(), notes: 'Test data.' })) };
  r = await call('job', 'PUT', '/', { cookie: await as('MOHSIN'), params: { id }, json: { job: filled, revision: rev } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); rev = r.data.revision; current = r.data.job;
  // 3. Backup engineer reviews the data; the engineer drafts and submits the report; the sampling approver approves.
  await refused('MOHSIN', [{ type: 'data-review' }]);
  await step('HUSSEINI', [{ type: 'data-review' }]);
  const form = new FormData(); form.set('file', new File(['G-sheet,test\n'], 'G-sheet.csv', { type: 'text/csv' })); form.set('anyType', '1');
  const gs = await call('files', 'POST', '/', { cookie: await as('MOHSIN'), body: form });
  assert.equal(gs.status, 201);
  await step('MOHSIN', [{ type: 'report-draft', kind: 'sampling', text: 'Test sampling report.', checker: '', file: { ...gs.data, version: 1, submittedBy: 'MOHSIN', submittedAt: new Date().toISOString(), status: 'Available', comments: '' } }]);
  await step('MOHSIN', [{ type: 'report-action', kind: 'sampling', action: 'submit', comments: '' }]);
  await refused('WILFRED', [{ type: 'report-action', kind: 'sampling', action: 'approve', comments: '' }]);
  await step('SALIM', [{ type: 'report-action', kind: 'sampling', action: 'approve', comments: '' }]);
  // 4. Scope selector releases the laboratory scope; team leads assign; engineers submit workbooks.
  await refused('NASSER', [{ type: 'lab-scope', action: 'release', reason: '', conditions: { pressure: '2400', pressureUnit: 'psi', temperature: '80', temperatureUnit: '°C', notes: '' }, samples: [] }]);
  await step('SALIM', [{ type: 'lab-scope', action: 'release', reason: '', conditions: { pressure: '2400', pressureUnit: 'psi', temperature: '80', temperatureUnit: '°C', notes: 'Test.' }, samples: [{ sampleId: '1.01', fluidType: 'Black Oil', destination: 'Both', pvtTests: ['Black Oil — DL'], chemicalTests: ['Others — Water Analysis'], notes: '', excluded: false, exclusionReason: '' }] }]);
  const act = (title) => current.operations.activities.find((a) => a.title === title);
  const dl = act('Black Oil — DL'), water = act('Others — Water Analysis');
  await refused('BAHRI', [{ type: 'schedule', id: dl.id, owner: 'NASSER', start: day, due: day, conditions: dl.conditions, notes: '' }]);
  await step('SHEREIQI', [{ type: 'schedule', id: dl.id, owner: 'NASSER', start: day, due: day, conditions: dl.conditions, notes: 'Run DL.' }]);
  await step('BAHRI', [{ type: 'schedule', id: water.id, owner: 'YAQEEN', start: day, due: day, conditions: water.conditions, notes: 'Run water analysis.' }]);
  const upload = async (who, name) => { const f = new FormData(); f.set('file', new File(['Workbook,test\n'], name, { type: 'text/csv' })); const u = await call('files', 'POST', '/', { cookie: await as(who), body: f }); assert.equal(u.status, 201); return u.data; };
  await refused('RANJITH', [{ type: 'workbook', id: dl.id, notes: 'Not mine.' }]);
  await step('NASSER', [{ type: 'workbook', id: dl.id, file: await upload('NASSER', 'DL.csv'), notes: 'Done.' }]);
  await step('YAQEEN', [{ type: 'workbook', id: water.id, file: await upload('YAQEEN', 'Water.csv'), notes: 'Done.' }]);
  // 5. Team-lead review, then QC by the QC reviewer only.
  await step('SHEREIQI', [{ type: 'lead-review', id: dl.id, decision: 'approve', target: '', comments: '' }]);
  await step('BAHRI', [{ type: 'lead-review', id: water.id, decision: 'approve', target: '', comments: '' }]);
  await refused('SHEREIQI', [{ type: 'qc-review', id: dl.id, decision: 'approve', target: '', comments: '' }]);
  await step('WILFRED', [{ type: 'qc-review', id: dl.id, decision: 'approve', target: '', comments: '' }]);
  await step('WILFRED', [{ type: 'qc-review', id: water.id, decision: 'approve', target: '', comments: '' }]);
  // 6. Final report: prepared by the reporting duty, approved by the final approver only; then the coordinator closes.
  await step('SHEREIQI', [{ type: 'report-draft', kind: 'final', text: 'Test final report.', checker: 'SHEREIQI' }]);
  await step('SHEREIQI', [{ type: 'report-action', kind: 'final', action: 'submit', comments: '' }]);
  await refused('SALIM', [{ type: 'report-action', kind: 'final', action: 'approve', comments: '' }]);
  await step('WILFRED', [{ type: 'report-action', kind: 'final', action: 'approve', comments: '' }]);
  // Approval is internal: the coordinator records the issue to the client before the client's approval.
  await refused('SALIM', [{ type: 'client-disposal', note: '' }]);
  await refused('NASSER', [{ type: 'report-issue', note: '' }]);
  await refused('SALIM', [{ type: 'report-issue', on: '2099-01-01' }]); // the issue day reaches the server rules
  await step('SALIM', [{ type: 'report-issue', note: 'Emailed to the focal point (test).' }]);
  await refused('NASSER', [{ type: 'client-disposal', note: '' }]);
  await step('SALIM', [{ type: 'client-disposal', note: 'Client approved (test).' }]);
  await step('SALIM', [{ type: 'release-cylinders', note: '', assignee: 'MOHSIN' }]);
  assert.ok(current.operations.clientDisposal && current.operations.cylindersReleased);
  assert.ok(current.operations.history.every((h) => ['SALIM', 'MOHSIN', 'HUSSEINI', 'SHEREIQI', 'BAHRI', 'NASSER', 'YAQEEN', 'WILFRED'].includes(h.by)), 'every step recorded under the signed-in employee');

  // Access roles: a Normal User sees only assigned jobs, even if Authorization grants a company-wide permission.
  const jobsOf = async (who) => (await call('workspace', 'GET', '/', { cookie: await as(who) })).data.jobs.map((j) => j.job.id);
  assert.deepEqual(await jobsOf('NASSER'), [id], 'assigned laboratory work');
  assert.deepEqual(await jobsOf('RANJITH'), [], 'Normal User with no assignment');
  ws = (await call('workspace', 'GET', '/', { cookie: ma })).data;
  const policy = JSON.parse(ws.records['vaps-authorization-v1']); policy.companyOverview = [...policy.companyOverview, 'RANJITH'];
  await put('vaps-authorization-v1', policy);
  assert.deepEqual(await jobsOf('RANJITH'), [], 'company overview has no effect for a Normal User');
  // The Administrator makes Ranjith a Super User: the configured permission now applies. Then back to Normal.
  await put('vaps-access-roles-v1', { superUsers: ['SALIM', 'SHEREIQI', 'WILFRED', 'BAHRI', 'RANJITH'] });
  assert.deepEqual(await jobsOf('RANJITH'), [id]);
  await put('vaps-access-roles-v1', { superUsers: ['SALIM', 'SHEREIQI', 'WILFRED', 'BAHRI'] });
  assert.deepEqual(await jobsOf('RANJITH'), []);
  assert.equal((await call('record', 'PUT', '/', { cookie: ma, params: { key: 'vaps-access-roles-v1' }, json: { value: JSON.stringify({ superUsers: ['MA001'] }), revision: ws.revisions['vaps-access-roles-v1'] + 2 } })).status, 400, 'the Administrator is not a Super User entry');
  // Workbook access remains a separate, Super User permission (Ahmed Al Shereiqi by default).
  const dlFile = current.operations.activities.find((a) => a.id === dl.id).files.at(-1);
  assert.equal((await call('file', 'GET', '/', { cookie: await as('SHEREIQI'), params: { id: dlFile.id } })).status, 200);
  assert.equal((await call('file', 'GET', '/', { cookie: await as('WILFRED'), params: { id: dlFile.id } })).status, 403);
  // Account audit: invitations, activations and role changes are recorded; no tokens or passwords.
  const audit = await DB.prepare("SELECT action, detail FROM audit_log WHERE action IN ('account.invited', 'account.activated') OR record_id = 'vaps-access-roles-v1'").all();
  assert.ok(audit.results.some((a) => a.action === 'account.invited') && audit.results.some((a) => a.action === 'account.activated') && audit.results.some((a) => a.action === 'setting.saved'));
  for (const p of Object.values(passwords)) assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE instr(detail, ?) > 0').bind(p).first()).n, 0);
});

test('Normal User as QC reviewer: opens only the job that awaits their QC; unrelated jobs stay closed in the list, by direct request and for files', async () => {
  const ma = await as('MA001');
  // Demo jobs as if imported: job 003 has a workbook awaiting QC; the others do not. Their files exist in storage.
  const files = [];
  const demo = await api.buildDemoJobs(async (name, content) => { const f = { id: crypto.randomUUID(), name, size: content.length, type: 'text/csv' }; files.push({ ...f, content }); return f; }, new Date());
  for (const j of demo) await DB.prepare("INSERT INTO jobs (id, job_number, payload, revision, trashed, updated_by, updated_at) VALUES (?, ?, ?, 1, 0, 'test', ?)").bind(j.id, j.jobNumber, JSON.stringify(j), new Date().toISOString()).run();
  for (const f of files) { await globalThis.__vapsTestEnv.FILES.put(f.id, f.content); await DB.prepare("INSERT INTO files (id, name, size, type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, 'test', ?)").bind(f.id, f.name, f.size, f.type, new Date().toISOString()).run(); }
  // Ahad (Normal User) is the assigned QC reviewer.
  let ws = (await call('workspace', 'GET', '/', { cookie: ma })).data;
  const roles = JSON.parse(ws.records['vaps-responsibilities-v1']);
  assert.equal((await call('record', 'PUT', '/', { cookie: ma, params: { key: 'vaps-responsibilities-v1' }, json: { value: JSON.stringify({ ...roles, qcReviewer: 'AHAD' }), revision: ws.revisions['vaps-responsibilities-v1'] } })).status, 200);
  assert.equal((await invite(ma, 'AHAD')).status, 200); await activate('AHAD');
  const ahad = await as('AHAD');
  const byId = Object.fromEntries(demo.map((j) => [j.id, j]));
  const awaiting = demo.filter((j) => j.operations?.activities.some((a) => a.status === 'Awaiting QC')).map((j) => j.id);
  assert.deepEqual(awaiting, ['OM-X-26-003']);
  // Job list: only the job that requires his QC action (Ahad has no direct assignment on any job).
  ws = (await call('workspace', 'GET', '/', { cookie: ahad })).data;
  assert.equal(ws.records['vaps-access-roles-v1'] ? JSON.parse(ws.records['vaps-access-roles-v1']).superUsers.includes('AHAD') : false, false, 'Normal User');
  assert.deepEqual(ws.jobs.map((j) => j.job.id), ['OM-X-26-003']);
  // Direct requests to an unrelated job are refused, whatever the action.
  const job6 = byId['OM-X-26-006'];
  const direct = await call('operations', 'POST', '/', { cookie: ahad, params: { id: job6.id }, json: { commands: [{ type: 'request-addition', title: 'Probe', reason: 'Probe', destination: 'PVT' }], revision: 1 } });
  assert.equal(direct.status, 403);
  assert.equal((await call('job', 'PUT', '/', { cookie: ahad, params: { id: job6.id }, json: { job: job6, revision: 1 } })).status, 403);
  // Files: an unrelated job's report document is refused; the QC job's report document opens (job access, not workbook permission).
  const reportFile = (j) => j.operations.samplingReports.at(-1)?.file?.id;
  // A file referenced only by jobs he cannot open (job 004's final report; the demo G-sheet is shared with job 003).
  const isolated = files.find((f) => !JSON.stringify(byId['OM-X-26-003']).includes(f.id) && !f.name.endsWith('.csv') && demo.some((j) => JSON.stringify(j).includes(f.id)));
  assert.ok(isolated, 'a report document referenced only by other jobs'); const finalReport = isolated.id;
  assert.equal((await call('file', 'GET', '/', { cookie: ahad, params: { id: finalReport } })).status, 403, 'file of an unrelated job');
  assert.equal((await call('file', 'GET', '/', { cookie: await as('WILFRED'), params: { id: finalReport } })).status, 200, 'the same file opens for a Super User with access to that job');
  assert.equal((await call('file', 'GET', '/', { cookie: ahad, params: { id: reportFile(byId['OM-X-26-003']) } })).status, 200);
  // He performs the QC review on the server as himself.
  const pending = byId['OM-X-26-003'].operations.activities.find((a) => a.status === 'Awaiting QC');
  const qc = await call('operations', 'POST', '/', { cookie: ahad, params: { id: 'OM-X-26-003' }, json: { commands: [{ type: 'qc-review', id: pending.id, decision: 'approve', target: '', comments: '' }], revision: 1 } });
  assert.equal(qc.status, 200, JSON.stringify(qc.data));
  assert.equal(qc.data.job.operations.activities.find((a) => a.id === pending.id).qcApprovedBy ?? qc.data.job.operations.activities.find((a) => a.id === pending.id).files.at(-1).qcApprovedBy, 'AHAD');
  // Once nothing awaits his action, the job closes for him again (no direct assignment).
  assert.deepEqual((await call('workspace', 'GET', '/', { cookie: ahad })).data.jobs.map((j) => j.job.id), []);
  // Super Users keep their configured duty access (Wilfred, PVT Supervisor and final approval, sees job 003).
  assert.ok((await call('workspace', 'GET', '/', { cookie: await as('WILFRED') })).data.jobs.some((j) => j.job.id === 'OM-X-26-003'));
  // Restore the agreed QC reviewer.
  ws = (await call('workspace', 'GET', '/', { cookie: ma })).data;
  assert.equal((await call('record', 'PUT', '/', { cookie: ma, params: { key: 'vaps-responsibilities-v1' }, json: { value: JSON.stringify({ ...roles, qcReviewer: 'WILFRED' }), revision: ws.revisions['vaps-responsibilities-v1'] } })).status, 200);
});

test('Normal Users keep direct assignments: engineers, backups and drivers open their jobs only', async () => {
  const jobsOf = async (who) => (await call('workspace', 'GET', '/', { cookie: await as(who) })).data.jobs.map((j) => j.job.id).sort();
  const ali = await jobsOf('ALI'), mohsin = await jobsOf('MOHSIN'), husseini = await jobsOf('HUSSEINI'), nasser = await jobsOf('NASSER');
  for (const [who, list] of [['ALI', ali], ['MOHSIN', mohsin], ['HUSSEINI', husseini], ['NASSER', nasser]]) {
    const all = (await DB.prepare('SELECT payload FROM jobs').all()).results.map((r) => JSON.parse(r.payload));
    const expected = all.filter((j) => !j.trash && (j.assignedDriverId === who || j.assignedEngineerId === who || (j.samplingTeamIds || []).includes(who) || (j.operations?.activities || []).some((a) => a.owner === who))).map((j) => j.id).sort();
    for (const id of expected) assert.ok(list.includes(id), `${who} keeps assigned job ${id}`);
    for (const id of list) assert.ok(expected.includes(id) || id === 'OM-X-26-003', `${who} sees only assigned jobs (got ${id})`);
  }
});

test.after(async () => { await mf.dispose(); });
