'use client';
/**
 * Weekly plan board on the Dashboard: read-only for everyone. Jobs are rows, days are columns, each PVT test is a bar
 * coloured by its assigned equipment, and "R" marks the report submission date. Clicking a bar, a blank day or an R
 * opens a quick summary; nothing here opens a job, so job access is never widened.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Printer, Search, X } from 'lucide-react';
import type { DashboardJob } from './company-dashboard';
import { addDays } from './local-date';
import { formatDay, formatRange } from './schedule-overlap';
import { durationOf } from './schedule-estimate';
import { labEquipment, equipmentOf, noEquipment } from './lab-equipment';
import { weeklyBoard, weekStart, isWeekend, boardDays, type BoardBar, type BoardRow, type BoardActivity } from './weekly-board';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayParts = (d: string) => { const v = new Date(d + 'T00:00:00'); return { dow: weekdays[v.getDay()], label: `${v.getDate()}-${months[v.getMonth()]}` }; };
const daysText = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

type Summary = { x: number; y: number; title: string; sub: string; body: ReactNode };

export function WeeklyBoard({ jobs, today, name }: { jobs: DashboardJob[]; today: string; name: (id?: string) => string }) {
  const [start, setStart] = useState(() => weekStart(today)), [search, setSearch] = useState(''), [summary, setSummary] = useState<Summary | null>(null);
  const board = useMemo(() => weeklyBoard(jobs.map((r) => ({ job: r.job, closed: r.flow.closed })), start), [jobs, start]);
  const stageOf = (id: string) => jobs.find((r) => r.job.id === id)?.flow.current || '';
  const term = search.trim().toLowerCase();
  const match = (r: BoardRow) => !term || [r.jobNumber, r.name, r.client, r.sampleDetails, ...r.all.map((a) => a.title)].join(' ').toLowerCase().includes(term);
  const groups = board.groups.map((g) => ({ ...g, rows: g.rows.filter(match) })).filter((g) => g.rows.length);
  const reports = board.reports.filter(match);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!summary) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !card.current?.contains(e.target as Node)) setSummary(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [summary]);
  const open = (e: React.MouseEvent, s: Omit<Summary, 'x' | 'y'>) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const w = 340;
    setSummary({ ...s, x: Math.max(12, Math.min(window.innerWidth - w - 12, r.left)), y: r.bottom + 6 > window.innerHeight - 260 ? Math.max(12, r.top - 266) : r.bottom + 6 });
  };
  const activityList = (list: BoardActivity[]) => <ul className="wb-sum-list">{list.map((a) => <li key={a.id}><strong>{a.title}</strong><span>Sample {a.sampleId} · {a.owner ? name(a.owner) : 'Unassigned'}{a.external ? ' · External · ' + a.external : ''}</span><em>{a.status}</em></li>)}</ul>;
  const jobFacts = (r: BoardRow) => <dl className="wb-sum-facts">
    <div><dt>Client</dt><dd>{r.client}</dd></div>
    {r.sampleDetails && <div><dt>Samples</dt><dd>{r.sampleDetails}</dd></div>}
    {stageOf(r.jobId) && <div><dt>Job stage</dt><dd>{stageOf(r.jobId)}</dd></div>}
    <div><dt>Report</dt><dd>{r.report ? `${formatDay(r.report.date)} · ${r.report.kind === 'issued' ? 'issued' : 'planned'}` : 'Date not set'}</dd></div>
  </dl>;
  const barSummary = (r: BoardRow, b: BoardBar) => { const q = equipmentOf(b.equipment); const n = durationOf(b.start, b.end);
    return { title: b.label, sub: `${r.jobNumber} · ${r.name}`, body: <>
      <dl className="wb-sum-facts">
        <div><dt>Equipment</dt><dd>{q ? <span className="equip-tag"><i className="equip-dot" style={{ background: q.color }} aria-hidden />{q.name}</span> : 'Not assigned yet'}</dd></div>
        <div><dt>Planned</dt><dd>{formatRange(b.start, b.end)} · {daysText(n)}</dd></div>
        <div><dt>Samples</dt><dd>{b.samples.join(', ')}</dd></div>
      </dl>{activityList(b.activities)}{b.activities.find((a) => a.notes)?.notes && <p className="wb-sum-note">{b.activities.find((a) => a.notes)!.notes}</p>}</> }; };
  const daySummary = (r: BoardRow, day: string) => { const next = r.all.filter((a) => a.start > day && a.status !== 'QC approved').sort((x, y) => x.start.localeCompare(y.start))[0];
    return { title: `${r.jobNumber} · ${r.name}`, sub: `${dayParts(day).dow} ${formatDay(day)}`, body: <>
      <p className="wb-sum-note">No PVT test planned on this day.{next ? ` Next: ${next.title} (Sample ${next.sampleId}) starts ${formatDay(next.start)}.` : ''}</p>
      {jobFacts(r)}{r.unscheduled.length > 0 && <><h4>Not scheduled yet · {r.unscheduled.length}</h4>{activityList(r.unscheduled.slice(0, 6))}{r.unscheduled.length > 6 && <p className="wb-sum-note">+{r.unscheduled.length - 6} more</p>}</>}</> }; };
  const reportSummary = (r: BoardRow) => ({ title: 'Report submission', sub: `${r.jobNumber} · ${r.name}`, body: <>
    <p className="wb-sum-note">{r.report!.kind === 'issued' ? 'Final report issued to the client on ' : 'Final report planned for submission to the client on '}<strong>{formatDay(r.report!.date)}</strong>. The client sees the same date in the job progress view.</p>{jobFacts(r)}</> });

  const cols = { gridTemplateColumns: `repeat(${boardDays}, minmax(0, 1fr))` };
  const dayCells = (onPick?: (e: React.MouseEvent, day: string) => void, label?: (day: string) => string) => board.days.map((d, i) => {
    const cls = 'wb-cell' + (isWeekend(d) ? ' is-weekend' : '') + (d === today ? ' is-today' : '') + (i === 7 ? ' is-week' : '');
    return onPick && !isWeekend(d) ? <button type="button" key={d} className={cls} style={{ gridColumn: i + 1 }} aria-label={label!(d)} onClick={(e) => onPick(e, d)} /> : <span key={d} className={cls} style={{ gridColumn: i + 1 }} aria-hidden />;
  });
  const jobCell = (r: BoardRow) => <div className="wb-job"><strong>{r.name}</strong><span className="wb-num">{r.jobNumber}</span><small>{r.sampleDetails || r.client}</small></div>;
  const empty = !groups.length && !reports.length;

  return <section className="panel dash-panel wb" aria-labelledby="wb-title">
    <div className="dash-toolbar wb-toolbar">
      <h2 id="wb-title">Weekly plan <span className="wb-range">{formatRange(board.start, board.end)}</span></h2>
      <div className="wb-nav"><button type="button" className="outline-button" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={16} aria-hidden /></button><button type="button" className="outline-button" disabled={start === weekStart(today)} onClick={() => setStart(weekStart(today))}>This week</button><button type="button" className="outline-button" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={16} aria-hidden /></button></div>
      <label className="search-field"><Search size={16} aria-hidden /><span className="sr-only">Search the weekly plan</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Job, well or test" /></label>
      <button type="button" className="outline-button wb-print" onClick={() => window.print()}><Printer size={15} aria-hidden /> Print</button>
    </div>
    <div className="wb-scroll"><div className="wb-grid" role="table" aria-label={`Weekly plan ${formatRange(board.start, board.end)}`}>
      <div className="wb-row wb-head" role="row"><div className="wb-job" role="columnheader"><span>Job</span><small>Job number · sample details</small></div>
        <div className="wb-track" style={cols}>{board.days.map((d, i) => { const p = dayParts(d); return <div key={d} role="columnheader" className={'wb-day' + (isWeekend(d) ? ' is-weekend' : '') + (d === today ? ' is-today' : '') + (i === 7 ? ' is-week' : '')}><strong>{p.label}</strong><span>{p.dow}</span></div>; })}</div></div>
      {groups.map((g) => <div className="wb-group" key={g.name} role="rowgroup"><div className="wb-group-name"><span>{g.name}</span></div>
        <div className="wb-group-rows">{g.rows.map((r) => <div className="wb-row" role="row" key={r.jobId}>{jobCell(r)}
          <div className="wb-track" style={{ ...cols, gridTemplateRows: `repeat(${r.lanes}, 26px) 1fr` }}>
            {dayCells((e, d) => open(e, daySummary(r, d)), (d) => `${r.jobNumber}, ${formatDay(d)}: job summary`)}
            {r.bars.map((b) => { const q = equipmentOf(b.equipment) || noEquipment;
              return <button type="button" key={b.key} className={'wb-bar' + (b.equipment ? '' : ' is-open') + (b.done ? ' is-done' : '') + (b.clippedStart ? ' clip-start' : '') + (b.clippedEnd ? ' clip-end' : '')} style={{ gridColumn: `${b.from + 1} / ${b.to + 2}`, gridRow: b.lane + 1, background: q.color, color: q.text }}
                title={`${b.label} · ${equipmentOf(b.equipment)?.name || 'Equipment not assigned'} · ${formatRange(b.start, b.end)}`} onClick={(e) => open(e, barSummary(r, b))}><span>{b.done ? '✓ ' : ''}{b.label}</span>{b.samples.length > 1 && <i>×{b.samples.length}</i>}</button>; })}
          </div></div>)}</div></div>)}
      {reports.length > 0 && <div className="wb-group wb-reports" role="rowgroup"><div className="wb-group-name"><span>Reports</span></div>
        <div className="wb-group-rows">{reports.map((r) => <div className="wb-row" role="row" key={r.jobId}>{jobCell(r)}
          <div className="wb-track" style={{ ...cols, gridTemplateRows: '26px 1fr' }}>{dayCells()}
            <button type="button" className={'wb-r' + (r.report.kind === 'issued' ? ' is-done' : '')} style={{ gridColumn: r.col + 1, gridRow: 1 }} aria-label={`${r.jobNumber}: report submission ${formatDay(r.report.date)}`} title={`Report submission · ${formatDay(r.report.date)}`} onClick={(e) => open(e, reportSummary(r))}>R</button>
          </div></div>)}</div></div>}
    </div></div>
    {empty && <div className="empty-state" role="status"><strong>{term ? 'Nothing in the plan matches this search.' : 'No PVT tests or report dates planned in these two weeks.'}</strong><span>Tests appear here as soon as the PVT Team Lead assigns them with dates.</span></div>}
    <div className="wb-legend" aria-label="Equipment colours"><strong>Resources</strong>{labEquipment.map((q) => <span key={q.id}><i style={{ background: q.color }} aria-hidden />{q.name}</span>)}<span><i className="is-open" aria-hidden />Equipment not assigned</span><span><b className="wb-r is-key" aria-hidden>R</b>Report submission</span></div>
    {summary && <div className="wb-summary" role="dialog" aria-label={summary.title} ref={card} style={{ left: summary.x, top: summary.y }}>
      <header><div><strong>{summary.title}</strong><span>{summary.sub}</span></div><button type="button" className="icon-remove" aria-label="Close summary" onClick={() => setSummary(null)}><X size={16} aria-hidden /></button></header>
      {summary.body}
    </div>}
  </section>;
}
