'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pencil, Plus, Search, TriangleAlert, Upload, X } from 'lucide-react';
import { localDate } from './local-date';
import { ukDate } from './uk-date';
import {
  blankDraft, breakdown, doneByFor, draftOf, draftProblems, groupKey, groupRecords, inPeriod, isOpen, lastTwelveMonths, maxStages, newestFirst, newStage, nextBase, requestStats, requestStatuses,
  stageNumbers, baseNumber, withStatus, type Breakdown, type Period, type RequestDraft, type RequestLists, type RequestRecord, type RequestStatus, type StageDraft,
} from './request-book';
import { importRequests, loadRequests, putRequest, saveRequest } from './request-store';
import { readXlsxSheet, recordsFromRows, requestsCsv } from './request-import';

type Tab = 'dashboard' | 'form' | 'open' | 'all';
const statusTone: Record<RequestStatus, string> = { Received: 'pending', 'In progress': 'waiting', Completed: 'done', Delivered: 'pending' };
const monthLabel = (month: string) => new Date(month + '-01T00:00:00').toLocaleString('en-GB', { month: 'short', year: '2-digit' });
const range = (numbers: string[]) => (numbers.length > 1 ? `${numbers[0]} → ${numbers[numbers.length - 1]}` : numbers[0]);
const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0) + '%';
const days = (value: number | null) => (value === null ? '–' : value.toFixed(1));

/** A dropdown fed by Settings → Request Book lists, with "Other…" for a value that is not in the list. */
function Choice({ label, value, list, required, hideLabel, optional, onChange }: { label: string; value: string; list: string[]; required?: boolean; hideLabel?: boolean; optional?: boolean; onChange: (value: string) => void }) {
  const [other, setOther] = useState(false);
  const typed = other || (!!value && !list.includes(value));
  return <label className={optional ? 'rq-plain' : undefined}><span className={hideLabel ? 'sr-only' : undefined}>{label}{required ? ' *' : ''}</span>
    <select value={typed ? '__other' : value} onChange={(e) => { const next = e.target.value; setOther(next === '__other'); onChange(next === '__other' ? '' : next); }}>
      <option value="">Select…</option>{list.map((item) => <option key={item}>{item}</option>)}<option value="__other">Other…</option>
    </select>
    {typed && <input className="rq-other" aria-label={label + ' (other)'} placeholder="Type the other value" value={value} ref={(input) => { if (input && other && !value) input.focus(); }} onChange={(e) => onChange(e.target.value)} />}
  </label>;
}

function StatusPill({ status }: { status: RequestStatus }) { return <span className={'flow-pill ' + statusTone[status] + (status === 'Delivered' ? ' rq-delivered' : '')}>{status}</span>; }

function RequestTable({ rows, actions, onEdit, onStatus }: { rows: RequestRecord[]; actions: boolean; onEdit: (record: RequestRecord) => void; onStatus: (record: RequestRecord, status: RequestStatus) => void }) {
  if (!rows.length) return <p className="filter-note">No requests to show.</p>;
  return <div className="client-table-wrap"><table className="client-table rq-table"><thead><tr><th>Request No</th><th>Date</th><th>Job No.</th><th>Well</th><th>Experiment</th><th>Samples</th><th>H2S</th><th>Balloon</th><th>Done by</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
    {rows.map((r) => <tr key={r.no} className={r.h2s ? 'rq-h2s' : ''}>
      <td className="rq-no">{r.no}</td><td>{r.date ? ukDate(r.date) : 'No date'}</td><td>{r.job}</td><td>{r.well}</td><td>{r.experiment}</td>
      <td>{r.liquid > 0 && <span className="rq-tag">LIQ</span>}{r.gas > 0 && <span className="rq-tag">GAS</span>}</td>
      <td>{r.h2s ? <span className="rq-h2s-pill"><TriangleAlert size={12} aria-hidden="true" /> H2S</span> : 'No'}</td>
      <td>{r.balloon}</td><td>{r.doneBy}</td><td><StatusPill status={r.status} /></td>
      <td className="rq-actions">{actions && r.status === 'Received' && <button type="button" className="continue-button" onClick={() => onStatus(r, 'In progress')}>Start</button>}
        {actions && <button type="button" className="continue-button rq-ready" onClick={() => onStatus(r, 'Completed')}>Ready</button>}
        <button type="button" className="continue-button" onClick={() => onEdit(r)} aria-label={'Edit request ' + r.no}><Pencil size={13} aria-hidden="true" /> Edit</button></td>
    </tr>)}
  </tbody></table></div>;
}

