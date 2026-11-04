'use client';
import { useState } from 'react';
import { Lock } from 'lucide-react';
import type { JobRecord } from './page';
import { useUnsaved } from './settings-pages';
import { localDate } from './local-date';
import { containerLabel } from './sample-container';
import { storeWorkbook } from './workbook-storage';
import { PersonOptions, OverlapNotice } from './person-picker';
import { operationsFor, holder, hasAccess, validationCatalogue, validationScopes, separateRecombination, externalStage, labStatus, streamLead, type Actor, type Command, type ActivityRecord, type ScopeRecord, type ExecutionChoice } from './operations-model';

type Run = (c: Command | Command[]) => boolean;
const touched = (a: ActivityRecord) => a.status !== 'Unassigned' || !!a.owner || a.files.length > 0 || (a.history || []).length > 0;

/**
 * Validation planning for the PVT Team Lead: one item per sample with Validation requested. The lead chooses the
 * applicable steps (none is mandatory); assignment, dates and instructions then use the normal assignment controls.
 */
export function ValidationPlanning({ job, actor, run, focus }: { job: JobRecord; actor: Actor; run: Run; focus?: string }) {
  const records = validationScopes(job); const o = operationsFor(job);
  const lead = holder(actor, 'pvtTeamLead'); const isLead = !!lead && actor.id === lead && hasAccess(actor, 'analysis');
  const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'Not assigned';
  const [editing, setEditing] = useState<string>(isLead ? (focus && records.some(r=>r.id===focus) ? focus : records.find(r=>r.validationRequest&&!r.plannedAt)?.id || '') : '');
  if (!records.length) return null;
  const open = records.filter((r) => r.validationRequest && !r.plannedAt).length;
  return <section className="panel ops-panel validation-planning" id="validation-planning"><div className="section-head"><h2>Validation planning</h2>{open > 0 && <span className="status-pill flow-waiting">{open} awaiting planning</span>}</div>
    <p>{isLead ? 'Choose the applicable steps for each sample, then assign them below to one or more engineers.' : `Planned by ${lead ? name(lead) + ' (PVT Team Lead)' : 'the PVT Team Lead (not configured)'}.`} The usual order is shown for guidance only; no step blocks another.</p>
    <ul className="plan-list">{records.map((r) => { const steps = o.activities.filter((a) => a.scopeId === r.id && a.kind === 'validation'); const sid = r.sampleIds[0]; const smp = job.samples?.find((s) => s.id === sid); const needs = r.validationRequest && !r.plannedAt;
      return <li key={r.id} className={needs ? 'needs-plan' : ''}><div className="plan-row"><span><span><strong>Sample {sid}</strong> · {smp ? containerLabel(smp) : 'container not recorded'}</span><small>Requested by {name(r.addedBy)} · {new Date(r.at).toLocaleDateString()}{r.source === 'Additional work' ? ' · additional work' : ''}{r.plannedAt ? ` · planned by ${name(r.plannedBy)} ${new Date(r.plannedAt).toLocaleDateString()}` : ''}</small></span>
        <span className="plan-status">{needs ? <strong className="flag-note">Steps not chosen yet</strong> : <>{steps.length} step{steps.length === 1 ? '' : 's'} · {steps.filter((a) => !a.owner).length} unassigned{steps.some((a) => a.external) ? ` · ${steps.filter((a) => a.external).length} external` : ''}</>}</span>
        {isLead && editing !== r.id && <button type="button" className={needs ? 'primary-button' : 'outline-button'} onClick={() => setEditing(r.id)}>{needs ? 'Plan steps' : 'Edit plan'}</button>}</div>
        {!needs && steps.length > 0 && editing !== r.id && <ul className="plan-steps">{[...steps].sort((x, y) => validationCatalogue.indexOf(x.title as typeof validationCatalogue[number]) - validationCatalogue.indexOf(y.title as typeof validationCatalogue[number])).map((a) => <li key={a.id}><span className="step-no">{validationCatalogue.indexOf(a.title as typeof validationCatalogue[number]) + 1}</span>{a.title}<small>{a.owner ? name(a.owner) : <em className="flag-note">Unassigned</em>}{a.external ? ' · External · ' + a.external.provider : ''} · {a.external ? externalStage(a) : labStatus(a)}</small></li>)}</ul>}
        {editing === r.id && <PlanForm actor={actor} job={job} record={r} steps={steps} run={run} onDone={() => setEditing('')} />}
      </li>; })}</ul>
  </section>;
}

