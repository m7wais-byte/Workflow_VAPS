'use client';
import { useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import type { JobRecord } from './page';
import { useUnsaved } from './settings-pages';
import { localDate } from './local-date';
import { containerLabel } from './sample-container';
import { storeWorkbook } from './workbook-storage';
import { PersonOptions, OverlapNotice } from './person-picker';
import { operationsFor, holder, hasAccess, validationCatalogue, selectableValidationSteps, validationScopes, separateRecombination, externalStage, labStatus, streamLead, type Actor, type Command, type ActivityRecord, type ScopeRecord, type ExecutionChoice } from './operations-model';
import { DateInput, ukDate } from "./uk-date";
import { teamName } from './team-name';

type Run = (c: Command | Command[]) => boolean;
const touched = (a: ActivityRecord) => a.status !== 'Unassigned' || !!a.owner || a.files.length > 0 || (a.history || []).length > 0;

type Row = { owner: string; due: string; note: string };
const underReview = (a?: ActivityRecord) => !!a && ['Workbook Submitted', 'Awaiting QC', 'QC Returned'].includes(a.status);
const order = (t: string) => validationCatalogue.indexOf(t as typeof validationCatalogue[number]);

/**
 * Validation assignment for the PVT Team Lead: one table per sample with Validation requested. Each row is one step
 * with its engineer, due date and note. The lead can remove steps that are not needed (while untouched) and add
 * catalogue steps that were not selected in the scope. Order is guidance only; no step blocks another.
 */
export function ValidationPlanning({ job, actor, run }: { job: JobRecord; actor: Actor; run: Run; focus?: string }) {
  const records = validationScopes(job); const o = operationsFor(job);
  const lead = holder(actor, 'pvtTeamLead'); const isLead = !!lead && actor.id === lead && hasAccess(actor, 'analysis');
  const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'Not assigned';
  if (!records.length) return null;
  const open = records.filter((r) => r.validationRequest && !r.plannedAt).length;
  return <section className="panel ops-panel validation-planning" id="validation-planning"><div className="section-head"><h2>Validation — assign steps</h2>{open > 0 && <span className="status-pill flow-waiting">{open} awaiting planning</span>}</div>
    <p>{isLead ? 'Assign each Validation step to an engineer with a due date and a note. Remove a step that is not needed, or add one that was not selected in the scope.' : `Assigned by ${lead ? name(lead) + ' (PVT Team Lead)' : 'the PVT Team Lead (not configured)'}.`} The usual order is shown for guidance only; no step blocks another.</p>
    <ul className="plan-list">{records.map((r) => { const steps = o.activities.filter((a) => a.scopeId === r.id && a.kind === 'validation').sort((x, y) => order(x.title) - order(y.title));
      return <li key={r.id} className={r.validationRequest && !r.plannedAt ? 'needs-plan' : ''}><SamplePlan key={steps.map((a) => [a.title, a.owner, a.due, a.notes, a.status, a.external?.provider].join('|')).join(';')} actor={actor} job={job} record={r} steps={steps} run={run} isLead={isLead} /></li>; })}</ul>
  </section>;
}

function SamplePlan({ actor, job, record, steps, run, isLead }: { actor: Actor; job: JobRecord; record: ScopeRecord; steps: ActivityRecord[]; run: Run; isLead: boolean }) {
  const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'Not assigned';
  const sid = record.sampleIds[0]; const smp = job.samples?.find((s) => s.id === sid); const separate = separateRecombination(job, sid);
  const existing = (t: string) => steps.find((a) => a.title === t);
  const saved = (t: string): Row => { const a = existing(t); return { owner: a?.owner || '', due: a?.due || '', note: a?.notes || '' }; };
  const savedExec = Object.fromEntries(steps.map((a) => [a.title, a.external ? { by: 'Third-party', provider: a.external.provider, notes: a.external.notes, expectedReturn: a.external.expectedReturn } as ExecutionChoice : undefined]));
  const [chosen, setChosen] = useState<string[]>(steps.map((a) => a.title)), [rows, setRows] = useState<Record<string, Row>>({}), [exec, setExec] = useState<Record<string, ExecutionChoice | undefined>>(savedExec);
  const [restoration, setRestoration] = useState(() => operationsFor(job).conditions), [confirm, setConfirm] = useState(false);
  const row = (t: string) => rows[t] || saved(t);
  const change = (t: string, c: Partial<Row>) => setRows((list) => ({ ...list, [t]: { ...row(t), ...c } }));
  const today = localDate();
  const list = [...chosen].sort((x, y) => order(x) - order(y));
  const addable = selectableValidationSteps.filter((t) => !chosen.includes(t));
  const removed = steps.filter((a) => !chosen.includes(a.title)).map((a) => a.title), added = list.filter((t) => !existing(t));
  const execChanged = list.some((t) => !!existing(t) && JSON.stringify(exec[t] || null) !== JSON.stringify(savedExec[t] || null));
  const assignChanged = (t: string) => { const x = row(t), s = saved(t); return !!x.owner && (!existing(t) || x.owner !== s.owner || x.due !== s.due || x.note !== s.note); };
  const toAssign = list.filter(assignChanged);
  const needs = !!record.validationRequest && !record.plannedAt;
  const planChanged = removed.length > 0 || added.length > 0 || execChanged || (needs && list.length > 0);
  const dirty = planChanged || toAssign.length > 0;
  useUnsaved(isLead && dirty);
  const recombinationClash = chosen.includes('Recombination') && !existing('Recombination') && separate.length > 0;
  const reset = () => { setChosen(steps.map((a) => a.title)); setRows({}); setExec(savedExec); setRestoration(operationsFor(job).conditions); setConfirm(false); };
  const conditionsFor = (t: string) => existing(t)?.conditions ?? (t === 'Restoration' ? `${restoration.pressure.trim()} ${restoration.pressureUnit}; ${restoration.temperature.trim()} ${restoration.temperatureUnit}` : t === 'Water Check' ? 'Check for water on the sample side.' : operationsFor(job).conditions.notes || '');
  const save = () => { const commands: Command[] = [];
    if (planChanged) commands.push({ type: 'validation-plan', scopeId: record.id, steps: list.map((title) => ({ title, external: exec[title] })), restoration, confirmRecombination: confirm });
    for (const t of toAssign) { const x = row(t), a = existing(t); const start = a?.start && a.start <= x.due ? a.start : x.due < today ? x.due : today;
      commands.push({ type: 'schedule', id: a?.id || record.id + ':validation:' + t, owner: x.owner, start, due: x.due, conditions: conditionsFor(t), notes: x.note.trim() }); }
    run(commands); };
  const assigned = list.filter((t) => !!existing(t)?.owner).length;
  const head = <div className="plan-row"><span><span><strong>Sample {sid}</strong> · {smp ? containerLabel(smp) : 'container not recorded'}</span><small>Requested by {name(record.addedBy)} · {ukDate(record.at)}{record.source === 'Additional work' ? ' · additional work' : ''}{record.plannedAt ? ` · steps selected by ${name(record.plannedBy)} ${ukDate(record.plannedAt)}` : ''}</small></span>
    <span className="plan-status">{!steps.length ? <strong className="flag-note">Steps not chosen yet</strong> : <><b>{assigned}</b> of {steps.length} step{steps.length === 1 ? '' : 's'} assigned{steps.length - assigned > 0 && <em className="flag-note"> · {steps.length - assigned} to assign</em>}</>}</span></div>;

  if (!isLead) return <>{head}{steps.length > 0 && <div className="assign-table" role="table" aria-label={'Validation steps for Sample ' + sid}>
    <div className="assign-head" role="row"><span>#</span><span>Step</span><span>Engineer</span><span>Due date</span><span>Note</span><span>Status</span></div>
    {steps.map((a, i) => <div className="assign-row is-read" role="row" key={a.id}><span className="step-no">{i + 1}</span><span className="assign-step"><strong>{a.title}</strong>{a.external && <small>External · {a.external.provider}</small>}</span><span data-label="Engineer">{a.owner ? name(a.owner) : <em className="flag-note">Unassigned</em>}</span><span data-label="Due date">{a.due ? ukDate(a.due) : '—'}</span><span data-label="Note">{a.notes || '—'}</span><span data-label="Status">{a.external ? externalStage(a) : labStatus(a)}</span></div>)}
  </div>}</>;

  return <form className="plan-form" onSubmit={(e) => { e.preventDefault(); save(); }}>{head}
    {list.length > 0 ? <div className="assign-table" role="table" aria-label={'Assign Validation steps for Sample ' + sid}>
      <div className="assign-head" role="row"><span>#</span><span>Step</span><span>Engineer</span><span>Due date</span><span>Note for the engineer</span><span /></div>
      {list.map((t, i) => { const a = existing(t), x = row(t), ext = exec[t]; const locked = !!a && touched(a); const done = a?.status === 'Completed'; const untouched = !a || (a.status === 'Unassigned' && !a.files.length);
        return <div className={'assign-row' + (!a ? ' is-new' : '') + (x.owner ? '' : ' is-open')} role="row" key={t}>
          <span className="step-no">{i + 1}</span>
          <span className="assign-step"><strong>{t}</strong>
            <small>{!a ? 'New · added by you' : a.external ? externalStage(a) : labStatus(a)}{ext?.by === 'Third-party' && !a?.external ? ' · third-party' : ''}</small>
            {untouched && <button type="button" className="link-button" onClick={() => setExec({ ...exec, [t]: ext?.by === 'Third-party' ? undefined : { by: 'Third-party', provider: '', notes: '', expectedReturn: '' } })}>{ext?.by === 'Third-party' ? 'Perform internally' : 'Send to third-party lab'}</button>}</span>
          {done ? <><span data-label="Engineer">{name(a!.owner)}</span><span data-label="Due date">{a!.due ? ukDate(a!.due) : '—'}</span><span data-label="Note">{a!.notes || '—'}</span></> : <>
            <select aria-label={(ext?.by === 'Third-party' ? 'Internal coordinator for ' : 'Engineer for ') + t} value={x.owner} disabled={underReview(a)} title={underReview(a) ? 'Under review — finish the review before reassigning' : undefined} onChange={(e) => change(t, { owner: e.target.value })}>{!a?.owner && <option value="">{ext?.by === 'Third-party' ? 'Select coordinator' : 'Select engineer'}</option>}<PersonOptions employees={actor.employees} departments={actor.departments} me={actor.id} current={a?.owner} first={[...(actor.teams?.PVT || []), holder(actor, 'pvtTeamLead')]} firstLabel="PVT team" /></select>
            <DateInput aria-label={'Due date for ' + t} required={!!x.owner} disabled={!x.owner} value={x.due} onChange={(e) => change(t, { due: e.target.value })} />
            <input aria-label={'Note for ' + t} placeholder={x.owner ? 'Instructions (optional)' : 'Select an engineer first'} disabled={!x.owner} value={x.note} onChange={(e) => change(t, { note: e.target.value })} /></>}
          <span className="assign-remove">{locked ? <span className="assign-lock" title={'Already ' + (a!.owner ? 'assigned' : 'started') + ' — kept in the plan'}><Lock size={14} aria-hidden="true" /><span className="sr-only">Kept: already {a!.owner ? 'assigned' : 'started'}</span></span> : <button type="button" className="icon-remove" aria-label={'Remove ' + t} title="Remove this step — not needed" onClick={() => setChosen(chosen.filter((s) => s !== t))}><Trash2 size={15} aria-hidden="true" /></button>}</span>
          {(ext?.by === 'Third-party' && untouched || !a && t === 'Restoration' || t === 'Recombination' && separate.length > 0 || assignChanged(t)) && <div className="assign-extra">
            {ext?.by === 'Third-party' && untouched && <div className="plan-exec"><input aria-label={'Provider for ' + t} required placeholder="Provider / laboratory *" value={ext.provider || ''} onChange={(e) => setExec({ ...exec, [t]: { ...ext, provider: e.target.value } })} /><label className="inline-date">Expected return<DateInput aria-label={'Expected return for ' + t} value={ext.expectedReturn || ''} onChange={(e) => setExec({ ...exec, [t]: { ...ext, expectedReturn: e.target.value } })} /></label></div>}
            {!a && t === 'Restoration' && <div className="plan-exec">{(['pressure', 'temperature'] as const).map((key) => { const unit = key === 'pressure' ? 'pressureUnit' : 'temperatureUnit';
              return <label key={key} className="inline-date">Reservoir {key} *<input required inputMode="decimal" aria-label={'Reservoir ' + key + ' for Restoration'} value={restoration[key]} onChange={(e) => setRestoration({ ...restoration, [key]: e.target.value })} /><select aria-label={key + ' unit'} value={restoration[unit]} onChange={(e) => setRestoration({ ...restoration, [unit]: e.target.value })}>{(key === 'pressure' ? ['psi', 'bar', 'kPa', 'MPa'] : ['°C', '°F', 'K']).map((u) => <option key={u}>{u}</option>)}</select></label>; })}</div>}
            {t === 'Recombination' && separate.length > 0 && <small className="flag-note">Recombination is already requested as a separate test on this sample ({separate.map((s) => s.stream + ' · ' + labStatus(s)).join(', ')}).</small>}
            {assignChanged(t) && x.due && <OverlapNotice jobs={actor.jobs} employees={actor.employees} employeeId={x.owner} start={a?.start && a.start <= x.due ? a.start : today} end={x.due} exclude={a ? ['activity:' + a.id] : []} />}
          </div>}
        </div>; })}
    </div> : <p className="assign-empty">No steps in the plan. Add the steps this sample needs below.</p>}
    {addable.length > 0 && <div className="assign-add"><span>Add a step:</span>{addable.map((t) => <button type="button" key={t} className="add-chip" onClick={() => setChosen([...chosen, t])}><Plus size={13} aria-hidden="true" />{t}</button>)}</div>}
    {recombinationClash && <label className="ops-check confirm-dup"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Also add Recombination as a Validation step (deliberately separate from the requested Recombination test)</label>}
    <footer className="ops-actions assign-footer"><small>{dirty ? [toAssign.length && `${toAssign.length} assignment${toAssign.length === 1 ? '' : 's'}`, added.length && 'add ' + added.join(', '), removed.length && 'remove ' + removed.join(', '), execChanged && 'execution changed'].filter(Boolean).join(' · ') || 'Confirm the selected steps' : 'No unsaved changes'}</small>
      {dirty && <button type="button" className="text-button" onClick={reset}>Discard</button>}<button className="primary-button" disabled={!dirty || !list.length || (recombinationClash && !confirm)}>Save changes</button></footer>
    {!list.length && steps.length > 0 && <small className="flag-note">Keep at least one step. If Validation is not needed at all, ask the scope owner to remove it from the scope.</small>}
  </form>;
}

/** Third-party execution: who coordinates, dispatch, returned results and submission into the normal internal review. */
export function ExternalWorkPanel({ job, activity: a, actor, run }: { job: JobRecord; activity: ActivityRecord; actor: Actor; run: Run }) {
  const ext = a.external!; const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'Not assigned';
  const lead = holder(actor, streamLead(a.stream)); const isOwner = actor.id === a.owner && hasAccess(actor, 'jobDetails'); const isLead = !!lead && actor.id === lead && hasAccess(actor, 'analysis');
  const [sentOn, setSentOn] = useState(localDate()), [expected, setExpected] = useState(ext.expectedReturn || ''), [notes, setNotes] = useState(''), [receivedOn, setReceivedOn] = useState(localDate()), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const canRecord = (isOwner || isLead) && !!a.owner;
  const late = !!ext.expectedReturn && !ext.receivedAt && ext.expectedReturn < localDate();
  return <div className="external-panel"><h4>External · {ext.provider}</h4>
    <dl className="ops-facts lab-facts"><div><dt>Performed by</dt><dd>Third-party laboratory · {ext.provider}</dd></div><div><dt>Internal coordinator</dt><dd>{a.owner ? name(a.owner) : `Not assigned · ${name(lead)} assigns`}</dd></div><div><dt>External stage</dt><dd>{externalStage(a)}</dd></div><div><dt>Expected return</dt><dd>{ext.expectedReturn || 'Not set'}{late ? ' · overdue' : ''}</dd></div><div><dt>Date sent</dt><dd>{ext.sentOn ? `${ext.sentOn} · recorded by ${name(ext.sentBy)}` : 'Not dispatched'}</dd></div><div><dt>Results received</dt><dd>{ext.receivedOn ? `${ext.receivedOn} · recorded by ${name(ext.receivedBy)}` : 'Not received'}</dd></div>{ext.notes && <div><dt>Instructions</dt><dd>{ext.notes}</dd></div>}{ext.dispatchNotes && <div><dt>Dispatch notes</dt><dd>{ext.dispatchNotes}</dd></div>}</dl>
    {!a.owner && a.status !== 'Completed' && <p className="qc-gate" role="status"><strong>No internal coordinator.</strong> Dispatch is blocked until {lead ? name(lead) + ` (${teamName(a.stream)} Team Lead)` : `the ${teamName(a.stream)} Team Lead (not configured)`} assigns an accountable coordinator below. The test stays tracked meanwhile.</p>}
    <p className="filter-note">Tracking only: VAPS does not email the provider, send files or give them access.</p>
    {canRecord && !ext.sentAt && ['Scheduled', 'In Progress'].includes(a.status) && <form className="external-step" onSubmit={(e) => { e.preventDefault(); run({ type: 'external-dispatch', id: a.id, sentOn, expectedReturn: expected, notes }); }}><div className="settings-form-grid"><label>Date sent *<DateInput required value={sentOn} onChange={(e) => setSentOn(e.target.value)} /></label><label>Expected return<DateInput value={expected} min={sentOn} onChange={(e) => setExpected(e.target.value)} /></label><label>Dispatch notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Courier, reference, quantity sent" /></label></div><button className="primary-button">Record dispatch to {ext.provider}</button></form>}
    {canRecord && !!ext.sentAt && ['In Progress', 'Changes Requested'].includes(a.status) && !(a.status === 'In Progress' && ext.receivedAt) && <div className="external-step"><div className="settings-form-grid"><label>Date results received *<DateInput value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} /></label><label>Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label><label>{a.status === 'Changes Requested' ? 'Attach corrected/clarified results' : 'Attach returned report / results'} *<input type="file" disabled={busy} accept=".xls,.xlsx,.xlsm,.csv,.pdf,.doc,.docx,.ods" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { const saved = await storeWorkbook(file); if (run({ type: 'external-results', id: a.id, receivedOn, notes, file: saved })) setError(''); } catch (err) { setError((err as Error).message); } finally { setBusy(false); e.target.value = ''; } }} /></label></div><small className="required-legend">{busy ? 'Storing file…' : 'Recording results does not approve or complete the test.'}</small></div>}
    {isOwner && a.status === 'In Progress' && !!ext.receivedAt && <div className="external-step"><p>Results received {ext.receivedOn}. Submit them for internal review by {lead ? name(lead) + ` (${teamName(a.stream)} Team Lead)` : `the ${teamName(a.stream)} Team Lead (not configured)`}; QC and the final report follow as usual.</p><button type="button" className="primary-button" onClick={() => run({ type: 'external-submit', id: a.id, notes })}>Submit results for internal review</button></div>}
    {!canRecord && !['Completed'].includes(a.status) && <p className="filter-note">Dispatch and results are recorded by {a.owner ? name(a.owner) + ' (internal coordinator)' : 'the internal coordinator once assigned'}.</p>}
    {error && <p role="alert">{error}</p>}
    <small className="filter-note">{job.jobNumber} · Sample {a.sampleId}</small>
  </div>;
}
