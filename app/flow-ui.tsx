'use client';
/** Shared status badges and workflow trackers. Every state is shown with an icon and a text label, never colour alone. */
import { useState, type ComponentType } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, CircleDot, Clock, RotateCcw } from 'lucide-react';
import { flowStateLabel, type FlowGroup, type FlowSection, type FlowState, type FlowStep, type JobFlow } from './job-flow';
import { ukDate } from "./uk-format";

const icons: Record<FlowState, ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>> = { completed: CircleCheck, 'in-progress': CircleDot, 'not-started': CircleDashed, blocked: CircleAlert };

export function StateIcon({ state, correction, size = 15 }: { state: FlowState; correction?: boolean; size?: number }) {
  const Icon = state === 'blocked' && correction ? RotateCcw : icons[state];
  return <Icon size={size} strokeWidth={2.2} aria-hidden />;
}

/** Status badge: green Completed, amber In progress, gray Not started, red Blocked / Correction needed. */
export function StatusBadge({ state, label, correction, size = 'md' }: { state: FlowState; label?: string; correction?: boolean; size?: 'sm' | 'md' }) {
  return <span className={`st-badge st-${state} st-${size}`}><StateIcon state={state} correction={correction} size={size === 'sm' ? 13 : 15} />{label || (state === 'blocked' && correction ? 'Correction needed' : flowStateLabel[state])}</span>;
}

/** Schedule warning, separate from workflow status. */
export function OverdueBadge({ due, today, size = 'md' }: { due: string; today: string; size?: 'sm' | 'md' }) {
  const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(due)) / 864e5));
  return <span className={`st-badge st-overdue st-${size}`}><Clock size={size === 'sm' ? 13 : 15} strokeWidth={2.2} aria-hidden />Overdue · {days} day{days === 1 ? '' : 's'}</span>;
}

const sectionStatus = (s: Pick<FlowSection, 'state' | 'done' | 'total' | 'pendingScope'>) => s.state === 'completed' ? 'Completed' : s.state === 'not-started' ? 'Not started' : s.state === 'blocked' ? 'Needs attention' : 'In progress';

/** Compact, read-only progress for tables and cards. Nothing here is clickable. */
export function MiniTracker({ flow, label }: { flow: Pick<JobFlow, 'sections'>; label?: string }) {
  return <ol className="mini-track" aria-label={label || 'Job progress'}>
    {flow.sections.map((s) => <li key={s.id} className={`mini-step st-${s.state}${s.current ? ' is-current' : ''}`}>
      <span className="mini-node"><StateIcon state={s.state} size={13} /></span>
      <span className="mini-label">{s.label}<span className="sr-only">: {sectionStatus(s)}{s.total ? `, ${s.done} of ${s.total} steps` : ''}{s.current ? ', current stage' : ''}</span></span>
    </li>)}
  </ol>;
}

function StepRow({ step, name }: { step: FlowStep; name?: (id?: string) => string }) {
  return <li className={`flow-step st-${step.state}`}>
    <span className="flow-step-icon"><StateIcon state={step.state} correction={step.correction} size={14} /></span>
    <span className="flow-step-main"><strong>{step.label}</strong>
      <small>{step.detail}{step.additional ? ' · Additional work' : ''}{step.external ? ' · Third-party laboratory' : ''}{name && step.owner && step.state !== 'completed' ? ' · ' + name(step.owner) : ''}{step.state === 'completed' && step.at ? ' · ' + shortDate(step.at) : ''}</small></span>
    <span className="flow-step-state">{step.state === 'blocked' ? (step.correction ? 'Correction needed' : 'Blocked') : flowStateLabel[step.state]}</span>
  </li>;
}

function GroupBlock({ group, name }: { group: FlowGroup; name?: (id?: string) => string }) {
  const done = group.steps.filter((s) => s.state === 'completed').length;
  return <div className={`flow-group st-${group.state}`}>
    <h4><span>{group.label}</span>{group.steps.length > 1 && <em>{done} of {group.steps.length}</em>}</h4>
    {group.note && <p className="flow-group-note">{group.note}</p>}
    {group.steps.length > 0 && <ol className="flow-steps">{group.steps.map((s) => <StepRow key={s.id} step={s} name={name} />)}</ol>}
  </div>;
}

