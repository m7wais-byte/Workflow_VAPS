'use client';
/**
 * Overall job progress: one plain sentence with a progress bar, the stages as cards, three at-a-glance boxes and the activities folded by stage.
 * The same component renders the internal job page (with planner editing) and the client progress view (read-only,
 * client-visible estimates only). Status always has an icon and text; colour is never the only signal.
 */
import { Fragment, useState, type ComponentType, type ReactNode } from 'react';
import { ArrowRight, CalendarClock, CircleCheck, CircleDashed, CircleDot, Clock, Eye, Pencil, TriangleAlert } from 'lucide-react';
import { progressGroupLabel, progressStatusLabel, rowsOf, type ProgressRow, type ProgressStatus, type ProgressView } from './job-progress';
import { dayConventionLabel, type EstimateInput } from './schedule-estimate';
import { shortDate } from './flow-ui';
import { DateInput } from "./uk-date";

const icons: Record<ProgressStatus, ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>> = { completed: CircleCheck, 'in-progress': CircleDot, 'under-review': Eye, 'not-started': CircleDashed };
export function ProgressIcon({ status, size = 15 }: { status: ProgressStatus; size?: number }) { const Icon = icons[status]; return <Icon size={size} strokeWidth={2.2} aria-hidden />; }
/** Gray Not started · amber In progress · amber Under review · green Completed. */
export function ProgressBadge({ status, label }: { status: ProgressStatus; label?: string }) {
  return <span className={`st-badge st-sm pg-${status}`}><ProgressIcon status={status} size={13} />{label || progressStatusLabel[status]}</span>;
}
/** Schedule warning, separate from the work status. */
function OverdueFlag({ finish, today }: { finish: string; today: string }) {
  const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(finish)) / 864e5));
  return <span className="st-badge st-sm st-overdue"><Clock size={13} strokeWidth={2.2} aria-hidden />Overdue · {days} day{days === 1 ? '' : 's'}</span>;
}

function EstimateEditor({ row, onSave, onClose }: { row: ProgressRow; onSave: (input: EstimateInput & { clientVisible: boolean }) => string | undefined; onClose: () => void }) {
  const plan = row.schedule?.source === 'plan' ? row.schedule : undefined;
  const [start, setStart] = useState(plan?.start || ''), [days, setDays] = useState(plan?.days ? String(plan.days) : ''), [finish, setFinish] = useState(plan?.finish || '');
  const [visible, setVisible] = useState(plan ? plan.clientVisible : false), [error, setError] = useState('');
  const team = row.schedule?.source === 'team' ? row.schedule : undefined;
  const submit = (clear = false) => { const result = onSave(clear ? { start: '', days: '', finish: '', clientVisible: false } : { start, days, finish, clientVisible: visible }); if (result) setError(result); else onClose(); };
  return <form className="pg-editor" onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <p className="pg-editor-help">Enter any two values; the third is calculated. {dayConventionLabel}. Estimates do not change work status or actual completion dates.</p>
    <div className="pg-editor-grid">
      <label>Planned start<DateInput value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label>Expected duration (calendar days)<input inputMode="numeric" pattern="[0-9]*" min={1} value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 5" /></label>
      <label>Expected completion<DateInput value={finish} onChange={(e) => setFinish(e.target.value)} /></label>
    </div>
    <label className="pg-check"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Show this estimate in the client progress view</label>
    {team && <p className="pg-editor-help">Team plan (internal): {team.start ? shortDate(team.start) : '—'} to {team.finish ? shortDate(team.finish) : '—'}. <button type="button" className="text-button" onClick={() => { setStart(team.start || ''); setFinish(team.finish || ''); setDays(''); }}>Use these dates</button></p>}
    {error && <p className="ops-error" role="alert">{error}</p>}
    <div className="panel-actions"><button className="primary-button" type="submit">Save estimate</button>{plan && <button className="outline-button" type="button" onClick={() => submit(true)}>Clear estimate</button>}<button className="text-button" type="button" onClick={onClose}>Cancel</button></div>
  </form>;
}

