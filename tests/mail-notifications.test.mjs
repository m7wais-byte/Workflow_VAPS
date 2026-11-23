// Email through Microsoft Graph (as bsg@visionaps.com would send it): invitations, employee workflow notifications and
// client notifications, through the real Sites API route handlers against a local D1 + R2 (Miniflare).
// Microsoft identity and Graph sendMail are replaced by an in-memory stand-in: nothing is sent. The sender is the real,
// fixed mailbox (the app refuses any other); every recipient is an example address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSitesApi } from './fixtures/sites-api.mjs';

const SENDER = 'bsg@visionaps.com';
const ENV = {
  MAIL_PROVIDER: 'graph', GRAPH_TENANT_ID: '00000000-0000-0000-0000-0000000000cc', GRAPH_CLIENT_ID: '00000000-0000-0000-0000-0000000000dd', GRAPH_CLIENT_SECRET: 'sample-client-secret-for-tests',
  MAIL_SENDER: SENDER, APP_ORIGIN: 'https://vaps.example', INVITE_TTL_HOURS: '72',
  NOTIFY_STAFF: 'assignment,review,returned', NOTIFY_CLIENT: 'sampling-report,interim,final-report',
  // Test mailboxes only. RANJITH's address is left out on purpose: it must be blocked, not sent.
  MAIL_ALLOWED_RECIPIENTS: '',
};
const emailOf = (id) => id.toLowerCase() + '@vaps.example.test';
const STAFF = ['SALIM', 'SHEREIQI', 'BAHRI', 'WILFRED', 'MOHSIN', 'HUSSEINI', 'ALI', 'NASSER', 'YAQEEN'];
ENV.MAIL_ALLOWED_RECIPIENTS = [...STAFF.map(emailOf), 'client.contact@client.example.test'].join(', ');

/* ---------- In-memory Microsoft identity + Graph sendMail ---------- */
// down: 503 (refused before processing). unsure: 'timeout' (no answer) or a status such as 504: Microsoft may have sent it.
const graph = { sent: [], tokens: 0, down: false, unsure: null, calls: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.hostname === 'login.microsoftonline.com') {
    const form = new URLSearchParams(String(init.body));
    assert.equal(url.pathname, `/${ENV.GRAPH_TENANT_ID}/oauth2/v2.0/token`);
    assert.deepEqual([form.get('grant_type'), form.get('scope'), form.get('client_id'), form.get('client_secret')], ['client_credentials', 'https://graph.microsoft.com/.default', ENV.GRAPH_CLIENT_ID, ENV.GRAPH_CLIENT_SECRET]);
    graph.tokens++; return json({ access_token: 'app-token-' + graph.tokens, expires_in: 3600 });
  }
  if (url.hostname !== 'graph.microsoft.com') return realFetch(input, init);
  graph.calls.push((init.method || 'GET') + ' ' + url.pathname);
  // Send only: the app never reads, lists or deletes mail.
  assert.equal(init.method, 'POST'); assert.equal(url.pathname, `/v1.0/users/${encodeURIComponent(SENDER)}/sendMail`);
  assert.match(init.headers.Authorization, /^Bearer app-token-\d+$/);
  if (graph.down) return json({ error: { code: 'ServiceUnavailable' } }, 503);
  const body = JSON.parse(init.body);
  if (graph.unsure) {
    // The worst case: Microsoft accepted and delivered the message, but the app never learned it.
    graph.sent.push({ to: body.message.toRecipients[0].emailAddress.address, subject: body.message.subject, html: body.message.body.content, unsure: true });
    if (graph.unsure === 'timeout') throw new TypeError('network connection lost');
    return json({ error: { code: 'GatewayTimeout' } }, graph.unsure);
  }
  assert.equal(body.message.toRecipients.length, 1, 'one recipient per message');
  graph.sent.push({ to: body.message.toRecipients[0].emailAddress.address, subject: body.message.subject, html: body.message.body.content });
  return new Response(null, { status: 202 });
};

