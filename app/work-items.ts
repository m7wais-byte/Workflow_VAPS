import type { JobRecord } from './page';
import { operationsFor, samplingStatus, latestData, latest, labStatus, isDraft, canSeeDraft, samplingTeam, samplingApproved, finalReady, testsAwaitingQcApproval, actorRoles, hasAccess, streamLead, type Actor, type ActivityRecord, type Stream } from './operations-model';
import { containerLabel } from './sample-container';
import type { Responsibilities } from './authorization';

/**
 * Personal dashboard items, derived from the same workflow states the Jobs, Sampling and PVT Lab pages use
 * (samplingStatus, labStatus, report and handover records). No separate status engine.
 */
export type ItemKind = 'returned' | 'review' | 'assignment' | 'task';
export type WorkItem = {
  key: string; kind: ItemKind; action: string; jobId: string; jobNumber: string; client: string;
  sample?: string; container?: string; test?: string; stream?: Stream; status: string; due?: string; overdue: boolean;
  from?: string; fromLabel?: string; comment?: string; /** Seen markers shared with the Sampling and PVT Lab pages. */events: string[];
  /** Short name for the button that opens this action. */button: string;
  open: { tab: string } | { editor: 'type' | 'bottomhole' | 'report' | 'job'; sample?: string };
};
export type Setting = 'teams' | 'labReceipt' | 'qcReviewer' | 'samplingApproval' | 'scopeSelector' | 'routing' | 'finalApproval';
export type WaitingItem = {
  key: string; jobId: string; jobNumber: string; client: string; what: string; waitingOn: string; since?: string; open: { tab: string };
  /** Headline when "Waiting on {waitingOn}" does not read well, e.g. work this employee returned. */label?: string;
  sample?: string; test?: string; comment?: string; commentLabel?: string;
  /** Set when the next holder is a missing setting: the work cannot move until it is configured. */blocked?: Setting;
};
export type BlockedItem = { key: string; setting: Setting; what: string; jobs: string[] };

/** Sampling seen-marker keys (same format as the Sampling page). */
export function samplingEvents(job: JobRecord, me: string, approver: string): string[] {
  const data = latestData(job), report = latest(job.operations?.samplingReports || []), events: string[] = [];
  if (samplingTeam(job).includes(me) && job.operations?.dispatchedAt) events.push(`assign:${job.id}:${job.operations.dispatchedAt}`);
  if (data?.status === 'Returned' && samplingTeam(job).includes(me)) events.push(`return:${job.id}:${data.version}`);
  if (data?.status === 'Submitted' && approver === me) events.push(`review:${job.id}:${data.version}`);
  if (report?.status === 'Awaiting Approval' && approver === me) events.push(`report:${job.id}:${report.version}`);
  return events;
}
/** Laboratory seen-marker keys (same format as the PVT Lab page). */
export function labEvents(a: ActivityRecord, me: string, lead: string, qc: string): string[] {
  const v = a.files.length, events: string[] = [];
  const assignedAt = [...(a.history || [])].reverse().find((h) => h.to === me)?.at || a.start;
  if (a.owner === me && a.status !== 'Completed') events.push(`lab:assign:${a.id}:${assignedAt}`);
  if (a.owner === me && a.status === 'Changes Requested') events.push(`lab:return:${a.id}:${v}`);
  if (lead === me && a.status === 'Workbook Submitted') events.push(`lab:review:${a.id}:${v}`);
  if (lead === me && a.status === 'QC Returned') events.push(`lab:qcret:${a.id}:${v}`);
  if (qc === me && a.status === 'Awaiting QC') events.push(`lab:qc:${a.id}:${v}`);
  return events;
}
/** The sampling step that matches the job's current sampling status. */
export function samplingStage(job: JobRecord, roles?: Responsibilities): 'type' | 'bottomhole' | 'report' {
  const status = samplingStatus(job, roles);
  if (status.key === 'preparation') return 'type';
  if (status.key === 'returned' && status.tab === 'sampling') { const first = latestData(job)?.comments[0]?.target || ''; return first === 'preparation' || first === 'job' ? 'type' : 'bottomhole'; }
  if (status.key === 'data') return job.samples?.length && job.samples.every((s) => s.dataComplete) ? 'report' : 'bottomhole';
  return 'report';
}
const rank: Record<ItemKind, number> = { returned: 0, review: 2, assignment: 3, task: 4 };
/** Returned work first, then overdue, reviews, new assignments, everything else; earliest due date breaks ties. */
export const sortItems = (items: WorkItem[], isNew: (i: WorkItem) => boolean) => [...items].sort((a, b) => {
  const score = (i: WorkItem) => i.kind === 'returned' ? 0 : i.overdue ? 1 : i.kind === 'review' ? 2 : isNew(i) ? 3 : rank[i.kind] + 1;
  return score(a) - score(b) || (a.due || '9999').localeCompare(b.due || '9999') || a.jobNumber.localeCompare(b.jobNumber);
});

