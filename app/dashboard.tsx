'use client';
import { useState, type ReactNode } from 'react';
import { ArrowRight, Settings } from 'lucide-react';
import type { WorkItem, WaitingItem, BlockedItem } from './work-items';

type Filter = 'all' | 'returned' | 'review' | 'new' | 'overdue' | 'task';
const settingLabel: Record<BlockedItem['setting'], string> = { teams: 'PVT and Chemical teams', labReceipt: 'Laboratory receipt responsibility', qcReviewer: 'QC review responsibility', samplingApproval: 'Sampling approval responsibility', scopeSelector: 'Scope selection responsibility', routing: 'Laboratory test routing' };
const settingAnchor: Record<BlockedItem['setting'], string> = { teams: 'lab-teams', labReceipt: 'responsibilities', qcReviewer: 'responsibilities', samplingApproval: 'responsibilities', scopeSelector: 'responsibilities', routing: 'test-routing' };

/**
 * The employee's starting point: actions first, then work waiting on others, configuration blocks,
 * and optional planning and overview sections. Items come from work-items.ts (the same workflow states as each section).
 */
export function MyDashboard({ name, firstName, date, actions, waiting, blocked, isNew, onOpen, onOpenWaiting, isAdmin, canCreate, onCreate, children }: {
  name: (id?: string) => string; firstName: string; date: string; actions: WorkItem[]; waiting: WaitingItem[]; blocked: BlockedItem[];
  isNew: (item: WorkItem) => boolean; onOpen: (item: WorkItem) => void; onOpenWaiting: (item: WaitingItem) => void; isAdmin: boolean; canCreate: boolean; onCreate: () => void; children?: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>('all'), [search, setSearch] = useState('');
  const match: Record<Filter, (i: WorkItem) => boolean> = { all: () => true, returned: (i) => i.kind === 'returned', review: (i) => i.kind === 'review', new: (i) => isNew(i), overdue: (i) => i.overdue, task: (i) => i.kind === 'task' || i.kind === 'assignment' };
  const term = search.trim().toLowerCase();
  const shown = actions.filter(match[filter]).filter((i) => !term || [i.jobNumber, i.client, i.test, i.sample, i.action, i.status].join(' ').toLowerCase().includes(term));
  const chips: [Filter, string][] = [['all', 'All my actions'], ['returned', 'Returned'], ['overdue', 'Overdue'], ['review', 'Reviews'], ['new', 'New'], ['task', 'Tasks']];
  const when = (v?: string) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  return <div className="my-dashboard">
    <section className="dashboard-intro"><div><span className="eyebrow">MY DASHBOARD · {date}</span><h1>Hello, {firstName}</h1><p>{actions.length ? `You have ${actions.length} action${actions.length === 1 ? '' : 's'} to take.` : waiting.length ? 'Nothing needs your action right now. Your submitted work is waiting on others.' : 'Nothing needs your action right now.'}</p></div>{canCreate && <button type="button" className="primary-button" onClick={onCreate}>+ Create Job</button>}</section>
    <p className="local-note" role="note">Browser-local trial: records and notifications are kept in this browser only. The profile selector is not secure sign-in, and nothing is synchronized to other devices.</p>
    <nav className="dashboard-counts" aria-label="Dashboard summary">{chips.map(([id, label]) => { const n = actions.filter(match[id]).length; return <button key={id} type="button" className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => { setFilter(id); document.getElementById('my-actions')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}><strong>{n}</strong><span>{label}</span></button>; })}<a href="#waiting-on-others"><strong>{waiting.length}</strong><span>Waiting on others</span></a>{blocked.length > 0 && <a href="#blocked-work" className="is-blocked"><strong>{blocked.length}</strong><span>Blocked by settings</span></a>}</nav>
    <section className="panel dashboard-section" id="my-actions" aria-labelledby="my-actions-title">
      <div className="section-head"><h2 id="my-actions-title">My actions</h2><label className="dashboard-search"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Job, client, sample or test" /></label></div>
      {filter !== 'all' && <p className="filter-note">Showing: {chips.find((c) => c[0] === filter)![1]} · <button type="button" className="text-button" onClick={() => setFilter('all')}>Show all</button></p>}
      {shown.length ? <ul className="action-list">{shown.map((i) => <li key={i.key} className={'action-card kind-' + i.kind + (i.overdue ? ' is-overdue' : '')}>
        <div className="action-tags">{i.kind === 'returned' && <span className="tag tag-returned">Returned</span>}{i.overdue && <span className="tag tag-overdue">Overdue</span>}{i.kind === 'review' && <span className="tag tag-review">Review</span>}{isNew(i) && <span className="tag tag-new">New</span>}{i.stream && <span className="tag">{i.stream}</span>}</div>
        <h3>{i.action}</h3>
        <dl className="action-meta"><div><dt>Job</dt><dd>{i.jobNumber} · {i.client}</dd></div>{i.sample && <div><dt>Sample</dt><dd>{i.sample}{i.container ? ` · ${i.container}` : ''}</dd></div>}{i.test && <div><dt>Test</dt><dd>{i.test}</dd></div>}<div><dt>Status</dt><dd>{i.status}</dd></div>{i.due && <div><dt>Due</dt><dd className={i.overdue ? 'overdue-text' : ''}>{when(i.due)}</dd></div>}{i.from && <div><dt>{i.fromLabel}</dt><dd>{name(i.from)}</dd></div>}</dl>
        {i.comment && <p className="action-comment"><strong>{i.kind === 'returned' ? 'Correction requested:' : 'Note:'}</strong> {i.comment}</p>}
        <button type="button" className="primary-button action-open" onClick={() => onOpen(i)}>{i.action} <ArrowRight size={15} /></button>
      </li>)}</ul> : <p className="empty-state">{actions.length ? 'No actions match these filters.' : blocked.length ? 'No actions you can take now. Some work is blocked by missing settings (see below).' : waiting.length ? 'No action needed. Your submitted work is waiting for review.' : 'No work assigned to you right now.'}</p>}
    </section>
    <section className="panel dashboard-section" id="waiting-on-others" aria-labelledby="waiting-title"><div className="section-head"><h2 id="waiting-title">Waiting on others</h2><span className="event-count">{waiting.length}</span></div>
      {waiting.length ? <ul className="waiting-list">{waiting.map((w) => <li key={w.key}><div><strong>{w.what}</strong><span>{w.jobNumber} · {w.client}</span></div><div><small>Waiting on</small><span>{w.waitingOn}</span>{w.since && <small>since {when(w.since)}</small>}</div><button type="button" className="outline-button" onClick={() => onOpenWaiting(w)}>View</button></li>)}</ul> : <p className="empty-state">Nothing you submitted is waiting on others.</p>}
    </section>
    {blocked.length > 0 && <section className="panel dashboard-section blocked-section" id="blocked-work" aria-labelledby="blocked-title"><div className="section-head"><h2 id="blocked-title">Blocked by missing settings</h2></div><ul className="blocked-list">{blocked.map((b) => <li key={b.key}><div><strong>{settingLabel[b.setting]} not configured</strong><p>{b.what} Jobs: {b.jobs.join(', ')}.</p></div>{isAdmin ? <a className="outline-button" href={`#settings/authorization/${settingAnchor[b.setting]}`}><Settings size={15} /> Open the setting</a> : <small>An administrator needs to configure this in Settings → Authorization.</small>}</li>)}</ul></section>}
    {children}
  </div>;
}

/** Read-only laboratory progress for team leads (their section) and the supervisor or administrator (both). No actions. */
export function LabSummary({ rows, onOpen }: { rows: { stream: string; counts: [string, number][] }[]; onOpen: () => void }) {
  if (!rows.length) return null;
  return <section className="panel dashboard-section" aria-labelledby="lab-summary-title"><div className="section-head"><h2 id="lab-summary-title">Laboratory progress</h2><button type="button" className="outline-button" onClick={onOpen}>Open PVT Lab overview</button></div>
    <p className="filter-note">Read-only summary. Assignment and review actions appear in My actions only for their configured holders.</p>
    <div className="lab-summary-grid">{rows.map((row) => <div key={row.stream}><strong>{row.stream}</strong><ul>{row.counts.map(([label, n]) => <li key={label}><span>{label}</span><b>{n}</b></li>)}</ul></div>)}</div>
  </section>;
}
