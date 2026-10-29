'use client';
import { useState, type ReactNode } from 'react';
import { rowSearchText, type InboxRow, type WorkItem, type WaitingItem, type BlockedItem, type Setting } from './work-items';

type Filter = 'action' | 'waiting' | 'all';
const PER_PAGE = 10;
const settingLabel: Record<Setting, string> = { teams: 'PVT and Chemical teams', labReceipt: 'Laboratory receipt responsibility', qcReviewer: 'QC review responsibility', samplingApproval: 'Sampling approval responsibility', scopeSelector: 'Scope selection responsibility', routing: 'Laboratory test routing', finalApproval: 'Final report approval responsibility' };
const settingAnchor: Record<Setting, string> = { teams: 'lab-teams', labReceipt: 'responsibilities', qcReviewer: 'responsibilities', samplingApproval: 'responsibilities', scopeSelector: 'responsibilities', routing: 'test-routing', finalApproval: 'responsibilities' };
const blockedHeadline: Record<Setting, string> = { teams: 'Tests cannot be assigned — the team has no members', labReceipt: 'Receipt cannot be confirmed — laboratory receipt not configured', qcReviewer: 'QC review cannot start — QC reviewer not configured', samplingApproval: 'Review cannot start — sampling approver not configured', scopeSelector: 'Scope cannot be released — scope selector not configured', routing: 'Tests cannot be routed — test routing not configured', finalApproval: 'Approval cannot start — final approver not configured' };

