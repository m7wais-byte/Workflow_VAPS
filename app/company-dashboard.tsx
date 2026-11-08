'use client';
/**
 * Dashboard: a shared, read-only view of active jobs across the company. Nothing here opens a job; authorized people
 * reach their work through My work, so job access is never widened by this page.
 */
import { useMemo, useState } from 'react';
import { Search, SearchX } from 'lucide-react';
import type { JobRecord } from './page';
import { flowOverdue, type JobFlow } from './job-flow';
import { MiniTracker, OverdueBadge, StatusBadge, shortDate } from './flow-ui';

export type DashboardJob = { job: JobRecord; flow: JobFlow };
const location = (j: JobRecord) => [j.fieldArea, j.wellMode === 'multiple' ? (j.wells || []).filter(Boolean).join(', ') : j.well, j.facility || j.rigInstallation].filter(Boolean).join(' · ');
type StatusFilter = '' | 'attention' | 'overdue' | 'in-progress' | 'additional';

export function CompanyDashboard({ jobs, today, canActivity, onActivity }: { jobs: DashboardJob[]; today: string; canActivity: boolean; onActivity: () => void }) {
  const [search, setSearch] = useState(''), [client, setClient] = useState(''), [stage, setStage] = useState(''), [status, setStatus] = useState<StatusFilter>(''), [completed, setCompleted] = useState(false);
  const base = useMemo(() => jobs.filter((r) => !r.flow.draft && (completed || !r.flow.closed)), [jobs, completed]);
  const clients = [...new Set(base.map((r) => r.job.clientName))].sort();
  const stages = ['Sampling', 'Sample transfer', 'Laboratory', 'Final report', 'Completed'].filter((s) => base.some((r) => r.flow.current.split(' + ').includes(s)));
  const term = search.trim().toLowerCase();
  const rows = base.filter((r) => {
    const overdue = flowOverdue(r.job, r.flow, today);
    if (client && r.job.clientName !== client) return false;
    if (stage && !r.flow.current.split(' + ').includes(stage)) return false;
    if (status === 'attention' && !(r.flow.correction || r.flow.blocked)) return false;
    if (status === 'overdue' && !overdue) return false;
    if (status === 'in-progress' && (r.flow.correction || r.flow.blocked || r.flow.closed)) return false;
    if (status === 'additional' && !r.flow.additionalWork) return false;
    return !term || [r.job.jobNumber, r.job.clientName, location(r.job), r.flow.current, r.flow.status, ...r.flow.responsible].join(' ').toLowerCase().includes(term);
  }).sort((a, b) => Number(b.flow.correction || b.flow.blocked) - Number(a.flow.correction || a.flow.blocked) || Number(flowOverdue(b.job, b.flow, today)) - Number(flowOverdue(a.job, a.flow, today)) || (a.job.dueDate || '9999').localeCompare(b.job.dueDate || '9999') || a.job.jobNumber.localeCompare(b.job.jobNumber));
  const active = jobs.filter((r) => !r.flow.draft && !r.flow.closed);
  const counts = { active: active.length, attention: active.filter((r) => r.flow.correction || r.flow.blocked).length, overdue: active.filter((r) => flowOverdue(r.job, r.flow, today)).length };
  const filtered = !!(term || client || stage || status);
  const reset = () => { setSearch(''); setClient(''); setStage(''); setStatus(''); };

  return <div className="company-dashboard">
    <header className="page-head"><div><span className="eyebrow">COMPANY OVERVIEW · READ-ONLY</span><h1>Dashboard</h1><p>Where every active job stands. Open your own tasks from <a href="#my-work">My work</a>.</p></div>{canActivity && <button type="button" className="outline-button" onClick={onActivity}>Activity log</button>}</header>
    <dl className="dash-counts" aria-label="Summary">
      <div><dt>Active jobs</dt><dd>{counts.active}</dd></div>
      <div className={counts.attention ? 'is-alert' : ''}><dt>Need attention</dt><dd>{counts.attention}</dd><small>Correction needed or blocked</small></div>
      <div className={counts.overdue ? 'is-warn' : ''}><dt>Overdue</dt><dd>{counts.overdue}</dd><small>Past the job due date</small></div>
    </dl>
    <section className="panel dash-panel" aria-labelledby="dash-title">
      <div className="dash-toolbar">
        <h2 id="dash-title">{completed ? 'Active and completed jobs' : 'Active jobs'} <span className="count-chip">{rows.length}</span></h2>
        <label className="search-field"><Search size={16} aria-hidden /><span className="sr-only">Search jobs</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Job ID, client, field or well" /></label>
        <label className="select-field"><span>Client</span><select value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{clients.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="select-field"><span>Stage</span><select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All stages</option>{stages.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="select-field"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}><option value="">All statuses</option><option value="in-progress">In progress</option><option value="attention">Needs attention</option><option value="overdue">Overdue</option><option value="additional">Additional work</option></select></label>
        <label className="check-field"><input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />Include completed</label>
      </div>
      {rows.length > 0 ? <table className="dash-table">
        <caption className="sr-only">Active jobs, read-only. Jobs open from My work.</caption>
        <thead><tr><th scope="col">Job</th><th scope="col">Field / well</th><th scope="col">Progress</th><th scope="col">Status</th><th scope="col">Responsible now</th><th scope="col">Due</th></tr></thead>
        <tbody>{rows.map(({ job, flow }) => { const overdue = flowOverdue(job, flow, today); return <tr key={job.id} className={flow.correction || flow.blocked ? 'is-attention' : ''}>
          <td data-label="Job"><strong className="job-id">{job.jobNumber}</strong><span className="sub">{job.clientName}</span></td>
          <td data-label="Field / well">{location(job) || <span className="muted">Not recorded</span>}</td>
          <td data-label="Progress"><span className="dash-stage">{flow.current}</span><MiniTracker flow={flow} label={`${job.jobNumber} progress`} /><span className="sub">{flow.done} of {flow.total} steps</span></td>
          <td data-label="Status"><div className="badge-stack"><StatusBadge state={flow.state} label={flow.status} correction={flow.correction} size="sm" />{overdue && <OverdueBadge due={job.dueDate} today={today} size="sm" />}</div></td>
          <td data-label="Responsible now">{flow.responsible.length ? flow.responsible.slice(0, 3).join(' · ') + (flow.responsible.length > 3 ? ` +${flow.responsible.length - 3}` : '') : <span className="muted">{flow.closed ? 'None' : 'Not recorded'}</span>}</td>
          <td data-label="Due">{job.dueDate ? <span className={overdue ? 'due is-late' : 'due'}>{shortDate(job.dueDate)}</span> : <span className="muted">No due date</span>}</td>
        </tr>; })}</tbody>
      </table> : <div className="empty-state" role="status">{filtered ? <><SearchX size={22} aria-hidden /><strong>No jobs match these filters.</strong><button type="button" className="text-button" onClick={reset}>Clear filters</button></> : <><strong>No active jobs.</strong><span>Jobs appear here once they are sent to Sampling.</span></>}</div>}
    </section>
    <p className="dash-foot">Read-only. Status is calculated from the saved workflow records, the same way as inside each job and in My work.</p>
  </div>;
}
