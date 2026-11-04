'use client';
import { AlertTriangle, CalendarCheck2, CalendarX2 } from 'lucide-react';
import type { Employee } from './employee-directory';
import type { JobRecord } from './page';
import { scheduleOverlaps, formatRange } from './schedule-overlap';

type Dept = { id: string; name: string };
const deptName = (id: string, departments?: Dept[]) => departments?.find((d) => d.id === id)?.name || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Other');

/**
 * Options for every person-assignment picker: the full active directory, grouped by department, with the current
 * user marked "(you)". `first` (e.g. the responsible team) is listed on top. An inactive current value stays visible, disabled.
 */
export function PersonOptions({ employees, departments, me, current, first = [], firstLabel, exclude = [] }: { employees: Employee[]; departments?: Dept[]; me?: string; current?: string; first?: string[]; firstLabel?: string; exclude?: string[] }) {
  const label = (e: Employee) => e.name + (e.id === me ? ' (you)' : '') + (e.active ? '' : ' (inactive)');
  const pool = employees.filter((e) => (e.active || e.id === current) && !exclude.includes(e.id));
  const top = first.map((id) => pool.find((e) => e.id === id)).filter((e): e is Employee => !!e);
  const rest = pool.filter((e) => !top.includes(e));
  const groups = [...new Set(rest.map((e) => e.departmentId))].sort((a, b) => deptName(a, departments).localeCompare(deptName(b, departments)));
  return <>
    {top.length > 0 && <optgroup label={firstLabel || 'Suggested'}>{top.map((e) => <option key={e.id} value={e.id} disabled={!e.active}>{label(e)}</option>)}</optgroup>}
    {groups.map((g) => <optgroup key={g} label={deptName(g, departments)}>{rest.filter((e) => e.departmentId === g).sort((a, b) => a.name.localeCompare(b.name)).map((e) => <option key={e.id} value={e.id} disabled={!e.active}>{label(e)}</option>)}</optgroup>)}
  </>;
}

/**
 * Advisory overlap check shown before confirming an assignment. It refreshes whenever the employee or dates change,
 * excludes the assignment being edited and never blocks confirmation.
 */
export function OverlapNotice({ jobs, employees, employeeId, start, end, exclude = [], jobDates = false }: { jobs?: JobRecord[]; employees: Employee[]; employeeId: string; start: string; end: string; exclude?: string[]; /** The proposed range is the job's Job Date → Due Date. */jobDates?: boolean }) {
  if (!employeeId || !jobs) return null;
  const who = employees.find((e) => e.id === employeeId)?.name || 'This employee';
  const list = scheduleOverlaps(jobs, employeeId, start, end, exclude);
  if (!list) return <p className="overlap-note overlap-unknown" role="status"><CalendarX2 size={15} aria-hidden="true" /> Availability not checked: {jobDates ? 'the job needs a Job Date and Due Date' : 'enter the planned start and due date'} to check {who}’s schedule.</p>;
  if (!list.length) return <p className="overlap-note overlap-clear" role="status"><CalendarCheck2 size={15} aria-hidden="true" /> {who} has no other scheduled work between {formatRange(start, end)}{jobDates ? ' (job dates)' : ''}.</p>;
  return <div className="overlap-note overlap-warning" role="status" aria-live="polite">
    <strong><AlertTriangle size={15} aria-hidden="true" /> {who} already has {list.length} scheduled task{list.length === 1 ? '' : 's'} overlapping {formatRange(start, end)}{jobDates ? ' (job dates)' : ''}</strong>
    <ul>{list.map((o) => <li key={o.key}><span className="overlap-job">{o.jobNumber}</span> {o.task} · scheduled {formatRange(o.start, o.end)}{o.jobDates ? ' (job dates)' : ''} · <b>overlap {formatRange(o.from, o.to)}</b></li>)}</ul>
    <small>Advisory only. You can still confirm the assignment if {who} can handle {list.length === 1 ? 'both tasks' : 'the combined work'}.</small>
  </div>;
}
