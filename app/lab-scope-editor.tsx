'use client';
import { useRef, useState } from 'react';
import { AlertCircle, ChevronDown, Download, Lock, Plus, Trash2 } from 'lucide-react';
import type { JobRecord } from './page';
import type { Employee } from './employee-directory';
import { useUnsaved } from './settings-pages';
import { isValidationTest } from './lab-work';
import { containerLabel, containerNoun } from './sample-container';
import { PersonOptions, OverlapNotice } from './person-picker';
import { localDate } from './local-date';
import { operationsFor, latest, actorRoles, holder, hasAccess, samplingApproved, labScopeProblems, teamChoicesNeeded, entryValidation, scopeReview, unplannedValidation, validationScopes, type Actor, type Command, type LabScopeVersion, type SampleScope, type Stream, type CustomTest, type ExecutionChoice, type Destination } from './operations-model';
import { testCards, allowedTeams, defaultTeam, shortTest, methodOf, fluidTypes, type FluidType, type TeamChoice, type TestCard } from './scope-catalogue';

type ScopeEntry = Omit<SampleScope, 'containerType' | 'containerLabel'>;
type Run = (c: Command) => boolean;
const teamLabel = (t: TeamChoice) => t === 'Both' ? 'PVT and Chemical' : t;
const streamsOf = (d: Destination): Stream[] => d === 'Both' ? ['PVT', 'Chemical'] : [d];
const teamOf = (e: ScopeEntry, id: string): TeamChoice | undefined => { const p = e.pvtTests.includes(id), c = e.chemicalTests.includes(id); return p && c ? 'Both' : p ? 'PVT' : c ? 'Chemical' : undefined; };
const selectedIds = (e: ScopeEntry) => [...new Set([...e.pvtTests, ...e.chemicalTests])].filter((id) => !isValidationTest(id));
const external = (x?: ExecutionChoice) => x?.by === 'Third-party';
/** An Unassigned test on a sample sent to both teams waits for the scope owner's explicit team choice. */
const needsTeam = (e: ScopeEntry, id: string, routing: Actor['routing']) => !!routing && !routing[id] && e.destination === 'Both' && !(e.teamChosen || []).includes(id);
let customSeq = 0;
const newCustomId = () => 'ct-' + Date.now().toString(36) + '-' + (++customSeq);

/** Older records keep their lists; an unreleased catalogue "Validation" test becomes the Yes/No control. */
function toEntry(sampleId: string, v?: LabScopeVersion, released?: LabScopeVersion): ScopeEntry {
  const e = v?.samples.find((x) => x.sampleId === sampleId);
  if (!e) return { sampleId, destination: 'PVT', pvtTests: [], chemicalTests: [], notes: '', excluded: false, exclusionReason: '', validation: false, customTests: [], execution: {} };
  const rel = released?.samples.find((x) => x.sampleId === sampleId);
  const keep = (list: string[], key: 'pvtTests' | 'chemicalTests') => list.filter((t) => !isValidationTest(t) || rel?.[key].includes(t));
  const rest: ScopeEntry = { ...e } as ScopeEntry; delete (rest as Partial<SampleScope>).containerType; delete (rest as Partial<SampleScope>).containerLabel;
  return { ...rest, pvtTests: keep(e.pvtTests, 'pvtTests'), chemicalTests: keep(e.chemicalTests, 'chemicalTests'), validation: entryValidation(e), customTests: (e.customTests || []).map((c) => ({ ...c })), execution: { ...(e.execution || {}) } };
}
/** What is still missing in one sample, for the collapsed summary. */
function missing(e: ScopeEntry, routing?: Actor['routing'], released?: LabScopeVersion | SampleScope): string[] {
  const rel = released && 'samples' in released ? released.samples.find((x) => x.sampleId === e.sampleId && !x.excluded) : released;
  if (e.excluded) return e.exclusionReason.trim() ? [] : ['exclusion reason'];
  const out: string[] = [];
  if (!e.fluidType) out.push('fluid type');
  else if (e.fluidType === 'Other' && !e.fluidDescription?.trim()) out.push('fluid description');
  if (!selectedIds(e).length && !entryValidation(e) && !(e.customTests || []).length) out.push('tests');
  if ((e.customTests || []).some((c) => !c.name.trim())) out.push('custom test name');
  if ([...Object.entries(e.execution || {}).filter(([id]) => selectedIds(e).includes(id)).map(([, x]) => x), ...(e.customTests || []).map((c) => c.execution)].some((x) => external(x) && !x?.provider?.trim())) out.push('third-party provider');
  if (scopeReview(e).length) out.push('review ' + scopeReview(e).length + ' selection(s)');
  const teams = teamChoicesNeeded(e, routing, rel && !rel.excluded ? rel : undefined);
  if (teams.length) out.push('team for ' + teams.map(shortTest).join(', '));
  return out;
}