const { mf, DB, api, call } = await startSitesApi({
  login: 'app/api/auth/login/route.ts', password: 'app/api/auth/password/route.ts', invitation: 'app/api/auth/invitation/route.ts', invite: 'app/api/admin/invitations/route.ts',
  workspace: 'app/api/workspace/route.ts', record: 'app/api/workspace/records/[key]/route.ts', job: 'app/api/jobs/[id]/route.ts', operations: 'app/api/jobs/[id]/operations/route.ts', files: 'app/api/files/route.ts',
  mail: 'app/api/admin/mail/route.ts',
}, [
  'export * as auth from "./server/auth.ts";', 'export * as notify from "./server/notify.ts";', 'export * as mailer from "./server/mail.ts";', 'export { defaultResponsibilities } from "./app/authorization.ts";', 'export { demoConfiguration } from "./app/demo-data.ts";',
  'export { defaultFieldData } from "./app/sample-defaults.ts";', 'export { cylinderCatalog } from "./app/cylinder-catalog.ts";',
].join('\n'), ENV);
const env = globalThis.__vapsTestEnv;

const cookieOf = (c) => c.split(';')[0];
const passwords = {};
const signIn = async (name, password) => { const r = await call('login', 'POST', '/', { json: { username: name, password } }); assert.equal(r.status, 200, name + ' ' + JSON.stringify(r.data)); return cookieOf(r.setCookie); };
const as = async (id) => signIn(id, passwords[id]);
const invite = (cookie, employeeId, email = emailOf(employeeId)) => call('invite', 'POST', '/', { cookie, json: { employeeId, email } });
const lastTo = (to) => graph.sent.filter((m) => m.to === to).at(-1);
async function activate(employeeId) {
  const token = /#invite=([a-f0-9]{64})/.exec(lastTo(emailOf(employeeId)).html)[1];
  passwords[employeeId] = 'Mail test passphrase number ' + (Object.keys(passwords).length + 1) + ' of the run';
  const r = await call('invitation', 'POST', '/', { json: { action: 'accept', token, password: passwords[employeeId] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // The link works once.
  assert.notEqual((await call('invitation', 'POST', '/', { json: { action: 'accept', token, password: 'Another passphrase for reuse' } })).status, 200);
}
const boot = await api.auth.createAccount(DB, { accountId: 'bootstrap', employeeId: 'MA001' }, { username: 'ma001', employeeId: 'MA001' }, () => true);
{ const c = await signIn('ma001', boot.temporaryPassword); passwords.MA001 = 'Administrator mail test passphrase'; assert.equal((await call('password', 'POST', '/', { cookie: c, json: { currentPassword: boot.temporaryPassword, newPassword: passwords.MA001 } })).status, 200); }
const rows = async () => (await DB.prepare('SELECT * FROM mail_outbox ORDER BY created_at, rowid').all()).results;

test('invitation through Graph from the configured mailbox; the link points at APP_ORIGIN and works once; nothing stored', async () => {
  const ma = await as('MA001');
  for (const id of STAFF) { const r = await invite(ma, id); assert.equal(r.status, 200, id + JSON.stringify(r.data)); assert.equal(r.data.mail, 'graph'); assert.equal(r.data.testLink, undefined); await activate(id); }
  const m = lastTo(emailOf('SALIM'));
  assert.match(m.html, /href="https:\/\/vaps\.example\/#invite=[a-f0-9]{64}"/);
  const inv = (await rows()).filter((r) => r.audience === 'invite');
  assert.equal(inv.length, STAFF.length); assert.ok(inv.every((r) => r.status === 'sent' && r.text_body === null && r.html_body === null), 'the one-time link is never stored');
  assert.equal(graph.tokens, 1, 'the app token is reused');
});

test('a recipient outside MAIL_ALLOWED_RECIPIENTS is blocked: no invitation, no account, nothing sent', async () => {
  const before = graph.sent.length;
  const r = await invite(await as('MA001'), 'RANJITH');
  assert.equal(r.status, 403); assert.match(r.data.error, /not on the server's list of allowed recipients/);
  assert.equal(graph.sent.length, before);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM invitations i JOIN accounts a ON a.id = i.account_id WHERE a.employee_id = 'RANJITH'").first()).n, 0);
});

test('full workflow: each newly assigned action and review is emailed once to that employee; client gets approved milestones only', async () => {
  const ma = await as('MA001');
  let ws = (await call('workspace', 'GET', '/', { cookie: ma })).data;
  const put = async (key, value) => { const r = await call('record', 'PUT', '/', { cookie: ma, params: { key }, json: { value: JSON.stringify(value), revision: ws.revisions[key] ?? 0 } }); assert.equal(r.status, 200, key + JSON.stringify(r.data)); ws = (await call('workspace', 'GET', '/', { cookie: ma })).data; };
  await put('vaps-responsibilities-v1', { ...api.defaultResponsibilities, ...api.demoConfiguration.roles });
  await put('vaps-lab-teams-v1', api.demoConfiguration.teams);
  const sentBefore = graph.sent.length;
  // 1. Coordinator (Salim, Super User) creates the job and sends it to Sampling in one step.
  const salim = await as('SALIM');
  const at = new Date().toISOString(), day = at.slice(0, 10);
  const cyl = api.cylinderCatalog.find((b) => b.type === 'PDS');
  const sample = { id: '1.01', sampler: '', bottle: cyl.type, samplerSerial: '', bottleSerial: cyl.serial, bottleCapacity: cyl.capacity, calibrationStatus: 'Passed', pressureTestStatus: 'Passed', equipmentCondition: 'Good', preparedBy: 'SALIM', preparedAt: at, preparationRemarks: '', fieldData: { ...api.defaultFieldData(), sampleNature: 'WHS' }, dataComplete: false, dataCompletedBy: '', dataCompletedAt: '', pressure: '', temperature: '', depth: '', notes: '' };
  const id = 'OM-P-26-301';
  const job = { id, globalSequence: 301, jobNumber: id, clientCode: 'P', clientName: 'PDO', countryCode: 'OM', dateReceived: day, description: 'Email notification test job (test data).', clientFocalPoint: 'Test Contact', clientFocalPointEmail: 'client.contact@client.example.test', clientReference: 'PO-TEST-77', samplingInstructions: 'Test instructions.', samplingSource: 'Wellhead Sampling', well: 'TEST-WH-1', requiredTests: ['Black Oil — DL', 'Others — Water Analysis'], assignedEngineerId: 'MOHSIN', samplingTeamIds: ['HUSSEINI'], assignedDriverId: 'ALI', samples: [sample], stages: [], events: [], status: 'Job Created', currentStage: 'Sampling Preparation', nextAction: 'Start', ownerId: 'SALIM', responsibleId: 'MOHSIN', jobResponsibleId: 'SALIM', createdById: 'SALIM', createdAt: at, lastUpdatedById: 'SALIM', lastUpdatedAt: at, dueDate: day };
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
  await refused('NASSER', [{ type: 'client-disposal', note: '' }]);
  await step('SALIM', [{ type: 'client-disposal', note: 'Client approved (test).' }]);
  await step('SALIM', [{ type: 'release-cylinders', note: '', assignee: 'MOHSIN' }]);
  globalThis.__flow = { id, current, rev, job };
  const staff = (await rows()).filter((r) => r.audience === 'staff'), client = (await rows()).filter((r) => r.audience === 'client');
  const to = (e) => staff.filter((r) => r.employee_id === e);
  // The assigned employee, reviewers and approvers each got their action, with the right Job ID and a dashboard link.
  assert.ok(to('MOHSIN').some((r) => r.event === 'assignment'), 'accountable engineer: assignment on dispatch');
  assert.ok(to('HUSSEINI').some((r) => r.event === 'review'), 'backup engineer: sampling data review');
  assert.ok(to('SALIM').some((r) => r.event === 'review'), 'sampling approver: report awaiting approval');
  assert.ok(to('NASSER').some((r) => r.event === 'assignment') && to('YAQEEN').some((r) => r.event === 'assignment'), 'lab engineers: test assignment');
  assert.ok(to('SHEREIQI').some((r) => r.event === 'review') && to('WILFRED').some((r) => r.event === 'review'), 'team lead and QC: awaiting review');
  for (const r of staff) {
    assert.equal(r.status, 'sent', JSON.stringify(r)); assert.equal(r.job_id, id); assert.equal(r.recipient, emailOf(r.employee_id));
    assert.ok(r.subject.startsWith(`[${id}] `), r.subject);
    assert.ok(r.html_body.includes(`href="https://vaps.example/#workflow/${id}/overview"`));
  }
  const nasser = graph.sent.find((m) => m.to === emailOf('NASSER') && /Assigned to you/.test(m.subject));
  assert.match(nasser.html, /Black Oil — DL/); assert.match(nasser.html, new RegExp(id));
  // Nobody is emailed about their own step: SALIM dispatched, so no SALIM row for the dispatch revision.
  const keys = staff.map((r) => r.dedupe_key); assert.equal(new Set(keys).size, keys.length);
  // Client: sampling report approved and final report approved, to the job's client contact only.
  assert.deepEqual(client.map((r) => [r.event, r.recipient, r.status]), [['sampling-report', 'client.contact@client.example.test', 'sent'], ['final-report', 'client.contact@client.example.test', 'sent']]);
  for (const r of client) {
    for (const name of ['Salim', 'Mohsin', 'Husseini', 'Wilfred', 'Shereiqi', 'Nasser', 'Yaqeen', 'Bahri', 'Ali', 'Test sampling report', 'Test final report', 'G-sheet', 'Run DL', 'QC', 'workbook', 'Workbook', 'vaps.example.test', '#workflow', 'Client approved (test)'])
      assert.ok(!r.html_body.includes(name) && !r.text_body.includes(name), `client email contains internal text "${name}"`);
    assert.match(r.text_body, /PO-TEST-77/); assert.match(r.subject, new RegExp(id));
  }
  assert.equal(graph.sent.length - sentBefore, staff.length + client.length, 'every send is in the log');
});

test('a retried workflow action never sends twice', async () => {
  const { id, rev } = globalThis.__flow;
  const before = (await rows()).length, sent = graph.sent.length;
  // The same request again with the revision it was sent with: refused before anything is queued.
  const stale = await call('operations', 'POST', '/', { cookie: await as('SALIM'), params: { id }, json: { commands: [{ type: 'release-cylinders', note: '', assignee: 'MOHSIN' }], revision: rev - 1 } });
  assert.equal(stale.status, 409);
  assert.equal((await rows()).length, before); assert.equal(graph.sent.length, sent);
  // The same message key twice (a repeated save, or a second worker running the same step): queued and sent once.
  const q = { dedupeKey: 'staff:review:SALIM:test-key:' + id + ':r999', audience: 'staff', event: 'review', jobId: id, employeeId: 'SALIM', mail: { to: emailOf('SALIM'), subject: 'Once', text: 'Once', html: '<p>Once</p>' } };
  const [a, b] = await Promise.all([api.notify.deliver(env, DB, q), api.notify.deliver(env, DB, q)]);
  assert.equal(a.id, b.id); assert.equal(graph.sent.filter((m) => m.subject === 'Once').length, 1);
  const dump = await rows();
  console.log('--- staff sample ---\n' + dump.find((r) => r.employee_id === 'NASSER' && r.event === 'assignment').text_body);
  console.log('--- client sample ---\n' + dump.find((r) => r.event === 'final-report').subject + '\n' + dump.find((r) => r.event === 'final-report').text_body);
});

test('Graph down: the save still succeeds, the failure is logged, MA001 retries once; a sent message is never re-sent', async () => {
  const ma = await as('MA001');
  // A fresh job dispatched while Graph is unavailable.
  const nid = 'OM-P-26-302';
  const job = { ...globalThis.__flow.job, id: nid, jobNumber: nid, globalSequence: 302 };
  graph.down = true;
  const r = await call('job', 'PUT', '/', { cookie: await as('SALIM'), params: { id: nid }, json: { job, revision: 0, commands: [{ type: 'dispatch', engineer: 'MOHSIN', driver: 'ALI', team: ['HUSSEINI'] }] } });
  graph.down = false;
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.ok(r.data.job.operations.dispatchedAt, 'the workflow change is saved');
  assert.ok(r.data.mail.failed >= 1);
  const failed = (await rows()).find((x) => x.job_id === nid && x.employee_id === 'MOHSIN');
  assert.equal(failed.status, 'failed'); assert.match(failed.last_error, /Microsoft 365 refused the email \(503\)/);
  // The log is MA001's only.
  assert.equal((await call('mail', 'GET', '/', { cookie: await as('SALIM') })).status, 403);
  const log = (await call('mail', 'GET', '/', { cookie: ma })).data;
  assert.deepEqual(log.config, { provider: 'graph', sender: SENDER, dashboard: 'https://vaps.example', allowedRecipients: ENV.MAIL_ALLOWED_RECIPIENTS.split(', '), staffEvents: ['assignment', 'review', 'returned'], clientEvents: ['sampling-report', 'interim', 'final-report'] });
  assert.ok(!JSON.stringify(log).includes(ENV.GRAPH_CLIENT_SECRET) && !JSON.stringify(log).includes('#invite='), 'no secret or invitation link in the log');
  const sent = graph.sent.length;
  const retried = await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: failed.id } });
  assert.equal(retried.status, 200); assert.equal(retried.data.status, 'sent'); assert.equal(retried.data.attempts, 2);
  assert.equal(graph.sent.length, sent + 1);
  const again = await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: failed.id } });
  assert.equal(again.data.status, 'sent'); assert.equal(graph.sent.length, sent + 1, 'already sent: not sent again');
});