function BreakdownTable({ head, rows, total, people, selected, onSelect }: { head: string; rows: Breakdown[]; total: number; people?: boolean; selected?: string; onSelect?: (label: string) => void }) {
  if (!rows.length) return <p className="filter-note">No requests in this period.</p>;
  const max = Math.max(1, ...rows.map((row) => row.requests));
  return <div className="rq-scroll"><table className="rq-breakdown"><thead><tr><th>{head}</th><th aria-hidden="true"></th><th>Requests</th><th>Liquid</th><th>Gas</th>{people ? <><th>H2S</th><th>Open</th><th>Avg days</th></> : <th>% of total</th>}</tr></thead><tbody>
    {rows.map((row) => <tr key={row.label} className={(onSelect ? 'rq-click' : '') + (selected === row.label ? ' rq-selected' : '')} onClick={onSelect ? () => onSelect(row.label) : undefined}>
      <td>{onSelect ? <button type="button" className="rq-link" aria-pressed={selected === row.label}>{row.label}</button> : row.label}</td>
      <td className="rq-bar"><i style={{ width: (row.requests / max) * 100 + '%' }} /></td><td><b>{row.requests}</b></td><td>{row.liquid}</td><td>{row.gas}</td>
      {people ? <><td>{row.h2s}</td><td>{row.open}</td><td>{days(row.averageDays)}</td></> : <td>{percent(row.requests, total)}</td>}
    </tr>)}
  </tbody></table></div>;
}

function MonthBars({ records, months, selected, onSelect }: { records: RequestRecord[]; months: string[]; selected?: string; onSelect?: (month: string) => void }) {
  const counts = months.map((month) => records.filter((r) => r.date.startsWith(month)).length), max = Math.max(1, ...counts);
  return <div className="rq-months" role="group" aria-label="Requests per month">{months.map((month, i) => {
    const bar = <><em>{counts[i]}</em><i style={{ height: Math.max(2, (counts[i] / max) * 100) + '%' }} /><small>{monthLabel(month).slice(0, 3)}</small></>;
    return onSelect ? <button type="button" key={month} className={month === selected ? 'active' : ''} aria-pressed={month === selected} aria-label={`${monthLabel(month)}: ${counts[i]} requests`} onClick={() => onSelect(month)}>{bar}</button>
      : <div key={month} title={`${monthLabel(month)}: ${counts[i]} requests`}>{bar}</div>;
  })}</div>;
}