/** Per-sample laboratory scope: fluid type → team → Validation → tests → other tests, released by the scope selector. */
export function LabScope({ job, actor, run }: { job: JobRecord; actor: Actor; run: Run }) {
  const o = operationsFor(job); const versions = o.labScopes || []; const last = versions.at(-1); const released = [...versions].reverse().find((v) => v.status === 'Released');
  const roles = actorRoles(actor); const routing = actor.routing; const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'Not assigned';
  const selector = holder(actor, 'scopeSelector'); const canEdit = !!selector && actor.id === selector && hasAccess(actor, 'analysis');
  const legacyScoped = o.scope.some((s) => !s.id.startsWith('labscope:') && !s.id.startsWith('addval:')) && !versions.length;
  const entries = (v?: LabScopeVersion) => (job.samples || []).map((s) => toEntry(s.id, v, released));
  const initial = { samples: entries(last), conditions: last?.conditions || o.conditions, reason: last?.status === 'Draft' ? last.reason : '' };
  const [editing, setEditing] = useState(last?.status === 'Draft');
  const [samples, setSamples] = useState(initial.samples), [conditions, setConditions] = useState(initial.conditions), [reason, setReason] = useState(initial.reason), [review, setReview] = useState(false);
  const firstOpen = initial.samples.find((e) => missing(e, actor.routing, released).length)?.sampleId || initial.samples[0]?.sampleId;
  const [open, setOpen] = useState<string[]>(firstOpen ? [firstOpen] : []);
  useUnsaved(editing && JSON.stringify({ samples, conditions, reason }) !== JSON.stringify(initial));
  // Unassigned tests on a sample sent to both teams need the scope owner's explicit team choice before release.
  const problems = [...samples.flatMap((e) => teamChoicesNeeded(e, routing, released?.samples.find((x) => x.sampleId === e.sampleId && !x.excluded)).map((id) => `Sample ${e.sampleId}: choose the team for “${shortTest(id)}”. It has no default team in Settings → Tests.`)), ...labScopeProblems(job, samples, conditions, routing, roles, released, actor)];
  const update = (id: string, change: Partial<ScopeEntry>) => { setReview(false); setSamples((list) => list.map((s) => s.sampleId === id ? { ...s, ...change } : s)); };
  const start = (from?: LabScopeVersion) => { const list = entries(from); setSamples(list); setConditions(from?.conditions || o.conditions); setReason(''); setReview(false); setEditing(true); const f = list.find((e) => missing(e, actor.routing, released).length)?.sampleId || list[0]?.sampleId; setOpen(f ? [f] : []); };
  const providers = [...new Set([...o.activities.map((a) => a.external?.provider || ''), ...samples.flatMap((s) => [...Object.values(s.execution || {}), ...(s.customTests || []).map((c) => c.execution)].map((x) => x?.provider || ''))].map((p) => p.trim()).filter(Boolean))].sort();
  const versionList = versions.length > 0 && <div className="scope-versions"><h3>Scope versions</h3>{[...versions].reverse().map((v) => <ScopeDocument key={v.version + v.status} version={v} employees={actor.employees} />)}</div>;
  if (legacyScoped) return <section className="panel ops-panel"><h2>Laboratory scope</h2><p>This job’s scope was confirmed in the earlier workflow and stays as recorded below. Further work is added as an additional-work request.</p><ValidationRequest job={job} actor={actor} run={run} /></section>;
  if (!samplingApproved(job)) return <section className="panel ops-panel"><h2>Laboratory scope</h2><p className="locked-note"><AlertCircle size={16} /> The detailed laboratory scope is selected per sample after the sampling report is approved. Sampling report: {latest(o.samplingReports)?.status || (job.report?.reportStatus ? 'legacy ' + job.report.reportStatus : 'not started')}.</p><p>Scope selection: {name(selector)}{!selector && ' (not configured — ask an administrator)'}.</p>{versionList}</section>;
  const toggleOpen = (id: string) => setOpen((list) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return <section className="panel ops-panel lab-scope">
    <div className="panel-heading"><div><h2>Laboratory scope per sample</h2><p>Selected by {name(selector)} (scope selection). On release, PVT work goes to {name(roles.pvtTeamLead)} (PVT Team Lead) and Chemical work to {name(roles.chemicalTeamLead)} (Chemical Team Lead). Validation requests go to the PVT Team Lead, who chooses the steps.</p></div></div>
    {!routing && <p className="ops-error" role="alert">Laboratory test routing settings cannot be read. Release is blocked until an administrator restores them in Settings → Authorization.</p>}
    {!editing && <>{released ? <p>Version {released.version} released by {name(released.releasedBy)} on {new Date(released.releasedAt!).toLocaleString()}.</p> : <p>No laboratory scope has been released yet.</p>}
      {released && <ReleasedSummary job={job} version={released} actor={actor} />}
      {canEdit ? <button className="primary-button" onClick={() => start(released || last)}>{released ? 'Revise scope (add work or Validation)' : 'Select laboratory scope'}</button> : <p>Only {name(selector)} can select and release the laboratory scope.</p>}</>}
    {editing && <fieldset disabled={!canEdit} className="lab-scope-editor">
      {released && <p className="revision-banner" role="note"><strong>Revision of version {released.version}.</strong> Released tests, Validation and custom tests stay as they are (marked <Lock size={12} aria-label="released" />). Add tests, Validation or custom tests; completed work, files, approvals and reports are kept.</p>}
      <details className="scope-conditions" open={!conditions.pressure && !conditions.temperature && !conditions.notes ? undefined : true}>
        <summary>Reservoir conditions and general scope notes{conditions.pressure || conditions.temperature ? ` · ${conditions.pressure || '—'} ${conditions.pressureUnit} · ${conditions.temperature || '—'} ${conditions.temperatureUnit}` : ''}</summary>
        <div className="settings-form-grid">{(['pressure', 'temperature'] as const).map((key) => <label key={key}>Reservoir {key}<span className="unit-input"><input inputMode="decimal" value={conditions[key]} onChange={(e) => { setReview(false); setConditions({ ...conditions, [key]: e.target.value }); }} /><select aria-label={key + ' unit'} value={conditions[key === 'pressure' ? 'pressureUnit' : 'temperatureUnit']} onChange={(e) => setConditions({ ...conditions, [key === 'pressure' ? 'pressureUnit' : 'temperatureUnit']: e.target.value })}>{(key === 'pressure' ? ['psi', 'bar', 'kPa', 'MPa'] : ['°C', '°F', 'K']).map((u) => <option key={u}>{u}</option>)}</select></span><small>Optional here. Required when the PVT lead plans Restoration.</small></label>)}<label>General scope notes<textarea value={conditions.notes} onChange={(e) => { setReview(false); setConditions({ ...conditions, notes: e.target.value }); }} /></label></div>
      </details>
      <div className="scope-toolbar"><span>{samples.length} sample{samples.length === 1 ? '' : 's'} · {samples.filter((e) => missing(e, routing, released).length).length} incomplete</span><button type="button" className="text-button" onClick={() => setOpen(samples.map((s) => s.sampleId))}>Expand all</button><button type="button" className="text-button" onClick={() => setOpen([])}>Collapse all</button><BulkOutsource samples={samples} job={job} released={released} onApply={(list) => { setReview(false); setSamples(list); }} /></div>
      {samples.map((entry) => <SampleScopeCard key={entry.sampleId} job={job} actor={actor} entry={entry} released={released?.samples.find((s) => s.sampleId === entry.sampleId)} open={open.includes(entry.sampleId)} onToggle={() => toggleOpen(entry.sampleId)} update={(c) => update(entry.sampleId, c)} />)}
      <datalist id="scope-providers">{providers.map((p) => <option key={p} value={p} />)}</datalist>
      {review && <ScopeReview job={job} samples={samples} problems={problems} roles={roles} name={name} version={last?.status === 'Draft' ? last.version : versions.length + 1} released={released} reason={reason} setReason={setReason} />}
      <footer className="scope-actions"><button type="button" className="text-button" onClick={() => { setEditing(last?.status === 'Draft'); setSamples(initial.samples); setConditions(initial.conditions); setReason(initial.reason); setReview(false); }}>Discard changes</button><button type="button" className="outline-button" onClick={() => run({ type: 'lab-scope', action: 'save', samples, conditions, reason })}>Save draft scope</button>{review ? <button type="button" className="primary-button" disabled={problems.length > 0} onClick={() => { if (run({ type: 'lab-scope', action: 'release', samples, conditions, reason })) { setEditing(false); setReview(false); } }}>Approve &amp; release scope</button> : <button type="button" className="primary-button" onClick={() => setReview(true)}>Review scope</button>}</footer>
    </fieldset>}
    {versionList}
  </section>;
}

/** Compact released scope, per sample, so the current scope is readable without opening a document. */
function ReleasedSummary({ job, version, actor }: { job: JobRecord; version: LabScopeVersion; actor: Actor }) {
  const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'not configured';
  const roles = actorRoles(actor); const planned = (sid: string) => validationScopes(job).filter((r) => r.sampleIds.includes(sid));
  return <ul className="scope-released-list">{version.samples.map((s) => { const smp = job.samples?.find((x) => x.id === s.sampleId); const v = planned(s.sampleId); const open = unplannedValidation(job).some((r) => r.sampleIds.includes(s.sampleId));
    return <li key={s.sampleId}><strong>Sample {s.sampleId}</strong> <small>{smp ? containerLabel(smp) : s.containerLabel}</small>{s.excluded ? <span> · Excluded: {s.exclusionReason}</span> : <><span className="scope-chip">{s.fluidType ? (s.fluidType === 'Other' ? 'Other · ' + (s.fluidDescription || '') : s.fluidType) : 'Fluid type not recorded'}</span><span className="scope-chip">{teamLabel(s.destination)}</span>{(entryValidation(s) || v.length > 0) && <span className="scope-chip chip-validation">Validation · {open ? 'awaiting planning by ' + name(roles.pvtTeamLead) : v.length ? 'planned' : 'requested'}</span>}<span> {[s.pvtTests.filter((t) => !isValidationTest(t)).length ? 'PVT: ' + s.pvtTests.filter((t) => !isValidationTest(t)).map(shortTest).join(', ') : '', s.chemicalTests.filter((t) => !isValidationTest(t)).length ? 'Chemical: ' + s.chemicalTests.filter((t) => !isValidationTest(t)).map(shortTest).join(', ') : '', (s.customTests || []).length ? 'Other: ' + (s.customTests || []).map((c) => c.name).join(', ') : ''].filter(Boolean).join(' · ')}</span></>}</li>; })}</ul>;
}

function Segmented<T extends string>({ label, value, options, onChange, disabled, render }: { label: string; value?: T; options: T[]; onChange: (v: T) => void; disabled?: (v: T) => boolean; render?: (v: T) => string }) {
  return <div className="segmented" role="radiogroup" aria-label={label}>{options.map((o) => <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'active' : ''} disabled={disabled?.(o)} onClick={() => onChange(o)}>{render ? render(o) : o}</button>)}</div>;
}