test('a send interrupted mid-way ("sending") is retryable by MA001 only once stale and after confirming Sent Items were checked; sent once', async () => {
  const ma = await as('MA001');
  const failed = (await rows()).find((x) => x.status === 'sent' && x.audience === 'staff');
  const at = new Date().toISOString();
  // Simulate a worker that stopped after claiming the row: a fresh "sending" row is left alone.
  await DB.prepare("UPDATE mail_outbox SET status = 'sending', sent_at = NULL, updated_at = ? WHERE id = ?").bind(at, failed.id).run();
  const sent = graph.sent.length;
  const fresh = await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: failed.id } });
  assert.equal(fresh.data.status, 'sending'); assert.equal(graph.sent.length, sent, 'a send still in progress is not repeated');
  const old = new Date(Date.now() - api.notify.STALE_SENDING_MS - 60_000).toISOString();
  await DB.prepare('UPDATE mail_outbox SET updated_at = ? WHERE id = ?').bind(old, failed.id).run();
  // Stale: refused until MA001 confirms the sender's Sent Items were checked.
  const unchecked = await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: failed.id } });
  assert.equal(unchecked.status, 409); assert.match(unchecked.data.error, new RegExp('Sent Items of ' + SENDER)); assert.equal(graph.sent.length, sent);
  const r = await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: failed.id, sentItemsChecked: true } });
  assert.equal(r.status, 200); assert.equal(r.data.status, 'sent'); assert.equal(graph.sent.length, sent + 1);
  const again = await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: failed.id, sentItemsChecked: true } });
  assert.equal(again.data.status, 'sent'); assert.equal(graph.sent.length, sent + 1, 'sent once');
});

