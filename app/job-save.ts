/**
 * What happens to a job record every time it is saved, shared by the browser (persistJobs in page.tsx) and the
 * server data layer (server/job-commands.ts) so both apply exactly the same rules.
 */
import type { JobRecord } from './page';
import { labComplete, reconcileLabScope } from './lab-work';
import { trackChanges } from './job-workflow-model';

/** Every employee a job names as responsible, assigned or preparing. */
export function assignmentRefs(j: JobRecord): (string | undefined)[] {
  return [j.responsibleId, j.jobResponsibleId, j.assignedEngineerId, j.assignedDriverId, ...j.stages.map(s => s.assignedTo), ...Object.values(j.teamWork || {}).map(t => t.owner), ...Object.values(j.labPlan?.assignees || {}), j.report?.preparedBy];
}

/** Refuses a save that names an employee who was not already on the job and is not active. */
export function assertActiveAssignments(item: JobRecord, previous: JobRecord | undefined, isActive: (id: string) => boolean) {
  if (item.trash) return;
  const before = previous ? assignmentRefs(previous) : [];
  if (assignmentRefs(item).some(id => id && !before.includes(id) && !isActive(id))) throw Error('New assignments require an active employee.');
}

/** Reconciles earlier-workflow lab scope, clears a premature analysis completion and appends workflow history. */
export function prepareJobForSave(item: JobRecord, previous: JobRecord | undefined): JobRecord {
  if (item.trash) return item;
  const reconciled = item.operations ? item : reconcileLabScope(item);
  const task = reconciled.teamWork?.analysis;
  if (task?.completedAt && !labComplete(reconciled)) {
    reconciled.teamWork = { ...reconciled.teamWork, analysis: { ...task, completedAt: undefined } };
  }
  return trackChanges(reconciled, previous);
}
