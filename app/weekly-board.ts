/**
 * Weekly plan board: PVT laboratory tests laid out as job rows against calendar days, coloured by the assigned
 * equipment, with the planned final-report date ("R") in its own block. Read-only: everything is derived from the
 * same saved records as the workflow (activities and the report estimate), so the board never needs its own entry.
 * Chemistry tests are not shown.
 */
import type { JobRecord } from './page';
import { operationsFor, labStatus, isTrashed, type ActivityRecord } from './operations-model';
import { addDays } from './local-date';
import { daysBetween } from './schedule-estimate';
import { normalizeFluid, type FluidType } from './scope-catalogue';
import { equipmentName } from './lab-equipment';

const iso = /^\d{4}-\d{2}-\d{2}$/;
export const boardDays = 14;
/** The working week runs Sunday–Thursday; Friday and Saturday are the weekend. */
export const isWeekend = (day: string) => { const d = new Date(day + 'T00:00:00').getDay(); return d === 5 || d === 6; };
/** Sunday on or before the given day. */
export const weekStart = (day: string) => addDays(day, -new Date(day + 'T00:00:00').getDay());

export type BoardActivity = { id: string; title: string; sampleId: string; owner: string; equipment?: string; start: string; due: string; status: string; validation: boolean; external?: string; notes: string };
export type BoardBar = { key: string; label: string; equipment?: string; start: string; end: string; /** Column indexes inside the window (clipped). */from: number; to: number; clippedStart: boolean; clippedEnd: boolean; lane: number; activities: BoardActivity[]; samples: string[]; done: boolean };
export type BoardReport = { date: string; kind: 'planned' | 'issued' };
export type BoardRow = { jobId: string; jobNumber: string; client: string; name: string; sampleDetails: string; group: string; bars: BoardBar[]; lanes: number; /** PVT tests still without dates. */unscheduled: BoardActivity[]; all: BoardActivity[]; report?: BoardReport };
export type Board = { start: string; end: string; days: string[]; groups: { name: string; rows: BoardRow[] }[]; reports: (BoardRow & { report: BoardReport; col: number })[] };

const jobName = (j: JobRecord) => (j.wellMode === 'multiple' ? (j.wells || []).filter(Boolean).join(', ') : j.well) || j.fieldArea || j.jobNumber;
const view = (a: ActivityRecord): BoardActivity => ({ id: a.id, title: a.title, sampleId: a.sampleId, owner: a.owner, equipment: a.equipment, start: a.start, due: a.due, status: labStatus(a), validation: a.kind === 'validation', external: a.external?.provider, notes: a.notes });

/** Fluid type of the job's samples in the latest laboratory scope; the most common one names the group. */
function fluidGroup(job: JobRecord): string {
  const scopes = operationsFor(job).labScopes || [];
  const latest = [...scopes].reverse().find((s) => s.status === 'Released') || scopes.at(-1);
  const count = new Map<FluidType, number>();
  for (const s of latest?.samples || []) { const f = normalizeFluid(s.fluidType); if (f && !s.excluded) count.set(f, (count.get(f) || 0) + 1); }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other';
}
const groupOrder = ['Black Oil', 'Gas Condensate'];
const groupRank = (g: string) => { const i = groupOrder.indexOf(g); return i < 0 ? (g === 'Other' ? 99 : 50) : i; };

/** Planned report submission date: the report estimate; once the final report is approved, the date it was issued. */
export function reportDate(job: JobRecord, closed: boolean): BoardReport | undefined {
  const o = operationsFor(job);
  const issued = o.finalReports.filter((r) => r.status === 'Approved' && r.approvedAt).at(-1)?.approvedAt?.slice(0, 10);
  if (closed && issued) return { date: issued, kind: 'issued' };
  const plan = o.progressPlan?.report;
  return plan?.finish ? { date: plan.finish, kind: 'planned' } : undefined;
}

