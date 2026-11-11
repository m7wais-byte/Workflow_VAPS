/**
 * One workflow status for every view: Dashboard, job page, My work and the client progress view.
 *
 * Built only from saved records (dispatch, sampling data reviews, sampling-report versions, released laboratory
 * scope, activities and final-report versions). It never adds a mandatory stage the workflow does not have, and an uploaded
 * file never counts as an approval: a test is complete only when QC approved, a report only when approved.
 */
import type { JobRecord } from './page';
import type { Responsibilities } from './authorization';
import { storedResponsibilities, roleHolder } from './authorization';
import {
  operationsFor, isDraft, latestData, latest, samplingApproved, legacyDispatch, dataReviewRequired, unplannedValidation,
  validationScopes, allWorkDone, finalReady, operationComplete, additionalWorkPending, externalStage, validationCatalogue,
  streamLead, latestLabScope, type ActivityRecord, type Stream,
} from './operations-model';
import { preparationDone } from './sampling-validation';
import { jobStages, type TrackState } from './job-workflow-model';
import { teamName } from './team-name';

/** Green · amber · gray · red. Always shown with a text label and an icon, never by colour alone. */
export type FlowState = 'completed' | 'in-progress' | 'not-started' | 'blocked';
export const flowStateLabel: Record<FlowState, string> = { completed: 'Completed', 'in-progress': 'In progress', 'not-started': 'Not started', blocked: 'Blocked' };

export type FlowStep = {
  id: string; label: string; state: FlowState;
  /** Internal, plain-language status, e.g. "Awaiting approval" or "2 of 3 data sheets complete". Never a name or comment. */
  detail: string;
  /** Employee who acts on this step now (internal views only). */owner?: string;
  /** Team or role responsible, e.g. "Sampling team", "PVT Team Lead". */team: string;
  /** Returned for correction (red). */correction?: boolean;
  /** Cannot move until a missing setting is configured (red). */setting?: boolean;
  /** Added after the original scope. */additional?: boolean;
  /** Third-party laboratory work (internal views only). */external?: boolean;
  sample?: string; due?: string; /** When the step was completed. */at?: string;
};
export type FlowGroup = { id: string; label: string; state: FlowState; steps: FlowStep[]; stream?: Stream; kind: 'steps' | 'planning' | 'validation' | 'tests'; note?: string };
export type FlowSectionId = 'sampling' | 'laboratory' | 'report';
export type FlowSection = {
  id: FlowSectionId; label: string; state: FlowState; groups: FlowGroup[]; done: number; total: number; current: boolean;
  /** Short status line under the section, e.g. "4 of 6 steps completed". */summary: string;
  /** Tests are not known yet: the laboratory scope is selected after the sampling report is approved. */pendingScope?: boolean;
  notes: string[]; completedAt?: string;
};
export type FlowNow = { section: FlowSectionId; team: string; text: string; owners: string[]; state: FlowState };
export type JobFlow = {
  sections: FlowSection[]; state: FlowState; status: string; current: string; now: FlowNow[]; next: string; nextTeam?: string;
  done: number; total: number; summary: string; closed: boolean; draft: boolean; correction: boolean; blocked: boolean;
  additionalWork: boolean; responsible: string[]; responsibleIds: string[]; lastUpdate?: string;
};

const isTransfer = (job: JobRecord) => /Transfer/i.test(job.samplingSource || '');
const short = (title: string) => title.split(' — ').slice(1).join(' — ') || title;
const order: Record<FlowState, number> = { blocked: 0, 'in-progress': 1, 'not-started': 2, completed: 3 };

/** A group or section: completed when every step is, blocked when any step is, in progress once anything has started. */
export function combineStates(states: FlowState[]): FlowState {
  if (!states.length) return 'not-started';
  if (states.every((s) => s === 'completed')) return 'completed';
  if (states.includes('blocked')) return 'blocked';
  return states.some((s) => s !== 'not-started') ? 'in-progress' : 'not-started';
}
const group = (g: Omit<FlowGroup, 'state'>): FlowGroup => ({ ...g, state: combineStates(g.steps.map((s) => s.state)) });

