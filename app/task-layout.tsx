'use client';
import type { ReactNode } from 'react';
import { CalendarClock, Gauge, Thermometer } from 'lucide-react';
import type { JobRecord } from './page';
import { operationsFor } from './operations-model';
import { localDate } from './local-date';

/**
 * One header for every task screen (laboratory, Sampling, review, reporting): job ID, task, sample, status,
 * due date and the next action, with the main action button beside it. Supporting detail goes below it.
 */
export function TaskHeader({ eyebrow, title, jobNumber, sample, status, statusTone, due, dueLabel = 'Due', next, action }: {
  eyebrow: string; title: string; jobNumber: string; sample?: string; status: string; statusTone?: string; due?: string; dueLabel?: string;
  /** What happens next, in one line. */next: string; /** The main action (button or link). */action?: ReactNode;
}) {
  const overdue = !!due && due < localDate();
  return <header className="task-header">
    <div className="task-header-main">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <dl className="task-meta">
        <div><dt>Job</dt><dd>{jobNumber}</dd></div>
        {sample && <div><dt>Sample</dt><dd>{sample}</dd></div>}
        <div><dt>Status</dt><dd><span className={'status-pill ' + (statusTone || '')}>{status}</span></dd></div>
        <div><dt>{dueLabel}</dt><dd className={overdue ? 'is-overdue' : ''}><CalendarClock size={13} aria-hidden="true" /> {due || 'Not scheduled'}{overdue ? ' · overdue' : ''}</dd></div>
      </dl>
    </div>
    <div className="task-next"><small>NEXT ACTION</small><strong>{next}</strong>{action}</div>
  </header>;
}

const shown = (value: string, unit: string) => value.trim() ? `${value.trim()} ${unit}` : 'Not provided';
/** Compact job-level details from the top of Scope of Work: reservoir conditions with units, scope notes and the job basics. */
export function JobDetails({ job, compact = false }: { job: JobRecord; compact?: boolean }) {
  const c = operationsFor(job).conditions;
  const well = job.wellMode === 'multiple' ? (job.wells || []).filter(Boolean).join(', ') : job.well;
  const sampling = job.samplingSource === 'Other' && job.otherSamplingType ? 'Other — ' + job.otherSamplingType : job.samplingSource;
  return <section className={'job-details-card' + (compact ? ' is-compact' : '')} aria-label="Job details">
    <h3>Job details</h3>
    <dl>
      <div className="is-key"><dt><Gauge size={13} aria-hidden="true" /> Reservoir pressure</dt><dd className={c.pressure.trim() ? '' : 'not-provided'}>{shown(c.pressure, c.pressureUnit)}</dd></div>
      <div className="is-key"><dt><Thermometer size={13} aria-hidden="true" /> Reservoir temperature</dt><dd className={c.temperature.trim() ? '' : 'not-provided'}>{shown(c.temperature, c.temperatureUnit)}</dd></div>
      <div><dt>Client</dt><dd>{job.clientName || 'Not provided'}</dd></div>
      <div><dt>Field · well</dt><dd>{[job.fieldArea, well].filter(Boolean).join(' · ') || 'Not provided'}</dd></div>
      <div><dt>Sampling type</dt><dd>{sampling || 'Not provided'}</dd></div>
      <div><dt>Job due</dt><dd>{job.dueDate || 'Not provided'}</dd></div>
      <div className="wide"><dt>Scope notes</dt><dd className={c.notes.trim() ? 'instructions-text' : 'not-provided'}>{c.notes.trim() || 'Not provided'}</dd></div>
    </dl>
  </section>;
}