export function weeklyBoard(jobs: { job: JobRecord; closed: boolean }[], start: string, days = boardDays): Board {
  const end = addDays(start, days - 1);
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const rows: BoardRow[] = [];
  // Rows kept while the job has PVT work to show: open tests, or tests planned inside the window.
  const shownIds = new Set<string>();
  for (const { job, closed } of jobs) {
    if (isTrashed(job)) continue;
    const pvt = operationsFor(job).activities.filter((a) => a.stream === 'PVT');
    const scheduled = pvt.filter((a) => iso.test(a.start) && iso.test(a.due) && a.due >= a.start);
    const inWindow = scheduled.filter((a) => a.start <= end && a.due >= start);
    const open = pvt.some((a) => a.status !== 'Completed');
    const report = reportDate(job, closed);
    // One bar per test on one equipment over the same dates; Validation steps planned together share a bar.
    const grouped = new Map<string, ActivityRecord[]>();
    for (const a of inWindow) { const k = [a.kind === 'validation' ? 'validation' : a.title, a.equipment || '', a.start, a.due].join('|'); grouped.set(k, [...(grouped.get(k) || []), a]); }
    const bars: BoardBar[] = [...grouped.entries()].map(([key, list]) => {
      const first = list[0]; const titles = [...new Set(list.map((a) => a.title))];
      return { key, label: titles.length === 1 ? titles[0] : 'Validation', equipment: first.equipment, start: first.start, end: first.due,
        from: Math.max(0, daysBetween(start, first.start)), to: Math.min(days - 1, daysBetween(start, first.due)), clippedStart: first.start < start, clippedEnd: first.due > end,
        lane: 0, activities: list.map(view), samples: [...new Set(list.map((a) => a.sampleId))], done: list.every((a) => a.status === 'Completed') };
    }).sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.label.localeCompare(b.label));
    const laneEnd: number[] = [];
    for (const b of bars) { let lane = laneEnd.findIndex((e) => e < b.from); if (lane < 0) lane = laneEnd.length; laneEnd[lane] = b.to; b.lane = lane; }
    const samples = new Set(pvt.map((a) => a.sampleId));
    const n = samples.size || job.samples?.length || 0;
    rows.push({ jobId: job.id, jobNumber: job.jobNumber, client: job.clientName, name: jobName(job),
      sampleDetails: [n ? `${n} sample${n === 1 ? '' : 's'}` : '', job.samplingSource || ''].filter(Boolean).join(' · '),
      group: fluidGroup(job), bars, lanes: Math.max(1, laneEnd.length), unscheduled: pvt.filter((a) => !scheduled.includes(a) && a.status !== 'Completed').map(view), all: pvt.map(view), report });
    if ((open && !closed) || bars.length > 0) shownIds.add(job.id);
  }
  const shown = rows.filter((r) => shownIds.has(r.jobId));
  const names = [...new Set(shown.map((r) => r.group))].sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b));
  const byNumber = (a: BoardRow, b: BoardRow) => a.jobNumber.localeCompare(b.jobNumber);
  return { start, end, days: dayList,
    groups: names.map((name) => ({ name, rows: shown.filter((r) => r.group === name).sort(byNumber) })),
    reports: rows.filter((r): r is BoardRow & { report: BoardReport } => !!r.report && r.report.date >= start && r.report.date <= end)
      .map((r) => ({ ...r, col: daysBetween(start, r.report.date) })).sort((a, b) => a.report.date.localeCompare(b.report.date) || byNumber(a, b)) };
}

/**
 * Advisory check for the PVT Team Lead: other open PVT tests already planned on the same equipment in the proposed
 * dates. Steps of the same sample in the same job are not counted (they share the equipment in sequence). Never blocks.
 */
export type EquipmentClash = { id: string; jobNumber: string; task: string; start: string; end: string };
export function equipmentClashes(jobs: JobRecord[], equipment: string, start: string, end: string, self: { jobId: string; sampleId: string }): EquipmentClash[] | null {
  if (!equipment || !iso.test(start) || !iso.test(end) || end < start) return null;
  const out: EquipmentClash[] = [];
  for (const job of jobs) {
    if (isTrashed(job) || job.status === 'Completed') continue;
    for (const a of operationsFor(job).activities) {
      if (a.equipment !== equipment || a.status === 'Completed' || !iso.test(a.start) || !iso.test(a.due)) continue;
      if (job.id === self.jobId && a.sampleId === self.sampleId) continue;
      if (a.start <= end && a.due >= start) out.push({ id: a.id, jobNumber: job.jobNumber, task: `${a.title} · Sample ${a.sampleId}`, start: a.start, end: a.due });
    }
  }
  return out.sort((x, y) => x.start.localeCompare(y.start) || x.jobNumber.localeCompare(y.jobNumber));
}
export { equipmentName };
