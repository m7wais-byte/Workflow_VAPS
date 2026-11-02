'use client';
import { useState, type ReactNode } from 'react';
import { itemSearchText, rowSearchText, type Alert, type BlockedItem, type InboxRow, type Setting, type UpcomingItem, type WaitingItem, type WorkItem } from './work-items';

export type MyWorkFilter = 'now' | 'upcoming' | 'waiting' | 'blocked' | 'jobs';
const PER_PAGE = 15;
export const settingLabel: Record<Setting, string> = { teams: 'PVT and Chemical teams', labReceipt: 'Laboratory receipt responsibility', qcReviewer: 'QC review responsibility', samplingApproval: 'Sampling approval responsibility', scopeSelector: 'Scope selection responsibility', routing: 'Laboratory test routing', finalApproval: 'Final report approval responsibility', pvtTeamLead: 'PVT Team Lead responsibility', chemicalTeamLead: 'Chemical Team Lead responsibility' };
const settingAnchor: Record<Setting, string> = { teams: 'lab-teams', labReceipt: 'responsibilities', qcReviewer: 'responsibilities', samplingApproval: 'responsibilities', scopeSelector: 'responsibilities', routing: 'test-routing', finalApproval: 'responsibilities', pvtTeamLead: 'responsibilities', chemicalTeamLead: 'responsibilities' };
const when = (v?: string) => v ? new Date(v.length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const stamp = (v: string) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const ident = (test?: string, sample?: string, container?: string) => [sample && `Sample ${sample}${container ? ` · ${container}` : ''}`, test].filter(Boolean).join(' · ');
const areaClass = (area: string) => 'area-tag area-' + area.toLowerCase().replace(/[^a-z]+/g, '-');

/**
 * My work: the employee's home. Do now lists one row per actionable task; Coming up, Waiting and Blocked stay compact;
 * My jobs lists every job where this employee holds a real responsibility. Everything comes from workItems() (work-items.ts).
 */
export function MyWork({ now, upcoming, waiting, blocked, blockedActions, alerts, rows, today, name, isNew, filter, onFilter, onOpen, onOpenTab, onOpenJob, onReadAlert, isAdmin, canCreate, onCreate, canPlan, canOverview, onPlanning, onOverview, children }: {
  now: WorkItem[]; upcoming: UpcomingItem[]; waiting: WaitingItem[]; blocked: BlockedItem[]; blockedActions: WorkItem[]; alerts: Alert[]; rows: InboxRow[];
  today: string; name: (id?: string) => string; isNew: (item: WorkItem) => boolean; filter: MyWorkFilter; onFilter: (f: MyWorkFilter) => void;
  onOpen: (item: WorkItem) => void; onOpenTab: (jobId: string, tab: string, alert?: Alert) => void; onOpenJob: (row: InboxRow) => void; onReadAlert: (alert: Alert) => void;
  isAdmin: boolean; canCreate: boolean; onCreate: () => void; canPlan: boolean; canOverview: boolean; onPlanning: () => void; onOverview: () => void; children?: ReactNode;
}) {
  const [search, setSearch] = useState(''), [page, setPage] = useState(0), [allAlerts, setAllAlerts] = useState(false);
  const term = search.trim().toLowerCase(), hit = (text: string) => !term || text.includes(term);
  const blockedWaiting = waiting.filter((w) => w.blocked), plainWaiting = waiting.filter((w) => !w.blocked);
  const lists = {
    now: now.filter((i) => hit(itemSearchText(i))),
    upcoming: upcoming.filter((u) => hit(itemSearchText(u))),
    waiting: plainWaiting.filter((w) => hit([w.jobNumber, w.client, w.what, w.label, w.waitingOn, w.test, w.sample].join(' ').toLowerCase())),
    blocked: [...blockedActions.map((i) => ({ key: i.key, jobId: i.jobId, jobNumber: i.jobNumber, text: `${i.action} · ${i.stream} team has no members`, open: () => onOpen(i) })),
      ...blockedWaiting.map((w) => ({ key: w.key, jobId: w.jobId, jobNumber: w.jobNumber, text: `${w.what} · waiting on ${w.waitingOn}`, open: () => onOpenTab(w.jobId, w.open.tab) }))].filter((b) => hit((b.jobNumber + ' ' + b.text).toLowerCase())),
    jobs: rows.filter((r) => hit(rowSearchText(r))),
  };
  const counts: Record<MyWorkFilter, number> = { now: lists.now.length, upcoming: lists.upcoming.length, waiting: lists.waiting.length, blocked: lists.blocked.length + (isAdmin ? blocked.length : 0), jobs: lists.jobs.length };
  const tabs: [MyWorkFilter, string][] = [['now', 'Do now'], ['upcoming', 'Coming up'], ['waiting', 'Waiting on others'], ['blocked', 'Blocked'], ['jobs', 'My jobs']];
  const shown = lists[filter] as unknown[];
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE)), current = Math.min(page, pages - 1), slice = <T,>(l: T[]) => l.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);
  const pager = shown.length > PER_PAGE && <nav className="inbox-pager" aria-label="Pages"><span>{current * PER_PAGE + 1}–{Math.min(shown.length, (current + 1) * PER_PAGE)} of {shown.length}</span><button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button><button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>›</button></nav>;
  const due = (date: string | undefined, kind: string, late?: boolean, jobDue?: string) => <div className={'inbox-due' + (late ? ' is-late' : '')}>{date ? <><span className="due-kind">{kind}</span> {when(date)}</> : <span className="muted">No deadline</span>}{late && date ? <small>{Math.round((Date.parse(today) - Date.parse(date)) / 864e5)} day(s) overdue</small> : date === today ? <small>Due today</small> : null}{jobDue && kind === 'Test due' && jobDue !== date && <small>Job due {when(jobDue)}</small>}</div>;
  const visibleAlerts = allAlerts ? alerts : alerts.slice(0, 3);

  return <div className="my-work">
    <header className="inbox-head"><h1>My work</h1><nav className="inbox-links" aria-label="Other views">{canPlan && <button type="button" className="text-button" onClick={onPlanning}>Weekly plan</button>}{canOverview && <button type="button" className="text-button" onClick={onOverview}>Overview &amp; activity</button>}</nav>{canCreate && <button type="button" className="primary-button" onClick={onCreate}>+ Create Job</button>}</header>
    {children}
    {alerts.length > 0 && <section className="alert-strip" aria-label="New scope and assignment alerts">
      <header><strong>{alerts.length} new alert{alerts.length === 1 ? '' : 's'}</strong><span>Reading an alert does not complete the work; open it to act.</span></header>
      <ul>{visibleAlerts.map((a) => <li key={a.key} className={'alert-' + a.kind}>
        <div><strong>{a.headline}</strong> · <b className="mono">{a.jobNumber}</b> · {a.samples} · {a.scope}
          <small>Destination {a.destination} · {a.kind === 'scope' ? 'added' : a.kind === 'moved' ? 'reassigned' : 'assigned'} by {name(a.by)} · {stamp(a.at)} · Planning: {a.planner ? name(a.planner) : 'Unassigned (team lead not configured)'} · Assigned: {a.assignee ? (a.kind === 'scope' ? a.assignee : name(a.assignee)) : 'not yet'}</small></div>
        <div className="alert-go"><button type="button" className="primary-button" onClick={() => onOpenTab(a.jobId, a.open.tab, a)}>{a.button}</button><button type="button" className="text-button" onClick={() => onReadAlert(a)}>Mark read</button></div>
      </li>)}</ul>
      {alerts.length > 3 && <button type="button" className="text-button" onClick={() => setAllAlerts(!allAlerts)}>{allAlerts ? 'Show fewer' : `Show all ${alerts.length}`}</button>}
    </section>}
    {isAdmin && blocked.length > 0 && <p className="inbox-admin-note" role="note"><strong>{blocked.length} workflow setting{blocked.length === 1 ? '' : 's'} missing:</strong> {blocked.map((b, n) => <span key={b.key}>{n ? ', ' : ''}<a href={`#settings/authorization/${settingAnchor[b.setting]}`}>{settingLabel[b.setting]}</a> ({b.jobs.length} job{b.jobs.length === 1 ? '' : 's'})</span>)}</p>}
    <div className="inbox-bar">
      <div className="inbox-tabs" role="group" aria-label="My work views">{tabs.map(([id, label]) => <button key={id} type="button" className={filter === id ? 'is-on' : ''} aria-pressed={filter === id} onClick={() => { onFilter(id); setPage(0); }}>{label}<b>{counts[id]}</b></button>)}</div>
      {pager}
      <label className="inbox-search"><span className="sr-only">Search my work</span><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search job, sample, test or client" /></label>
    </div>
    <div className="inbox-list" role="table" aria-label={tabs.find((t) => t[0] === filter)?.[1]}>
      {filter === 'now' && <><div className="inbox-th" role="row"><span role="columnheader">Job</span><span role="columnheader">Task</span><span role="columnheader">Deadline</span><span role="columnheader">Action</span></div>
        {slice(lists.now).map((i) => <div key={i.key} className={'inbox-item ' + (i.kind === 'returned' ? 'is-returned' : i.overdue ? 'is-overdue' : '')} role="row"><div className="inbox-row">
          <div className="inbox-job" role="cell"><b>{i.jobNumber}</b><span>{i.client}</span></div>
          <div className="inbox-act" role="cell"><span className={areaClass(i.area)}>{i.area}</span>{i.kind === 'returned' && <span className="inbox-tag tag-returned">Returned</span>}{isNew(i) && <span className="inbox-tag tag-new">New</span>}<strong>{i.action}</strong>
            <span className="inbox-sub">{ident(i.test, i.sample, i.container) || i.status}{i.from ? ` · ${i.fromLabel || 'From'} ${name(i.from)}` : ''}</span>
            {i.comment && <span className={'inbox-note ' + (i.kind === 'returned' ? 'is-correction' : '')}>{i.kind === 'returned' ? 'Correction: ' : 'Note: '}{i.comment}</span>}</div>
          <div role="cell">{due(i.due, i.dueKind, i.overdue, i.jobDue)}</div>
          <div className="inbox-go" role="cell"><button type="button" className="primary-button" onClick={() => onOpen(i)}>{i.button}</button></div>
        </div></div>)}
        {!lists.now.length && <p className="inbox-empty">{term ? 'Nothing matches this search.' : upcoming.length || plainWaiting.length ? 'Nothing needs your action right now. See Coming up and Waiting on others.' : 'Nothing needs your action right now.'}</p>}</>}
      {filter === 'upcoming' && <>{slice(lists.upcoming).map((u) => <div key={u.key} className="inbox-item compact" role="row"><div className="inbox-row">
          <div className="inbox-job" role="cell"><b>{u.jobNumber}</b><span>{u.client}</span></div>
          <div className="inbox-act" role="cell"><span className={areaClass(u.area)}>{u.area}</span><strong>{u.what}</strong><span className="inbox-sub">{u.after} · {u.role}</span></div>
          <div role="cell">{due(u.due, u.dueKind)}</div>
          <div className="inbox-go" role="cell"><button type="button" className="outline-button" onClick={() => onOpenTab(u.jobId, u.open.tab)}>View</button></div>
        </div></div>)}{!lists.upcoming.length && <p className="inbox-empty">Nothing coming up.</p>}</>}
      {filter === 'waiting' && <>{slice(lists.waiting).map((w) => <div key={w.key} className="inbox-item compact" role="row"><div className="inbox-row">
          <div className="inbox-job" role="cell"><b>{w.jobNumber}</b><span>{w.client}</span></div>
          <div className="inbox-act" role="cell"><strong>{w.label || `Waiting on ${w.waitingOn}`}</strong><span className="inbox-sub">{w.what}</span>{w.comment && <span className="inbox-note">{w.commentLabel || 'Note'}: {w.comment}</span>}</div>
          <div role="cell" className="inbox-due">{w.since ? <><span className="due-kind">Since</span> {when(w.since)}</> : null}</div>
          <div className="inbox-go" role="cell"><button type="button" className="outline-button" onClick={() => onOpenTab(w.jobId, w.open.tab)}>View</button></div>
        </div></div>)}{!lists.waiting.length && <p className="inbox-empty">Nothing of yours is waiting on others.</p>}</>}
      {filter === 'blocked' && <>{isAdmin && blocked.map((b) => <p key={b.key} className="inbox-comment is-blocked"><strong>{settingLabel[b.setting]} not configured.</strong> {b.what} Jobs: {b.jobs.join(', ')}. <a href={`#settings/authorization/${settingAnchor[b.setting]}`}>Open the setting</a></p>)}
        {lists.blocked.map((b) => <div key={b.key} className="inbox-item compact is-blocked" role="row"><div className="inbox-row">
          <div className="inbox-job" role="cell"><b>{b.jobNumber}</b></div>
          <div className="inbox-act" role="cell"><strong>Blocked by a missing setting</strong><span className="inbox-sub">{b.text}. {isAdmin ? '' : 'An administrator must configure this; nothing more is needed from you.'}</span></div>
          <div role="cell" />
          <div className="inbox-go" role="cell"><button type="button" className="outline-button" onClick={b.open}>View</button></div>
        </div></div>)}{!lists.blocked.length && !(isAdmin && blocked.length) && <p className="inbox-empty">Nothing is blocked.</p>}</>}
      {filter === 'jobs' && <><div className="inbox-th" role="row"><span role="columnheader">Job</span><span role="columnheader">Your responsibility · stage</span><span role="columnheader">Job due</span><span role="columnheader">Action</span></div>
        {slice(lists.jobs).map((r) => { const next = r.actions[0]; return <div key={r.jobId} className="inbox-item compact" role="row"><div className="inbox-row">
          <div className="inbox-job" role="cell"><b>{r.jobNumber}</b><span>{r.client}</span></div>
          <div className="inbox-act" role="cell"><strong>{r.roles.join(' · ') || 'Assigned work'}</strong><span className="inbox-sub">{r.stage}{r.additionalWork ? ' · Additional work pending' : ''} · {next ? 'Your next action: ' + next.action : r.waiting[0] ? 'Waiting on ' + r.waiting[0].waitingOn : r.upcoming[0] ? 'Coming up: ' + r.upcoming[0].what : 'No action needed from you now'}</span></div>
          <div role="cell" className="inbox-due">{r.jobDue ? when(r.jobDue) : <span className="muted">Not set</span>}</div>
          <div className="inbox-go" role="cell"><button type="button" className="outline-button" onClick={() => onOpenJob(r)}>Open job</button></div>
        </div></div>; })}{!lists.jobs.length && <p className="inbox-empty">{term ? 'Nothing matches this search.' : 'No jobs currently include a responsibility of yours.'}</p>}</>}
    </div>
    <div className="inbox-foot">{pager}<span>Browser-local trial: records stay in this browser; the demo selector is not secure sign-in.</span></div>
  </div>;
}

/** Read-only laboratory progress for team leads (their section) and the supervisor or administrator (both). No actions. */
export function LabSummary({ rows, onOpen }: { rows: { stream: string; counts: [string, number][] }[]; onOpen: () => void }) {
  if (!rows.length) return null;
  return <section className="panel dashboard-section" aria-labelledby="lab-summary-title"><div className="section-head"><h2 id="lab-summary-title">Laboratory progress</h2><button type="button" className="outline-button" onClick={onOpen}>Open Laboratory</button></div>
    <p className="filter-note">Read-only summary. Assignment and review actions appear in My work only for their configured holders.</p>
    <div className="lab-summary-grid">{rows.map((row) => <div key={row.stream}><strong>{row.stream}</strong><ul>{row.counts.map(([label, n]) => <li key={label}><span>{label}</span><b>{n}</b></li>)}</ul></div>)}</div>
  </section>;
}