function SampleScopeCard({ job, actor, entry, released, open, onToggle, update }: { job: JobRecord; actor: Actor; entry: ScopeEntry; released?: SampleScope; open: boolean; onToggle: () => void; update: (c: Partial<ScopeEntry>) => void }) {
  const sample = job.samples!.find((s) => s.id === entry.sampleId)!; const routing = actor.routing; const roles = actorRoles(actor);
  const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || 'not configured';
  const ids = selectedIds(entry); const custom = entry.customTests || []; const validation = entryValidation(entry);
  const wasReleased = (id: string, stream?: Stream) => !!released && !released.excluded && (stream ? (stream === 'PVT' ? released.pvtTests : released.chemicalTests).includes(id) : [...released.pvtTests, ...released.chemicalTests].includes(id));
  const validationReleased = !!released && !released.excluded && entryValidation(released);
  const gaps = missing(entry, routing, released); const review = scopeReview(entry);
  const cards = testCards(entry.fluidType);
  const setTeam = (id: string, team?: TeamChoice, explicit = false) => { const p = entry.pvtTests.filter((t) => t !== id), c = entry.chemicalTests.filter((t) => t !== id); const chosenTeams = (entry.teamChosen || []).filter((t) => t !== id); update({ pvtTests: team === 'PVT' || team === 'Both' ? [...p, id] : p, chemicalTests: team === 'Chemical' || team === 'Both' ? [...c, id] : c, teamChosen: explicit ? [...chosenTeams, id] : chosenTeams }); };
  const select = (id: string, on: boolean) => { if (on) setTeam(id, defaultTeam(id, entry.destination, routing)); else { const execution = { ...(entry.execution || {}) }; delete execution[id]; update({ pvtTests: entry.pvtTests.filter((t) => t !== id), chemicalTests: entry.chemicalTests.filter((t) => t !== id), execution }); } };
  const setExec = (id: string, x?: ExecutionChoice) => { const execution = { ...(entry.execution || {}) }; if (x) execution[id] = x; else delete execution[id]; update({ execution }); };
  const setCustom = (list: CustomTest[]) => update({ customTests: list });
  const pvtList = ids.filter((id) => entry.pvtTests.includes(id)).map(shortTest), chemList = ids.filter((id) => entry.chemicalTests.includes(id)).map(shortTest);
  const nExternal = ids.filter((id) => external(entry.execution?.[id])).length + custom.filter((c) => external(c.execution)).length;
  const otherIds = new Set(cards.filter((c) => c.section === 'Other tests').flatMap((c) => c.ids));
  const requiredIds = ids.filter((id) => !otherIds.has(id)), otherSelected = ids.filter((id) => otherIds.has(id));
  const renderCards = (sections: TestCard['section'][]) => sections.map((section) => { const list = cards.filter((c) => c.section === section); return list.length > 0 && <div key={section} className="test-chip-group"><small>{section === 'Fluid tests' ? (entry.fluidType && entry.fluidType !== 'Other' ? entry.fluidType + ' tests' : 'Fluid tests') : section}</small><div className="test-chips">{list.map((card) => {
            const chosen = card.ids.filter((id) => ids.includes(id)); const on = chosen.length > 0; const blocked = card.ids.every((id) => !allowedTeams(id, entry.destination, routing).length);
            const locked = chosen.some((id) => wasReleased(id));
            if (card.ids.length > 1 && !on) return <span key={card.key} className="test-chip method-chip"><span>{card.label}</span><span className="method-pick">{card.ids.map((id) => <button key={id} type="button" disabled={!allowedTeams(id, entry.destination, routing).length} onClick={() => select(id, true)}>{methodOf(id).replace(' method', '')}</button>)}</span></span>;
            return <button key={card.key} type="button" aria-pressed={on} className={'test-chip' + (on ? ' active' : '')} disabled={(blocked && !on) || locked} title={blocked ? `Classified as ${routing?.[card.ids[0]]} in Settings — the destination must include it` : locked ? 'Released — cannot be removed in a revision' : undefined} onClick={() => chosen.length ? chosen.forEach((id) => select(id, false)) : select(card.ids[0], true)}>{locked && <Lock size={11} />}{card.label}{chosen.length && card.ids.length > 1 ? <small> · {methodOf(chosen[0]).replace(' method', '')}</small> : null}{blocked && !on ? <small> · {routing?.[card.ids[0]]} only</small> : null}{!on && routing && card.ids.every((id) => !routing[id]) ? <small className="chip-unassigned"> · no default team</small> : null}</button>;
          })}</div></div>; });
  const selectedRow = (id: string) => <SelectedTest key={id} id={id} entry={entry} actor={actor} team={teamOf(entry, id)} setTeam={(t) => setTeam(id, t, true)} exec={entry.execution?.[id]} setExec={(x) => setExec(id, x)} releasedStreams={(['PVT', 'Chemical'] as Stream[]).filter((st) => wasReleased(id, st))} needsReview={review.includes(id)} onRemove={() => select(id, false)} />;
  const lead = (st: Stream) => name(roles[st === 'PVT' ? 'pvtTeamLead' : 'chemicalTeamLead']);
  return <section className={'scope-sample' + (gaps.length ? ' needs-decision' : '') + (open ? ' is-open' : '')}>
    <button type="button" className="scope-sample-head" aria-expanded={open} onClick={onToggle}>
      <span className="scope-sample-id"><strong>Sample {entry.sampleId}</strong><small>{containerLabel(sample).startsWith(containerNoun(sample)) ? containerLabel(sample) : containerNoun(sample) + ' · ' + containerLabel(sample)}</small></span>
      <span className="scope-sample-chips">{entry.excluded ? <span className="scope-chip">Excluded</span> : <>
        <span className={'scope-chip' + (entry.fluidType ? '' : ' chip-missing')}>{entry.fluidType || 'Fluid type?'}</span>
        <span className="scope-chip">{teamLabel(entry.destination)}</span>
        {validation && <span className="scope-chip chip-validation">Validation{!streamsOf(entry.destination).includes('PVT') ? ' · PVT' : ''}</span>}
        <span className="scope-chip">{ids.length + custom.length} test{ids.length + custom.length === 1 ? '' : 's'}</span>
        {nExternal > 0 && <span className="scope-chip chip-external">{nExternal} external</span>}</>}
        {gaps.length > 0 ? <span className="scope-chip chip-missing">Needs: {gaps.join(', ')}</span> : <span className="scope-chip chip-ok">Complete</span>}
      </span><ChevronDown size={18} aria-hidden="true" className="scope-caret" />
    </button>
    {open && <div className="scope-sample-body">
      {!entry.excluded && <>
        <div className="scope-step"><span className="step-label">1 · Fluid type</span>
          <Segmented label={'Fluid type for sample ' + entry.sampleId} value={entry.fluidType} options={fluidTypes} render={(v) => v === 'Other' ? 'Add Other' : v} onChange={(v: FluidType) => update({ fluidType: v })} />
          {!entry.fluidType && (ids.length > 0 || validation) && <p className="flag-note">Fluid type not recorded for this older scope. Select it before release; the existing selections are kept.</p>}
          {entry.fluidType === 'Other' && <div className="settings-form-grid scope-other-fluid"><label>Fluid / sample description *<input value={entry.fluidDescription || ''} onChange={(e) => update({ fluidDescription: e.target.value })} placeholder="e.g. Volatile oil, emulsion, produced water" /></label><label>Fluid notes<textarea value={entry.fluidNotes || ''} onChange={(e) => update({ fluidNotes: e.target.value })} /></label></div>}
        </div>
        <div className="scope-step"><span className="step-label">2 · Responsible team</span>
          <Segmented label={'Responsible team for sample ' + entry.sampleId} value={entry.destination} options={['PVT', 'Chemical', 'Both'] as Destination[]} render={teamLabel} onChange={(d) => update({ destination: d })} disabled={(d) => !!released && !released.excluded && streamsOf(released.destination).some((st) => !streamsOf(d).includes(st))} />
          <small className="step-hint">{streamsOf(entry.destination).map((st) => `${st} work → ${lead(st)} (${st} Team Lead)`).join(' · ')}</small>
        </div>
        <div className="scope-step"><span className="step-label">3 · Validation required?</span>
          <Segmented label={'Validation required for sample ' + entry.sampleId} value={validation ? 'Yes' : 'No'} options={['Yes', 'No']} disabled={(v) => v === 'No' && validationReleased} onChange={(v) => update(v === 'Yes' ? { validation: true } : { validation: false, pvtTests: entry.pvtTests.filter((t) => !isValidationTest(t) || wasReleased(t)), chemicalTests: entry.chemicalTests.filter((t) => !isValidationTest(t) || wasReleased(t)) })} />
          {validationReleased ? <small className="step-hint"><Lock size={12} /> Released. {lead('PVT')} plans the steps in Laboratory.</small> : validation && <small className="step-hint">{lead('PVT')} (PVT Team Lead) chooses the steps and engineers after release.{!streamsOf(entry.destination).includes('PVT') && <strong className="step-note"> Adds PVT responsibility for Validation only; the Chemical scope and assignments stay as they are.</strong>}</small>}
        </div>
        <div className="scope-step"><span className="step-label">4 · Required tests{pvtList.length + chemList.length > 0 && <small> · {[pvtList.length ? 'PVT: ' + pvtList.join(', ') : '', chemList.length ? 'Chemical: ' + chemList.join(', ') : ''].filter(Boolean).join(' · ')}</small>}</span>
          {!entry.fluidType && !ids.length && <p className="step-hint">Select the fluid type first to see its tests. Each test is listed once.</p>}
          {(entry.fluidType || ids.length > 0) && renderCards(['Fluid tests', 'General analysis', 'Specialised analysis'])}
          {requiredIds.length > 0 && <ul className="selected-tests">{requiredIds.map(selectedRow)}</ul>}
          {review.length > 0 && <p className="flag-note" role="status">{review.length} saved selection{review.length === 1 ? ' is' : 's are'} not listed for {entry.fluidType}: {review.map((id) => shortTest(id) + (methodOf(id) ? ' (' + methodOf(id) + ')' : '')).join(', ')}. Kept until you remove or confirm them.</p>}
        </div>
        <div className="scope-step"><span className="step-label">5 · Other tests <small>· choose the team for each</small></span>
          {renderCards(['Other tests'])}
          {otherSelected.length > 0 && <ul className="selected-tests">{otherSelected.map(selectedRow)}</ul>}
          <small className="step-hint">Job-specific tests added below stay with this job and are not added to the catalogue.</small>
          {custom.map((c, i) => <CustomTestRow key={c.id} test={c} entry={entry} actor={actor} locked={!!released?.customTests?.some((x) => x.id === c.id)} onChange={(n) => setCustom(custom.map((x, j) => j === i ? n : x))} onRemove={() => setCustom(custom.filter((_, j) => j !== i))} />)}
          <button type="button" className="outline-button add-test" onClick={() => setCustom([...custom, { id: newCustomId(), name: '', notes: '', team: entry.destination }])}><Plus size={14} /> Add test</button>
        </div>
      </>}
      <label className="ops-check"><input type="checkbox" checked={entry.excluded} disabled={!!released && !released.excluded} onChange={(e) => update({ excluded: e.target.checked, ...(e.target.checked ? { pvtTests: [], chemicalTests: [], customTests: [], validation: false, execution: {} } : { exclusionReason: '' }) })} />Exclude this sample from laboratory scope</label>
      {entry.excluded && <label>Reason for exclusion *<input value={entry.exclusionReason} onChange={(e) => update({ exclusionReason: e.target.value })} /></label>}
      <label>Scope notes for this sample<textarea value={entry.notes} onChange={(e) => update({ notes: e.target.value })} /></label>
    </div>}
  </section>;
}

