'use client';
/**
 * Overall job progress: stage overview, plain-language summary and one activity table (cards on small screens).
 * The same component renders the internal job page (with planner editing) and the client progress view (read-only,
 * client-visible estimates only). Status always has an icon and text; colour is never the only signal.
 */
import { Fragment, useState, type ComponentType } from 'react';
import { CalendarClock, CircleCheck, CircleDashed, CircleDot, Clock, Eye, Pencil, TriangleAlert } from 'lucide-react';
import { progressGroupLabel, progressStatusLabel, rowsOf, type ProgressRow, type ProgressStage, type ProgressStatus, type ProgressView } from './job-progress';
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
const tbc = <span className="pg-tbc">To be confirmed</span>;
const date = (v?: string) => v ? shortDate(v) : undefined;

function StageTrack({ stages }: { stages: ProgressStage[] }) {
  return <ol className="pg-stages" style={{ ['--stages' as string]: stages.length }} aria-label="Job stages">
    {stages.map((s, i) => <li key={s.id} className={`pg-stage pg-${s.status}${s.current ? ' is-current' : ''}${s.planned ? ' is-planned' : ''}`}>
      <span className="pg-node"><ProgressIcon status={s.status} size={18} /></span>
      <span className="pg-stage-text"><small>{s.current ? 'Current stage' : `Stage ${i + 1}`}</small><strong>{s.label}</strong>
        <span>{progressStatusLabel[s.status]}{s.status === 'completed' && s.at ? ' · ' + shortDate(s.at) : ''}</span>
        {s.note && <em>{s.note}</em>}</span>
    </li>)}
  </ol>;
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

function RowCells({ row, today, client }: { row: ProgressRow; today: string; client: boolean }) {
  const s = row.schedule;
  const sourceTag = !client && s ? <small className={`pg-source pg-source-${s.source}${s.source === 'plan' && s.clientVisible ? ' is-shared' : ''}`}>{s.source === 'team' ? 'Team plan · internal' : s.clientVisible ? 'Shared with client' : 'Internal estimate'}</small> : null;
  return <>
    <td data-label="Status"><span className="pg-status-cell"><ProgressBadge status={row.status} />{row.overdue && s?.finish && <OverdueFlag finish={s.finish} today={today} />}{!client && row.attention && <span className="st-badge st-sm st-blocked"><TriangleAlert size={13} aria-hidden />Action required · {row.attention}</span>}</span></td>
    <td data-label="Planned start">{date(s?.start) || (row.status === 'completed' ? '—' : tbc)}</td>
    <td data-label="Expected duration">{s?.days ? `${s.days} day${s.days === 1 ? '' : 's'}` : row.status === 'completed' ? '—' : tbc}</td>
    <td data-label="Expected completion">{row.status === 'completed' && row.actual
      ? <span className="pg-actual"><strong>Completed {shortDate(row.actual)}</strong>{s?.finish && <small>Expected {shortDate(s.finish)}</small>}</span>
      : <>{date(s?.finish) || tbc}{sourceTag}</>}</td>
  </>;
}

export function ProgressBody({ view, today, canPlan, onSave }: { view: ProgressView; today: string; canPlan?: (key: string) => boolean; onSave?: (row: ProgressRow, input: EstimateInput & { clientVisible: boolean }) => string | undefined }) {
  const client = view.audience === 'client';
  const [editing, setEditing] = useState('');
  const sections = view.stages.filter((s) => s.id !== 'created');
  const exp = view.expected;
  return <>
    <p className="pg-sentence">{view.sentence}</p>
    <dl className="pg-summary">
      <div><dt>Current stage</dt><dd>{view.currentStage}</dd></div>
      <div><dt>Happening now</dt><dd>{view.now}</dd></div>
      <div><dt>Planned next</dt><dd>{view.next}</dd></div>
      <div><dt>{exp.kind === 'actual' ? 'Completed' : 'Expected report delivery'}</dt><dd>{exp.date ? <>{shortDate(exp.date)}{exp.kind === 'provisional' && <small className="pg-provisional">Provisional · {exp.reason}</small>}</> : 'To be confirmed'}</dd></div>
      <div><dt>Last progress update</dt><dd>{view.lastUpdate ? shortDate(view.lastUpdate) : 'Not recorded'}</dd></div>
    </dl>
    <StageTrack stages={view.stages} />
    <div className="pg-table-wrap">
      <table className="pg-table">
        <caption className="sr-only">Planned activities and their status</caption>
        <thead><tr><th scope="col">Activity / test</th><th scope="col">Status</th><th scope="col">Planned start</th><th scope="col">Expected duration</th><th scope="col">Expected completion</th></tr></thead>
        {sections.map((stage) => {
          const list = rowsOf(view, stage);
          const groups = [...new Set(list.map((r) => r.group))];
          return <tbody key={stage.id} className="pg-section">
            <tr className="pg-section-head"><th colSpan={5} scope="colgroup"><span>{stage.label}</span><ProgressBadge status={stage.status} />{stage.note && <em>{stage.note}</em>}</th></tr>
            {stage.planned && !list.length && <tr className="pg-empty"><td colSpan={5}>Laboratory scope awaiting confirmation. Tests are listed here once they are confirmed.</td></tr>}
            {groups.map((g) => <Fragment key={g}>
              {stage.id === 'lab' && <tr className="pg-group-head"><th colSpan={5} scope="colgroup">{progressGroupLabel[g]} testing{groups.length > 1 && <small>Runs in parallel</small>}</th></tr>}
              {list.filter((r) => r.group === g).map((row) => <Fragment key={row.key}>
                <tr className={`pg-row pg-${row.status}${row.overdue ? ' is-overdue' : ''}`}>
                  <th scope="row" data-label="Activity / test"><span className="pg-activity"><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}</span>
                    {!client && canPlan?.(row.key) && onSave && !view.legacy && row.status !== 'completed' && <button type="button" className="text-button pg-edit" aria-expanded={editing === row.key} onClick={() => setEditing(editing === row.key ? '' : row.key)}><Pencil size={13} aria-hidden />{row.schedule?.source === 'plan' ? 'Revise estimate' : 'Add estimate'}<span className="sr-only"> for {row.label}</span></button>}</th>
                  <RowCells row={row} today={today} client={client} />
                </tr>
                {editing === row.key && onSave && <tr className="pg-editor-row"><td colSpan={5}><EstimateEditor row={row} onSave={(input) => onSave(row, input)} onClose={() => setEditing('')} /></td></tr>}
              </Fragment>)}
            </Fragment>)}
          </tbody>;
        })}
      </table>
    </div>
    <p className="pg-foot"><CalendarClock size={14} aria-hidden /> Durations are in calendar days, counting the start day. Expected dates are estimates; actual completion dates replace them once work is completed.{client ? '' : ' Only estimates marked “Shared with client” appear in the client view.'}</p>
    {view.notes.map((n) => <p key={n} className="flow-note">{n}</p>)}
  </>;
}

/** Internal job page section: placed under the job header. */
export function OverallProgress({ view, today, canPlan, onSave, children }: { view: ProgressView; today: string; canPlan?: (key: string) => boolean; onSave?: (row: ProgressRow, input: EstimateInput & { clientVisible: boolean }) => string | undefined; children?: React.ReactNode }) {
  const overall: ProgressStatus = view.closed ? 'completed' : view.draft ? 'not-started' : 'in-progress';
  return <section className="panel pg-panel" aria-labelledby="pg-title">
    <header className="pg-head">
      <div><span className="eyebrow">OVERALL JOB PROGRESS</span><h2 id="pg-title">{view.closed ? 'Job completed' : view.currentStage}</h2></div>
      <div className="pg-head-badges"><ProgressBadge status={overall} label={view.closed ? 'Completed' : view.draft ? 'Draft · not started' : 'In progress'} /><span className="pg-count">{view.done} of {view.total} activities completed</span>{view.overdue > 0 && <span className="st-badge st-sm st-overdue"><Clock size={13} aria-hidden />{view.overdue} overdue</span>}</div>
    </header>
    <ProgressBody view={view} today={today} canPlan={canPlan} onSave={onSave} />
    {children}
  </section>;
}
