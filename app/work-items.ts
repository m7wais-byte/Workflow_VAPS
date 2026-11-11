import type { JobRecord } from './page';
import { phase2Undecided, phase2Ready, samplingWorkers, samplingStarted, jobFinished, jobCylinderSerials, operationsFor, samplingStatus, latestData, latest, labStatus, isDraft, canSeeDraft, samplingTeam, samplingApproved, finalReady, testsAwaitingQcApproval, assignmentEngineers, actorRoles, hasAccess, streamLead, additionalWorkPending, unplannedValidation, type Actor, type ActivityRecord, type Stream } from './operations-model';
import { containerLabel } from './sample-container';
import { addDays as addDaysIso } from './local-date';
import type { Responsibilities } from './authorization';
import { teamName } from './team-name';
import { legacyPlan, rowSummary } from './sampling-plan';
import { readCylinderStatus, cylinderStatuses } from './cylinder-status';
import { ukDate } from './uk-format';

/**
 * Personal dashboard items, derived from the same workflow states the Jobs, Sampling and PVT Lab pages use
 * (samplingStatus, labStatus, report and handover records). No separate status engine.
 */
export type ItemKind = 'returned' | 'review' | 'assignment' | 'task';
/** Which part of the work a row belongs to: shown as a tag so PVT, Chemical and Sampling work are never confused. */
export type Area = 'Sampling' | 'PVT' | 'Chemical' | 'Scope' | 'Transport' | 'Receipt' | 'Final report' | 'Job setup' | 'QC';
/** The deadline a row shows: a test's own due date, or the overall job due date when the task has none of its own. */
export type DueKind = 'Test due' | 'Job due';
export type WorkItem = {
  key: string; kind: ItemKind; action: string; jobId: string; jobNumber: string; client: string;
  area: Area; /** This employee's responsibility behind the row, e.g. "PVT Team Lead". */role: string; dueKind: DueKind; jobDue?: string;
  sample?: string; container?: string; test?: string; stream?: Stream; status: string; /** The task deadline shown in the row. */due?: string; overdue: boolean; dueToday: boolean;
  from?: string; fromLabel?: string; comment?: string; /** Seen markers shared with the Sampling and PVT Lab pages. */events: string[];
  /** Short name for the button that opens this action. */button: string;
  open: { tab: string } | { editor: 'type' | 'bottomhole' | 'report' | 'job'; sample?: string };
};
export type Setting = 'teams' | 'labReceipt' | 'qcReviewer' | 'samplingApproval' | 'scopeSelector' | 'routing' | 'finalApproval' | 'pvtTeamLead' | 'chemicalTeamLead';
export type WaitingItem = {
  key: string; jobId: string; jobNumber: string; client: string; what: string; waitingOn: string; since?: string; open: { tab: string };
  /** Headline when "Waiting on {waitingOn}" does not read well, e.g. work this employee returned. */label?: string;
  sample?: string; test?: string; comment?: string; commentLabel?: string;
  /** Set when the next holder is a missing setting: the work cannot move until it is configured. */blocked?: Setting;
};
export type BlockedItem = { key: string; setting: Setting; what: string; jobs: string[] };
/** A responsibility that is not this employee's turn yet. It has no approve/submit button: prerequisites come first. */
export type UpcomingItem = { key: string; jobId: string; jobNumber: string; client: string; area: Area; role: string; what: string; after: string; sample?: string; test?: string; due?: string; dueKind: DueKind; open: { tab: string } };
/** In-app scope and assignment alerts. Reading one never completes the work behind it. */
export type Alert = {
  key: string; kind: 'scope' | 'assignment' | 'moved' | 'external' | 'sampling'; jobId: string; jobNumber: string; headline: string;
  samples: string; scope: string; /** Not set on a sampling heads-up: no laboratory scope exists yet. */destination?: Stream | 'Both'; by: string; at: string; planner: string; assignee?: string; button: string; open: { tab: string };
  /** Seen-marker keys covered by this alert (its own key plus the "New" markers of the tasks it announces). */keys: string[];
};

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
/**
 * Overdue work first, then work due today, returned corrections, reviews, then everything else by its own deadline.
 * "New" only breaks ties: an unopened item never outranks urgent work already in progress.
 */
export const sortItems = (items: WorkItem[], isNew: (i: WorkItem) => boolean) => [...items].sort((a, b) => {
  const score = (i: WorkItem) => i.overdue ? 0 : i.dueToday ? 1 : i.kind === 'returned' ? 2 : i.kind === 'review' ? 3 : 4;
  return score(a) - score(b) || (a.due || '9999').localeCompare(b.due || '9999') || Number(isNew(b)) - Number(isNew(a)) || a.jobNumber.localeCompare(b.jobNumber);
});
const areaOf = (key: string, stream?: Stream): Area => key.startsWith('draft:') ? 'Job setup' : /^(sampling|data-review|report-prep|report-review|report-fix):/.test(key) ? 'Sampling' : /^(scope|additions):/.test(key) ? 'Scope' : key.startsWith('handover:') ? 'Transport' : key.startsWith('receipt:') ? 'Receipt' : /^final/.test(key) ? 'Final report' : key.startsWith('qc:') ? 'QC' : stream || 'PVT';
/** Short employee responsibility labels, from configured duties. */
export const dutyLabel: Record<string, string> = { scopeSelector: 'Scope selection', samplingApproval: 'Sampling approval', pvtSupervisor: 'PVT Supervisor', pvtTeamLead: 'PVT Team Lead', chemicalTeamLead: 'Chemistry Team Lead', reporting: 'Final report preparation', finalApproval: 'Final report approval', qcReviewer: 'QC review', labReceipt: 'Laboratory receipt' };