function PlanForm({ actor, job, record, steps, run, onDone }: { actor: Actor; job: JobRecord; record: ScopeRecord; steps: ActivityRecord[]; run: Run; onDone: () => void }) {
  const [restoration,setRestoration]=useState(()=>operationsFor(job).conditions);
  const [assignments,setAssignments]=useState<Record<string,{owner:string;start:string;due:string}>>({});
  const assignment=(title:string)=>assignments[title]||{owner:'',start:localDate(),due:''};
  const changeAssignment=(title:string,change:Partial<{owner:string;start:string;due:string}>)=>setAssignments(list=>({...list,[title]:{...assignment(title),...change}}));
  const sid = record.sampleIds[0]; const separate = separateRecombination(job, sid);
  const initial = Object.fromEntries(steps.map((a) => [a.title, a.external ? { by: 'Third-party', provider: a.external.provider, notes: a.external.notes, expectedReturn: a.external.expectedReturn } as ExecutionChoice : undefined]));
  const [chosen, setChosen] = useState<string[]>(steps.map((a) => a.title)), [exec, setExec] = useState<Record<string, ExecutionChoice | undefined>>(initial), [instructions, setInstructions] = useState(''), [confirm, setConfirm] = useState(false);
  useUnsaved(JSON.stringify(chosen) !== JSON.stringify(steps.map((a) => a.title)) || !!instructions || JSON.stringify(restoration)!==JSON.stringify(operationsFor(job).conditions) || Object.values(assignments).some(a=>!!a.owner||!!a.due));
  const existing = (t: string) => steps.find((a) => a.title === t);
  const recombinationClash = chosen.includes('Recombination') && !existing('Recombination') && separate.length > 0;
  return <form className="plan-form" onSubmit={(e) => { e.preventDefault(); const commands:Command[]=[{ type: 'validation-plan', scopeId: record.id, steps: chosen.map((title) => ({ title, external: exec[title] })), restoration, instructions: instructions || undefined, confirmRecombination: confirm }]; for(const title of chosen){const x=assignments[title];if(x?.owner&&!existing(title))commands.push({type:'schedule',id:record.id+':validation:'+title,owner:x.owner,start:x.start,due:x.due,conditions:title==='Restoration'?`${restoration.pressure.trim()} ${restoration.pressureUnit}; ${restoration.temperature.trim()} ${restoration.temperatureUnit}`:operationsFor(job).conditions.notes,notes:instructions});} if(run(commands))onDone(); }}>
    <div className="lab-inline-actions"><button type="button" className="text-button" onClick={() => setChosen([...validationCatalogue])}>Select all</button><button type="button" className="text-button" onClick={() => setChosen(steps.filter(touched).map((a) => a.title))}>Clear</button><small>Select only the steps this sample needs.</small></div>
    <ol className="plan-step-grid">{validationCatalogue.map((step, i) => { const a = existing(step); const locked = !!a && touched(a); const on = chosen.includes(step); const x = exec[step];
      return <li key={step} className={on ? 'is-on' : ''}><label className="ops-check"><input type="checkbox" checked={on} disabled={locked} onChange={(e) => setChosen(e.target.checked ? [...chosen, step] : chosen.filter((s) => s !== step))} /><span className="step-no">{i + 1}</span>{step}{locked && <small><Lock size={11} /> {a!.owner ? 'assigned' : 'started'} · kept</small>}</label>
        {on && !locked && <div className="plan-exec"><select aria-label={'Performed by for ' + step} value={x?.by === 'Third-party' ? 'Third-party' : 'Internal'} onChange={(e) => setExec({ ...exec, [step]: e.target.value === 'Internal' ? undefined : { by: 'Third-party', provider: x?.provider || '', notes: x?.notes || '', expectedReturn: x?.expectedReturn || '' } })}><option value="Internal">Internal</option><option value="Third-party">Third-party laboratory</option></select>
          {x?.by === 'Third-party' && <><input aria-label={'Provider for ' + step} placeholder="Provider / laboratory *" value={x.provider || ''} onChange={(e) => setExec({ ...exec, [step]: { ...x, provider: e.target.value } })} /><input aria-label={'Expected return for ' + step} type="date" value={x.expectedReturn || ''} onChange={(e) => setExec({ ...exec, [step]: { ...x, expectedReturn: e.target.value } })} /></>}</div>}
        {on && !a && step === 'Restoration' && <div className="settings-form-grid">
          {(['pressure', 'temperature'] as const).map(key => {
            const unit = key === 'pressure' ? 'pressureUnit' : 'temperatureUnit';
            return <label key={key}>Reservoir {key} for Restoration
              <input required inputMode="decimal" value={restoration[key]} onChange={e => setRestoration({ ...restoration, [key]: e.target.value })} />
              <select aria-label={key + ' unit'} value={restoration[unit]} onChange={e => setRestoration({ ...restoration, [unit]: e.target.value })}>
                {(key === 'pressure' ? ['psi', 'bar', 'kPa', 'MPa'] : ['°C', '°F', 'K']).map(u => <option key={u}>{u}</option>)}
              </select>
            </label>;
          })}
        </div>}
        {on && !a && <div className="settings-form-grid"><label>Engineer for {step}<select aria-label={'Engineer for '+step} value={assignment(step).owner} onChange={e=>changeAssignment(step,{owner:e.target.value})}><option value="">Assign later</option><PersonOptions employees={actor.employees} departments={actor.departments} me={actor.id} first={[...(actor.teams?.PVT||[]),holder(actor,'pvtTeamLead')]} firstLabel="PVT team"/></select></label>{assignment(step).owner&&<><label>Planned start<input required type="date" value={assignment(step).start} onChange={e=>changeAssignment(step,{start:e.target.value})}/></label><label>Due date<input required type="date" min={assignment(step).start} value={assignment(step).due} onChange={e=>changeAssignment(step,{due:e.target.value})}/></label></>}</div>}
        {on && !a && assignment(step).owner && <OverlapNotice jobs={actor.jobs} employees={actor.employees} employeeId={assignment(step).owner} start={assignment(step).start} end={assignment(step).due} />}
        {step === 'Recombination' && separate.length > 0 && <small className="flag-note">Recombination is already requested as a separate test on this sample ({separate.map((s) => s.stream + ' · ' + labStatus(s)).join(', ')}).</small>}
      </li>; })}</ol>
    {recombinationClash && <label className="ops-check confirm-dup"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Also add Recombination as a Validation step (deliberately separate from the requested Recombination test)</label>}
    <label>Instructions for the new steps (optional)<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Shown to the engineer with each new step" /></label>
    <footer className="ops-actions"><button type="button" className="text-button" onClick={onDone}>Cancel</button><button className="primary-button" disabled={!chosen.length || (recombinationClash && !confirm)}>Save {chosen.length} step{chosen.length === 1 ? '' : 's'}</button></footer>
    <small className="required-legend">Saved steps appear under “Awaiting your assignment”: choose different engineers, dates and instructions per step. Reopening the plan reuses existing steps; nothing is duplicated.</small>
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
    {!a.owner && a.status !== 'Completed' && <p className="qc-gate" role="status"><strong>No internal coordinator.</strong> Dispatch is blocked until {lead ? name(lead) + ` (${a.stream} Team Lead)` : `the ${a.stream} Team Lead (not configured)`} assigns an accountable coordinator below. The test stays tracked meanwhile.</p>}
    <p className="filter-note">Tracking only: VAPS does not email the provider, send files or give them access.</p>
    {canRecord && !ext.sentAt && ['Scheduled', 'In Progress'].includes(a.status) && <form className="external-step" onSubmit={(e) => { e.preventDefault(); run({ type: 'external-dispatch', id: a.id, sentOn, expectedReturn: expected, notes }); }}><div className="settings-form-grid"><label>Date sent *<input type="date" required value={sentOn} onChange={(e) => setSentOn(e.target.value)} /></label><label>Expected return<input type="date" value={expected} min={sentOn} onChange={(e) => setExpected(e.target.value)} /></label><label>Dispatch notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Courier, reference, quantity sent" /></label></div><button className="primary-button">Record dispatch to {ext.provider}</button></form>}
    {canRecord && !!ext.sentAt && ['In Progress', 'Changes Requested'].includes(a.status) && !(a.status === 'In Progress' && ext.receivedAt) && <div className="external-step"><div className="settings-form-grid"><label>Date results received *<input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} /></label><label>Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label><label>{a.status === 'Changes Requested' ? 'Attach corrected/clarified results' : 'Attach returned report / results'} *<input type="file" disabled={busy} accept=".xls,.xlsx,.xlsm,.csv,.pdf,.doc,.docx,.ods" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { const saved = await storeWorkbook(file); if (run({ type: 'external-results', id: a.id, receivedOn, notes, file: saved })) setError(''); } catch (err) { setError((err as Error).message); } finally { setBusy(false); e.target.value = ''; } }} /></label></div><small className="required-legend">{busy ? 'Storing file…' : 'Recording results does not approve or complete the test.'}</small></div>}
    {isOwner && a.status === 'In Progress' && !!ext.receivedAt && <div className="external-step"><p>Results received {ext.receivedOn}. Submit them for internal review by {lead ? name(lead) + ` (${a.stream} Team Lead)` : `the ${a.stream} Team Lead (not configured)`}; QC and the final report follow as usual.</p><button type="button" className="primary-button" onClick={() => run({ type: 'external-submit', id: a.id, notes })}>Submit results for internal review</button></div>}
    {!canRecord && !['Completed'].includes(a.status) && <p className="filter-note">Dispatch and results are recorded by {a.owner ? name(a.owner) + ' (internal coordinator)' : 'the internal coordinator once assigned'}.</p>}
    {error && <p role="alert">{error}</p>}
    <small className="filter-note">{job.jobNumber} · Sample {a.sampleId}</small>
  </div>;
}