/** One laboratory activity: complete only when QC approved; a returned workbook needs correction. */
export function activityStep(a: ActivityRecord, roles: Responsibilities, additional: boolean): FlowStep {
  const lead = roles[streamLead(a.stream)], qc = roles.qcReviewer, ext = externalStage(a);
  const base = { id: 'act:' + a.id, label: (a.kind === 'validation' ? a.title : short(a.title)) + ' · Sample ' + a.sampleId, sample: a.sampleId, due: a.due || undefined, additional, external: !!a.external };
  const done = a.files.at(-1)?.qcApprovedAt || [...(a.history || [])].reverse().find((h) => h.action === 'qc-approved')?.at;
  switch (a.status) {
    case 'Completed': return { ...base, state: 'completed', detail: 'QC approved', team: teamName(a.stream) + ' team', at: done };
    case 'Changes Requested': return { ...base, state: 'blocked', correction: true, detail: ext ? 'Returned · results to be corrected' : 'Returned for correction', team: teamName(a.stream) + ' team', owner: a.owner || undefined };
    case 'QC Returned': return { ...base, state: 'blocked', correction: true, detail: 'Returned by QC · with team lead', team: a.stream + ' Team Lead', owner: lead || undefined };
    case 'Awaiting QC': return qc ? { ...base, state: 'in-progress', detail: 'QC review', team: 'QC review', owner: qc } : { ...base, state: 'blocked', setting: true, detail: 'QC reviewer not configured', team: 'QC review' };
    case 'Workbook Submitted': return { ...base, state: 'in-progress', detail: ext ? 'External results · team-lead review' : 'Team-lead review', team: a.stream + ' Team Lead', owner: lead || undefined };
    case 'In Progress': return { ...base, state: 'in-progress', detail: ext || 'In progress', team: teamName(a.stream) + ' team', owner: a.owner || undefined };
    default:
      if (!a.owner) return { ...base, state: 'not-started', detail: a.external ? 'Awaiting internal coordinator' : 'Awaiting assignment', team: a.stream + ' Team Lead', owner: lead || undefined };
      return { ...base, state: 'not-started', detail: ext || (a.start ? 'Assigned · planned start ' + a.start : 'Assigned · not started'), team: teamName(a.stream) + ' team', owner: a.owner };
  }
}