/** One line of work inside a job row: an action, a blocked action or a waiting item. */
type Entry = { key: string; tone: 'action' | 'blocked' | 'waiting'; tags: string[]; headline: string; sub: string; due?: string; overdue?: boolean; button: string; open: () => void; facts: [string, string][]; comment?: string; commentLabel?: string; /** Red only for corrections this employee must make. */commentTone?: 'correction' | 'note' | 'neutral' };
const when = (v?: string) => v ? new Date(v.length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const ident = (test?: string, sample?: string, container?: string) => [test, sample && `Sample ${sample}${container ? ` · ${container}` : ''}`].filter(Boolean).join(' · ');

/**
 * The dashboard: one personal inbox with one row per job. Rows come from inboxRows() (work-items.ts),
 * which derives every action from the same workflow states and permissions as the Jobs, Sampling and PVT Lab pages.
 */
export function MyWork({ rows, today, name, isNew, onOpen, onOpenWaiting, onOpenJob, isAdmin, canCreate, onCreate, canPlan, canOverview, onPlanning, onOverview, missing, children }: {
  rows: InboxRow[]; today: string; name: (id?: string) => string; isNew: (item: WorkItem) => boolean;
  onOpen: (item: WorkItem) => void; onOpenWaiting: (item: WaitingItem) => void; onOpenJob: (row: InboxRow) => void;
  isAdmin: boolean; canCreate: boolean; onCreate: () => void; canPlan: boolean; canOverview: boolean; onPlanning: () => void; onOverview: () => void;
  /** Missing settings across visible jobs; listed only for administrators, who can fix them. */missing: BlockedItem[]; children?: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>('action'), [search, setSearch] = useState(''), [page, setPage] = useState(0), [open, setOpen] = useState<string[]>([]);
  const term = search.trim().toLowerCase();
  const found = rows.filter((r) => !term || rowSearchText(r).includes(term));
  const match: Record<Filter, (r: InboxRow) => boolean> = { action: (r) => r.state === 'action', waiting: (r) => r.state === 'waiting' || r.state === 'blocked', all: () => true };
  const shown = found.filter(match[filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE)), current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);
  const tabs: [Filter, string][] = [['action', 'Needs my action'], ['waiting', 'Waiting'], ['all', 'All my jobs']];
  const range = shown.length ? `${current * PER_PAGE + 1}–${current * PER_PAGE + pageRows.length} of ${shown.length}` : '0 of 0';
  const pager = (where: string) => <nav className="inbox-pager" aria-label={`Pages (${where})`}><span>{range}</span><button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button><button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>›</button></nav>;
  const settingNote = (b: BlockedItem) => <p key={b.key} className="inbox-comment is-blocked"><strong>{settingLabel[b.setting]} not configured.</strong> {b.what} {isAdmin ? <a href={`#settings/authorization/${settingAnchor[b.setting]}`}>Open the setting</a> : 'An administrator must configure this in Settings → Authorization; nothing more is needed from you for this step.'}</p>;

  const entries = (r: InboxRow): Entry[] => [
    ...r.actions.map((i): Entry => ({ key: i.key, tone: 'action', tags: [...(i.kind === 'returned' ? ['Returned'] : []), ...(i.overdue ? ['Overdue'] : []), ...(isNew(i) ? ['New'] : []), ...(i.key.startsWith('draft:') ? ['Draft'] : [])], headline: i.action, sub: ident(i.test, i.sample, i.container) || (i.from ? `${i.fromLabel || 'From'} ${name(i.from)}` : i.status), due: i.due, overdue: i.overdue, button: i.button, open: () => onOpen(i),
      facts: [['Status', i.status] as [string, string], ...(i.from ? [[i.fromLabel || 'From', name(i.from)] as [string, string]] : []), ...(i.stream ? [['Laboratory', i.stream] as [string, string]] : [])], comment: i.comment, commentLabel: i.kind === 'returned' ? 'Correction requested' : i.fromLabel === 'Assigned by' ? 'Assignment note' : 'Note', commentTone: i.kind === 'returned' ? 'correction' : 'note' })),
    ...r.blockedActions.map((i): Entry => ({ key: i.key, tone: 'blocked', tags: ['Blocked'], headline: blockedHeadline.teams, sub: `${i.action} · ${i.stream} team has no members`, due: i.due, button: 'View job', open: () => onOpen(i), facts: [['Status', i.status]] })),
    ...r.waiting.map((w): Entry => ({ key: w.key, tone: w.blocked ? 'blocked' : 'waiting', tags: [w.blocked ? 'Blocked' : 'Waiting'], headline: w.blocked ? blockedHeadline[w.blocked] : w.label || `Waiting on ${w.waitingOn}`, sub: w.what, button: w.open.tab.startsWith('laboratory?') ? 'View test' : 'View job', open: () => onOpenWaiting(w),
      facts: [...(w.blocked ? [] : [['Waiting on', w.waitingOn] as [string, string]]), ...(w.since ? [['Since', when(w.since)] as [string, string]] : [])], comment: w.comment, commentLabel: w.commentLabel, commentTone: 'neutral' })),
  ];
  const dueCell = (due: string | undefined, late?: boolean) => <div className={'inbox-due' + (late ? ' is-late' : '')}>{due ? <><span className="inbox-due-label">Due </span>{when(due)}</> : <span className="muted">No due date</span>}{late && due ? <small>{Math.round((Date.parse(today) - Date.parse(due)) / 864e5)} day(s) overdue</small> : due === today ? <small>Due today</small> : null}</div>;

  return <div className="my-work">
    <header className="inbox-head"><h1>My work</h1><nav className="inbox-links" aria-label="Other views">{canPlan && <button type="button" className="text-button" onClick={onPlanning}>Weekly plan</button>}{canOverview && <button type="button" className="text-button" onClick={onOverview}>Overview &amp; activity</button>}</nav>{canCreate && <button type="button" className="primary-button" onClick={onCreate}>+ Create Job</button>}</header>
    {children}
    {isAdmin && missing.length > 0 && <p className="inbox-admin-note" role="note"><strong>{missing.length} workflow setting{missing.length === 1 ? '' : 's'} missing:</strong> {missing.map((b, n) => <span key={b.key}>{n ? ', ' : ''}<a href={`#settings/authorization/${settingAnchor[b.setting]}`}>{settingLabel[b.setting]}</a> ({b.jobs.length} job{b.jobs.length === 1 ? '' : 's'})</span>)}</p>}
    <div className="inbox-bar">
      <div className="inbox-tabs" role="group" aria-label="Filter my work">{tabs.map(([id, label]) => <button key={id} type="button" className={filter === id ? 'is-on' : ''} aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(0); }}>{label}<b>{found.filter(match[id]).length}</b></button>)}</div>
      {pager('top')}
      <label className="inbox-search"><span className="sr-only">Search my work</span><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search job, client, sample or test" /></label>
    </div>
    <div className="inbox-list" role="table" aria-label="My work">
      <div className="inbox-th" role="row"><span role="columnheader">Job / client</span><span role="columnheader">Required action</span><span role="columnheader">Due</span><span role="columnheader">Action</span></div>
      {pageRows.map((r) => {
        const list = entries(r), primary = list[0], rest = list.slice(1), expanded = open.includes(r.jobId);
        const tone = r.returned ? 'is-returned' : r.overdue ? 'is-overdue' : r.state === 'blocked' ? 'is-blocked' : '';
        const toggle = () => setOpen(expanded ? open.filter((id) => id !== r.jobId) : [...open, r.jobId]);
        return <div key={r.jobId} className={'inbox-item ' + tone} role="rowgroup">
          <div className="inbox-row" role="row">
            <div className="inbox-job" role="cell"><b>{r.jobNumber}</b><span>{r.client}</span></div>
            <div className="inbox-act" role="cell">{primary ? <>{primary.tags.map((t) => <span key={t} className={'inbox-tag tag-' + t.toLowerCase()}>{t}</span>)}<strong>{primary.headline}</strong><span className="inbox-sub">{primary.sub}</span></> : <><span className="inbox-tag tag-info">In progress</span><strong>No action needed from you</strong><span className="inbox-sub">{r.stage}</span></>}</div>
            <div role="cell">{dueCell(primary?.tone === 'action' ? r.due : primary?.due || r.due, primary?.tone === 'action' && r.overdue)}</div>
            <div className="inbox-go" role="cell"><button type="button" className="inbox-more" aria-expanded={expanded} onClick={toggle}>{expanded ? 'Hide' : rest.length ? `+${rest.length} more` : 'Details'}</button>
              {primary ? <button type="button" className={primary.tone === 'action' ? 'primary-button' : 'outline-button'} onClick={primary.open}>{primary.button}</button> : <button type="button" className="outline-button" onClick={() => onOpenJob(r)}>View job</button>}</div>
          </div>
          {expanded && <div className="inbox-detail">
            {primary ? <><dl className="inbox-facts">{primary.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{primary.comment && <p className={'inbox-comment tone-' + primary.commentTone}><strong>{primary.commentLabel}:</strong> {primary.comment}</p>}</> : <dl className="inbox-facts"><div><dt>Current stage</dt><dd>{r.stage}</dd></div></dl>}
            {r.blocked.map(settingNote)}
            {rest.length > 0 && <ul className="inbox-subs">{rest.map((e) => <li key={e.key} className={'tone-' + e.tone}>
              <div>{e.tags.filter((t) => t !== 'Draft').map((t) => <span key={t} className={'inbox-tag tag-' + t.toLowerCase()}>{t}</span>)}<strong>{e.headline}</strong><span className="inbox-sub">{e.sub}</span>{e.comment && <p className={'inbox-comment tone-' + e.commentTone}><strong>{e.commentLabel}:</strong> {e.comment}</p>}</div>
              {dueCell(e.due, e.overdue)}
              <div className="inbox-go"><button type="button" className={e.tone === 'action' ? 'primary-button' : 'outline-button'} onClick={e.open}>{e.button}</button></div>
            </li>)}</ul>}
          </div>}
        </div>;
      })}
      {!pageRows.length && <p className="inbox-empty">{term ? 'Nothing matches this search.' : filter === 'action' ? (rows.some((r) => r.state !== 'info') ? 'Nothing needs your action right now. See Waiting for work that is with others.' : 'Nothing needs your action right now.') : filter === 'waiting' ? 'Nothing of yours is waiting on others.' : 'No jobs are assigned to you.'}</p>}
    </div>
    <div className="inbox-foot">{pager('bottom')}<span>Browser-local trial: records stay in this browser; the profile selector is not secure sign-in.</span></div>
  </div>;
}

/** Read-only laboratory progress for team leads (their section) and the supervisor or administrator (both). No actions. */
export function LabSummary({ rows, onOpen }: { rows: { stream: string; counts: [string, number][] }[]; onOpen: () => void }) {
  if (!rows.length) return null;
  return <section className="panel dashboard-section" aria-labelledby="lab-summary-title"><div className="section-head"><h2 id="lab-summary-title">Laboratory progress</h2><button type="button" className="outline-button" onClick={onOpen}>Open PVT Lab overview</button></div>
    <p className="filter-note">Read-only summary. Assignment and review actions appear in My work only for their configured holders.</p>
    <div className="lab-summary-grid">{rows.map((row) => <div key={row.stream}><strong>{row.stream}</strong><ul>{row.counts.map(([label, n]) => <li key={label}><span>{label}</span><b>{n}</b></li>)}</ul></div>)}</div>
  </section>;
}
