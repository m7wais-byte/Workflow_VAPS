import type { JobRecord } from './page';
import { operationsFor, samplingTeam, isTrashed } from './operations-model';

/**
 * Advisory schedule check: which of an employee's scheduled assignments overlap a proposed date range.
 * Laboratory tasks use their own planned start and due dates. Sampling and driver assignments have no dates of
 * their own, so they use the job's Job Date → Due Date, and are labelled that way. Completed work is not counted.
 * The check never blocks an assignment.
 */
export type Booking = { key: string; jobId: string; jobNumber: string; task: string; start: string; end: string; /** The dates come from the job, not the task. */jobDates?: boolean };
export type Overlap = Booking & { from: string; to: string };
const iso = /^\d{4}-\d{2}-\d{2}$/;

export function bookings(jobs: JobRecord[], employeeId: string): Booking[] {
  const list: Booking[] = [];
  for (const job of jobs) {
    if (isTrashed(job) || job.status === 'Completed') continue;
    const o = operationsFor(job);
    for (const a of o.activities) {
      if (a.owner !== employeeId || a.status === 'Completed' || !iso.test(a.start) || !iso.test(a.due)) continue;
      list.push({ key: 'activity:' + a.id, jobId: job.id, jobNumber: job.jobNumber, task: `${a.title} · Sample ${a.sampleId}${a.stream ? ' · ' + a.stream : ''}`, start: a.start, end: a.due });
    }
    const start = job.dateReceived || '', end = job.dueDate || '';
    if (!iso.test(start) || !iso.test(end) || end < start) continue;
    // Sampling work is open until the sampling data is approved; transport until the samples are handed over.
    const samplingOpen = (o.samplingData || []).at(-1)?.status !== 'Approved' && !o.samplingReports.some((r) => r.status === 'Approved');
    if (samplingOpen && samplingTeam(job).includes(employeeId)) list.push({ key: 'sampling:' + job.id, jobId: job.id, jobNumber: job.jobNumber, task: job.assignedEngineerId === employeeId ? 'Sampling (accountable)' : 'Sampling (supporting)', start, end, jobDates: true });
    if (!o.handover && job.assignedDriverId === employeeId) list.push({ key: 'driver:' + job.id, jobId: job.id, jobNumber: job.jobNumber, task: 'Sample transport (driver)', start, end, jobDates: true });
  }
  return list;
}

/** Overlaps with the proposed range (inclusive), excluding the assignment being edited. Null when the dates cannot be checked. */
export function scheduleOverlaps(jobs: JobRecord[], employeeId: string, start: string, end: string, exclude: string[] = []): Overlap[] | null {
  if (!employeeId || !iso.test(start) || !iso.test(end) || end < start) return null;
  return bookings(jobs, employeeId).filter((b) => !exclude.includes(b.key) && b.start <= end && b.end >= start)
    .map((b) => ({ ...b, from: b.start > start ? b.start : start, to: b.end < end ? b.end : end }))
    .sort((x, y) => x.from.localeCompare(y.from) || x.jobNumber.localeCompare(y.jobNumber));
}

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (d: string) => { const [y, m, day] = d.split('-').map(Number); return { y, m, day }; };
/** "12 November 2026". */
export const formatDay = (d: string) => { const p = parts(d); return `${p.day} ${months[p.m - 1]} ${p.y}`; };
/** "11–12 November 2026", "30 November – 2 December 2026", or one day. */
export function formatRange(from: string, to: string) {
  if (from === to) return formatDay(from);
  const a = parts(from), b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${a.day}–${b.day} ${months[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.day} ${months[a.m - 1]} – ${b.day} ${months[b.m - 1]} ${b.y}`;
  return `${formatDay(from)} – ${formatDay(to)}`;
}