function samplingSection(job: JobRecord, roles: Responsibilities): FlowSection {
  const o = operationsFor(job), d = latestData(job), r = latest(o.samplingReports), draft = isDraft(job), transfer = isTransfer(job);
  const legacy = legacyDispatch(job), approved = samplingApproved(job), dispatched = !!o.dispatchedAt || legacy, reviewed = dataReviewRequired(job);
  const lead = job.assignedEngineerId || undefined, approver = roles.samplingApproval || undefined, team = transfer ? 'Transfer team' : 'Sampling team';
  const samples = job.samples || [], sheets = samples.filter((s) => s.dataComplete).length;
  const submitted = ['Submitted', 'Approved'].includes(d?.status || '') || approved;
  const dataApproved = d?.status === 'Approved' || approved;
  const reportSubmitted = approved || ['Checking', 'Awaiting Approval', 'Approved'].includes(r?.status || '');
  const prepDone = dispatched && (preparationDone(job) || submitted || legacy);
  const steps: FlowStep[] = [];
  steps.push(draft
    ? { id: 'sampling:assign', label: 'Assigned to ' + team.toLowerCase(), state: 'not-started', detail: 'Job draft · not sent yet', team: 'Job coordinator', owner: job.createdById }
    : { id: 'sampling:assign', label: 'Assigned to ' + team.toLowerCase(), state: dispatched ? 'completed' : 'in-progress', detail: dispatched ? (legacy ? 'Earlier workflow · dispatch not recorded' : 'Sent to ' + team.toLowerCase()) : 'Send the job to Sampling', team: 'Job coordinator', owner: dispatched ? undefined : job.createdById, at: o.dispatchedAt });
  steps.push({ id: 'sampling:preparation', label: transfer ? 'Transfer preparation' : 'Sampling preparation', team, owner: lead,
    ...(prepDone ? { state: 'completed', detail: 'Completed' } : dispatched ? { state: 'in-progress', detail: 'Preparation checklist in progress' } : { state: 'not-started', detail: 'After the job is sent' }) } as FlowStep);
  const dataLabel = transfer ? 'Sample transfer data' : 'Field sampling & data sheets', sheetText = samples.length ? `${sheets} of ${samples.length} data sheets complete` : 'Sample records not created yet';
  steps.push({ id: 'sampling:data', label: dataLabel, team, owner: lead,
    ...(d?.status === 'Returned' ? { state: 'blocked', correction: true, detail: 'Returned for correction' }
      : submitted || (!reviewed && (r || legacy)) ? { state: 'completed', detail: approved || d ? 'Submitted' : sheetText, at: d?.submittedAt }
      : prepDone ? { state: 'in-progress', detail: d?.status === 'Reopened' ? 'Reopened for correction · ' + sheetText : sheetText }
      : { state: 'not-started', detail: 'After preparation' }) } as FlowStep);
  if (reviewed) steps.push({ id: 'sampling:data-review', label: 'Data review & approval', team: 'Sampling approval', owner: approver,
    ...(dataApproved ? { state: 'completed', detail: 'Data approved', at: d?.reviewedAt }
      : d?.status === 'Submitted' ? (approver ? { state: 'in-progress', detail: 'Awaiting review' } : { state: 'blocked', setting: true, detail: 'Sampling approver not configured' })
      : d?.status === 'Returned' ? { state: 'not-started', detail: 'Waiting for the corrected data' }
      : { state: 'not-started', detail: 'After the data is submitted' }) } as FlowStep);
  steps.push({ id: 'sampling:report', label: 'Sampling report preparation', team, owner: r?.preparedBy || lead,
    ...(reportSubmitted ? { state: 'completed', detail: 'Submitted for approval', at: r?.submittedAt }
      : r?.status === 'Changes Requested' ? { state: 'blocked', correction: true, detail: 'Returned for correction' }
      : dataApproved || (!reviewed && dispatched) ? { state: 'in-progress', detail: r?.status === 'Draft' ? 'Draft in preparation' : 'Ready to prepare' }
      : { state: 'not-started', detail: 'After the data is approved' }) } as FlowStep);
  steps.push({ id: 'sampling:approval', label: 'Sampling report approval', team: r?.status === 'Checking' ? 'Report checker' : 'Sampling approval', owner: r?.status === 'Checking' ? r.checker : approver,
    ...(approved ? { state: 'completed', detail: 'Approved', at: r?.approvedAt || job.report?.approvedAt }
      : r?.status === 'Awaiting Approval' ? (approver ? { state: 'in-progress', detail: 'Awaiting approval' } : { state: 'blocked', setting: true, detail: 'Sampling approver not configured' })
      : r?.status === 'Checking' ? { state: 'in-progress', detail: 'With the report checker' }
      : { state: 'not-started', detail: 'After the report is submitted' }) } as FlowStep);
  return section('sampling', transfer ? 'Sample transfer' : 'Sampling', [group({ id: 'sampling', label: transfer ? 'Sample transfer' : 'Sampling', kind: 'steps', steps })], []);
}