/** Team routing and execution for one selected catalogue test. */
function SelectedTest({ id, entry, actor, team, setTeam, exec, setExec, releasedStreams, needsReview, onRemove }: { id: string; entry: ScopeEntry; actor: Actor; team?: TeamChoice; setTeam: (t: TeamChoice) => void; exec?: ExecutionChoice; setExec: (x?: ExecutionChoice) => void; releasedStreams: Stream[]; needsReview: boolean; onRemove: () => void }) {
  const allowed = allowedTeams(id, entry.destination, actor.routing); const locked = releasedStreams.length > 0;
  const routed = actor.routing?.[id];
  return <li className={'selected-test' + (needsReview ? ' needs-review' : '')}>
    <div className="selected-test-head"><strong>{shortTest(id)}</strong>{methodOf(id) && <small>{methodOf(id)}</small>}
      {team && <span className={'team-badge team-' + team.toLowerCase()}>{teamLabel(team)}</span>}
      {!routed && (needsTeam(entry, id, actor.routing) ? <strong className="flag-note team-needed">No default team · choose the team below</strong> : <small className="muted">No default team in Settings · team chosen here</small>)}
      {needsReview && <button type="button" className="text-button" onClick={onRemove}>Remove</button>}
      {locked && <small><Lock size={11} /> Released</small>}
    </div>
    <div className="selected-test-controls">
      {allowed.length > 1 && <div className="inline-field"><span>Team</span><Segmented label={'Team for ' + shortTest(id)} value={team} options={allowed} render={teamLabel} onChange={setTeam} disabled={(t) => releasedStreams.some((st) => !streamsOf(t).includes(st))} /></div>}
      {!allowed.length && <span className="flag-note">Classified as {routed} in Settings: choose a destination that includes it, or remove it.</span>}
      <ExecutionFields value={exec} onChange={setExec} streams={team ? streamsOf(team) : []} actor={actor} locked={locked} label={shortTest(id)} />
    </div>
  </li>;
}