/** When the activity happens, in one short line: actual completion, or the estimate, or "Dates to be confirmed". */
function whenText(row: ProgressRow) {
  const s = row.schedule;
  if (row.status === 'completed' && row.actual) return <span className="pgx-when is-done">Completed {shortDate(row.actual)}</span>;
  const parts = [s?.start && `Start ${shortDate(s.start)}`, s?.finish && `Expected ${shortDate(s.finish)}`, s?.days && `${s.days} day${s.days === 1 ? '' : 's'}`].filter(Boolean);
  return <span className={'pgx-when' + (parts.length ? '' : ' is-tbc')}>{parts.length ? parts.join(' · ') : 'Dates to be confirmed'}</span>;
}

const glanceIcon = { now: CircleDot, next: ArrowRight, report: CalendarClock };

export function ProgressBody({ view, today, canPlan, onSave }: { view: ProgressView; today: string; canPlan?: (key: string) => boolean; onSave?: (row: ProgressRow, input: EstimateInput & { clientVisible: boolean }) => string | undefined }) {
  const client = view.audience === 'client';
  const [editing, setEditing] = useState('');
  const sections = view.stages.filter((s) => s.id !== 'created');
  const exp = view.expected;
  const stagesDone = view.stages.filter((s) => s.status === 'completed').length;
  const pct = view.total ? Math.round((view.done / view.total) * 100) : Math.round((stagesDone / Math.max(1, view.stages.length)) * 100);
  const glance: [keyof typeof glanceIcon, string, ReactNode][] = [
    ['now', 'Happening now', view.now],
    ['next', 'Next step', view.next],
    ['report', exp.kind === 'actual' ? 'Report delivered' : 'Expected report delivery', exp.date ? <>{shortDate(exp.date)}{exp.kind === 'provisional' && <small className="pg-provisional">Provisional · {exp.reason}</small>}</> : 'To be confirmed'],
  ];
  return <div className="pgx">
    <div className="pgx-hero">
      <p className="pgx-sentence">{view.sentence}</p>
      <div className="pgx-meter"><div className="pgx-meter-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Overall progress"><span style={{ width: pct + '%' }} /></div>
        <small><strong>{pct}%</strong> · {view.total ? `${view.done} of ${view.total} activities completed` : `${stagesDone} of ${view.stages.length} stages completed`}</small></div>
    </div>
    <ol className="pgx-stages" aria-label="Job stages">
      {view.stages.map((st, i) => <li key={st.id} className={`pgx-stage pg-${st.status}${st.current ? ' is-current' : ''}`}>
        <span className="pgx-stage-num"><ProgressIcon status={st.status} size={18} /></span>
        <small>{st.current ? 'Now' : `Stage ${i + 1}`}</small>
        <strong>{st.label}</strong>
        <span className="pgx-stage-status">{progressStatusLabel[st.status]}{st.status === 'completed' && st.at ? ' · ' + shortDate(st.at) : ''}</span>
        {st.note && <em>{st.note}</em>}
      </li>)}
    </ol>
    <dl className="pgx-glance">{glance.map(([k, label, value]) => { const Icon = glanceIcon[k]; return <div key={k} className={'pgx-glance-' + k}><dt><Icon size={15} aria-hidden /> {label}</dt><dd>{value}</dd></div>; })}</dl>
    <div className="pgx-activities">
      <h3>Activities by stage</h3>
      {sections.map((stage) => {
        const list = rowsOf(view, stage);
        const groups = [...new Set(list.map((r) => r.group))];
        const done = list.filter((r) => r.status === 'completed').length;
        return <details key={stage.id} className={`pgx-section pg-${stage.status}`} open={stage.current || undefined}>
          <summary><span className="pgx-section-title"><ProgressIcon status={stage.status} size={16} /> {stage.label}</span><ProgressBadge status={stage.status} /><span className="pgx-section-count">{list.length ? `${done} of ${list.length} done` : stage.planned ? 'Scope not confirmed yet' : 'No activities yet'}</span></summary>
          {stage.note && <p className="pgx-section-note">{stage.note}</p>}
          {stage.planned && !list.length && <p className="pgx-empty">Laboratory tests are listed here once the laboratory scope is confirmed.</p>}
          {groups.map((g) => <Fragment key={g}>
            {stage.id === 'lab' && <p className="pgx-group">{progressGroupLabel[g]} testing{groups.length > 1 && <small> · runs in parallel</small>}</p>}
            <ul className="pgx-rows">{list.filter((r) => r.group === g).map((row) => {
              const s = row.schedule;
              const source = !client && s && row.status !== 'completed' ? <small className={`pg-source pg-source-${s.source}${s.source === 'plan' && s.clientVisible ? ' is-shared' : ''}`}>{s.source === 'team' ? 'Team plan · internal' : s.clientVisible ? 'Shared with client' : 'Internal estimate'}</small> : null;
              return <li key={row.key} className={`pgx-row pg-${row.status}${row.overdue ? ' is-overdue' : ''}`}>
                <span className="pgx-row-icon"><ProgressIcon status={row.status} size={17} /></span>
                <span className="pgx-row-main"><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}
                  <span className="pgx-row-flags">{row.overdue && s?.finish && <OverdueFlag finish={s.finish} today={today} />}{!client && row.attention && <span className="st-badge st-sm st-blocked"><TriangleAlert size={13} aria-hidden />Action required · {row.attention}</span>}</span></span>
                <span className="pgx-row-side"><ProgressBadge status={row.status} />{whenText(row)}{source}
                  {!client && canPlan?.(row.key) && onSave && !view.legacy && row.status !== 'completed' && <button type="button" className="text-button pg-edit" aria-expanded={editing === row.key} onClick={() => setEditing(editing === row.key ? '' : row.key)}><Pencil size={13} aria-hidden />{s?.source === 'plan' ? 'Revise dates' : 'Add dates'}<span className="sr-only"> for {row.label}</span></button>}</span>
                {editing === row.key && onSave && <div className="pgx-editor"><EstimateEditor row={row} onSave={(input) => onSave(row, input)} onClose={() => setEditing('')} /></div>}
              </li>;
            })}</ul>
          </Fragment>)}
        </details>;
      })}
    </div>
    <p className="pg-foot"><Clock size={14} aria-hidden /> {view.lastUpdate ? `Last progress update ${shortDate(view.lastUpdate)}. ` : ''}Expected dates are estimates in calendar days; actual completion dates replace them once work is done.{client ? '' : ' Only dates marked “Shared with client” appear in the client view.'}</p>
    {view.notes.map((n) => <p key={n} className="flow-note">{n}</p>)}
  </div>;
}

/** Internal job page section: placed under the job header. */
export function OverallProgress({ view, today, canPlan, onSave, children }: { view: ProgressView; today: string; canPlan?: (key: string) => boolean; onSave?: (row: ProgressRow, input: EstimateInput & { clientVisible: boolean }) => string | undefined; children?: React.ReactNode }) {
  const overall: ProgressStatus = view.closed ? 'completed' : view.draft ? 'not-started' : 'in-progress';
  return <section className="panel pg-panel" aria-labelledby="pg-title">
    <header className="pg-head">
      <div><span className="eyebrow">{view.closed ? 'JOB COMPLETED' : 'CURRENT STAGE'}</span><h2 id="pg-title">{view.closed ? 'All work completed' : view.currentStage}</h2></div>
      <div className="pg-head-badges"><ProgressBadge status={overall} label={view.closed ? 'Completed' : view.draft ? 'Draft · not started' : 'In progress'} />{view.overdue > 0 && <span className="st-badge st-sm st-overdue"><Clock size={13} aria-hidden />{view.overdue} overdue</span>}</div>
    </header>
    <ProgressBody view={view} today={today} canPlan={canPlan} onSave={onSave} />
    {children}
  </section>;
}