function laboratorySection(job: JobRecord, roles: Responsibilities): FlowSection {
  const o = operationsFor(job), approved = samplingApproved(job), notes: string[] = [];
  const intake: FlowStep[] = [];
  const selector = roles.scopeSelector || undefined, draftScope = latestLabScope(job)?.status === 'Draft';
  intake.push({ id: 'lab:scope', label: 'Laboratory scope released', team: 'Scope selection',
    ...(o.scopeConfirmedAt ? { state: 'completed', detail: 'Released', at: o.scopeConfirmedAt }
      : approved ? (selector ? { state: 'in-progress', detail: draftScope ? 'Scope draft saved · not released' : 'Selecting tests per sample', owner: selector } : { state: 'blocked', setting: true, detail: 'Scope selection not configured' })
      : { state: 'not-started', detail: 'Selected per sample after the sampling report is approved' }) } as FlowStep);
  if (o.additions.length) {
    const open = o.additions.filter((a) => !a.confirmedAt);
    intake.push({ id: 'lab:additions', label: 'Additional work confirmed', team: 'Scope selection', additional: true,
      ...(open.length ? { state: 'in-progress', detail: `${open.length} request${open.length === 1 ? '' : 's'} awaiting confirmation`, owner: selector } : { state: 'completed', detail: `${o.additions.length} request${o.additions.length === 1 ? '' : 's'} confirmed`, at: o.additions.map((a) => a.confirmedAt || '').sort().at(-1) }) } as FlowStep);
  }
  const groups: FlowGroup[] = [group({ id: 'lab:intake', label: 'Scope', kind: 'steps', steps: intake })];
  const required = o.activities.filter((a) => a.required);
  const additionalScope = new Set(o.scope.filter((s) => s.source === 'Additional work').map((s) => s.id));
  const isAdditional = (a: ActivityRecord) => additionalScope.has(a.scopeId) || a.scopeId.startsWith('addval:');
  const toPlan = unplannedValidation(job), valScopes = validationScopes(job);
  for (const stream of ['PVT', 'Chemical'] as const) {
    const list = required.filter((a) => a.stream === stream), plan = stream === 'PVT' ? toPlan : [];
    if (!list.length && !plan.length && !(stream === 'PVT' && valScopes.length)) continue;
    const lead = roles[streamLead(stream)] || undefined, ready = list.filter((a) => a.owner && a.start && a.due).length;
    const planned = ready === list.length && !plan.length;
    const planDetail = [list.length ? `${ready} of ${list.length} assigned and scheduled` : '', plan.length ? `Validation steps to choose · ${[...new Set(plan.flatMap((p) => p.sampleIds))].length} sample(s)` : ''].filter(Boolean).join(' · ');
    groups.push(group({ id: 'lab:plan:' + stream, label: stream + ' planning', stream, kind: 'planning', steps: [{ id: 'lab:plan:' + stream, label: 'Assign & schedule ' + stream + ' work', team: stream + ' Team Lead',
      ...(planned ? { state: 'completed', detail: 'All work assigned and scheduled' } : lead ? { state: 'in-progress', detail: planDetail, owner: lead } : { state: 'blocked', setting: true, detail: stream + ' Team Lead not configured' }) } as FlowStep] }));
    const sampleOrder = (a: ActivityRecord, b: ActivityRecord) => a.sampleId.localeCompare(b.sampleId, undefined, { numeric: true });
    const validation = list.filter((a) => a.kind === 'validation').sort((a, b) => sampleOrder(a, b) || validationCatalogue.indexOf(a.title as typeof validationCatalogue[number]) - validationCatalogue.indexOf(b.title as typeof validationCatalogue[number]));
    if (stream === 'PVT' && (validation.length || plan.length)) {
      const g = group({ id: 'lab:validation', label: 'Validation', stream, kind: 'validation', steps: validation.map((a) => activityStep(a, roles, isAdditional(a))) });
      if (plan.length) { g.note = 'Steps for sample ' + [...new Set(plan.flatMap((p) => p.sampleIds))].join(', ') + ' are chosen by the PVT Team Lead.'; if (g.state === 'completed') g.state = 'in-progress'; }
      groups.push(g);
    }
    const tests = list.filter((a) => a.kind !== 'validation').sort(sampleOrder);
    if (tests.length) groups.push(group({ id: 'lab:tests:' + stream, label: stream + ' tests', stream, kind: 'tests', steps: tests.map((a) => activityStep(a, roles, isAdditional(a))) }));
  }
  const pendingScope = !o.scopeConfirmedAt;
  if (pendingScope) notes.push('Laboratory tests are selected per sample after the sampling report is approved.');
  else if (!required.length && !valScopes.length) notes.push('The released scope has no laboratory tests.');
  if (required.some((a) => a.external)) notes.push('Includes work performed by a third-party laboratory and reviewed internally.');
  const s = section('laboratory', 'Laboratory', groups, notes);
  s.pendingScope = pendingScope;
  // Never complete while required work, Validation planning is outstanding.
  if (s.state === 'completed' && (pendingScope || !allWorkDone(job))) s.state = 'in-progress';
  if (pendingScope) s.summary += ' · tests to be confirmed';
  return s;
}