test('outcome unknown (timeout or 504): recorded "uncertain", never re-sent by a repeat; retry needs the Sent Items check, which is audited', async () => {
  const ma = await as('MA001');
  for (const mode of ['timeout', 504]) {
    const key = 'staff:review:SALIM:unsure-' + mode + ':' + globalThis.__flow.id + ':r1';
    const q = { dedupeKey: key, audience: 'staff', event: 'review', jobId: globalThis.__flow.id, employeeId: 'SALIM', mail: { to: emailOf('SALIM'), subject: 'Unsure ' + mode, text: 'Unsure', html: '<p>Unsure</p>' } };
    graph.unsure = mode;
    const first = await api.notify.deliver(env, DB, q);
    graph.unsure = null;
    assert.equal(first.status, 'uncertain', String(mode)); assert.match(first.last_error, /not known whether the email was sent/);
    const count = () => graph.sent.filter((m) => m.subject === 'Unsure ' + mode).length;
    assert.equal(count(), 1);
    // A repeated save producing the same message: not queued or sent again.
    const repeat = await api.notify.deliver(env, DB, q);
    assert.equal(repeat.id, first.id); assert.equal(repeat.status, 'uncertain'); assert.equal(count(), 1);
    // The log tells MA001 to check Sent Items; a plain retry is refused and sends nothing.
    const listed = (await call('mail', 'GET', '/', { cookie: ma })).data.messages.find((m) => m.id === first.id);
    assert.equal(listed.next, 'check-sent-items'); assert.equal(listed.status, 'uncertain');
    const plain = await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: first.id } });
    assert.equal(plain.status, 409); assert.match(plain.data.error, /Sent Items of bsg@visionaps\.com/); assert.equal(count(), 1);
    assert.equal((await call('mail', 'POST', '/', { cookie: await as('SALIM'), json: { action: 'retry', id: first.id, sentItemsChecked: true } })).status, 403, 'MA001 only');
    // After the confirmed check: sent once more, never again.
    const ok = await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: first.id, sentItemsChecked: true } });
    assert.equal(ok.status, 200); assert.equal(ok.data.status, 'sent'); assert.equal(count(), 2);
    assert.equal((await call('mail', 'POST', '/', { cookie: ma, json: { action: 'retry', id: first.id, sentItemsChecked: true } })).data.status, 'sent'); assert.equal(count(), 2);
    const audits = (await DB.prepare("SELECT action, actor_id, detail FROM audit_log WHERE record_id = ? ORDER BY id").bind(first.id).all()).results;
    const confirmed = audits.filter((a) => a.action === 'mail.sent_items_confirmed');
    assert.equal(confirmed.length, 1, 'the confirmation is audited once, before the send'); assert.equal(confirmed[0].actor_id, 'MA001');
    assert.deepEqual(JSON.parse(confirmed[0].detail).previousStatus, 'uncertain');
    assert.ok(audits.findIndex((a) => a.action === 'mail.sent_items_confirmed') < audits.findIndex((a) => a.action === 'mail.retried'));
  }
});