export const shortDate = (v: string) => ukDate(v) || v;

/** Laboratory streams side by side: PVT and Chemistry work runs in parallel, not in sequence. */
function SectionDetail({ section, name }: { section: FlowSection; name?: (id?: string) => string }) {
  const shared = section.groups.filter((g) => !g.stream), streams = (['PVT', 'Chemical'] as const).filter((st) => section.groups.some((g) => g.stream === st));
  return <div className="flow-detail-body">
    {section.notes.map((n) => <p key={n} className="flow-note">{n}</p>)}
    {shared.map((g) => <GroupBlock key={g.id} group={g} name={name} />)}
    {streams.length > 0 && <div className={`flow-streams streams-${streams.length}`}>{streams.map((st) => <div key={st} className="flow-stream"><h3>{st === 'PVT' ? 'PVT laboratory' : 'Chemistry laboratory'}{streams.length > 1 && <small>Runs in parallel</small>}</h3>{section.groups.filter((g) => g.stream === st).map((g) => <GroupBlock key={g.id} group={g} name={name} />)}</div>)}</div>}
  </div>;
}

/**
 * The job workflow shown under the job header: main sections left to right (stacked on small screens), a short summary
 * under each, and the selected section's steps in a full-width panel below. Read-only: actions stay in the job sections and My work.
 */
export function JobFlowTracker({ flow, name, overdue, due }: { flow: JobFlow; name?: (id?: string) => string; overdue?: boolean; due?: string }) {
  const [selected, setSelected] = useState(flow.sections.find((s) => s.current)?.id || flow.sections.at(-1)?.id);
  const shown = flow.sections.find((s) => s.id === selected);
  return <section className="panel job-flow" aria-labelledby="job-flow-title">
    <header className="job-flow-head">
      <div><span className="eyebrow">JOB WORKFLOW</span><h2 id="job-flow-title">Overall progress</h2><p>{flow.summary}</p></div>
      <div className="job-flow-badges"><StatusBadge state={flow.state} label={flow.status} correction={flow.correction} />{overdue && due && <span className="st-badge st-overdue st-md"><Clock size={15} aria-hidden />Overdue · due {shortDate(due)}</span>}</div>
    </header>
    <ol className="flow-sections" style={{ ['--sections' as string]: flow.sections.length }}>
      {flow.sections.map((s, i) => <li key={s.id} className={`flow-section st-${s.state}${s.current ? ' is-current' : ''}${selected === s.id ? ' is-selected' : ''}`}>
        <button type="button" className="flow-section-head" aria-pressed={selected === s.id} aria-controls="flow-detail-panel" onClick={() => setSelected(s.id)}>
          <span className="flow-section-node"><StateIcon state={s.state} size={18} /></span>
          <span className="flow-section-text"><small>{i + 1} · {s.current ? 'Current stage' : sectionStatus(s)}</small><strong>{s.label}</strong><span>{s.summary}</span><em>{selected === s.id ? 'Steps shown below' : 'Show steps'}</em></span>
        </button>
      </li>)}
    </ol>
    {shown && <div id="flow-detail-panel" className="flow-detail-panel" aria-live="polite"><h3>{shown.label} · steps</h3><SectionDetail section={shown} name={name} /></div>}
    <div className="flow-now-grid">
      <div><small>Current stage</small><strong>{flow.current}</strong></div>
      <div><small>Happening now</small>{flow.now.length ? <ul>{flow.now.slice(0, 6).map((n) => <li key={n.text} className={`st-${n.state}`}><StateIcon state={n.state} size={13} /><span>{n.text}<em>{n.team}{name && n.owners.length ? ' · ' + n.owners.map((o) => name(o)).join(', ') : ''}</em></span></li>)}{flow.now.length > 6 && <li>+{flow.now.length - 6} more activities</li>}</ul> : <strong>{flow.closed ? 'All required work is complete' : flow.draft ? 'Draft · not sent to Sampling' : 'Nothing in progress'}</strong>}</div>
      <div><small>What happens next</small><strong>{flow.next}</strong>{flow.nextTeam && !flow.closed && <em>{flow.nextTeam}</em>}</div>
    </div>
  </section>;
}
