/** Next global sequence for the year. It never falls behind a job already recorded, so a lost or stale counter cannot reissue an ID. */
export function nextJobSequence(counter: number, jobs: { id: string; globalSequence?: number }[], yearShort: string): number {
  return Math.max(counter || 0, ...jobs.filter((job) => job.id.split("-")[2] === yearShort).map((job) => job.globalSequence || 0)) + 1;
}