/** Comments the model writes when it reopens a final report itself (operations-model.ts), as opposed to a reviewer's return. */
const systemReopen = (comments?: string) => /^(Scope or workbook state changed|Additional work or workbook correction)/.test(comments || '');
function reportSection(job: JobRecord, roles: Responsibilities): FlowSection {
  const o = operationsFor(job), final = latest(o.finalReports), ready = finalReady(job), complete = operationComplete(job), notes: string[] = [];
  const preparer = roles.reporting || undefined, approver = roles.finalApproval || undefined;
  const previous = o.finalReports.filter((r) => r.status === 'Approved' && r.approvedAt);
  const reopened = !complete && final?.status === 'Approved';
  if (previous.length && !complete) notes.push(`Report v${previous.at(-1)!.version} was approved earlier and is kept. A revised report is required for the additional work.`);
  const steps: FlowStep[] = [];
  const waitText = 'Starts when all laboratory work is QC approved and samples are received';
  steps.push({ id: 'report:prep', label: previous.length && !complete ? 'Revised final report preparation' : 'Final report preparation', team: 'Final report preparation', owner: preparer, additional: reopened || undefined,
    ...(complete || (!reopened && ['Checking', 'Awaiting Approval'].includes(final?.status || '')) ? { state: 'completed', detail: 'Submitted for approval', at: final?.submittedAt }
      // The workflow itself reopens a report when scope or workbooks change; only a reviewer's return is a correction.
      : final?.status === 'Changes Requested' && !systemReopen(final.comments) ? (ready ? { state: 'blocked', correction: true, detail: 'Returned for correction' } : { state: 'not-started', detail: 'Returned for correction · resumes when laboratory work is complete' })
      : final?.status === 'Changes Requested' ? (ready ? { state: 'in-progress', detail: 'Revision required' } : { state: 'not-started', detail: 'Revision required · after the additional work is QC approved' })
      : ready ? (preparer ? { state: 'in-progress', detail: final?.status === 'Draft' ? 'Draft in preparation' : 'Ready to prepare' } : { state: 'blocked', setting: true, detail: 'Report preparation not configured' })
      : { state: 'not-started', detail: waitText }) } as FlowStep);
  if (o.finalReports.some((r) => r.checker)) steps.push({ id: 'report:check', label: 'Final report check', team: 'Report checker', owner: final?.checker || undefined,
    ...(complete || (!reopened && final?.status === 'Awaiting Approval') ? { state: 'completed', detail: 'Checked', at: final?.checkedAt } : final?.status === 'Checking' ? { state: 'in-progress', detail: 'With the report checker' } : { state: 'not-started', detail: 'After preparation' }) } as FlowStep);
  steps.push({ id: 'report:approval', label: 'Final approval', team: 'Final report approval', owner: approver,
    ...(complete ? { state: 'completed', detail: 'Approved', at: final?.approvedAt }
      : final?.status === 'Awaiting Approval' ? (approver ? { state: 'in-progress', detail: 'Awaiting approval' } : { state: 'blocked', setting: true, detail: 'Final approval not configured' })
      : { state: 'not-started', detail: 'After the report is submitted' }) } as FlowStep);
  return section('report', 'Final report', [group({ id: 'report', label: 'Final report', kind: 'steps', steps })], notes);
}

function section(id: FlowSectionId, label: string, groups: FlowGroup[], notes: string[]): FlowSection {
  const steps = groups.flatMap((g) => g.steps), done = steps.filter((s) => s.state === 'completed').length;
  const state = combineStates(groups.map((g) => g.state));
  const at = state === 'completed' ? steps.map((s) => s.at || '').sort().at(-1) || undefined : undefined;
  return { id, label, groups, done, total: steps.length, state, current: false, notes, completedAt: at, summary: steps.length ? `${done} of ${steps.length} steps completed` : 'No steps recorded' };
}

/** Jobs recorded before the current workflow: their own recorded stages, without a final-report stage they never had. */
function legacySections(job: JobRecord): FlowSection[] {
  const map = (s: TrackState): FlowState => s === 'done' ? 'completed' : s === 'active' ? 'in-progress' : 'not-started';
  const out: FlowSection[] = [];
  const stages = jobStages(job);
  const sampling = stages.find((s) => s.id === 'sampling');
  if (sampling) out.push(section('sampling', sampling.label, [group({ id: 'sampling', label: sampling.label, kind: 'steps', steps: sampling.tasks.map((t) => ({ id: t.id, label: t.label, state: map(t.state), detail: t.status, team: 'Sampling team', owner: t.owner })) })], ['Recorded in the earlier workflow.']));
  const lab = stages.filter((s) => s.id === 'delivery' || s.id === 'lab');
  if (lab.length) out.push(section('laboratory', 'Laboratory', lab.map((s) => group({ id: 'lab:' + s.id, label: s.label, kind: 'steps', steps: s.tasks.map((t) => ({ id: t.id, label: t.label, state: map(t.state), detail: t.status, team: s.id === 'delivery' ? 'Driver' : 'Laboratory team', owner: t.owner })) })), ['Recorded in the earlier workflow.']));
  return out;
}