function Dashboard({ records, today }: { records: RequestRecord[]; today: string }) {
  const [period, setPeriod] = useState<Period>('all'), [month, setMonth] = useState(today.slice(0, 7)), [person, setPerson] = useState('');
  const months = lastTwelveMonths(today), all = requestStats(records), year = today.slice(0, 4);
  const years = [...new Set(records.map((r) => r.date.slice(0, 4)).filter((y) => y && y <= year))].sort();
  const inView = records.filter((r) => inPeriod(r, period, today)), view = requestStats(inView), samples = view.liquid + view.gas || 1;
  const periodLabel = period === 'all' ? 'All time' : period === '12m' ? 'Last 12 months' : period;
  const people = breakdown(inView, (r) => r.doneBy), chosen = people.some((p) => p.label === person) ? person : '';
  const theirs = inView.filter((r) => r.doneBy === chosen), their = requestStats(theirs), monthly = requestStats(records.filter((r) => r.date.startsWith(month)));
  const statusRows = requestStatuses.map((status) => ({ status, count: inView.filter((r) => r.status === status).length })), statusMax = Math.max(1, ...statusRows.map((s) => s.count));
  const kpi = (label: string, value: string | number, note: string, tone = '') => <article className={'rq-kpi ' + tone}><small>{label}</small><strong>{value}</strong><p>{note}</p></article>;
  return <>
    <div className="rq-kpis">
      {kpi('TOTAL REQUESTS', all.requests, 'all time')}{kpi('THIS YEAR', records.filter((r) => r.date.startsWith(year)).length, year)}
      {kpi('THIS MONTH', records.filter((r) => r.date.startsWith(today.slice(0, 7))).length, monthLabel(today.slice(0, 7)))}{kpi('OPEN NOW', all.open, 'received or in progress', 'warn')}
      {kpi('LIQUID SAMPLES', all.liquid, 'all time')}{kpi('GAS SAMPLES', all.gas, 'all time')}
      {kpi('H2S REQUESTS', all.h2s, records.filter((r) => r.h2s && isOpen(r)).length + ' open now', 'danger')}{kpi('AVERAGE TURNAROUND', days(all.averageDays), `days · ${all.completedCount} with a completed date`)}
    </div>
    <div className="rq-two">
      <section className="panel"><div className="rq-head"><h2>Last 12 months</h2><span>Select a month for its report</span></div>
        <MonthBars records={records} months={months} selected={month} onSelect={setMonth} />
        <h3 className="rq-sub">MONTHLY REPORT · {monthLabel(month).toUpperCase()}</h3>
        <p className="filter-note">{monthly.requests} requests · {monthly.liquid} liquid · {monthly.gas} gas · {monthly.h2s} H2S · {monthly.open} still open</p></section>
      <section className="panel"><div className="rq-head"><h2>Requests by year</h2></div><BreakdownTable head="Year" rows={breakdown(records.filter((r) => r.date), (r) => r.date.slice(0, 4), true)} total={all.requests} /></section>
    </div>
    <section className="panel"><div className="rq-head"><h2>Breakdown · {periodLabel}</h2>
      <div className="rq-seg" role="group" aria-label="Period">{[['all', 'All time'], ['12m', 'Last 12 months'], ...years.slice(-4).map((y) => [y, y])].map(([key, label]) => <button type="button" key={key} className={key === period ? 'active' : ''} aria-pressed={key === period} onClick={() => setPeriod(key)}>{label}</button>)}</div></div>
      <h3 className="rq-sub">LIQUID AND GAS SAMPLES</h3>
      <div className="rq-split" aria-hidden="true"><i className="liquid" style={{ width: (view.liquid / samples) * 100 + '%' }} /><i className="gas" style={{ width: (view.gas / samples) * 100 + '%' }} /></div>
      <p className="rq-legend"><span><b className="liquid" />Liquid {view.liquid} ({percent(view.liquid, samples)})</span><span><b className="gas" />Gas {view.gas} ({percent(view.gas, samples)})</span><span>{view.requests} requests · {view.h2s} with H2S</span></p>
      <div className="rq-two">
        <div><h3 className="rq-sub">BY EXPERIMENT</h3><BreakdownTable head="Experiment" rows={breakdown(inView, (r) => r.experiment)} total={view.requests} /></div>
        <div><h3 className="rq-sub">BY CLIENT</h3><BreakdownTable head="Client" rows={breakdown(inView, (r) => r.client)} total={view.requests} />
          <h3 className="rq-sub rq-gap">STATUS TRACKING</h3>
          <div className="rq-scroll"><table className="rq-breakdown"><tbody>{statusRows.map((s) => <tr key={s.status}><td><StatusPill status={s.status} /></td><td className="rq-bar"><i style={{ width: (s.count / statusMax) * 100 + '%' }} /></td><td><b>{s.count}</b></td><td>{percent(s.count, view.requests)}</td></tr>)}</tbody></table></div>
          <p className="filter-note">Average turnaround {days(view.averageDays)} days, from {view.completedCount} requests with a completed date.</p></div>
      </div></section>
    <section className="panel"><div className="rq-head"><h2>Employees · {periodLabel}</h2><span>Select a name to see that employee’s details</span></div>
      <BreakdownTable head="Done by" rows={people} total={view.requests} people selected={chosen} onSelect={(label) => setPerson(label === chosen ? '' : label)} />
      {chosen && <div className="rq-person"><div className="rq-head"><h2>{chosen}</h2><span>{their.requests} requests ({percent(their.requests, view.requests)} of the lab) · {their.liquid} liquid · {their.gas} gas · {their.h2s} H2S · {their.open} open · {days(their.averageDays)} days average</span></div>
        <div className="rq-two"><div><h3 className="rq-sub">EXPERIMENTS DONE</h3><BreakdownTable head="Experiment" rows={breakdown(theirs, (r) => r.experiment)} total={their.requests} /></div>
          <div><h3 className="rq-sub">REQUESTS PER MONTH · LAST 12 MONTHS</h3><MonthBars records={records.filter((r) => r.doneBy === chosen)} months={months} /></div></div></div>}
    </section>
  </>;
}