export function workItems(jobs: JobRecord[], actor: Actor, today: string) {
  const roles = actorRoles(actor), me = actor.id, name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'Not assigned';
  const actions = new Map<string, WorkItem>(), waiting = new Map<string, WaitingItem>(), blocked = new Map<string, BlockedItem>();
  const add = (i: Omit<WorkItem, 'overdue'>) => { if (!actions.has(i.key)) actions.set(i.key, { ...i, overdue: !!i.due && i.due < today }); };
  const wait = (i: WaitingItem) => { if (!waiting.has(i.key)) waiting.set(i.key, i); };
  const block = (key: BlockedItem['setting'], what: string, job: JobRecord) => { const b = blocked.get(key) || { key, setting: key, what, jobs: [] }; if (!b.jobs.includes(job.jobNumber)) b.jobs.push(job.jobNumber); blocked.set(key, b); };
  for (const job of jobs) {
    if (!canSeeDraft(job, actor)) continue;
    const base = { jobId: job.id, jobNumber: job.jobNumber, client: job.clientName };
    if (isDraft(job)) {
      if ((me === job.createdById || hasAccess(actor, 'createJob')) && hasAccess(actor, 'createJob')) add({ ...base, button: 'Continue draft', key: `draft:${job.id}`, kind: 'task', action: 'Continue job draft and send to Sampling', status: 'Draft · not sent', due: job.dueDate || undefined, events: [], open: { editor: 'job' } });
      continue;
    }
    const o = operationsFor(job), st = samplingStatus(job, roles), data = latestData(job), report = latest(o.samplingReports);
    const team = samplingTeam(job), lead = job.assignedEngineerId, sEvents = samplingEvents(job, me, roles.samplingApproval);
    // Sampling
    if (team.includes(me) && hasAccess(actor, 'sampling') && st.team) {
      const accountable = me === lead, returned = st.key === 'returned';
      const action = returned ? (accountable ? 'Correct sampling data and resubmit' : 'Help correct returned sampling data') : st.key === 'preparation' ? (accountable ? 'Complete sampling preparation' : 'Help with sampling preparation') : st.next === 'Review and submit the sampling data' ? (accountable ? 'Review and submit sampling data' : 'Sampling data ready for submission') : (accountable ? 'Complete sampling data' : 'Help complete sampling data');
      if (!accountable && st.next === 'Review and submit the sampling data') wait({ ...base, key: `w-support:${job.id}`, what: 'Sampling data complete', waitingOn: name(lead) + ' (accountable) to submit', open: { tab: 'sampling' } });
      const button = returned ? 'Correct sampling data' : st.key === 'preparation' ? 'Open preparation' : st.next === 'Review and submit the sampling data' && accountable ? 'Review and submit' : 'Open sample sheets';
      if (accountable || st.next !== 'Review and submit the sampling data') add({ ...base, button, key: `sampling:${job.id}`, kind: returned ? 'returned' : sEvents.some((k) => k.startsWith('assign:')) ? 'assignment' : 'task', action: action + (accountable ? '' : ` (supporting · ${name(lead)} submits)`), status: st.label, due: job.dueDate || undefined, from: returned ? data?.reviewedBy : o.dispatchedBy, fromLabel: returned ? 'Returned by' : 'Assigned by', comment: returned ? [data?.general, ...(data?.comments || []).map((c) => `${c.label}: ${c.text}`)].filter(Boolean).join(' · ') : undefined, events: sEvents, open: { editor: samplingStage(job, roles) } });
    }
    if (st.owner === me && hasAccess(actor, 'sampling')) {
      if (st.key === 'data-review') add({ ...base, button: 'Review sampling data', key: `data-review:${job.id}`, kind: 'review', action: 'Review sampling data', status: st.label, due: job.dueDate || undefined, from: data?.submittedBy, fromLabel: 'Submitted by', events: sEvents, open: { tab: 'sampling-report' } });
      if (st.key === 'report-generation') add({ ...base, button: report?.status === 'Draft' ? 'Submit report' : 'Prepare report', key: `report-prep:${job.id}`, kind: 'task', action: report?.status === 'Draft' ? 'Submit sampling report for approval' : 'Prepare sampling report', status: st.label, due: job.dueDate || undefined, from: data?.reviewedBy, fromLabel: 'Data approved by', events: [], open: { tab: 'sampling-report' } });
      if (st.key === 'report-review') add({ ...base, button: report?.status === 'Checking' ? 'Check report' : 'Review report', key: `report-review:${job.id}`, kind: 'review', action: report?.status === 'Checking' ? 'Check sampling report' : 'Review sampling report', status: st.label, due: job.dueDate || undefined, from: report?.preparedBy, fromLabel: 'Prepared by', events: sEvents, open: { tab: 'sampling-report' } });
      if (st.key === 'returned' && st.tab === 'sampling-report') add({ ...base, button: 'Correct report', key: `report-fix:${job.id}`, kind: 'returned', action: 'Correct sampling report', status: st.label, due: job.dueDate || undefined, comment: report?.comments, events: [], open: { tab: 'sampling-report' } });
    }
    if (me === lead && (st.key === 'data-review' || st.key === 'report-review')) wait({ ...base, key: `w-sampling:${job.id}`, what: st.key === 'data-review' ? 'Sampling data submitted' : 'Sampling report submitted', waitingOn: roles.samplingApproval ? name(roles.samplingApproval) : 'Sampling approval (not configured)', blocked: roles.samplingApproval ? undefined : 'samplingApproval', since: st.key === 'data-review' ? data?.submittedAt : report?.submittedAt, open: { tab: 'sampling-report' } });
    if ((st.key === 'data-review' || st.key === 'report-review') && !roles.samplingApproval) block('samplingApproval', 'Sampling data and reports are waiting for a sampling approver.', job);
    // Work this employee returned or dispatched: shown as waiting, never as their own action.
    if (data?.status === 'Returned' && data.reviewedBy === me && lead !== me) wait({ ...base, key: `w-returned:${job.id}`, label: `Waiting for ${name(lead)} to correct sampling data`, what: `You returned sampling data v${data.version}`, waitingOn: name(lead), since: data.reviewedAt, comment: [data.general, ...data.comments.map((c) => `${c.label}: ${c.text}`)].filter(Boolean).join(' · ') || undefined, commentLabel: 'Your correction request', open: { tab: 'sampling' } });
    else if (st.key === 'returned' && st.tab === 'sampling-report' && roles.samplingApproval === me && st.owner && st.owner !== me) wait({ ...base, key: `w-returned:${job.id}`, label: `Waiting for ${name(st.owner)} to correct the sampling report`, what: `Sampling report v${report?.version} returned`, waitingOn: name(st.owner), comment: report?.comments || undefined, commentLabel: 'Correction request', open: { tab: 'sampling-report' } });
    else if (o.dispatchedBy === me && lead && lead !== me && (st.key === 'preparation' || st.key === 'data')) wait({ ...base, key: `w-dispatch:${job.id}`, label: `Waiting for ${name(lead)} to complete sampling`, what: `Dispatched by you · ${st.label}`, waitingOn: name(lead), since: o.dispatchedAt, open: { tab: 'sampling' } });
    // Laboratory scope
    if (samplingApproved(job) && roles.scopeSelector === me && hasAccess(actor, 'analysis')) {
      if (!o.scopeConfirmedAt) add({ ...base, button: 'Define scope', key: `scope:${job.id}`, kind: 'task', action: 'Define and release laboratory scope', status: st.label, due: job.dueDate || undefined, from: report?.approvedBy, fromLabel: 'Report approved by', events: [], open: { tab: 'scope' } });
      const pending = o.additions.filter((a) => !a.confirmedAt).length;
      if (pending) add({ ...base, button: 'Confirm requests', key: `additions:${job.id}`, kind: 'review', action: `Confirm ${pending} additional-work request(s)`, status: 'Additional work requested', events: [], open: { tab: 'scope' } });
    }
    // Handover and receipt
    if (samplingApproved(job) && !o.handover && job.assignedDriverId === me) add({ ...base, button: 'Hand over samples', key: `handover:${job.id}`, kind: 'task', action: 'Hand over samples/containers to the laboratory', status: 'Sampling report approved · awaiting transport', due: job.dueDate || undefined, events: [], open: { tab: 'handover' } });
    if (o.handover && !o.handover.receivedAt) {
      if (roles.labReceipt === me && hasAccess(actor, 'analysis')) add({ ...base, button: 'Confirm receipt', key: `receipt:${job.id}`, kind: 'task', action: 'Confirm samples/containers received', status: 'In transit', from: o.handover.sentBy, fromLabel: 'Sent by', events: [], open: { tab: 'handover' } });
      if (o.handover.sentBy === me) wait({ ...base, key: `w-receipt:${job.id}`, what: 'Samples/containers sent', waitingOn: roles.labReceipt ? name(roles.labReceipt) : 'Laboratory receipt (not configured)', blocked: roles.labReceipt ? undefined : 'labReceipt', since: o.handover.sentAt, open: { tab: 'handover' } });
      if (!roles.labReceipt) block('labReceipt', 'Samples/containers in transit cannot be confirmed as received.', job);
    }
    // Laboratory tests
    const lab = o.activities.filter((a) => a.required);
    for (const stream of ['PVT', 'Chemical'] as const) {
      if (roles[streamLead(stream)] !== me || !hasAccess(actor, 'analysis')) continue;
      const unassigned = lab.filter((a) => a.stream === stream && !a.owner && a.status !== 'Completed');
      if (unassigned.length) add({ ...base, button: 'Assign tests', key: `assign:${job.id}:${stream}`, kind: 'task', action: `Assign ${unassigned.length} ${stream} test(s)`, stream, status: 'Awaiting assignment', from: o.scope.find((s) => s.stream === stream)?.addedBy, fromLabel: 'Scope released by', events: [], open: { tab: 'laboratory' } });
      if (unassigned.length && !actor.teams?.[stream]?.length) block('teams', `${stream} tests cannot be assigned until the ${stream} team has members.`, job);
    }
    for (const a of lab) {
      const sample = job.samples?.find((s) => s.id === a.sampleId), streamLeadId = roles[streamLead(a.stream)];
      const t = { ...base, sample: a.sampleId, container: sample ? containerLabel(sample) : undefined, test: a.title, stream: a.stream, status: labStatus(a), due: a.due || undefined, events: labEvents(a, me, streamLeadId, roles.qcReviewer), open: { tab: 'laboratory?activity=' + encodeURIComponent(a.id) } };
      const history = a.history || [], lastReturn = [...history].reverse().find((h) => h.action === 'lead-returned'), lastQc = [...history].reverse().find((h) => h.action === 'qc-returned'), assigned = [...history].reverse().find((h) => h.to === a.owner);
      if (a.owner === me && hasAccess(actor, 'analysis')) {
        if (a.status === 'Changes Requested') add({ ...t, button: 'Correct workbook', key: `test:${a.id}:${job.id}`, kind: 'returned', action: 'Correct and resubmit workbook', from: lastReturn?.by, fromLabel: 'Returned by', comment: [lastReturn?.target, lastReturn?.comments].filter(Boolean).join(' — ') });
        else if (a.status === 'Scheduled' || a.status === 'In Progress' || a.status === 'Unassigned') add({ ...t, button: a.status === 'Scheduled' ? 'Start test' : 'Submit workbook', key: `test:${a.id}:${job.id}`, kind: t.events.some((k) => k.includes(':assign:')) && a.status === 'Scheduled' ? 'assignment' : 'task', action: a.status === 'Scheduled' ? 'Start test and submit workbook' : 'Submit workbook', from: assigned?.by, fromLabel: 'Assigned by', comment: assigned?.comments || undefined });
        else if (['Workbook Submitted', 'Awaiting QC', 'QC Returned'].includes(a.status)) wait({ ...base, key: `w-test:${a.id}:${job.id}`, sample: a.sampleId, test: a.title, what: `${a.title} · Sample ${a.sampleId} · workbook v${a.files.length}`, waitingOn: a.status === 'Awaiting QC' ? (roles.qcReviewer ? name(roles.qcReviewer) + ' (QC)' : 'QC (not configured)') : streamLeadId ? name(streamLeadId) + ' (team lead)' : 'Team lead (not configured)', blocked: a.status === 'Awaiting QC' && !roles.qcReviewer ? 'qcReviewer' : undefined, since: a.files.at(-1)?.submittedAt, open: t.open });
      }
      if (streamLeadId === me && hasAccess(actor, 'analysis')) {
        if (a.status === 'Workbook Submitted') add({ ...t, button: 'Review workbook', key: `review:${a.id}:${job.id}`, kind: 'review', action: `Review workbook v${a.files.length}`, from: a.owner, fromLabel: 'Submitted by' });
        if (a.status === 'QC Returned') add({ ...t, button: 'Review QC return', key: `qcret:${a.id}:${job.id}`, kind: 'returned', action: 'Review QC return', from: lastQc?.by, fromLabel: 'Returned by QC', comment: [lastQc?.target, lastQc?.comments].filter(Boolean).join(' — ') });
        if (a.status === 'Changes Requested' && a.owner && a.owner !== me) wait({ ...base, key: `w-lead-ret:${a.id}:${job.id}`, sample: a.sampleId, test: a.title, label: `Waiting for ${name(a.owner)} to correct workbook`, what: `${a.title} · Sample ${a.sampleId} · you returned v${a.files.length}`, waitingOn: name(a.owner), since: lastReturn?.at, comment: [lastReturn?.target, lastReturn?.comments].filter(Boolean).join(' — ') || undefined, commentLabel: 'Your correction request', open: t.open });
        if (a.status === 'Awaiting QC') wait({ ...base, key: `w-qc:${a.id}:${job.id}`, sample: a.sampleId, test: a.title, blocked: roles.qcReviewer ? undefined : 'qcReviewer', what: `${a.title} · Sample ${a.sampleId} · v${a.files.length} approved by you`, waitingOn: roles.qcReviewer ? name(roles.qcReviewer) + ' (QC)' : 'QC (not configured)', since: a.files.at(-1)?.leadApprovedAt, open: t.open });
      }
      if (a.status === 'Awaiting QC' && roles.qcReviewer === me && hasAccess(actor, 'analysis')) add({ ...t, button: 'QC review', key: `qc:${a.id}:${job.id}`, kind: 'review', action: `QC review workbook v${a.files.length}`, from: a.files.at(-1)?.leadApprovedBy, fromLabel: 'Team-lead approved by' });
      if (a.status === 'Awaiting QC' && !roles.qcReviewer) block('qcReviewer', 'Team-lead-approved workbooks are waiting for a QC reviewer; final reporting is blocked.', job);
    }
    // Final laboratory report
    const final = latest(o.finalReports);
    if (roles.reporting === me && hasAccess(actor, 'analysis')) {
      if (finalReady(job) && (!final || final.status === 'Draft')) add({ ...base, button: final ? 'Submit final report' : 'Prepare final report', key: `final:${job.id}`, kind: 'task', action: final ? 'Submit final laboratory report' : 'Prepare final laboratory report', status: 'All tests QC approved', due: job.dueDate || undefined, events: [], open: { tab: 'reporting' } });
      if (final?.status === 'Changes Requested') add({ ...base, button: 'Correct final report', key: `final:${job.id}`, kind: 'returned', action: 'Correct final laboratory report', status: 'Final report returned', comment: final.comments, events: [], open: { tab: 'reporting' } });
      if (final?.status === 'Awaiting Approval') wait({ ...base, key: `w-final:${job.id}`, what: `Final laboratory report v${final.version}`, waitingOn: roles.finalApproval ? name(roles.finalApproval) : 'Final approval (not configured)', blocked: roles.finalApproval ? undefined : 'finalApproval', since: final.submittedAt, open: { tab: 'reporting' } });
    }
    if (final?.status === 'Awaiting Approval' && !roles.finalApproval) block('finalApproval', 'A submitted final laboratory report is waiting for a final approver.', job);
    if (final?.status === 'Awaiting Approval' && roles.finalApproval === me && hasAccess(actor, 'analysis')) add({ ...base, button: 'Approve final report', key: `final-approve:${job.id}`, kind: 'review', action: `Approve final laboratory report v${final.version}`, status: 'Awaiting final approval', due: job.dueDate || undefined, from: final.preparedBy, fromLabel: 'Prepared by', events: [], open: { tab: 'reporting' } });
    if (roles.reporting === me && o.scopeConfirmedAt && !finalReady(job) && testsAwaitingQcApproval(job).length && lab.some((a) => a.status === 'Awaiting QC')) wait({ ...base, key: `w-lab:${job.id}`, what: `${testsAwaitingQcApproval(job).length} test(s) not yet QC approved`, waitingOn: 'Laboratory teams and QC', open: { tab: 'reporting' } });
  }
  return { actions: [...actions.values()], waiting: [...waiting.values()], blocked: [...blocked.values()] };
}