/** Performed by Internal / Third-party. Dispatch and returned results are recorded later, in the laboratory view. */
function ExecutionFields({ value, onChange, streams, actor, locked, label }: { value?: ExecutionChoice; onChange: (x?: ExecutionChoice) => void; streams: Stream[]; actor: Actor; locked?: boolean; label: string }) {
  const ext = external(value); const name = (id: string) => actor.employees.find((e) => e.id === id)?.name || id;
  const team = [...new Set(streams.flatMap((st) => actor.teams?.[st] || []))];
  return <div className="execution-fields">
    <div className="inline-field"><span>Performed by</span><Segmented label={'Performed by for ' + label} value={ext ? 'Third-party laboratory' : 'Internal'} options={['Internal', 'Third-party laboratory']} disabled={() => !!locked} onChange={(v) => onChange(v === 'Internal' ? undefined : { by: 'Third-party', provider: value?.provider || '', notes: value?.notes || '', expectedReturn: value?.expectedReturn || '', coordinator: value?.coordinator || '' })} /></div>
    {ext && <div className="third-party-fields">
      <label>Provider / laboratory *<input list="scope-providers" value={value?.provider || ''} disabled={locked} onChange={(e) => onChange({ ...value!, provider: e.target.value })} placeholder="Enter or pick a laboratory" /></label>
      <label>Internal coordinator<select value={value?.coordinator || ''} disabled={locked} onChange={(e) => onChange({ ...value!, coordinator: e.target.value })}><option value="">Not assigned yet · team lead assigns after release</option><PersonOptions employees={actor.employees} departments={actor.departments} me={actor.id} current={value?.coordinator} first={team} firstLabel={(streams.join(' / ') || 'Responsible') + ' team'} /></select></label>
      <label>Expected return<input type="date" value={value?.expectedReturn || ''} disabled={locked} onChange={(e) => onChange({ ...value!, expectedReturn: e.target.value })} /></label>
      {!!value?.coordinator && !locked && <div className="wide"><OverlapNotice jobs={actor.jobs} employees={actor.employees} employeeId={value.coordinator} start={localDate()} end={value.expectedReturn || ''} /></div>}
      <label className="wide">Instructions / notes<input value={value?.notes || ''} disabled={locked} onChange={(e) => onChange({ ...value!, notes: e.target.value })} /></label>
      <small className="step-hint">Recorded and tracked only: nothing is sent to the provider. The coordinator records dispatch and the returned report in Laboratory; the {streams.join(' / ') || 'responsible'} team lead reviews the results.</small>
    </div>}
  </div>;
}