test('an invitation whose send outcome is unknown is cancelled: its link never works and nothing is re-sent', async () => {
  const ma = await as('MA001');
  // Not on the allowed list: refused before anything is sent.
  const sentBefore = graph.sent.length;
  assert.equal((await invite(ma, 'RANJITH')).status, 403); assert.equal(graph.sent.length, sentBefore);
  env.MAIL_ALLOWED_RECIPIENTS += ', ranjith@vaps.example.test';
  try {
    const before = graph.sent.length;
    graph.unsure = 504;
    const u = await invite(ma, 'RANJITH');
    graph.unsure = null;
    assert.equal(u.status, 502); assert.match(u.data.error, /did not confirm the invitation email\. The invitation was cancelled/);
    assert.equal(graph.sent.length, before + 1);
    const token = /#invite=([a-f0-9]{64})/.exec(graph.sent.at(-1).html)[1];
    assert.notEqual((await call('invitation', 'POST', '/', { json: { action: 'accept', token, password: 'A passphrase for the cancelled link' } })).status, 200, 'the cancelled link does not work');
    const row = (await rows()).filter((x) => x.audience === 'invite' && x.recipient === 'ranjith@vaps.example.test').at(-1);
    assert.equal(row.status, 'uncertain'); assert.equal(row.html_body, null);
    const log = (await call('mail', 'GET', '/', { cookie: ma })).data.messages.find((m) => m.id === row.id);
    assert.equal(log.next, null, 'invitations are re-sent only as a new invitation');
    assert.equal(graph.sent.length, before + 1);
  } finally { env.MAIL_ALLOWED_RECIPIENTS = ENV.MAIL_ALLOWED_RECIPIENTS; }
});