const phrases: Record<string, string> = { 'Team-lead review': 'in team-lead review', 'QC review': 'in QC review', 'Returned by QC · with team lead': 'returned by QC', 'External results · team-lead review': 'external results in team-lead review' };
const phrase = (detail: string) => phrases[detail] || detail.charAt(0).toLowerCase() + detail.slice(1);
/** Same rules for every view. roles default to the saved responsibilities (demo setup included). */
export function jobFlow(job: JobRecord, roles: Responsibilities = storedResponsibilities(), employees?: { id: string; active: boolean }[]): JobFlow {
  // Resolve each duty to a valid holder so a deactivated employee is never shown as responsible.
  const valid = employees ? Object.fromEntries(Object.keys(roles).map((k) => [k, roleHolder(roles, k as keyof Responsibilities, employees)])) as Responsibilities : roles;
  const modern = !!job.operations || isDraft(job);
  const sections = modern ? [samplingSection(job, valid), laboratorySection(job, valid), reportSection(job, valid)] : legacySections(job);
  const draft = isDraft(job);
  const closed = modern ? operationComplete(job) : sections.length > 0 && sections.every((s) => s.state === 'completed');
  const active = sections.filter((s) => s.state === 'in-progress' || s.state === 'blocked');
  const current = closed ? [] : active.length ? active : sections.filter((s) => s.state === 'not-started').slice(0, 1);
  for (const s of current) s.current = true;
  const steps = sections.flatMap((s) => s.groups.flatMap((g) => g.steps.map((step) => ({ step, g, s }))));
  const correction = steps.some((x) => x.step.correction), blocked = steps.some((x) => x.step.setting);

  // What is happening now: every active step; laboratory tests are summarised per team so parallel work stays readable.
  const now: FlowNow[] = [];
  for (const s of sections) for (const g of s.groups) {
    const live = g.steps.filter((x) => x.state === 'in-progress' || x.state === 'blocked');
    if (!live.length) continue;
    if (g.kind === 'tests' || g.kind === 'validation') {
      const byDetail = new Map<string, FlowStep[]>();
      for (const x of live) byDetail.set(x.detail, [...(byDetail.get(x.detail) || []), x]);
      for (const [detail, list] of byDetail) now.push({ section: s.id, team: list[0].team, text: `${g.label} · ${list.length} ${phrase(detail)}`, owners: [...new Set(list.map((x) => x.owner).filter(Boolean) as string[])], state: list.some((x) => x.state === 'blocked') ? 'blocked' : 'in-progress' });
    } else for (const x of live) now.push({ section: s.id, team: x.team, text: `${x.label} · ${x.detail}`, owners: x.owner ? [x.owner] : [], state: x.state });
  }
  now.sort((a, b) => order[a.state] - order[b.state]);
  // What happens next: the first step not started yet, outside groups that already have work moving in parallel.
  // Parallel test and Validation items are part of "now", not the next milestone.
  const firstLive = steps.findIndex((x) => x.step.state !== 'completed');
  const nextStep = firstLive < 0 ? undefined : steps.slice(firstLive).find((x) => x.step.state === 'not-started' && x.g.kind !== 'tests' && x.g.kind !== 'validation');
  const lab = sections.find((s) => s.id === 'laboratory');
  const next = closed ? 'No further steps · all required work and approvals are complete'
    : nextStep ? nextStep.step.label
    : lab?.pendingScope && sections.find((s) => s.id === 'sampling')?.state !== 'completed' ? 'Laboratory scope release'
    : sections.find((s) => s.state !== 'completed' && !s.current)?.label || 'Complete the work in progress';
  const counted = steps.map((x) => x.step), done = counted.filter((s) => s.state === 'completed').length;
  const additionalWork = modern && additionalWorkPending(job);
  const status = draft ? 'Draft' : closed ? 'Completed' : correction ? 'Correction needed' : blocked ? 'Blocked' : additionalWork ? 'Additional work in progress' : 'In progress';
  const state: FlowState = closed ? 'completed' : correction || blocked ? 'blocked' : draft ? 'not-started' : 'in-progress';
  const responsible = closed ? [] : [...new Set(now.map((n) => n.team))];
  return {
    sections, state, status, current: closed ? 'Completed' : current.map((s) => s.label).join(' + ') || 'Not started', now, next, nextTeam: nextStep?.step.team,
    done, total: counted.length, summary: `${done} of ${counted.length} required steps completed${lab?.pendingScope ? ' · laboratory tests to be confirmed' : ''}`,
    closed, draft, correction, blocked, additionalWork, responsible, responsibleIds: [...new Set(now.flatMap((n) => n.owners))], lastUpdate: job.lastUpdatedAt || undefined,
  };
}

