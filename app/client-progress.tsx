'use client';
/**
 * Client progress: read-only, built from the client-safe summary (jobSummary v2). No employee names, comments,
 * workbooks, returns, internal review steps or controls. Used inside the job (preview) and on the shared /track page.
 */
import type { JobSummary, TrackNode } from './job-workflow-model';
import type { FlowState } from './job-flow';
import { StatusBadge, StateIcon, shortDate } from './flow-ui';

const fromTrack = (s: TrackNode['state']): FlowState => s === 'done' ? 'completed' : s === 'active' ? 'in-progress' : 'not-started';
const leaves = (n: TrackNode): TrackNode[] => n.children?.length ? n.children.flatMap(leaves) : [n];

export function ClientProgress({ summary }: { summary: JobSummary }) {
  const closed = summary.status === 'Completed';
  const overall: FlowState = closed ? 'completed' : summary.status === 'Not started' ? 'not-started' : 'in-progress';
  return <article className="client-progress">
    <header className="client-head">
      <div><span className="eyebrow">JOB PROGRESS</span><h1>{summary.jobId}</h1><p>{summary.client}{summary.location && summary.location !== 'Not recorded' ? ' · ' + summary.location : ''}</p></div>
      <StatusBadge state={overall} label={summary.status || (closed ? 'Completed' : 'In progress')} />
    </header>
    <section className="client-overview" aria-label="Summary">
      <div><small>Current stage</small><strong>{summary.current || '—'}</strong></div>
      <div><small>Progress</small><strong>{summary.total ? `${summary.done} of ${summary.total} steps completed` : '—'}</strong></div>
      <div><small>Next step</small><strong>{summary.next || '—'}</strong></div>
      <div><small>Last update</small><strong>{shortDate(summary.updatedAt)}</strong></div>
    </section>
    {!!summary.scope?.length && <section className="client-block"><h2>Agreed scope</h2><ul className="client-scope">{summary.scope.map((line) => <li key={line}>{line}</li>)}</ul></section>}
    <section className="client-block"><h2>Workflow</h2>
      <ol className="client-sections" style={{ ['--sections' as string]: summary.nodes.length }}>
        {summary.nodes.map((s, i) => { const st = fromTrack(s.state), all = leaves(s), done = all.filter((x) => x.state === 'done').length; return <li key={s.id} className={`client-section st-${st}`}>
          <div className="client-section-head"><span className="flow-section-node"><StateIcon state={st} size={18} /></span><div><small>Stage {i + 1}</small><strong>{s.label}</strong><span>{st === 'completed' ? 'Completed' + (s.at ? ' · ' + shortDate(s.at) : '') : st === 'in-progress' ? 'In progress' : 'Not started'}{s.children?.length ? ` · ${done} of ${all.length} steps` : ''}</span></div></div>
          <details open={st === 'in-progress'}><summary>Steps<span className="sr-only"> for {s.label}</span></summary>
            {s.id === 'laboratory' && summary.scopeMissing && <p className="flow-note">Laboratory tests are confirmed after the sampling report is approved.</p>}
            {(s.children || []).map((g) => <div key={g.id} className="flow-group"><h4><span>{g.label}</span></h4><ol className="flow-steps">{(g.children || [g]).map((x) => { const xs = fromTrack(x.state); return <li key={x.id} className={`flow-step st-${xs}`}><span className="flow-step-icon"><StateIcon state={xs} size={14} /></span><span className="flow-step-main"><strong>{x.label}</strong>{x.at && <small>Completed {shortDate(x.at)}</small>}</span><span className="flow-step-state">{xs === 'completed' ? 'Completed' : xs === 'in-progress' ? 'In progress' : 'Not started'}</span></li>; })}</ol></div>)}
          </details>
        </li>; })}
      </ol>
    </section>
    {!!summary.dates?.length && <section className="client-block"><h2>Key dates</h2><dl className="client-dates">{summary.dates.map((d) => <div key={d.label}><dt>{d.label}</dt><dd>{shortDate(d.value)}</dd></div>)}</dl></section>}
    <p className="client-foot">Progress summary prepared by VAPS. Measurements, results and internal records are not included.</p>
  </article>;
}