test('the sender is fixed to bsg@visionaps.com; email is off until every Graph setting is present', async () => {
  const { mailerFrom, graphConfig } = api.mailer;
  const base = { MAIL_PROVIDER: 'graph', GRAPH_TENANT_ID: ENV.GRAPH_TENANT_ID, GRAPH_CLIENT_ID: ENV.GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET: 'x' };
  assert.equal(mailerFrom({ ...base, MAIL_SENDER: 'BSG@visionaps.com' }).mode, 'graph');
  assert.equal(graphConfig(base).sender, 'bsg@visionaps.com');
  assert.equal(mailerFrom({ ...base, MAIL_SENDER: 'someone.else@visionaps.com' }), null);
  assert.equal(mailerFrom({}), null);
  for (const missing of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) assert.equal(mailerFrom({ ...base, [missing]: '' }), null, missing);
  assert.equal(mailerFrom({ ...base, GRAPH_TENANT_ID: 'common' }), null);
});

test('notifications are off unless configured; staff and client switches are independent', async () => {
  const saved = { staff: env.NOTIFY_STAFF, client: env.NOTIFY_CLIENT };
  try {
    delete env.NOTIFY_STAFF; delete env.NOTIFY_CLIENT;
    assert.equal(api.notify.staffEvents(env).size, 0); assert.equal(api.notify.clientEvents(env).size, 0);
    env.NOTIFY_STAFF = 'assignment, unknown'; assert.deepEqual([...api.notify.staffEvents(env)], ['assignment']);
    env.NOTIFY_CLIENT = 'final-report'; assert.deepEqual([...api.notify.clientEvents(env)], ['final-report']);
  } finally { env.NOTIFY_STAFF = saved.staff; env.NOTIFY_CLIENT = saved.client; }
});

test.after(async () => { globalThis.fetch = realFetch; await mf.dispose(); });