function CustomTestRow({ test, entry, actor, locked, onChange, onRemove }: { test: CustomTest; entry: ScopeEntry; actor: Actor; locked: boolean; onChange: (t: CustomTest) => void; onRemove: () => void }) {
  const teams: TeamChoice[] = entry.destination === 'Both' ? ['PVT', 'Chemical', 'Both'] : [entry.destination];
  return <div className={'custom-test' + (locked ? ' is-locked' : '')}>
    <div className="custom-test-grid">
      <label>Test name *<input value={test.name} disabled={locked} onChange={(e) => onChange({ ...test, name: e.target.value })} placeholder="e.g. H2S content" /></label>
      <div className="inline-field"><span>Responsible team</span><Segmented label={'Team for custom test ' + (test.name || '')} value={teams.includes(test.team) ? test.team : undefined} options={teams} render={teamLabel} disabled={() => locked} onChange={(t) => onChange({ ...test, team: t })} /></div>
      <label className="wide">Instructions or notes<input value={test.notes} disabled={locked} onChange={(e) => onChange({ ...test, notes: e.target.value })} /></label>
    </div>
    {!teams.includes(test.team) && <p className="flag-note">This test was set to {teamLabel(test.team)}; the sample destination no longer includes it. Choose a team.</p>}
    <ExecutionFields value={test.execution} onChange={(x) => onChange({ ...test, execution: x })} streams={streamsOf(test.team)} actor={actor} locked={locked} label={test.name || 'custom test'} />
    {locked ? <small className="step-hint"><Lock size={11} /> Released · tracked as its own work item</small> : <button type="button" className="text-button danger-text" onClick={onRemove}><Trash2 size={13} /> Remove</button>}
  </div>;
}

/** Outsource several or all selected tests at once. Each test keeps its own execution record. */
function BulkOutsource({ samples, job, released, onApply }: { samples: ScopeEntry[]; job: JobRecord; released?: LabScopeVersion; onApply: (list: ScopeEntry[]) => void }) {
  const [open, setOpen] = useState(false), [picked, setPicked] = useState<string[]>([]), [provider, setProvider] = useState(''), [expected, setExpected] = useState(''), [notes, setNotes] = useState('');
  const rel = (sid: string, id: string) => !!released?.samples.some((s) => s.sampleId === sid && [...s.pvtTests, ...s.chemicalTests].includes(id)) || !!released?.samples.some((s) => s.sampleId === sid && (s.customTests || []).some((c) => c.id === id));
  const rows = samples.filter((s) => !s.excluded).flatMap((s) => [...selectedIds(s).map((id) => ({ key: s.sampleId + '|' + id, sid: s.sampleId, id, label: shortTest(id), ext: external(s.execution?.[id]) })), ...(s.customTests || []).map((c) => ({ key: s.sampleId + '|' + c.id, sid: s.sampleId, id: c.id, label: c.name || 'Unnamed custom test', ext: external(c.execution) }))]).filter((r) => !rel(r.sid, r.id));
  if (!rows.length) return null;
  const apply = () => { const x: ExecutionChoice = { by: 'Third-party', provider: provider.trim(), expectedReturn: expected, notes: notes.trim(), coordinator: '' }; onApply(samples.map((s) => { const mine = rows.filter((r) => r.sid === s.sampleId && picked.includes(r.key)); if (!mine.length) return s; const execution = { ...(s.execution || {}) }; for (const r of mine) if (selectedIds(s).includes(r.id)) execution[r.id] = { ...x, coordinator: s.execution?.[r.id]?.coordinator || '' }; return { ...s, execution, customTests: (s.customTests || []).map((c) => mine.some((r) => r.id === c.id) ? { ...c, execution: { ...x, coordinator: c.execution?.coordinator || '' } } : c) }; })); setOpen(false); setPicked([]); };
  return <>{!open ? <button type="button" className="outline-button" onClick={() => setOpen(true)}>Outsource tests…</button> : <div className="bulk-outsource" role="group" aria-label="Outsource tests">
    <strong>Send several tests to a third-party laboratory</strong><small>Each test keeps its own execution details; internal tests are not changed. {job.jobNumber}</small>
    <div className="lab-inline-actions"><button type="button" className="text-button" onClick={() => setPicked(rows.map((r) => r.key))}>Select all tests in the job</button><button type="button" className="text-button" onClick={() => setPicked([])}>Clear</button></div>
    <ul className="bulk-list">{rows.map((r) => <li key={r.key}><label className="ops-check"><input type="checkbox" checked={picked.includes(r.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.key] : picked.filter((k) => k !== r.key))} />Sample {r.sid} · {r.label}{r.ext ? ' · already external' : ''}</label></li>)}</ul>
    <div className="third-party-fields"><label>Provider / laboratory *<input list="scope-providers" value={provider} onChange={(e) => setProvider(e.target.value)} /></label><label>Expected return<input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></label><label className="wide">Instructions / notes<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label></div>
    <div className="ops-actions"><button type="button" className="text-button" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="primary-button" disabled={!picked.length || !provider.trim()} onClick={apply}>Mark {picked.length} test{picked.length === 1 ? '' : 's'} third-party</button></div>
  </div>}</>;
}