function RequestForm({ draft, setDraft, lists, numbers, last, problems, busy, today, onSave, onCancel }: {
  draft: RequestDraft; setDraft: (draft: RequestDraft) => void; lists: RequestLists; numbers: string[]; last?: RequestRecord; problems: string[]; busy: boolean; today: string; onSave: () => void; onCancel: () => void;
}) {
  const editing = draft.group !== undefined, set = (patch: Partial<RequestDraft>) => setDraft({ ...draft, ...patch });
  const setStage = (index: number, patch: Partial<StageDraft>) => set({ stages: draft.stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)) });
  const removeStage = (index: number) => { const stage = draft.stages[index]; if (stage.no && !window.confirm(`Remove stage ${stage.no}? It is deleted from the request book when you save.`)) return; set({ stages: draft.stages.filter((_, i) => i !== index) }); };
  const renumbered = editing && draft.stages.find((stage, i) => stage.no && stage.no !== numbers[i]);
  const text = (key: 'job' | 'well' | 'sample' | 'cylinder' | 'comments', label: string, required = false) => <label><span>{label}{required ? ' *' : ''}</span><input value={draft[key]} autoComplete="off" onChange={(e) => set({ [key]: e.target.value })} /></label>;
  return <form className={'panel rq-form' + (draft.h2s ? ' rq-form-h2s' : '')} onSubmit={(e) => { e.preventDefault(); onSave(); }}>
    <div className="rq-head"><h2>{editing ? 'Edit request ' + draft.group : 'New request'}</h2><span>{editing && last ? `Last saved by ${last.savedBy} on ${ukDate(last.savedAt)}. Every field can be changed.` : 'Fields marked * are required'}</span></div>
    {draft.h2s && <p className="rq-h2s-banner" role="note"><TriangleAlert size={17} aria-hidden="true" /> H2S — this request contains H2S. It is marked in red everywhere it appears.</p>}
    <p className="rq-number"><small>{editing ? 'REQUEST NO' : 'NUMBER GIVEN AUTOMATICALLY'}</small><strong>{range(numbers)}</strong><span>{numbers.length > 1 ? numbers.length + ' stages' : 'single request'}</span></p>
    <h3 className="rq-step"><b>1</b>Sample</h3>
    <div className="form-grid">{text('job', 'Job No.', true)}<Choice optional label="Client" value={draft.client} list={lists.clients} onChange={(client) => set({ client })} />{text('well', 'Well Name', true)}{text('sample', 'Sample No.')}{text('cylinder', 'Cylinder No.')}</div>
    <h3 className="rq-step"><b>2</b>Experiment</h3>
    <div className="form-grid"><Choice label="Experiment" required value={draft.experiment} list={lists.experiments} onChange={(experiment) => set({ experiment })} /><Choice label="Done by" required value={draft.doneBy} list={lists.doneBy} onChange={(doneBy) => set({ doneBy })} />
      <div className="rq-question"><span>Does it contain H2S? *</span><div className="rq-seg" role="group" aria-label="Does it contain H2S?"><button type="button" className={draft.h2s === false ? 'active' : ''} aria-pressed={draft.h2s === false} onClick={() => set({ h2s: false })}>No</button><button type="button" className={draft.h2s ? 'active danger' : ''} aria-pressed={draft.h2s === true} onClick={() => set({ h2s: true })}>Yes, H2S</button></div></div></div>
    <h3 className="rq-step"><b>3</b>Stages<small>One row per stage sent for analysis (up to {maxStages}). Each has its own date, samples and balloon.</small></h3>
    <div className={'rq-stages' + (editing ? ' editing' : '')}>
      <div className="rq-stage rq-stage-head" aria-hidden="true"><span>Request No</span><span>Date *</span><span>Samples *</span><span>Gas balloon No.</span>{editing && <span>Status</span>}<span /></div>
      {draft.stages.map((stage, i) => <div className="rq-stage" key={stage.no || 'new-' + i}>
        <strong className="rq-no">{numbers[i]}</strong>
        <input type="date" aria-label={'Date for ' + numbers[i]} value={stage.date} max={today} onChange={(e) => setStage(i, { date: e.target.value })} />
        <div className="rq-seg" role="group" aria-label={'Samples for ' + numbers[i]}><button type="button" className={stage.liquid ? 'active' : ''} aria-pressed={stage.liquid} onClick={() => setStage(i, { liquid: !stage.liquid })}>Liquid</button><button type="button" className={stage.gas ? 'active' : ''} aria-pressed={stage.gas} onClick={() => setStage(i, { gas: !stage.gas })}>Gas</button></div>
        {stage.gas ? <Choice optional hideLabel label={'Balloon for ' + numbers[i]} value={stage.balloon} list={lists.balloons} onChange={(balloon) => setStage(i, { balloon })} /> : <span className="filter-note">No gas sample</span>}
        {editing && <select aria-label={'Status for ' + numbers[i]} value={stage.status} onChange={(e) => setStage(i, { status: e.target.value as RequestStatus })}>{requestStatuses.map((status) => <option key={status}>{status}</option>)}</select>}
        <button type="button" className="outline-button rq-remove" disabled={draft.stages.length === 1} onClick={() => removeStage(i)} aria-label={'Remove stage ' + numbers[i]}><X size={15} aria-hidden="true" /></button>
      </div>)}
    </div>
    <div><button type="button" className="outline-button" disabled={draft.stages.length >= maxStages} onClick={() => set({ stages: [...draft.stages, newStage(today, draft.stages[draft.stages.length - 1])] })}><Plus size={14} aria-hidden="true" /> Add stage</button></div>
    {renumbered && <p className="flag-note" role="note">Because a stage was added, request {renumbered.no} becomes {numbers[draft.stages.indexOf(renumbered)]} when you save.</p>}
    {text('comments', 'Comments')}
    {problems.map((problem) => <p className="ops-error" role="alert" key={problem}>{problem}</p>)}
    <footer className="rq-footer"><button className="primary-button" disabled={busy}>{editing ? 'Save changes' : numbers.length > 1 ? `Add ${numbers.length} requests` : 'Add request'}</button><button type="button" className="text-button" onClick={onCancel}>{editing ? 'Cancel' : 'Clear form'}</button></footer>
  </form>;
}