/** Schedule warning, kept separate from the workflow status: a job can be in progress and overdue. */
export const flowOverdue = (job: JobRecord, flow: Pick<JobFlow, 'closed' | 'draft'>, today: string) => !flow.closed && !flow.draft && !!job.dueDate && job.dueDate < today;

/** Agreed scope in plain words, from the saved job and released laboratory scope only (no reference-only requests). */
export function scopeSummary(job: JobRecord): string[] {
  const o = operationsFor(job), lines: string[] = [];
  const samples = job.samples?.length || Number(job.requestedSampleCount) || 0;
  const method = job.samplingSource === 'Other' && job.otherSamplingType ? 'Other — ' + job.otherSamplingType : job.samplingSource;
  if (method) lines.push(`${method}${samples ? ` · ${samples} sample${samples === 1 ? '' : 's'}` : ''}`);
  const required = o.activities.filter((a) => a.required);
  for (const stream of ['PVT', 'Chemical'] as const) {
    const list = required.filter((a) => a.stream === stream);
    const tests = new Map<string, Set<string>>();
    for (const a of list.filter((x) => x.kind !== 'validation')) tests.set(short(a.title), (tests.get(short(a.title)) || new Set()).add(a.sampleId));
    const val = new Set(list.filter((x) => x.kind === 'validation').map((x) => x.sampleId));
    if (stream === 'PVT') for (const s of unplannedValidation(job)) for (const id of s.sampleIds) val.add(id);
    const parts = [...(val.size ? [`Validation (${val.size} sample${val.size === 1 ? '' : 's'})`] : []), ...[...tests].map(([name, ids]) => `${name}${ids.size > 1 ? ` (${ids.size} samples)` : ''}`)];
    if (parts.length) lines.push(`${teamName(stream)}: ${parts.join(', ')}`);
  }
  if (!o.scopeConfirmedAt) lines.push('Laboratory tests: to be confirmed after the sampling report is approved');
  return lines;
}

/** Client presentation: completed / in progress / not started only. No names, comments, returns, settings or providers. */
export type ClientStep = { id: string; label: string; state: Exclude<FlowState, 'blocked'>; at?: string };
export type ClientSection = { id: string; label: string; state: Exclude<FlowState, 'blocked'>; summary: string; groups: { id: string; label: string; steps: ClientStep[] }[]; note?: string; completedAt?: string };
export const clientState = (s: FlowState): Exclude<FlowState, 'blocked'> => s === 'blocked' ? 'in-progress' : s;
export function clientSections(flow: JobFlow): ClientSection[] {
  return flow.sections.map((s) => ({
    id: s.id, label: s.label, state: clientState(s.state), completedAt: s.completedAt,
    summary: s.total ? `${s.done} of ${s.total} steps completed` : '', note: s.pendingScope ? 'Laboratory tests are confirmed after the sampling report is approved.' : undefined,
    groups: s.groups.filter((g) => g.steps.length).map((g) => ({ id: g.id, label: g.label, steps: g.steps.map((x) => ({ id: x.id, label: x.label, state: clientState(x.state), at: x.state === 'completed' ? x.at : undefined })) })),
  }));
}
/** "Laboratory: in progress" style text for the client, from the same flow. */
export const clientStatus = (flow: JobFlow) => flow.closed ? 'Completed' : flow.draft ? 'Not started' : 'In progress';