function ScopeReview({ job, samples, problems, roles, name, version, released, reason, setReason }: { job: JobRecord; samples: ScopeEntry[]; problems: string[]; roles: Record<string, string>; name: (id?: string) => string; version: number; released?: LabScopeVersion; reason: string; setReason: (v: string) => void }) {
  const ext = (s: ScopeEntry, id: string) => external(s.execution?.[id]) ? ' (External · ' + s.execution![id].provider + ')' : '';
  const list = (s: ScopeEntry, key: 'pvtTests' | 'chemicalTests', st: Stream) => [...s[key].filter((t) => !isValidationTest(t)).map((t) => shortTest(t) + ext(s, t)), ...(s.customTests || []).filter((c) => streamsOf(c.team).includes(st)).map((c) => (c.name || 'Unnamed') + ' (custom' + (external(c.execution) ? ' · External · ' + c.execution!.provider : '') + ')')].join(', ') || '—';
  return <section className="scope-review" aria-live="polite"><h3>Review before release · version {version}</h3>
    <div className="ops-table-wrap"><table><thead><tr><th>Sample</th><th>Fluid</th><th>Validation</th><th>PVT tests</th><th>Chemical tests</th><th>Notes</th></tr></thead><tbody>{samples.map((s) => { const sample = job.samples!.find((x) => x.id === s.sampleId)!; return <tr key={s.sampleId} className={missing(s).length ? 'flag-row' : ''}><td>{s.sampleId}<small>{containerLabel(sample)}</small></td><td>{s.excluded ? 'Excluded' : s.fluidType ? s.fluidType + (s.fluidType === 'Other' ? ' · ' + (s.fluidDescription || '—') : '') : 'Not selected'}</td><td>{s.excluded ? '—' : entryValidation(s) ? 'Yes · PVT' : 'No'}</td><td>{s.excluded ? '—' : list(s, 'pvtTests', 'PVT')}</td><td>{s.excluded ? '—' : list(s, 'chemicalTests', 'Chemical')}</td><td>{s.excluded ? s.exclusionReason : s.notes}</td></tr>; })}</tbody></table></div>
    <p>PVT work and Validation planning → {name(roles.pvtTeamLead)} · Chemical work → {name(roles.chemicalTeamLead)}</p>
    {(() => { const n = samples.filter((s) => !s.excluded).reduce((k, s) => k + selectedIds(s).filter((id) => external(s.execution?.[id]) && !s.execution![id].coordinator).length + (s.customTests || []).filter((c) => external(c.execution) && !c.execution!.coordinator).length, 0); return n > 0 && <p className="scope-note" role="note"><strong>{n} outsourced test{n === 1 ? '' : 's'} without an internal coordinator.</strong> After release the responsible team lead gets an “Assign coordinator” task; dispatch stays blocked until one is assigned.</p>; })()}
    {samples.some((s) => !s.excluded && entryValidation(s) && !streamsOf(s.destination).includes('PVT')) && <p className="scope-note" role="note">Validation on a Chemical-only sample adds PVT responsibility for the Validation work only ({name(roles.pvtTeamLead)} plans it). Chemical scope is unchanged.</p>}
    {problems.length > 0 ? <div className="preparation-validation" role="alert"><span>!</span><div><strong>Release is blocked</strong><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div></div> : <p className="ops-success">Ready to release. Your release is recorded as the scope approval with your name and time.</p>}
    <label>{released ? 'Revision reason *' : 'Release note (optional)'}<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label></section>;
}

/** For jobs scoped in the earlier workflow: request Validation per sample. The PVT Team Lead chooses the steps. */
function ValidationRequest({ job, actor, run }: { job: JobRecord; actor: Actor; run: Run }) {
  const selector = holder(actor, 'scopeSelector'); const can = !!selector && actor.id === selector && hasAccess(actor, 'analysis'); const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || '';
  const [ids, setIds] = useState<string[]>([]), [reason, setReason] = useState('');
  useUnsaved(!!ids.length || !!reason);
  if (!job.samples?.length) return null;
  const has = (sid: string) => validationScopes(job).some((r) => r.sampleIds.includes(sid)); const pending = (sid: string) => unplannedValidation(job).some((r) => r.sampleIds.includes(sid));
  return <div className="validation-request"><h3>Validation</h3><p>Request Validation for a sample at any stage. {name(holder(actor, 'pvtTeamLead')) || 'The PVT Team Lead'} chooses the steps and engineers; earlier work and reports are kept.</p>
    <ul className="compact-list">{job.samples.map((s) => <li key={s.id}><span>Sample {s.id} · {containerLabel(s, 'container not recorded')}</span> {pending(s.id) ? <span className="scope-chip chip-validation">Requested · awaiting planning</span> : <Segmented label={'Validation required for sample ' + s.id} value={ids.includes(s.id) ? 'Yes' : 'No'} options={['Yes', 'No']} disabled={() => !can} onChange={(v) => setIds(v === 'Yes' ? [...ids, s.id] : ids.filter((x) => x !== s.id))} />}{has(s.id) && !pending(s.id) && <small> · Validation on record</small>}</li>)}</ul>
    {can ? ids.length > 0 && <form onSubmit={(e) => { e.preventDefault(); if (run({ type: 'add-validation', sampleIds: ids, steps: [], reason })) { setIds([]); setReason(''); } }}><label>Reason *<textarea required value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="primary-button" disabled={!reason.trim()}>Request Validation for {ids.length} sample{ids.length === 1 ? '' : 's'}</button></form> : <p className="filter-note">Requested by {selector ? name(selector) + ' (scope selection)' : 'the scope selector (not configured)'}.</p>}
  </div>;
}