export function workItems(jobs: JobRecord[], actor: Actor, today: string) {
  const roles = actorRoles(actor), me = actor.id, name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'Not assigned';
  const actions = new Map<string, WorkItem>(), waiting = new Map<string, WaitingItem>(), blocked = new Map<string, BlockedItem>(), upcoming = new Map<string, UpcomingItem>(), alerts = new Map<string, Alert>();
  let current: JobRecord | undefined;
  /** Lab test rows use the test's own due date; every other row uses the job due date, labelled as such. */
  const add = (i: Omit<WorkItem, 'overdue' | 'dueToday' | 'area' | 'role' | 'dueKind' | 'jobDue'> & { area?: Area; role?: string; dueKind?: DueKind }) => {
    if (actions.has(i.key)) return;
    const dueKind: DueKind = i.dueKind || (i.test ? 'Test due' : 'Job due'), due = i.due || (dueKind === 'Job due' ? current?.dueDate : undefined) || undefined;
    actions.set(i.key, { ...i, area: i.area || areaOf(i.key, i.stream), role: i.role || '', dueKind, jobDue: current?.dueDate || undefined, due, overdue: !!due && due < today, dueToday: due === today });
  };
  const soon = (i: Omit<UpcomingItem, 'dueKind' | 'jobNumber' | 'client' | 'jobId'> & { dueKind?: DueKind }) => { if (current && !upcoming.has(i.key)) upcoming.set(i.key, { jobId: current.id, jobNumber: current.jobNumber, client: current.clientName, dueKind: i.dueKind || 'Job due', ...i }); };
  const alert = (i: Alert) => { if (!alerts.has(i.key)) alerts.set(i.key, i); };
  const wait = (i: WaitingItem) => { if (!waiting.has(i.key)) waiting.set(i.key, i); };
  const block = (key: BlockedItem['setting'], what: string, job: JobRecord) => { const b = blocked.get(key) || { key, setting: key, what, jobs: [] }; if (!b.jobs.includes(job.jobNumber)) b.jobs.push(job.jobNumber); blocked.set(key, b); };
  // Cylinder status register (browser storage); jobs decide In use / Returned.
  const cylStatus = cylinderStatuses(jobs, readCylinderStatus());
  for (const job of jobs) {
    if (!canSeeDraft(job, actor)) continue;
    current = job;
    const base = { jobId: job.id, jobNumber: job.jobNumber, client: job.clientName };
    if (isDraft(job)) {
      if ((me === job.createdById || hasAccess(actor, 'createJob')) && hasAccess(actor, 'createJob')) add({ ...base, role: 'Job creation', button: 'Continue draft', key: `draft:${job.id}`, kind: 'task', action: 'Continue job draft and send to Sampling', status: 'Draft · not sent', due: job.dueDate || undefined, events: [], open: { editor: 'job' } });
      continue;
    }
    const o = operationsFor(job), st = samplingStatus(job, roles), data = latestData(job), report = latest(o.samplingReports);
    const team = samplingTeam(job), lead = job.assignedEngineerId, sEvents = samplingEvents(job, me, roles.samplingApproval);
    // Sampling
    // Assigned work is reachable through the assignment itself, from any department; reviews and approvals keep their permission.
    const workers = samplingWorkers(job), started = samplingStarted(job);
    // Before work starts, the accountable employee first reads the job briefing and presses Start job.
    if (me === lead && !started && st.key === 'preparation' && (hasAccess(actor, 'sampling') || hasAccess(actor, 'jobDetails'))) add({ ...base, area: 'Sampling', role: 'Accountable sampling employee', button: 'View job & start', key: `start:${job.id}`, kind: sEvents.some((k) => k.startsWith('assign:')) ? 'assignment' : 'task', action: 'New job assigned to you: read the briefing and start the job', status: 'Assigned · not started', due: job.dueDate || undefined, from: o.dispatchedBy, fromLabel: 'Assigned by', events: sEvents, open: { tab: 'overview' } });
    // Backups without edit access follow the job: they see it, but have no task on it.
    else if (team.includes(me) && !workers.includes(me) && st.team) wait({ ...base, key: `w-follow:${job.id}`, label: 'Following this job as backup (view only)', what: started ? st.label : 'Assigned · not started yet', waitingOn: name(lead) + ' (accountable)', since: o.dispatchedAt, open: { tab: 'overview' } });
    else if (workers.includes(me) && (hasAccess(actor, 'sampling') || hasAccess(actor, 'jobDetails')) && st.team) {
      const accountable = me === lead, returned = st.key === 'returned';
      const action = returned ? (accountable ? 'Correct sampling data and resubmit' : 'Help correct returned sampling data') : st.key === 'preparation' ? (accountable ? 'Complete sampling preparation' : 'Help with sampling preparation') : st.next === 'Review and submit the sampling data' ? (accountable ? 'Review and submit sampling data' : 'Sampling data ready for submission') : (accountable ? 'Complete sampling data' : 'Help complete sampling data');
      if (!accountable && st.next === 'Review and submit the sampling data') wait({ ...base, key: `w-support:${job.id}`, what: 'Sampling data complete', waitingOn: name(lead) + ' (accountable) to submit', open: { tab: 'sampling' } });
      const button = returned ? 'Correct sampling data' : st.key === 'preparation' ? 'Open preparation' : st.next === 'Review and submit the sampling data' && accountable ? 'Review and submit' : 'Open sample sheets';
      if (accountable || st.next !== 'Review and submit the sampling data') add({ ...base, role: accountable ? 'Accountable sampling employee' : 'Backup sampling employee', button, key: `sampling:${job.id}`, kind: returned ? 'returned' : sEvents.some((k) => k.startsWith('assign:')) ? 'assignment' : 'task', action: action + (accountable ? '' : ` (backup · ${name(lead)} submits)`), status: st.label, due: job.dueDate || undefined, from: returned ? data?.reviewedBy : o.dispatchedBy, fromLabel: returned ? 'Returned by' : 'Assigned by', comment: returned ? [data?.general, ...(data?.comments || []).map((c) => `${c.label}: ${c.text}`)].filter(Boolean).join(' · ') : undefined, events: sEvents, open: { editor: samplingStage(job, roles) } });
    }
    if (st.owner === me && (hasAccess(actor, 'sampling') || (me === lead && hasAccess(actor, 'jobDetails')))) {
      if (st.key === 'data-review') add({ ...base, button: 'Review sampling data', role: 'Sampling approval', key: `data-review:${job.id}`, kind: 'review', action: 'Review sampling data', status: st.label, due: job.dueDate || undefined, from: data?.submittedBy, fromLabel: 'Submitted by', events: sEvents, open: { tab: 'sampling-report' } });
      if (st.key === 'report-generation') add({ ...base, button: report?.status === 'Draft' ? 'Submit report' : 'Prepare report', role: 'Accountable sampling employee', key: `report-prep:${job.id}`, kind: 'task', action: report?.status === 'Draft' ? 'Submit sampling report for approval' : 'Prepare sampling report', status: st.label, due: job.dueDate || undefined, from: data?.reviewedBy, fromLabel: 'Data approved by', events: [], open: { tab: 'sampling-report' } });
      if (st.key === 'report-review') add({ ...base, button: report?.status === 'Checking' ? 'Check report' : 'Review report', role: report?.status === 'Checking' ? 'Sampling report check & review' : 'Sampling approval', key: `report-review:${job.id}`, kind: 'review', action: report?.status === 'Checking' ? 'Check sampling report' : 'Review sampling report', status: st.label, due: job.dueDate || undefined, from: report?.preparedBy, fromLabel: 'Prepared by', events: sEvents, open: { tab: 'sampling-report' } });
      if (st.key === 'returned' && st.tab === 'sampling-report') add({ ...base, button: 'Correct report', role: 'Accountable sampling employee', key: `report-fix:${job.id}`, kind: 'returned', action: 'Correct sampling report', status: st.label, due: job.dueDate || undefined, comment: report?.comments, events: [], open: { tab: 'sampling-report' } });
    }
    if (me === lead && (st.key === 'data-review' || st.key === 'report-review')) wait({ ...base, key: `w-sampling:${job.id}`, what: st.key === 'data-review' ? 'Sampling data submitted' : 'Sampling report submitted', waitingOn: roles.samplingApproval ? name(roles.samplingApproval) : 'Sampling approval (not configured)', blocked: roles.samplingApproval ? undefined : 'samplingApproval', since: st.key === 'data-review' ? data?.submittedAt : report?.submittedAt, open: { tab: 'sampling-report' } });
    if ((st.key === 'data-review' || st.key === 'report-review') && !roles.samplingApproval) block('samplingApproval', 'Sampling data and reports are waiting for a sampling approver.', job);
    // Work this employee returned or dispatched: shown as waiting, never as their own action.
    if (data?.status === 'Returned' && data.reviewedBy === me && lead !== me) wait({ ...base, key: `w-returned:${job.id}`, label: `Waiting for ${name(lead)} to correct sampling data`, what: `You returned sampling data v${data.version}`, waitingOn: name(lead), since: data.reviewedAt, comment: [data.general, ...data.comments.map((c) => `${c.label}: ${c.text}`)].filter(Boolean).join(' · ') || undefined, commentLabel: 'Your correction request', open: { tab: 'sampling' } });
    else if (st.key === 'returned' && st.tab === 'sampling-report' && roles.samplingApproval === me && st.owner && st.owner !== me) wait({ ...base, key: `w-returned:${job.id}`, label: `Waiting for ${name(st.owner)} to correct the sampling report`, what: `Sampling report v${report?.version} returned`, waitingOn: name(st.owner), comment: report?.comments || undefined, commentLabel: 'Correction request', open: { tab: 'sampling-report' } });
    else if (o.dispatchedBy === me && lead && lead !== me && (st.key === 'preparation' || st.key === 'data')) wait({ ...base, key: `w-dispatch:${job.id}`, label: `Waiting for ${name(lead)} to complete sampling`, what: `Dispatched by you · ${st.label}`, waitingOn: name(lead), since: o.dispatchedAt, open: { tab: 'sampling' } });
    // Laboratory scope
    if (samplingApproved(job) && roles.scopeSelector === me && hasAccess(actor, 'analysis')) {
      if (!o.scopeConfirmedAt) add({ ...base, role: 'Scope selection', button: 'Define scope', key: `scope:${job.id}`, kind: 'task', action: 'Define and release laboratory scope', status: st.label, due: job.dueDate || undefined, from: report?.approvedBy, fromLabel: 'Report approved by', events: [], open: { tab: 'scope' } });
      // Phase 2: samples with no Validation, or whose Validation is complete, wait for the further-study decision.
      const ready = phase2Undecided(job).filter((id) => phase2Ready(job, id));
      if (ready.length) add({ ...base, role: 'Scope selection', button: 'Select Phase 2 scope', key: `phase2:${job.id}`, kind: 'task', action: `Confirm with the client focal point${job.clientFocalPoint ? ' (' + job.clientFocalPoint + ')' : ''} which samples go to further study, then select their tests · Sample ${ready.join(', ')}`, status: 'Phase 2 · detailed tests', due: job.dueDate || undefined, events: [], open: { tab: 'scope' } });
      const pending = o.additions.filter((a) => !a.confirmedAt).length;
      if (pending) add({ ...base, role: 'Scope selection', button: 'Confirm requests', key: `additions:${job.id}`, kind: 'review', action: `Confirm ${pending} additional-work request(s)`, status: 'Additional work requested', events: [], open: { tab: 'scope' } });
    }
    // Handover and receipt
    if (samplingApproved(job) && !o.handover && job.assignedDriverId === me) add({ ...base, role: 'Driver', button: 'Hand over samples', key: `handover:${job.id}`, kind: 'task', action: 'Hand over samples/containers to the laboratory', status: 'Sampling report approved · awaiting transport', due: job.dueDate || undefined, events: [], open: { tab: 'handover' } });
    if (o.handover && !o.handover.receivedAt) {
      if (roles.labReceipt === me && hasAccess(actor, 'analysis')) add({ ...base, role: 'Laboratory receipt', button: 'Confirm receipt', key: `receipt:${job.id}`, kind: 'task', action: 'Confirm samples/containers received', status: 'In transit', from: o.handover.sentBy, fromLabel: 'Sent by', events: [], open: { tab: 'handover' } });
      if (o.handover.sentBy === me) wait({ ...base, key: `w-receipt:${job.id}`, what: 'Samples/containers sent', waitingOn: roles.labReceipt ? name(roles.labReceipt) : 'Laboratory receipt (not configured)', blocked: roles.labReceipt ? undefined : 'labReceipt', since: o.handover.sentAt, open: { tab: 'handover' } });
      if (!roles.labReceipt) block('labReceipt', 'Samples/containers in transit cannot be confirmed as received.', job);
    }
    // Laboratory tests
    const lab = o.activities.filter((a) => a.required);
    for (const stream of ['PVT', 'Chemical'] as const) {
      if (!roles[streamLead(stream)] && lab.some((a) => a.stream === stream && a.external && !a.owner && a.status !== 'Completed')) block(streamLead(stream) as Setting, `Outsourced ${teamName(stream)} tests have no internal coordinator and no ${teamName(stream)} Team Lead to assign one; dispatch is blocked.`, job);
      if (roles[streamLead(stream)] !== me || !hasAccess(actor, 'analysis')) continue;
      const open = lab.filter((a) => a.stream === stream && !a.owner && a.status !== 'Completed');
      // Outsourced work without an accountable internal coordinator gets its own task; it cannot be dispatched until assigned.
      const uncoordinated = open.filter((a) => a.external), unassigned = open.filter((a) => !a.external);
      if (uncoordinated.length) add({ ...base, role: `${teamName(stream)} Team Lead`, button: 'Assign coordinator', key: `coord:${job.id}:${stream}`, kind: 'task', action: `Assign an internal coordinator · ${uncoordinated.length} outsourced ${teamName(stream)} test${uncoordinated.length === 1 ? '' : 's'} (${[...new Set(uncoordinated.map((a) => a.external!.provider))].join(', ')})`, stream, sample: [...new Set(uncoordinated.map((a) => a.sampleId))].join(', '), status: 'Outsourced · no coordinator · dispatch blocked', from: [...o.scope].reverse().find((s) => s.stream === stream)?.addedBy, fromLabel: 'Scope added by', events: [], open: { tab: 'laboratory?stream=' + stream } });
      if (unassigned.length) add({ ...base, role: `${teamName(stream)} Team Lead`, button: 'Assign tests', key: `assign:${job.id}:${stream}`, kind: 'task', action: `Assign ${unassigned.length} ${teamName(stream)} test(s)`, stream, sample: [...new Set(unassigned.map((a) => a.sampleId))].join(', '), status: 'Awaiting assignment', from: [...o.scope].reverse().find((s) => s.stream === stream)?.addedBy, fromLabel: 'Scope added by', events: [], open: { tab: 'laboratory?stream=' + stream } });
      if (open.length && !assignmentEngineers(actor,stream).length) block('teams', `${teamName(stream)} tests cannot be assigned until the ${teamName(stream)} team has members.`, job);
    }
    // Validation requested per sample: the PVT Team Lead chooses the steps. It stays until planned; reading an alert never clears it.
    const toPlan = unplannedValidation(job);
    if (toPlan.length) {
      if (!roles.pvtTeamLead) block('pvtTeamLead', 'Validation is requested but no PVT Team Lead is configured to plan the steps.', job);
      else if (roles.pvtTeamLead === me && hasAccess(actor, 'analysis')) {
        const ids = [...new Set(toPlan.flatMap((r) => r.sampleIds))], first = job.samples?.find((x) => x.id === ids[0]);
        add({ ...base, role: 'PVT Team Lead', button: 'Plan Validation', key: `plan-validation:${job.id}`, kind: 'task', action: `Plan Validation steps · ${ids.length} sample${ids.length === 1 ? '' : 's'}`, stream: 'PVT', sample: ids.join(', '), container: ids.length === 1 && first ? containerLabel(first) : undefined, status: 'Validation requested · steps not chosen', from: toPlan[toPlan.length - 1].addedBy, fromLabel: 'Requested by', events: [], open: { tab: 'laboratory?stream=PVT&plan=' + encodeURIComponent(toPlan[0].id) } });
      }
    }
    for (const a of lab) {
      const sample = job.samples?.find((s) => s.id === a.sampleId), streamLeadId = roles[streamLead(a.stream)];
      const t = { ...base, sample: a.sampleId, container: sample ? containerLabel(sample) : undefined, test: a.title, stream: a.stream, status: labStatus(a), due: a.due || undefined, events: labEvents(a, me, streamLeadId, roles.qcReviewer), open: { tab: 'laboratory?activity=' + encodeURIComponent(a.id) } };
      const history = a.history || [], lastReturn = [...history].reverse().find((h) => h.action === 'lead-returned'), lastQc = [...history].reverse().find((h) => h.action === 'qc-returned'), assigned = [...history].reverse().find((h) => h.to === a.owner);
      const ext = a.external;
      if (ext && a.owner === me && hasAccess(actor, 'jobDetails') && (a.status === 'Scheduled' || a.status === 'In Progress')) {
        // Third-party work: the coordinator dispatches, waits on the provider, then submits the returned results for review.
        const label = `External · ${ext.provider}`;
        if (!ext.sentAt) add({ ...t, role: `${teamName(a.stream)} external coordinator`, button: 'Record dispatch', key: `test:${a.id}:${job.id}`, kind: t.events.some((k) => k.includes(':assign:')) && a.status === 'Scheduled' ? 'assignment' : 'task', action: `Dispatch to ${ext.provider} (third-party)`, status: `${label} · Awaiting dispatch`, due: ext.expectedReturn || a.due || undefined, from: assigned?.by, fromLabel: 'Assigned by', comment: ext.notes || undefined });
        else if (!ext.receivedAt) wait({ ...base, key: `w-ext:${a.id}:${job.id}`, sample: a.sampleId, test: a.title, label: `Waiting on ${ext.provider} (third party)`, what: `${a.title} · Sample ${a.sampleId} · sent ${ext.sentOn || ext.sentAt.slice(0, 10)} · expected back ${ext.expectedReturn || 'not set'}${ext.expectedReturn && ext.expectedReturn < today ? ' (overdue)' : ''}`, waitingOn: `${ext.provider} (third party)`, since: ext.sentAt, open: t.open });
        else add({ ...t, role: `${teamName(a.stream)} external coordinator`, button: 'Submit results', key: `test:${a.id}:${job.id}`, kind: 'task', action: `Submit ${ext.provider} results for internal review`, status: `${label} · Results received`, due: a.due || undefined, from: ext.receivedBy, fromLabel: 'Results recorded by' });
      } else if (a.owner === me && hasAccess(actor, 'jobDetails')) {
        if (a.status === 'Changes Requested') add({ ...t, role: ext ? `${teamName(a.stream)} external coordinator` : `${teamName(a.stream)} test`, button: ext ? 'Follow up return' : 'Correct workbook', key: `test:${a.id}:${job.id}`, kind: 'returned', action: ext ? `Follow up with ${ext.provider} and record corrected results` : 'Correct and resubmit workbook', from: lastReturn?.by, fromLabel: 'Returned by', comment: [lastReturn?.target, lastReturn?.comments].filter(Boolean).join(' — ') });
        // A test planned to start later waits in Coming up; it can still be opened, and nothing blocks starting it early.
        else if (a.status === 'Scheduled' && a.start && a.start > today) soon({ key: `soon-test:${a.id}:${job.id}`, area: a.stream, role: `${teamName(a.stream)} test`, what: `${a.title} · Sample ${a.sampleId}`, after: `Planned start ${a.start}`, sample: a.sampleId, test: a.title, due: a.due || undefined, dueKind: 'Test due', open: t.open });
        else if (a.status === 'Scheduled' || a.status === 'In Progress' || a.status === 'Unassigned') add({ ...t, role: `${teamName(a.stream)} test`, button: a.status === 'Scheduled' ? 'Start test' : 'Submit workbook', key: `test:${a.id}:${job.id}`, kind: t.events.some((k) => k.includes(':assign:')) && a.status === 'Scheduled' ? 'assignment' : 'task', action: a.status === 'Scheduled' ? 'Start test and submit workbook' : 'Submit workbook', from: assigned?.by, fromLabel: 'Assigned by', comment: assigned?.comments || undefined });
        else if (['Workbook Submitted', 'Awaiting QC', 'QC Returned'].includes(a.status)) wait({ ...base, key: `w-test:${a.id}:${job.id}`, sample: a.sampleId, test: a.title, what: `${a.title} · Sample ${a.sampleId} · workbook v${a.files.length}`, waitingOn: a.status === 'Awaiting QC' ? (roles.qcReviewer ? name(roles.qcReviewer) + ' (QC)' : 'QC (not configured)') : streamLeadId ? name(streamLeadId) + ' (team lead)' : 'Team lead (not configured)', blocked: a.status === 'Awaiting QC' && !roles.qcReviewer ? 'qcReviewer' : undefined, since: a.files.at(-1)?.submittedAt, open: t.open });
      }
      if (streamLeadId === me && hasAccess(actor, 'analysis')) {
        if (a.status === 'Workbook Submitted') add({ ...t, role: `${teamName(a.stream)} Team Lead`, button: a.external ? 'Review results' : 'Review workbook', key: `review:${a.id}:${job.id}`, kind: 'review', action: a.external ? `Review external results v${a.files.length} (${a.external.provider})` : `Review workbook v${a.files.length}`, from: a.owner, fromLabel: 'Submitted by' });
        if (a.status === 'Workbook Submitted' && a.external) { const sub = [...(a.history || [])].reverse().find((h) => h.action === 'submitted'); alert({ key: `lab:ext:${a.id}:${a.files.length}`, kind: 'external', jobId: job.id, jobNumber: job.jobNumber, headline: 'External results submitted for review', samples: `Sample ${a.sampleId}${sample ? ' · ' + containerLabel(sample) : ''}`, scope: `${a.title} · External · ${a.external.provider}`, destination: a.stream, by: sub?.by || a.owner, at: sub?.at || a.files.at(-1)?.submittedAt || '', planner: me, assignee: a.owner, button: 'Review results', open: t.open, keys: [`lab:ext:${a.id}:${a.files.length}`, `lab:review:${a.id}:${a.files.length}`] }); }
        if (a.status === 'QC Returned') add({ ...t, role: `${teamName(a.stream)} Team Lead`, button: 'Review QC return', key: `qcret:${a.id}:${job.id}`, kind: 'returned', action: 'Review QC return', from: lastQc?.by, fromLabel: 'Returned by QC', comment: [lastQc?.target, lastQc?.comments].filter(Boolean).join(' — ') });
        if (a.status === 'Changes Requested' && a.owner && a.owner !== me) wait({ ...base, key: `w-lead-ret:${a.id}:${job.id}`, sample: a.sampleId, test: a.title, label: `Waiting for ${name(a.owner)} to correct workbook`, what: `${a.title} · Sample ${a.sampleId} · you returned v${a.files.length}`, waitingOn: name(a.owner), since: lastReturn?.at, comment: [lastReturn?.target, lastReturn?.comments].filter(Boolean).join(' — ') || undefined, commentLabel: 'Your correction request', open: t.open });
        if (a.status === 'Awaiting QC') wait({ ...base, key: `w-qc:${a.id}:${job.id}`, sample: a.sampleId, test: a.title, blocked: roles.qcReviewer ? undefined : 'qcReviewer', what: `${a.title} · Sample ${a.sampleId} · v${a.files.length} approved by you`, waitingOn: roles.qcReviewer ? name(roles.qcReviewer) + ' (QC)' : 'QC (not configured)', since: a.files.at(-1)?.leadApprovedAt, open: t.open });
      }
      if (a.status === 'Awaiting QC' && roles.qcReviewer === me && hasAccess(actor, 'analysis')) add({ ...t, area: 'QC', role: 'QC review', button: 'QC review', key: `qc:${a.id}:${job.id}`, kind: 'review', action: `QC review workbook v${a.files.length}`, from: a.files.at(-1)?.leadApprovedBy, fromLabel: 'Team-lead approved by' });
      if (a.status === 'Awaiting QC' && !roles.qcReviewer) block('qcReviewer', 'Team-lead-approved workbooks are waiting for a QC reviewer; final reporting is blocked.', job);
    }
    // Final laboratory report
    const final = latest(o.finalReports);
    if (roles.reporting === me && hasAccess(actor, 'analysis')) {
      if (finalReady(job) && (!final || final.status === 'Draft')) add({ ...base, role: 'Final report preparation', button: final ? 'Submit final report' : 'Prepare final report', key: `final:${job.id}`, kind: 'task', action: final ? 'Submit final laboratory report' : 'Prepare final laboratory report', status: 'All tests QC approved', due: job.dueDate || undefined, events: [], open: { tab: 'reporting' } });
      if (final?.status === 'Changes Requested' && finalReady(job)) add({ ...base, role: 'Final report preparation', button: 'Correct final report', key: `final:${job.id}`, kind: 'returned', action: 'Correct final laboratory report', status: 'Final report returned', comment: final.comments, events: [], open: { tab: 'reporting' } });
      if (final?.status === 'Awaiting Approval') wait({ ...base, key: `w-final:${job.id}`, what: `Final laboratory report v${final.version}`, waitingOn: roles.finalApproval ? name(roles.finalApproval) : 'Final approval (not configured)', blocked: roles.finalApproval ? undefined : 'finalApproval', since: final.submittedAt, open: { tab: 'reporting' } });
    }
    if (final?.status === 'Awaiting Approval' && !roles.finalApproval) block('finalApproval', 'A submitted final laboratory report is waiting for a final approver.', job);
    if (final?.status === 'Awaiting Approval' && roles.finalApproval === me && hasAccess(actor, 'analysis')) add({ ...base, role: 'Final report approval', button: 'Approve final report', key: `final-approve:${job.id}`, kind: 'review', action: `Approve final laboratory report v${final.version}`, status: 'Awaiting final approval', due: job.dueDate || undefined, from: final.preparedBy, fromLabel: 'Prepared by', events: [], open: { tab: 'reporting' } });
    // Coming up: real responsibilities on this job that are not this employee's turn yet. No approval button before its prerequisites.
    const dispatched = !!o.dispatchedAt, approved = samplingApproved(job), openLab = lab.filter((a) => a.status !== 'Completed');
    // Cylinders: after the job is finished the coordinator releases them; the job's sampling team then cleans and checks them.
    const serials = jobCylinderSerials(job);
    if (serials.length && jobFinished(job) && !o.cylindersReleased && hasAccess(actor, 'createJob')) add({ ...base, area: 'Sampling', role: 'Job coordinator', button: 'Release cylinders', key: `cyl-release:${job.id}`, kind: 'task', action: `Job finished: release ${serials.length} cylinder${serials.length === 1 ? '' : 's'} to the sampling team for cleaning`, status: 'Job finished · cylinders still held', events: [], open: { tab: 'overview' } });
    if (o.cylindersReleased && team.includes(me)) {
      const waiting = serials.filter((x) => cylStatus(x).state === 'returned');
      if (waiting.length) add({ ...base, area: 'Sampling', role: me === lead ? 'Accountable sampling employee' : 'Backup sampling employee', button: 'Open cylinders', key: `cyl-clean:${job.id}`, kind: 'task', action: `Collect, clean and check ${waiting.length} cylinder${waiting.length === 1 ? '' : 's'}: ${waiting.join(', ')}`, status: 'Returned · needs cleaning', from: o.cylindersReleased.by, fromLabel: 'Released by', events: [], open: { tab: 'cylinders' } });
    }
    // Laboratory heads-up while the job is in sampling: general job details only, because the laboratory scope is chosen after the sampling report is approved.
    const labDuty = ([roles.scopeSelector, roles.labReceipt, roles.pvtTeamLead, roles.chemicalTeamLead] as (string | undefined)[]).includes(me);
    if (dispatched && !approved && labDuty && hasAccess(actor, 'analysis') && !team.includes(me) && o.dispatchedBy !== me) {
      const plan = legacyPlan(job), where = [job.fieldArea, job.wells?.filter(Boolean).join(', ') || job.well].filter(Boolean).join(' / ');
      const key = `heads-up:${job.id}:${o.dispatchedAt}`;
      alert({ key, kind: 'sampling', jobId: job.id, jobNumber: job.jobNumber, headline: `Job in sampling · ${job.clientName}`, samples: where || 'Location not recorded', scope: plan.map((r) => `${r.source} (${rowSummary(r)})`).join(', ') + (job.dueDate ? ` · job due ${ukDate(job.dueDate)}` : ''), by: o.dispatchedBy || job.createdById, at: o.dispatchedAt!, planner: '', button: 'View job', open: { tab: 'overview' }, keys: [key] });
    }
    if (dispatched && !approved) {
      if (job.assignedDriverId === me) soon({ key: `soon-transport:${job.id}`, area: 'Transport', role: 'Driver', what: 'Transport samples/containers to the laboratory', after: 'After the sampling report is approved', open: { tab: 'handover' } });
      if (roles.samplingApproval === me && hasAccess(actor, 'sampling') && st.owner !== me && st.key !== 'returned') soon({ key: `soon-sampling-approval:${job.id}`, area: 'Sampling', role: 'Sampling approval', what: st.key === 'report-generation' ? 'Approve the sampling report' : 'Review the sampling data, then approve the report', after: st.key === 'report-generation' ? `After ${name(lead)} submits the report` : `After ${name(lead)} submits the sampling data`, open: { tab: 'sampling-report' } });
      if (roles.scopeSelector === me && hasAccess(actor, 'analysis')) soon({ key: `soon-scope:${job.id}`, area: 'Scope', role: 'Scope selection', what: 'Define and release the laboratory scope', after: 'After the sampling report is approved', open: { tab: 'scope' } });
    }
    if (approved && !o.handover && roles.labReceipt === me && hasAccess(actor, 'analysis')) soon({ key: `soon-receipt:${job.id}`, area: 'Receipt', role: 'Laboratory receipt', what: 'Confirm samples/containers received', after: `After ${job.assignedDriverId ? name(job.assignedDriverId) : 'the driver'} sends them`, open: { tab: 'handover' } });
    for (const stream of ['PVT', 'Chemical'] as const) {
      if (roles[streamLead(stream)] !== me || !hasAccess(actor, 'analysis')) continue;
      const working = openLab.filter((a) => a.stream === stream && a.owner && ['Scheduled', 'In Progress', 'Changes Requested'].includes(a.status));
      if (working.length) soon({ key: `soon-review:${job.id}:${stream}`, area: stream, role: `${teamName(stream)} Team Lead`, what: `Review ${working.length} ${teamName(stream)} workbook(s)`, after: `After ${[...new Set(working.map((a) => name(a.owner)))].join(', ')} submit${working.length === 1 ? 's' : ''}`, open: { tab: 'laboratory?stream=' + stream } });
    }
    if (roles.qcReviewer === me && hasAccess(actor, 'analysis') && openLab.some((a) => a.status !== 'Awaiting QC') && !openLab.some((a) => a.status === 'Awaiting QC')) soon({ key: `soon-qc:${job.id}`, area: 'QC', role: 'QC review', what: `QC review of ${openLab.length} test(s)`, after: 'After team-lead approval of each workbook', open: { tab: 'laboratory?view=qc' } });
    const final2 = latest(o.finalReports);
    if (o.scopeConfirmedAt && !finalReady(job) && openLab.length) {
      if (roles.reporting === me && hasAccess(actor, 'analysis')) soon({ key: `soon-final:${job.id}`, area: 'Final report', role: 'Final report preparation', what: 'Prepare the final laboratory report', after: `After all ${lab.length} tests are QC approved (${lab.length - testsAwaitingQcApproval(job).length} done)`, open: { tab: 'reporting' } });
      if (roles.finalApproval === me && hasAccess(actor, 'analysis')) soon({ key: `soon-final-approval:${job.id}`, area: 'Final report', role: 'Final report approval', what: 'Approve the final laboratory report', after: `After ${roles.reporting ? name(roles.reporting) : 'the report preparer'} submits it`, open: { tab: 'reporting' } });
    } else if (finalReady(job) && (!final2 || ['Draft', 'Changes Requested'].includes(final2.status)) && roles.finalApproval === me && roles.reporting !== me && hasAccess(actor, 'analysis')) soon({ key: `soon-final-approval:${job.id}`, area: 'Final report', role: 'Final report approval', what: 'Approve the final laboratory report', after: `After ${roles.reporting ? name(roles.reporting) : 'the report preparer'} submits it`, open: { tab: 'reporting' } });
    // Alerts: new or extended scope (to the configured planner of that team), assignments and reassignments.
    // Destination as released for the sample (PVT, Chemical or Both); a test linked to both teams also counts as Both.
    const sampleBoth = (id: string) => (o.labScopes || []).some((v) => v.status === 'Released' && v.samples.some((x) => x.sampleId === id && x.destination === 'Both'));
    const containerOf = (id: string) => { const smp = job.samples?.find((x) => x.id === id); return `Sample ${id}${smp ? ' · ' + containerLabel(smp) : ''}`; };
    const groups = new Map<string, typeof o.scope>();
    for (const r of o.scope) { const k = r.stream + '|' + r.at + (r.validationRequest ? '|validation' : ''); groups.set(k, [...(groups.get(k) || []), r]); }
    for (const [k, records] of groups) {
      const stream = records[0].stream, planner = roles[streamLead(stream)], ids = new Set(records.map((r) => r.id));
      const acts = o.activities.filter((a) => ids.has(a.scopeId) && a.required);
      const toPlanHere = records.filter((r) => r.validationRequest && !r.plannedAt);
      // A scope alert stays while work is unassigned or Validation is unplanned, or for two days after the scope was added.
      if (!toPlanHere.length && (!acts.some((a) => a.status !== 'Completed') || (!acts.some((a) => !a.owner) && records[0].at.slice(0, 10) < addDaysIso(today, -2)))) continue;
      const both = records.some((r) => (r.id.startsWith('labscope:') && r.sampleIds.some(sampleBoth)) || (r.linkId && o.scope.some((x) => x.linkId === r.linkId && x.stream !== r.stream)));
      if (!planner) { block(streamLead(stream) as Setting, `New ${teamName(stream)} scope has no planning owner; it is saved and waits as Unassigned.`, job); continue; }
      if (planner !== me || !hasAccess(actor, 'analysis')) continue;
      const unassigned = acts.filter((a) => !a.owner).length, extended = records.some((r) => r.source === 'Additional work'), validation = records.every((r) => r.id.startsWith('addval:') || r.validationRequest), requested = records.every((r) => r.validationRequest);
      const customs = new Set(acts.filter((a) => a.custom).map((a) => a.scopeId));
      alert({ key: `scope:${job.id}:${k}`, kind: 'scope', jobId: job.id, jobNumber: job.jobNumber, headline: requested && toPlanHere.length ? 'Validation requested · choose the steps' : requested ? 'Validation steps planned' : validation ? 'Validation added' : extended ? `${teamName(stream)} scope extended` : `New ${teamName(stream)} scope added`,
        samples: [...new Set(records.flatMap((r) => r.sampleIds))].map(containerOf).join('; '), scope: [...new Set(records.map((r) => r.validationRequest ? (r.plannedAt ? 'Validation: ' + acts.filter((a) => a.scopeId === r.id).map((a) => a.title).join(', ') : 'Validation (steps to plan)') : r.id.startsWith('addval:') ? 'Validation: ' + r.notes : r.title + (customs.has(r.id) ? ' (custom test)' : '') + (acts.find((a) => a.scopeId === r.id)?.external ? ' (External · ' + acts.find((a) => a.scopeId === r.id)!.external!.provider + ')' : '')))].join(', '),
        destination: both ? 'Both' : stream, by: records[0].addedBy, at: records[0].at, planner,
        assignee: [...new Set(acts.map((a) => a.owner).filter(Boolean))].map(name).join(', ') || undefined,
        button: toPlanHere.length ? 'Plan Validation' : unassigned ? `Assign ${unassigned}` : 'Open scope', open: { tab: 'laboratory?stream=' + stream + (toPlanHere.length ? '&plan=' + encodeURIComponent(toPlanHere[0].id) : '') }, keys: [`scope:${job.id}:${k}`] });
    }
    // Assignment alerts, grouped per job, team and assigner, while the assigned work has not been started yet.
    const assignGroups = new Map<string, { list: ActivityRecord[]; at: string; by: string; reassigned: boolean }>(), moved = new Map<string, { list: ActivityRecord[]; at: string; by: string; to: string }>();
    for (const a of lab) {
      if (a.status === 'Completed') continue;
      const h = [...(a.history || [])].reverse().find((x) => x.action === 'assigned' || x.action === 'reassigned');
      if (!h) continue;
      if (h.to === me && a.owner === me && hasAccess(actor, 'jobDetails') && (a.status === 'Scheduled' || (h.action === 'reassigned' && a.status === 'In Progress'))) {
        const k = `${a.stream}:${h.by}`, g = assignGroups.get(k) || { list: [], at: h.at, by: h.by, reassigned: false };
        g.list.push(a); if (h.at > g.at) g.at = h.at; g.reassigned ||= h.action === 'reassigned'; assignGroups.set(k, g);
      } else if (h.from === me && a.owner !== me && a.status === 'Scheduled') {
        const k = `${a.stream}:${a.owner}`, g = moved.get(k) || { list: [], at: h.at, by: h.by, to: a.owner };
        g.list.push(a); if (h.at > g.at) g.at = h.at; moved.set(k, g);
      }
    }
    const describe = (list: ActivityRecord[]) => ({ samples: [...new Set(list.map((a) => a.sampleId))].map(containerOf).join('; '), scope: list.map((a) => a.title + (a.kind === 'validation' ? ' (Validation)' : '') + (a.external ? ` (External · ${a.external.provider})` : '')).join(', '), destination: (list.some((a) => (a.id.startsWith('labscope:') && sampleBoth(a.sampleId)) || (!!a.linkId && o.scope.some((x) => x.linkId === a.linkId && x.stream !== a.stream))) ? 'Both' : list[0].stream) as Stream | 'Both' });
    for (const [k, g] of assignGroups) {
      const stream = g.list[0].stream, n = g.list.length, keys = g.list.map((a) => `lab:assign:${a.id}:${[...(a.history || [])].reverse().find((h) => h.to === me)?.at || a.start}`);
      const first = [...g.list].sort((x, y) => (x.due || '9').localeCompare(y.due || '9'))[0];
      alert({ key: `lab:assigned:${job.id}:${k}:${g.at}:${n}`, kind: 'assignment', jobId: job.id, jobNumber: job.jobNumber, headline: g.list.every((a) => a.external) ? `External coordination ${g.reassigned ? 'reassigned' : 'assigned'} to you · ${[...new Set(g.list.map((a) => a.external!.provider))].join(', ')}` : `${n === 1 ? stream + ' test' : n + ' ' + stream + ' tests'} ${g.reassigned ? 'reassigned' : 'assigned'} to you`, ...describe(g.list), by: g.by, at: g.at, planner: roles[streamLead(stream)] || '', assignee: me, button: 'Open task', open: { tab: 'laboratory?activity=' + encodeURIComponent(first.id) }, keys: [`lab:assigned:${job.id}:${k}:${g.at}:${n}`, ...keys] });
    }
    for (const [k, g] of moved) alert({ key: `lab:moved:${job.id}:${k}:${g.at}:${g.list.length}`, kind: 'moved', jobId: job.id, jobNumber: job.jobNumber, headline: `${g.list.length === 1 ? g.list[0].stream + ' test' : g.list.length + ' ' + g.list[0].stream + ' tests'} reassigned to ${name(g.to)}`, ...describe(g.list), by: g.by, at: g.at, planner: roles[streamLead(g.list[0].stream)] || '', assignee: g.to, button: 'View test', open: { tab: 'laboratory?activity=' + encodeURIComponent(g.list[0].id) }, keys: [`lab:moved:${job.id}:${k}:${g.at}:${g.list.length}`] });
  }
  return { actions: [...actions.values()], waiting: [...waiting.values()], blocked: [...blocked.values()], upcoming: [...upcoming.values()], alerts: [...alerts.values()].sort((x, y) => y.at.localeCompare(x.at)) };
}

