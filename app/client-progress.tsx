'use client';
/**
 * Client progress: read-only, built from the client-safe summary (jobSummary v2). No employee names, comments,
 * workbooks, returns, internal review steps or controls. Used inside the job (preview) and on the shared /track page.
 */
import type { JobSummary, TrackNode } from './job-workflow-model';
import type { FlowState } from './job-flow';
import { StatusBadge, StateIcon, shortDate } from './flow-ui';
import { ProgressIcon, ProgressBody } from './job-progress-ui';
import { assetUrl } from './deployment';
import { useState } from 'react';
import { localDate } from './local-date';

const fromTrack = (s: TrackNode['state']): FlowState => s === 'done' ? 'completed' : s === 'active' ? 'in-progress' : 'not-started';
const leaves = (n: TrackNode): TrackNode[] => n.children?.length ? n.children.flatMap(leaves) : [n];

/** `brand` is the client's full name and logo from the client master (in-app preview); without it the short name and initials are shown. */
export function ClientProgress({ summary, today = localDate(), brand }: { summary: JobSummary; today?: string; brand?: { name?: string; shortName?: string; logo?: string } }) {
  const p = summary.progress;
  const [logoFailed, setLogoFailed] = useState(false);
  if (p) {
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    // The work can be finished while the samples still wait for the client's approval and disposal instruction.
    const awaitingClient = p.closed && p.currentStage !== 'Completed';
    const status = awaitingClient ? 'in-progress' : p.closed ? 'completed' : p.draft ? 'not-started' : 'in-progress';
    const statusLabel = awaitingClient ? 'Awaiting client approval' : p.closed ? 'Completed' : p.draft ? 'Being prepared' : 'In progress';
    const info = p.info || {};
    const late = !p.closed && !!info.dueDate && info.dueDate < today;
    const facts: [string, React.ReactNode][] = [
      ['Field / well', [info.field, info.well].filter(Boolean).join(' · ') || p.location || 'Not recorded'],
      ['Sampling type', p.sampling || 'To be confirmed'],
      ['Samples', info.samples ? String(info.samples) : 'To be confirmed'],
      ['Job date', info.jobDate ? shortDate(info.jobDate) : 'Not recorded'],
      ['Due date', info.dueDate ? <>{shortDate(info.dueDate)}{late && <em className="cp-late">Overdue</em>}</> : 'Not set'],
    ];
    const r = 34, c = 2 * Math.PI * r;
    return <article className="client-progress cp">
      <header className="cp-hero">
        <div className="cp-brand" aria-hidden="true">{brand?.logo && !logoFailed
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={assetUrl(brand.logo)} alt="" onError={() => setLogoFailed(true)} />
          : <span>{(brand?.shortName || p.client || '?').slice(0, 2).toUpperCase()}</span>}</div>
        <div className="cp-id"><span className="cp-eyebrow">Job progress</span><h1>{p.jobId}</h1><p>{brand?.name || p.client}</p></div>
        <div className="cp-status"><span className={`st-badge pg-${status}`}><ProgressIcon status={status} size={14} />{statusLabel}</span><small>Current stage</small><strong>{p.currentStage}</strong></div>
        <div className="cp-ring" role="img" aria-label={`${pct}% complete, ${p.done} of ${p.total} activities`}>
          <svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r={r} className="cp-ring-track" /><circle cx="42" cy="42" r={r} className="cp-ring-value" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 42 42)" /></svg>
          <span><strong>{pct}%</strong><small>{p.done} of {p.total}</small></span>
        </div>
      </header>
      <dl className="cp-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <ProgressBody view={p} today={today} />
      <p className="client-foot">Progress summary prepared by VAPS. Measurements, results and internal records are not included.</p>
    </article>;
  }
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