export type InboxState = 'action' | 'blocked' | 'waiting' | 'info';
/** One dashboard row per job: everything this employee can do, is waiting on, or is blocked by. */
export type InboxRow = {
  jobId: string; jobNumber: string; client: string; state: InboxState;
  /** Actions available now, primary first. Blocked actions (e.g. assignment with an empty team) are listed separately. */actions: WorkItem[]; blockedActions: WorkItem[];
  waiting: WaitingItem[]; blocked: BlockedItem[]; due?: string; overdue: boolean; returned: boolean; isNew: boolean; stage: string; open: WorkItem['open'];
};
const stateRank: Record<InboxState, number> = { action: 0, blocked: 1, waiting: 2, info: 3 };

/**
 * Groups workItems() output by job. Rows exist only for jobs this employee acts on, waits on, or is assigned to
 * (owner, responsible, sampling team, driver, dispatcher or test owner); never company-wide.
 */
export function inboxRows(work: ReturnType<typeof workItems>, jobs: JobRecord[], actor: Actor, today: string, opts: { isNew: (i: WorkItem) => boolean; isClosed: (job: JobRecord) => boolean; stage: (job: JobRecord) => string }): InboxRow[] {
  const me = actor.id, rows = new Map<string, InboxRow>();
  const row = (job: JobRecord) => {
    let r = rows.get(job.id);
    if (!r) rows.set(job.id, r = { jobId: job.id, jobNumber: job.jobNumber, client: job.clientName, state: 'info', actions: [], blockedActions: [], waiting: [], blocked: [], due: job.dueDate || undefined, overdue: false, returned: false, isNew: false, stage: opts.stage(job), open: { tab: 'overview' } });
    return r;
  };
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const teamEmpty = (i: WorkItem) => i.key.startsWith('assign:') && !!i.stream && !actor.teams?.[i.stream]?.length;
  for (const i of sortItems(work.actions, opts.isNew)) { const job = byId.get(i.jobId); if (job) (teamEmpty(i) ? row(job).blockedActions : row(job).actions).push(i); }
  for (const w of work.waiting) { const job = byId.get(w.jobId); if (job) row(job).waiting.push(w); }
  for (const job of jobs) {
    if (rows.has(job.id) || isDraft(job) || !canSeeDraft(job, actor) || opts.isClosed(job)) continue;
    const o = operationsFor(job);
    const involved = [job.ownerId, job.responsibleId, job.jobResponsibleId, job.assignedEngineerId, job.assignedDriverId, o.dispatchedBy, ...samplingTeam(job), ...o.activities.map((a) => a.owner)].includes(me);
    if (involved) row(job);
  }
  for (const r of rows.values()) {
    r.blocked = work.blocked.filter((b) => b.jobs.includes(r.jobNumber));
    r.state = r.actions.length ? 'action' : r.blockedActions.length || r.waiting.some((w) => w.blocked) ? 'blocked' : r.waiting.length ? 'waiting' : 'info';
    const lead = r.actions[0] || r.blockedActions[0];
    if (lead) { r.open = lead.open; const dues = r.actions.map((i) => i.due).filter(Boolean) as string[]; if (dues.length) r.due = dues.sort()[0]; }
    else if (r.waiting[0]) r.open = r.waiting[0].open;
    r.overdue = r.actions.some((i) => i.overdue) || (r.state === 'action' && !!r.due && r.due < today);
    r.returned = r.actions.some((i) => i.kind === 'returned');
    r.isNew = r.actions.some(opts.isNew);
  }
  const score = (r: InboxRow) => { const p = r.actions[0]; return !p ? 9 : p.kind === 'returned' ? 0 : r.overdue ? 1 : p.kind === 'review' ? 2 : r.isNew ? 3 : 4; };
  return [...rows.values()].sort((a, b) => stateRank[a.state] - stateRank[b.state] || score(a) - score(b) || (a.due || '9999').localeCompare(b.due || '9999') || a.jobNumber.localeCompare(b.jobNumber));
}
/** Text used by the dashboard search. */
export const rowSearchText = (r: InboxRow) => [r.jobNumber, r.client, r.stage, ...[...r.actions, ...r.blockedActions].flatMap((i) => [i.action, i.test, i.sample, i.container, i.status]), ...r.waiting.flatMap((w) => [w.label, w.what, w.waitingOn, w.test, w.sample])].filter(Boolean).join(' ').toLowerCase();