export type InboxState = 'action' | 'blocked' | 'waiting' | 'info';
/** One dashboard row per job: everything this employee can do, is waiting on, or is blocked by. */
export type InboxRow = {
  jobId: string; jobNumber: string; client: string; state: InboxState;
  /** Actions available now, primary first. Blocked actions (e.g. assignment with an empty team) are listed separately. */actions: WorkItem[]; blockedActions: WorkItem[];
  waiting: WaitingItem[]; blocked: BlockedItem[]; upcoming: UpcomingItem[]; /** This employee's responsibilities on the job. */roles: string[];
  /** Deadline of the primary action (its own task deadline), never another task's date. */due?: string; dueKind?: DueKind; jobDue?: string;
  overdue: boolean; returned: boolean; isNew: boolean; stage: string; open: WorkItem['open']; additionalWork: boolean;
};
const stateRank: Record<InboxState, number> = { action: 0, blocked: 1, waiting: 2, info: 3 };

/**
 * Groups workItems() output by job. Rows exist only for jobs this employee acts on, waits on, or currently holds a stage
 * responsibility for (sampling team until sampling approval, driver until receipt, owner of an unfinished test); never company-wide.
 */
export function inboxRows(work: ReturnType<typeof workItems>, jobs: JobRecord[], actor: Actor, today: string, opts: { isNew: (i: WorkItem) => boolean; isClosed: (job: JobRecord) => boolean; stage: (job: JobRecord) => string }): InboxRow[] {
  const me = actor.id, rows = new Map<string, InboxRow>();
  const row = (job: JobRecord) => {
    let r = rows.get(job.id);
    if (!r) rows.set(job.id, r = { jobId: job.id, jobNumber: job.jobNumber, client: job.clientName, state: 'info', actions: [], blockedActions: [], waiting: [], blocked: [], upcoming: [], roles: [], due: undefined, jobDue: job.dueDate || undefined, overdue: false, returned: false, isNew: false, stage: opts.stage(job), open: { tab: 'overview' }, additionalWork: additionalWorkPending(job) });
    return r;
  };
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const teamEmpty = (i: WorkItem) => (i.key.startsWith('assign:') || i.key.startsWith('coord:')) && !!i.stream && !assignmentEngineers(actor,i.stream).length;
  for (const i of sortItems(work.actions, opts.isNew)) { const job = byId.get(i.jobId); if (job) (teamEmpty(i) ? row(job).blockedActions : row(job).actions).push(i); }
  for (const w of work.waiting) { const job = byId.get(w.jobId); if (job) row(job).waiting.push(w); }
  for (const u of work.upcoming || []) { const job = byId.get(u.jobId); if (job) row(job).upcoming.push(u); }
  for (const job of jobs) {
    if (rows.has(job.id) || isDraft(job) || !canSeeDraft(job, actor) || opts.isClosed(job)) continue;
    // Current responsibility only: ownership, dispatch and finished assignments stay in the job's history, not in this list.
    const o = operationsFor(job), sampled = samplingApproved(job);
    const sampling = !sampled && !!o.dispatchedAt && samplingTeam(job).includes(me);
    const transport = sampled && job.assignedDriverId === me && !o.handover?.receivedAt;
    const testing = o.activities.some((a) => a.required && a.owner === me && a.status !== 'Completed');
    if (sampling || transport || testing) row(job);
  }
  for (const r of rows.values()) {
    r.blocked = work.blocked.filter((b) => b.jobs.includes(r.jobNumber));
    r.state = r.actions.length ? 'action' : r.blockedActions.length || r.waiting.some((w) => w.blocked) ? 'blocked' : r.waiting.length ? 'waiting' : 'info';
    const lead = r.actions[0] || r.blockedActions[0];
    // The row shows the primary action and that action's own deadline.
    if (lead) { r.open = lead.open; r.due = lead.due; r.dueKind = lead.dueKind; }
    else if (r.waiting[0]) r.open = r.waiting[0].open;
    else if (r.upcoming[0]) r.open = r.upcoming[0].open;
    r.roles = [...new Set([...r.actions, ...r.blockedActions].map((i) => i.role).concat(r.upcoming.map((u) => u.role)).filter(Boolean))];
    if (!r.roles.length) { const job = byId.get(r.jobId)!; r.roles = [job.assignedEngineerId === me ? 'Accountable sampling employee' : samplingTeam(job).includes(me) ? 'Backup sampling employee' : '', job.assignedDriverId === me ? 'Driver' : '', ...[...new Set(operationsFor(job).activities.filter((a) => a.owner === me && a.status !== 'Completed').map((a) => a.stream + ' test'))]].filter(Boolean); }
    r.overdue = r.actions.some((i) => i.overdue);
    r.returned = r.actions.some((i) => i.kind === 'returned');
    r.isNew = r.actions.some(opts.isNew);
  }
  const score = (r: InboxRow) => { const p = r.actions[0]; return !p ? 9 : r.overdue ? 0 : p.dueToday ? 1 : p.kind === 'returned' ? 2 : p.kind === 'review' ? 3 : 4; };
  return [...rows.values()].sort((a, b) => stateRank[a.state] - stateRank[b.state] || score(a) - score(b) || (a.due || '9999').localeCompare(b.due || '9999') || a.jobNumber.localeCompare(b.jobNumber));
}
/** Text used by the dashboard search. */
export const rowSearchText = (r: InboxRow) => [r.jobNumber, r.client, r.stage, ...r.roles, ...r.upcoming.flatMap((u) => [u.what, u.test, u.sample]), ...[...r.actions, ...r.blockedActions].flatMap((i) => [i.action, i.test, i.sample, i.container, i.status]), ...r.waiting.flatMap((w) => [w.label, w.what, w.waitingOn, w.test, w.sample])].filter(Boolean).join(' ').toLowerCase();