/**
 * The Requests panel. Everyone with request access adds requests, edits any request and works the open items;
 * the dashboard, the full register and import / export need the overview permission.
 */
export function RequestsPanel({ me, canOverview, lists }: { me: { id: string; name: string }; canOverview: boolean; lists: RequestLists }) {
  const today = localDate();
  const [records, setRecords] = useState<RequestRecord[] | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [notes, setNotes] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>(canOverview ? 'dashboard' : 'open');
  const firstDraft = () => blankDraft(today, { doneBy: doneByFor(me.name, lists.doneBy) });
  const [draft, setDraft] = useState<RequestDraft>(firstDraft), [problems, setProblems] = useState<string[]>([]), [busy, setBusy] = useState(false), [saved, setSaved] = useState<{ records: RequestRecord[]; edited: boolean } | null>(null);
  const [find, setFind] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState(''), [experiment, setExperiment] = useState(''), [h2sOnly, setH2sOnly] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const reload = () => loadRequests().then((all) => { setRecords(all); setError(''); }).catch((e) => setError(e instanceof Error ? e.message : 'The request book could not be opened in this browser.'));
  useEffect(() => { reload(); }, []);
  const all = useMemo(() => records || [], [records]);
  const openItems = useMemo(() => all.filter(isOpen).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no, undefined, { numeric: true })), [all]);
  const visible = tab === 'form' || tab === 'open' || canOverview ? tab : 'open';
  const numbers = useMemo(() => {
    const own = draft.group === undefined ? [] : groupRecords(all, draft.group);
    const base = draft.group === undefined ? nextBase(all.map((r) => r.no)) : baseNumber(own[0]?.no || '') ?? 0;
    return stageNumbers(base, draft.stages.map((stage) => stage.no));
  }, [draft, all]);

  const startNew = (keep: Partial<RequestDraft> = {}) => { setDraft({ ...firstDraft(), ...keep }); setSaved(null); setProblems([]); setMessage(''); setNotes([]); setTab('form'); };
  const edit = (record: RequestRecord) => { const next = draftOf(all, groupKey(record.no)); if (!next) return; setDraft(next); setSaved(null); setProblems([]); setMessage(''); setNotes([]); setTab('form'); };
  const save = async () => {
    const found = draftProblems(draft, today);
    setProblems(found);
    if (found.length) return;
    setBusy(true);
    try { const stored = await saveRequest(draft, me.name, today); await reload(); setSaved({ records: stored, edited: draft.group !== undefined }); setDraft(firstDraft()); }
    catch (e) { setProblems([e instanceof Error ? e.message : 'The request could not be saved.']); }
    setBusy(false);
  };
  const changeStatus = async (record: RequestRecord, next: RequestStatus) => {
    try { await putRequest({ ...withStatus(record, next, today), savedBy: me.name, savedAt: today }); await reload(); setMessage(`Request ${record.no} marked ${next}.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'The request could not be saved.'); }
  };
  const openFound = () => {
    const wanted = find.trim(); if (!wanted) return;
    const record = all.find((r) => r.no === wanted) || all.find((r) => groupKey(r.no) === wanted);
    if (record) { setFind(''); edit(record); } else setMessage(`No request with number ${wanted} was found.`);
  };
  const importFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setNotes([]); setMessage('');
    try {
      const parsed = recordsFromRows(await readXlsxSheet(await chosen.arrayBuffer(), ['Request Log', 'Request Book']), me.name, today);
      const result = await importRequests(parsed.records); await reload();
      setMessage(`Import finished: ${result.added} request(s) added${result.skipped ? `, ${result.skipped} already in the request book and left unchanged` : ''}.`); setNotes(parsed.notes);
    } catch (e) { setError(e instanceof Error ? e.message : 'The workbook could not be imported.'); }
    setBusy(false); if (file.current) file.current.value = '';
  };
  const exportCsv = () => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([requestsCsv(newestFirst(all).reverse())], { type: 'text/csv;charset=utf-8' })); link.download = `VAPS-request-book-${today}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); };

  const filtered = useMemo(() => { const text = query.trim().toLowerCase();
    return newestFirst(all.filter((r) => (!status || r.status === status) && (!experiment || r.experiment === experiment) && (!h2sOnly || r.h2s) && (!text || [r.no, r.job, r.well, r.cylinder, r.balloon, r.doneBy, r.client].some((value) => value.toLowerCase().includes(text))))); }, [all, query, status, experiment, h2sOnly]);
  const tabs: [Tab, string][] = [...(canOverview ? [['dashboard', 'Dashboard'] as [Tab, string]] : []), ['form', draft.group !== undefined && !saved ? 'Edit request' : 'New request'], ['open', 'Open items'], ...(canOverview ? [['all', 'All requests'] as [Tab, string]] : [])];
  const savedNumbers = saved?.records.map((r) => r.no) || [], first = saved?.records[0];

  return <div className="rq">
    <section className="page-intro"><div><span className="eyebrow">PVT LABORATORY</span><h1>Requests</h1><p>Request book for the liquid and gas samples sent for composition analysis.</p></div>
      <div className="rq-top"><form className="rq-find" role="search" onSubmit={(e) => { e.preventDefault(); openFound(); }}><label><span className="sr-only">Find request by number</span><input inputMode="numeric" placeholder="Find request no." value={find} onChange={(e) => setFind(e.target.value)} /></label><button className="outline-button" aria-label="Open request"><Search size={15} aria-hidden="true" /> Open</button></form>
        <button type="button" className="primary-button" onClick={() => startNew()}><Plus size={15} aria-hidden="true" /> New request</button></div></section>
    <div className="sampling-tabs" role="tablist" aria-label="Request book sections">{tabs.map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={visible === key} className={visible === key ? 'active' : ''} onClick={() => { setMessage(''); setNotes([]); setTab(key); }}>{label}{key === 'open' && <span>{openItems.length}</span>}</button>)}</div>
    {error && <p className="ops-error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {notes.map((note) => <p className="flag-note" role="note" key={note}>{note}</p>)}
    {records === null && !error ? <p className="filter-note">Loading the request book…</p> : visible === 'dashboard' ? (all.length ? <Dashboard records={all} today={today} /> : <section className="panel"><h2>No requests yet</h2><p className="filter-note">Add the first request, or import the Excel request book from the All requests tab.</p></section>)
      : visible === 'open' ? <section className="panel"><div className="rq-head"><h2>Open items</h2><span>Oldest first. Press Ready when the composition result is ready. Red rows contain H2S.</span></div><RequestTable rows={openItems} actions onEdit={edit} onStatus={changeStatus} /></section>
      : visible === 'all' ? <section className="panel">
          <div className="rq-filters rq-plain"><input type="search" aria-label="Search requests" placeholder="Search request no, job, well, cylinder, balloon, employee…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{requestStatuses.map((s) => <option key={s}>{s}</option>)}</select>
            <select aria-label="Experiment" value={experiment} onChange={(e) => setExperiment(e.target.value)}><option value="">All experiments</option>{[...new Set(all.map((r) => r.experiment).filter(Boolean))].sort().map((x) => <option key={x}>{x}</option>)}</select>
            <div className="rq-seg"><button type="button" className={h2sOnly ? 'active danger' : ''} aria-pressed={h2sOnly} onClick={() => setH2sOnly(!h2sOnly)}>H2S only</button></div></div>
          <div className="rq-head"><span>{filtered.length} of {all.length} requests{filtered.length > 200 ? ' (first 200 shown — search to narrow)' : ''}. Edit opens the request with all its stages.</span>
            <div><input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => importFile(e.target.files?.[0])} /><button type="button" className="outline-button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} aria-hidden="true" /> Import Request Book</button><button type="button" className="outline-button" disabled={!all.length} onClick={exportCsv}><Download size={14} aria-hidden="true" /> Export</button></div></div>
          <RequestTable rows={filtered.slice(0, 200)} actions={false} onEdit={edit} onStatus={changeStatus} /></section>
      : saved && first ? <section className={'panel rq-saved' + (first.h2s ? ' rq-form-h2s' : '')}><h2>{saved.edited ? 'Changes saved' : 'Request added'}</h2><strong className="rq-no">{range(savedNumbers)}</strong>
          <p className="filter-note">{first.job} · {first.well} · {first.experiment} · {savedNumbers.length > 1 ? savedNumbers.length + ' stages' : 'single request'} · saved by {me.name}</p>
          {first.h2s && <p className="rq-h2s-banner" role="note"><TriangleAlert size={17} aria-hidden="true" /> H2S — this request contains H2S.</p>}
          <footer className="rq-footer"><button type="button" className="primary-button" onClick={() => startNew({ job: first.job, client: first.client, well: first.well, sample: first.sample, cylinder: first.cylinder, h2s: first.h2s })}><Plus size={15} aria-hidden="true" /> Another request for the same job</button><button type="button" className="outline-button" onClick={() => startNew()}>New blank request</button><button type="button" className="outline-button" onClick={() => { setSaved(null); setTab('open'); }}>Go to open items</button></footer></section>
      : <RequestForm draft={draft} setDraft={(next) => { setDraft(next); if (problems.length) setProblems([]); }} lists={lists} numbers={numbers} last={draft.group !== undefined ? groupRecords(all, draft.group)[0] : undefined} problems={problems} busy={busy} today={today} onSave={save} onCancel={() => { const wasEditing = draft.group !== undefined; setDraft(firstDraft()); setProblems([]); if (wasEditing) setTab('open'); }} />}
  </div>;
}