/** Printable scope document rendered only from a stored version, so later edits never alter an issued copy. */
export function ScopeDocument({ version: v, employees }: { version: LabScopeVersion; employees: Employee[] }) {
  const ref = useRef<HTMLElement>(null); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const name = (id?: string) => employees.find((e) => e.id === id)?.name || id || 'Not recorded'; const draft = v.status !== 'Released';
  const date = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
  const exportPDF = async () => { if (!ref.current) return; setBusy(true); try { const html2pdf = (await import('html2pdf.js')).default; await html2pdf().set({ margin: 12, filename: `${v.job.jobNumber}-laboratory-scope-v${v.version}${draft ? '-DRAFT' : ''}.pdf`, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(ref.current).save(); setError(''); } catch { setError('Could not generate the PDF. The saved scope remains available.'); } finally { setBusy(false); } };
  const unclassified = (test: string) => !v.routing[test];
  const ext = (s: SampleScope, t: string) => s.execution?.[t]?.by === 'Third-party' ? ' (External · ' + s.execution[t].provider + ')' : '';
  const tests = (s: SampleScope, key: 'pvtTests' | 'chemicalTests', st: Stream) => [...s[key].filter((t) => !isValidationTest(t)).map((t) => shortTest(t) + (unclassified(t) ? ' *' : '') + ext(s, t)), ...(s.customTests || []).filter((c) => streamsOf(c.team).includes(st)).map((c) => c.name + ' (other' + (c.execution?.by === 'Third-party' ? ' · External · ' + c.execution.provider : '') + ')')].join(', ') || '—';
  return <details className="ops-report-preview"><summary>Version {v.version} · {draft ? 'Draft (not approved)' : 'Released ' + date(v.releasedAt)}</summary><button type="button" className="outline-button" disabled={busy} onClick={exportPDF}><Download size={14} /> {busy ? 'Preparing PDF…' : draft ? 'Download draft PDF' : 'Download approved scope PDF'}</button>{error && <p role="alert">{error}</p>}
    <article className={'ops-report-document scope-document' + (draft ? ' is-draft' : '')} ref={ref}>{draft && <div className="draft-mark" aria-hidden="true">DRAFT — NOT APPROVED</div>}
      <header><h1>Laboratory scope of work</h1><strong>{v.job.jobNumber} · Version {v.version} · {draft ? 'DRAFT' : 'APPROVED'}</strong><p>{v.job.clientName} · {[v.job.fieldArea, v.job.well].filter(Boolean).join(' · ')}</p><p>{v.job.samplingSource}</p><p>Issue date: {draft ? 'Not issued (draft saved ' + date(v.savedAt) + ')' : date(v.releasedAt)}</p></header>
      {(v.conditions.pressure || v.conditions.temperature || v.conditions.notes) && <><h2>Conditions and general notes</h2><p>{[v.conditions.pressure && `Reservoir pressure ${v.conditions.pressure} ${v.conditions.pressureUnit}`, v.conditions.temperature && `Reservoir temperature ${v.conditions.temperature} ${v.conditions.temperatureUnit}`].filter(Boolean).join(' · ')}</p>{v.conditions.notes && <p>{v.conditions.notes}</p>}</>}
      <h2>Samples and selected tests</h2><table><colgroup><col style={{ width: '9%' }} /><col style={{ width: '17%' }} /><col style={{ width: '12%' }} /><col style={{ width: '9%' }} /><col style={{ width: '17%' }} /><col style={{ width: '17%' }} /><col style={{ width: '19%' }} /></colgroup><thead><tr><th>Sample</th><th>Container</th><th>Fluid</th><th>Validation</th><th>PVT tests</th><th>Chemical tests</th><th>Scope notes</th></tr></thead><tbody>{v.samples.map((s) => <tr key={s.sampleId}><td>{s.sampleId}</td><td>{s.containerType === 'Glass container' ? s.containerLabel : 'Bottle · ' + s.containerLabel}</td><td>{s.excluded ? '—' : s.fluidType ? s.fluidType + (s.fluidType === 'Other' && s.fluidDescription ? ' · ' + s.fluidDescription : '') : 'Not recorded'}</td><td>{s.excluded ? '—' : entryValidation(s) ? 'Yes' : 'No'}</td><td>{s.excluded ? 'Excluded' : tests(s, 'pvtTests', 'PVT')}</td><td>{s.excluded ? '—' : tests(s, 'chemicalTests', 'Chemical')}</td><td>{s.excluded ? 'Excluded: ' + s.exclusionReason : [s.notes, s.fluidNotes].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table>
      {v.samples.some((s) => [...s.pvtTests, ...s.chemicalTests].some(unclassified)) && <p><small>* Unclassified in Settings when this version was saved; team chosen by the scope selector.</small></p>}
      {v.samples.some((s) => entryValidation(s)) && <p><small>Validation: the PVT Team Lead selects the applicable steps; none is assumed mandatory.</small></p>}
      {v.reason && <><h2>{v.version > 1 ? 'Revision reason' : 'Release note'}</h2><p>{v.reason}</p></>}
      <h2>Approval</h2>{draft ? <p><strong>Not approved.</strong> Prepared by {name(v.preparedBy)} on {date(v.savedAt)}. This draft has no approval or signature.</p> : <dl><dt>Approved and released by</dt><dd>{name(v.releasedBy)} · Scope selection</dd><dt>Date and time</dt><dd>{date(v.releasedAt)}</dd><dt>Method</dt><dd>Electronic release recorded in VAPS (no handwritten signature)</dd></dl>}
    </article></details>;
}