/** Text used to search one task row. */
export const itemSearchText = (i: { jobNumber: string; client: string; action?: string; what?: string; test?: string; sample?: string; container?: string; status?: string; area: string; role: string }) => [i.jobNumber, i.client, i.action, i.what, i.test, i.sample, i.container, i.status, i.area, i.role].filter(Boolean).join(' ').toLowerCase();
/** Jobs with something this employee must do now: the one count used by My work, Jobs and the navigation. */
export const jobsNeedingAction = (work: { actions: WorkItem[] }) => new Set(work.actions.map((i) => i.jobId));
/** Laboratory streams this employee works in, from duties, current assignments and configured team membership (in that order). */
export function streamsFor(actor: Actor, jobs: JobRecord[]): Stream[] {
  const roles = actorRoles(actor), me = actor.id, out: Stream[] = [];
  for (const stream of ['PVT', 'Chemical'] as const) if (roles[streamLead(stream)] === me) out.push(stream);
  for (const job of jobs) for (const a of operationsFor(job).activities) if (a.owner === me && a.status !== 'Completed' && !out.includes(a.stream)) out.push(a.stream);
  for (const stream of ['PVT', 'Chemical'] as const) if (actor.teams?.[stream]?.includes(me) && !out.includes(stream)) out.push(stream);
  return out;
}
