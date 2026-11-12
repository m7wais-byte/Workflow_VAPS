/**
 * Who may open a job and act on it. The same rule guards the job route, the sampling editor route and every job command,
 * so a hidden link, an edited job ID or another page cannot widen access.
 *
 * Browser-only: this protects the workflow inside the app. It is not server-side security; see WORKFLOW-IMPLEMENTATION.md.
 */
import type { JobRecord } from './page';
import { administratorId } from './authorization';
import { applyOperation, operationsFor, canSeeDraft, isDraft, hasAccess, actorRoles, samplingTeam, type Actor, type Command } from './operations-model';
import { workItems } from './work-items';

export type AccessReason = 'Administrator' | 'Company overview' | 'Job coordinator' | 'Sampling team' | 'Driver' | 'Laboratory assignment'
  | 'Sampling approval' | 'Scope selection' | 'PVT Supervisor' | 'PVT Team Lead' | 'Chemistry Team Lead' | 'Final report' | 'Earlier workflow assignment' | 'Work item';

/** Every legitimate reason this employee has to open the job; empty means no access. */
export function jobAccessReasons(job: JobRecord, actor: Actor, workJobIds?: Set<string>): AccessReason[] {
  const me = actor.id;
  if (job.trash || !hasAccess(actor, 'jobDetails') || !canSeeDraft(job, actor)) return [];
  const out: AccessReason[] = [];
  if (me === administratorId) out.push('Administrator');
  if (hasAccess(actor, 'companyOverview')) out.push('Company overview');
  const o = operationsFor(job), roles = actorRoles(actor), draft = isDraft(job);
  if (job.createdById === me || o.dispatchedBy === me || (draft && hasAccess(actor, 'createJob'))) out.push('Job coordinator');
  if (samplingTeam(job).includes(me)) out.push('Sampling team');
  if (job.assignedDriverId === me) out.push('Driver');
  if (o.activities.some((a) => a.owner === me)) out.push('Laboratory assignment');
  if (!draft) {
    const streams = new Set([...o.activities.filter((a) => a.required).map((a) => a.stream), ...o.scope.map((s) => s.stream)]);
    const lab = !!o.scopeConfirmedAt || o.activities.length > 0 || o.finalReports.length > 0;
    if (roles.samplingApproval === me) out.push('Sampling approval');
    if (roles.scopeSelector === me) out.push('Scope selection');
    if (roles.pvtSupervisor === me && streams.has('PVT')) out.push('PVT Supervisor');
    if (roles.pvtTeamLead === me && streams.has('PVT')) out.push('PVT Team Lead');
    if (roles.chemicalTeamLead === me && streams.has('Chemical')) out.push('Chemistry Team Lead');
    if ((roles.reporting === me || roles.finalApproval === me) && lab) out.push('Final report');
  }
  // Jobs recorded before the current workflow keep the people they named.
  if (!job.operations && !draft) {
    const legacy = [job.responsibleId, job.jobResponsibleId, job.ownerId, job.report?.preparedBy, ...(job.stages || []).map((s) => s.assignedTo), ...Object.values(job.teamWork || {}).map((t) => t?.owner), ...Object.values(job.labPlan?.assignees || {})];
    if (legacy.includes(me)) out.push('Earlier workflow assignment');
  }
  // Anything My work lists for this employee on this job (actions, reviews, waiting items, coming-up duties, alerts).
  const listed = workJobIds ? workJobIds.has(job.id) : jobsInWork(workItems([job], actor, new Date().toISOString().slice(0, 10))).has(job.id);
  if (listed) out.push('Work item');
  return [...new Set(out)];
}

export const canOpenJob = (job: JobRecord, actor: Actor, workJobIds?: Set<string>) => jobAccessReasons(job, actor, workJobIds).length > 0;

/** Job IDs present anywhere in this employee's work items. */
export function jobsInWork(work: Pick<ReturnType<typeof workItems>, 'actions' | 'waiting' | 'upcoming' | 'alerts'>): Set<string> {
  return new Set([...work.actions, ...work.waiting, ...work.upcoming, ...work.alerts].map((i) => i.jobId));
}

export const noJobAccessMessage = 'You do not have a responsibility or assignment on this job, so it cannot be opened or changed from your profile.';

/** Applies a workflow command only when the employee may open the job; the command's own permission and duty checks still run. */
export function applyJobOperation(job: JobRecord, command: Command, actor: Actor, now?: string): JobRecord {
  if (!canOpenJob(job, actor)) throw Error(noJobAccessMessage);
  return applyOperation(job, command, actor, now);
}
