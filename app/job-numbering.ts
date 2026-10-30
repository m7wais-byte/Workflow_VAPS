type NumberedJob = { id: string; jobNumber?: string; globalSequence?: number; trash?: unknown };
/** Numbering follows active jobs in the current year; deleted trailing numbers can be reused. */
export function nextJobSequence(_counter: number, jobs: NumberedJob[], yearShort: string): number {
  return Math.max(0, ...jobs.filter(job => !job.trash && (job.jobNumber || job.id).split('-')[2] === yearShort).map(job => job.globalSequence || Number((job.jobNumber || job.id).split('-')[3]) || 0)) + 1;
}
/** Keep record keys unique even when a visible job number is reused after deletion. */
export function nextJobRecordId(jobNumber: string, jobs: {id: string}[]): string {
  if (!jobs.some(job => job.id === jobNumber)) return jobNumber;
  let revision = 2;
  while (jobs.some(job => job.id === `${jobNumber}~${revision}`)) revision++;
  return `${jobNumber}~${revision}`;
}
export function assertJobNumberAvailable(job: NumberedJob, jobs: NumberedJob[]): void {
  if (jobs.some(other => other.id !== job.id && !other.trash && (other.jobNumber || other.id) === (job.jobNumber || job.id)))
    throw Error(`Job number ${job.jobNumber || job.id} is already used by an active job. Move that job to Trash before restoring this record; no records were changed.`);
}
