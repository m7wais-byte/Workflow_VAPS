// Laboratory Scope of Work — interactive demo (fictional data). Separate from the VAPS app and its records.
import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BriefcaseBusiness, Check, ChevronDown, ChevronRight, FlaskConical, LayoutDashboard, ListChecks, Menu, PackageSearch, Plus, RotateCcw, Settings, Trash2, X } from 'lucide-react';
import logoUrl from '../public/vaps-logo.png?url';
import './demo.css';
import {
  act, assign, assignmentLabel, blankRequest, canRelease, catalogueFor, fluidLabel, fluidOptions, leadOf, leadSummary, myAssignments, nameOf, nextActors,
  people, person, plansFor, pvtAddedForValidation, release, requestAdditional, requestOptions, requestRowIssues, requestStatus, routeSample, sampleIssues,
  sampleSummary, ownerOf, samplesForTeam, saveDraft, saveValidationPlan, scopeBlockers, seed, teamMembers, teamOfLead, teamText, teamsOf, testLabel,
  validationProcedure, demoStorageKey, type Conditions, type DemoState, type FluidChoice, type PersonId, type RequestRow, type SampleDraft, type Team, type TeamChoice, type ValidationPlan, type Work,
} from './model';

type View = 'mywork' | 'jobs' | 'lab' | 'job';
type Tab = 'scope' | 'work' | 'requests' | 'history';
const now = () => new Date().toISOString();
const time = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const roleKey = demoStorageKey + '-role';

function load(): DemoState {
  try { const raw = localStorage.getItem(demoStorageKey); if (raw) { const v = JSON.parse(raw); if (v?.v === 1) return v; } } catch { /* storage unavailable */ }
  return seed();
}
function loadRole(): PersonId { try { const r = localStorage.getItem(roleKey); if (r && person(r)) return r as PersonId; } catch { /* ignore */ } return 'SALIM'; }

const Chip = ({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'bad' | 'pvt' | 'chem' | 'neutral' | 'info'; children: ReactNode }) => <span className={'chip chip-' + tone}>{children}</span>;
const TeamTag = ({ team }: { team: Team }) => <Chip tone={team === 'PVT' ? 'pvt' : 'chem'}>{team}</Chip>;
function Choice<T extends string>({ value, options, onChange, disabled, label }: { value: T | ''; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return <div className="choice-row" role="radiogroup" aria-label={label}>{options.map((o) => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={'choice' + (value === o.value ? ' on' : '')} disabled={disabled} onClick={() => onChange(o.value)}>{value === o.value && <Check size={14} aria-hidden="true" />}{o.label}</button>)}</div>;
}
const statusTone = (s: Work['status']) => (s === 'QC approved' ? 'ok' : s === 'Returned' ? 'bad' : s === 'Under team-lead review' || s === 'Awaiting QC' ? 'info' : 'neutral');

function App() {
  const [st, setSt] = useState<DemoState>(load);
  const [role, setRole] = useState<PersonId>(loadRole);
  const [view, setView] = useState<View>('mywork');
  const [tab, setTab] = useState<Tab>('scope');
  const [labTeam, setLabTeam] = useState<Team>('PVT');
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { try { localStorage.setItem(demoStorageKey, JSON.stringify(st)); } catch { /* ignore */ } }, [st]);
  useEffect(() => { try { localStorage.setItem(roleKey, role); } catch { /* ignore */ } }, [role]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); }, [toast]);

  const me = person(role)!;
  const run = (fn: (s: DemoState) => DemoState, ok?: string) => { try { const next = fn(st); setSt(next); if (ok) setToast({ text: ok }); return true; } catch (e) { setToast({ text: e instanceof Error ? e.message : String(e), bad: true }); return false; } };
  const edit = (fn: (s: DemoState) => DemoState) => setSt((s) => ({ ...fn(s), scope: { ...s.scope, dirty: true } }));
  const openJob = (t: Tab, team?: Team, form?: boolean) => { setView('job'); setTab(t); if (team) setLabTeam(team); if (form) setRequestOpen(true); setMenuOpen(false); window.scrollTo(0, 0); };
  const switchRole = (id: PersonId) => { setRole(id); setView('mywork'); setReviewOpen(false); setRequestOpen(false); const p = person(id); if (p?.team) setLabTeam(p.team); };
  const [confirmReset, setConfirmReset] = useState(false);
  const reset = () => { setConfirmReset(false); setSt(seed()); setRole('SALIM'); setView('mywork'); setTab('scope'); setReviewOpen(false); setRequestOpen(false); setToast({ text: 'Demo reset. DEMO-26-0412 is back to “ready for scoping”.' }); };

  const nav: [View | 'off', string, typeof LayoutDashboard][] = [['mywork', 'My work', LayoutDashboard], ['jobs', 'Jobs', BriefcaseBusiness], ['off', 'Sampling', FlaskConical], ['lab', 'Laboratory', ListChecks], ['off', 'Inventory', PackageSearch], ['off', 'Settings', Settings]];
  const here = view === 'job' ? 'jobs' : view;
  const badge = myWorkCount(st, role);
  const crumb = view === 'job' ? st.job.id : view === 'mywork' ? 'My work' : view === 'jobs' ? 'Jobs' : 'Laboratory';

  return <div className="app-shell">
    <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
      <div className="brand"><img className="brand-logo" src={logoUrl} alt="VAPS" /><small>PVT Lab &amp; Sampling</small></div>
      <nav aria-label="Primary navigation"><p className="nav-label">WORKSPACE</p>
        {nav.map(([v, label, Icon]) => <button key={label} type="button" className={'nav-item' + (here === v ? ' active' : '') + (v === 'off' ? ' off' : '')} disabled={v === 'off'} title={v === 'off' ? 'Not part of this demo' : undefined} onClick={() => { if (v !== 'off') { setView(v); setMenuOpen(false); } }}>
          <span className="nav-icon" aria-hidden="true"><Icon size={19} strokeWidth={1.8} /></span>{label}{v === 'mywork' && badge > 0 && <span className="nav-badge">{badge}</span>}{v === 'off' && <em>not in demo</em>}
        </button>)}
      </nav>
      <div className="sidebar-card"><span className="status-dot" /><div><strong>Scope demo · fictional data</strong><small>Separate from VAPS records</small></div></div>
    </aside>
    {menuOpen && <button type="button" className="scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <main>
      <header className="topbar">
        <button className="menu-button" type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
        <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{crumb}</strong></div>
        <span className="local-pill"><span className="status-dot" /> Demo<span className="pill-long"> · not saved to VAPS</span></span>
      </header>
      <section className="demo-bar" aria-label="Demo role switcher">
        <div className="demo-bar-label"><strong>DEMO</strong><span>View as</span></div>
        <div className="role-buttons">
          {(['SALIM', 'SHEREIQI', 'BAHRI'] as PersonId[]).map((id) => <button key={id} type="button" className={'role' + (role === id ? ' on' : '')} aria-pressed={role === id} onClick={() => switchRole(id)}><b>{nameOf(id).split(' ').slice(0, id === 'BAHRI' ? 2 : 1).join(' ')}</b><small>{person(id)!.title}</small></button>)}
          <label className={'role role-select' + (!['SALIM', 'SHEREIQI', 'BAHRI'].includes(role) ? ' on' : '')}><small>Team member</small>
            <select aria-label="Team member" value={['SALIM', 'SHEREIQI', 'BAHRI'].includes(role) ? '' : role} onChange={(e) => e.target.value && switchRole(e.target.value as PersonId)}>
              <option value="">Choose…</option>{people.filter((p) => !['SALIM', 'SHEREIQI', 'BAHRI'].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}
            </select></label>
        </div>
        {confirmReset ? <div className="reset-confirm" role="group" aria-label="Confirm reset"><span>Clear all demo changes?</span><button type="button" className="reset danger" onClick={reset}>Reset</button><button type="button" className="reset" onClick={() => setConfirmReset(false)}>Cancel</button></div>
          : <button type="button" className="reset" onClick={() => setConfirmReset(true)}><RotateCcw size={15} /> Reset demo</button>}
      </section>
      <div className="page-wrap">
        {view === 'mywork' && <MyWork st={st} role={role} openJob={openJob} />}
        {view === 'jobs' && <Jobs st={st} openJob={() => openJob(role === 'SALIM' ? 'scope' : 'work', me.team)} />}
        {view === 'lab' && <Laboratory st={st} team={labTeam} setTeam={setLabTeam} openJob={openJob} />}
        {view === 'job' && <>
          <JobHeader st={st} />
          <div className="tabs" role="tablist">
            {([['scope', 'Scope of Work'], ['work', 'Lab work'], ['requests', `Additional work${st.requests.length ? ` · ${st.requests.length}` : ''}`], ['history', 'History']] as [Tab, string][]).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}
          </div>
          {tab === 'scope' && <ScopeTab st={st} role={role} edit={edit} onSave={() => run((s) => saveDraft(s, now()), 'Draft saved. Nothing is sent to the leads until you release.')} onReview={() => setReviewOpen(true)} onRequest={() => { setTab('requests'); setRequestOpen(true); }} />}
          {tab === 'work' && <WorkTab st={st} role={role} team={labTeam} setTeam={setLabTeam} run={run} />}
          {tab === 'requests' && <RequestsTab st={st} role={role} open={requestOpen} setOpen={setRequestOpen} run={run} />}
          {tab === 'history' && <History st={st} />}
        </>}
      </div>
    </main>
    {reviewOpen && <ReviewDialog st={st} onClose={() => setReviewOpen(false)} onRelease={() => { if (run((s) => release(s, now()), 'Scope released. Ahmed and Al Yaqdhan now see their work in My work.')) setReviewOpen(false); }} />}
    {toast && <div className={'toast' + (toast.bad ? ' bad' : '')} role="status">{toast.text}<button type="button" aria-label="Dismiss" onClick={() => setToast(null)}><X size={14} /></button></div>}
  </div>;
}

function myWorkCount(st: DemoState, role: PersonId) {
  if (role === 'SALIM') return st.scope.status === 'Draft' ? 1 : 0;
  const team = teamOfLead(role);
  if (team) { const s = leadSummary(st, team); return s && (s.planning.length || s.unassigned || s.review || s.qc) ? 1 : 0; }
  return myAssignments(st, role).filter((w) => w.status === 'In progress' || w.status === 'Returned').length;
}

/* ---------------- My work / Jobs / Laboratory ---------------- */

function MyWork({ st, role, openJob }: { st: DemoState; role: PersonId; openJob: (t: Tab, team?: Team, form?: boolean) => void }) {
  const p = person(role)!, team = teamOfLead(role);
  return <>
    <section className="page-intro"><div><span className="eyebrow">MY WORK</span><h1>{p.name}</h1><p>{p.title}{p.team && !team ? ` · ${p.team} team` : ''}</p></div></section>
    {role === 'SALIM' && <SalimWork st={st} openJob={openJob} />}
    {team && <LeadEntry st={st} team={team} openJob={openJob} />}
    {!team && role !== 'SALIM' && <MemberWork st={st} role={role} openJob={openJob} />}
  </>;
}
function SalimWork({ st, openJob }: { st: DemoState; openJob: (t: Tab, team?: Team, form?: boolean) => void }) {
  const ready = st.samples.filter((s) => !sampleIssues(s).length).length;
  if (st.scope.status === 'Draft') return <section className="panel"><h2 className="list-title">Do now</h2>
    <button type="button" className="work-entry" onClick={() => openJob('scope')}><div><strong>{st.job.id} · {st.job.client}</strong><span>Laboratory scope · {st.samples.length} samples received · {ready} of {st.samples.length} ready</span></div><Chip tone="warn">{st.scope.dirty ? 'Unsaved changes' : st.scope.savedAt ? 'Draft saved' : 'Ready for scoping'}</Chip><ChevronRight size={18} /></button></section>;
  return <section className="panel"><h2 className="list-title">Waiting on others</h2>
    <button type="button" className="work-entry" onClick={() => openJob('scope')}><div><strong>{st.job.id} · Scope released {time(st.scope.released?.at)}</strong><span>{nextActors(st).join(' · ')}</span></div><Chip tone="ok">Released</Chip><ChevronRight size={18} /></button>
    {st.requests.length > 0 && <><h3 className="sub-title">Additional requests</h3>{st.requests.map((r) => <button type="button" key={r.id} className="work-entry slim" onClick={() => openJob('requests')}><div><strong>{r.id} · {r.sampleId} · {r.label}</strong><span>{teamText(r.route)} · {requestStatus(st, r)}</span></div><ChevronRight size={18} /></button>)}</>}
    <div className="entry-actions"><button type="button" className="outline-button" onClick={() => openJob('requests', undefined, true)}><Plus size={15} /> Request additional work</button></div></section>;
}
function LeadEntry({ st, team, openJob }: { st: DemoState; team: Team; openJob: (t: Tab, team?: Team) => void }) {
  const s = leadSummary(st, team);
  if (!s) return <section className="panel empty-state"><h2>No {team} work yet</h2><p>{st.scope.status === 'Draft' ? 'Salim has not released the laboratory scope. Your work appears here after release.' : `No sample in ${st.job.id} has ${team} work.`}</p></section>;
  const open = s.planning.length + s.unassigned + s.review + s.qc;
  return <section className="panel"><h2 className="list-title">{open ? 'Do now' : 'My jobs'}</h2>
    <button type="button" className="work-entry" onClick={() => openJob('work', team)}>
      <div><strong>{st.job.id} · {team} work · {s.samples.join(', ')}</strong>
        <span>{[s.planning.length ? `Plan Validation: ${s.planning.join(', ')}` : '', s.unassigned ? `${s.unassigned} need assignment` : '', s.review ? `${s.review} to review` : '', s.qc ? `${s.qc} awaiting QC` : ''].filter(Boolean).join(' · ') || `All ${s.total} ${team} items assigned`}</span></div>
      <Chip tone={open ? 'warn' : 'ok'}>{open ? `${open} to act on` : 'Up to date'}</Chip><ChevronRight size={18} /></button>
    <p className="hint">One entry per job. It opens directly on your team’s work.</p></section>;
}
function MemberWork({ st, role, openJob }: { st: DemoState; role: PersonId; openJob: (t: Tab, team?: Team) => void }) {
  const mine = myAssignments(st, role);
  if (!mine.length) return <section className="panel empty-state"><h2>No assignments yet</h2><p>Your team lead assigns tests after the scope is released. Switch to Ahmed or Al Yaqdhan to assign work to {nameOf(role)}.</p></section>;
  return <section className="panel"><h2 className="list-title">My assignments</h2>
    {mine.map((w) => <button type="button" key={w.id} className="work-entry slim" onClick={() => openJob('work', w.team)}><div><strong>{st.job.id} · {w.sampleId} · {w.kind === 'validation' ? 'Validation · ' : ''}{w.title}</strong><span>{w.team}{w.outsourced ? ` · External coordination · ${w.outsourced.provider}` : ''}{w.source !== 'Original' ? ` · ${w.source}` : ''}</span></div><Chip tone={statusTone(w.status)}>{w.status}</Chip><ChevronRight size={18} /></button>)}</section>;
}
function Jobs({ st, openJob }: { st: DemoState; openJob: () => void }) {
  return <><section className="page-intro"><div><span className="eyebrow">JOBS</span><h1>Jobs</h1><p>The demo contains one fictional job.</p></div></section>
    <section className="panel table-panel"><button type="button" className="job-row" onClick={openJob}><span className="mono">{st.job.id}</span><span>{st.job.client}</span><span>{st.job.field} · {st.job.well}</span><span>{st.samples.length} samples</span><Chip tone={st.scope.status === 'Released' ? 'ok' : 'warn'}>{st.scope.status === 'Released' ? 'Scope released' : 'Ready for lab scoping'}</Chip></button></section></>;
}
function Laboratory({ st, team, setTeam, openJob }: { st: DemoState; team: Team; setTeam: (t: Team) => void; openJob: (t: Tab, team?: Team) => void }) {
  const s = leadSummary(st, team);
  return <><section className="page-intro"><div><span className="eyebrow">LABORATORY</span><h1>{team} queue</h1><p>Jobs with released {team} work.</p></div></section>
    <Choice label="Team" value={team} onChange={setTeam} options={[{ value: 'PVT', label: 'PVT' }, { value: 'Chemical', label: 'Chemical' }]} />
    {s ? <section className="panel"><button type="button" className="work-entry" onClick={() => openJob('work', team)}><div><strong>{st.job.id} · {s.samples.join(', ')}</strong><span>{s.total} {team} items · {s.unassigned} need assignment{s.planning.length ? ` · Validation to plan: ${s.planning.join(', ')}` : ''}</span></div><ChevronRight size={18} /></button></section>
      : <section className="panel empty-state"><h2>Queue is empty</h2><p>{st.scope.status === 'Draft' ? 'Nothing is released yet.' : `No ${team} work.`}</p></section>}</>;
}

/* ---------------- Job header ---------------- */

function JobHeader({ st }: { st: DemoState }) {
  const c = st.conditions;
  return <section className="job-head">
    <div className="job-id"><small>JOB</small><strong>{st.job.id}</strong></div>
    <dl>
      <div><dt>Client</dt><dd>{st.job.client}</dd></div>
      <div><dt>Field / well</dt><dd>{st.job.field} · {st.job.well}</dd></div>
      <div><dt>Samples</dt><dd>{st.samples.length} received</dd></div>
      <div><dt>Reservoir</dt><dd>{c.pressure ? `${c.pressure} ${c.pressureUnit}` : 'P not provided'} · {c.temperature ? `${c.temperature} ${c.temperatureUnit}` : 'T not provided'}</dd></div>
    </dl>
    <Chip tone={st.scope.status === 'Released' ? 'ok' : 'warn'}>{st.scope.status === 'Released' ? 'Scope released' : 'Scope draft'}</Chip>
  </section>;
}

/* ---------------- Scope of Work ---------------- */

function ScopeTab({ st, role, edit, onSave, onReview, onRequest }: { st: DemoState; role: PersonId; edit: (fn: (s: DemoState) => DemoState) => void; onSave: () => void; onReview: () => void; onRequest: () => void }) {
  const editable = role === 'SALIM' && st.scope.status === 'Draft';
  const [open, setOpen] = useState<Set<string>>(() => new Set([st.samples[0]?.id]));
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setSample = (id: string, fn: (s: SampleDraft) => SampleDraft) => edit((s) => ({ ...s, samples: s.samples.map((x) => (x.id === id ? fn(x) : x)) }));
  const setCond = (patch: Partial<Conditions>) => edit((s) => ({ ...s, conditions: { ...s.conditions, ...patch } }));
  const blockers = scopeBlockers(st).filter((b) => b.issues.length);
  const released = st.scope.status === 'Released';
  return <>
    {released && <section className="release-banner"><div><strong>Scope released · v1 · {time(st.scope.released?.at)} by Salim Al Maqbali</strong><span>Next: {nextActors(st).join(' · ')}</span></div>{role === 'SALIM' && <button type="button" className="primary-button" onClick={onRequest}><Plus size={15} /> Request additional work</button>}</section>}
    {!released && role !== 'SALIM' && <p className="notice">Salim is preparing this scope. You can view it; your work appears after release.</p>}
    <section className="panel conditions">
      <div className="cond-grid">
        <label><span>Reservoir pressure <em>optional</em></span><div className="unit-input"><input inputMode="decimal" placeholder="Not provided" value={st.conditions.pressure} disabled={!editable} onChange={(e) => setCond({ pressure: e.target.value })} /><select aria-label="Pressure unit" value={st.conditions.pressureUnit} disabled={!editable} onChange={(e) => setCond({ pressureUnit: e.target.value })}>{['psi', 'psia', 'psig', 'bar', 'kPa'].map((u) => <option key={u}>{u}</option>)}</select></div></label>
        <label><span>Reservoir temperature <em>optional</em></span><div className="unit-input"><input inputMode="decimal" placeholder="Not provided" value={st.conditions.temperature} disabled={!editable} onChange={(e) => setCond({ temperature: e.target.value })} /><select aria-label="Temperature unit" value={st.conditions.temperatureUnit} disabled={!editable} onChange={(e) => setCond({ temperatureUnit: e.target.value })}>{['°C', '°F', 'K'].map((u) => <option key={u}>{u}</option>)}</select></div></label>
        <label className="notes"><span>Lab notes for this job</span><textarea rows={2} placeholder="Instructions for both teams (optional)" value={st.notes} disabled={!editable} onChange={(e) => edit((s) => ({ ...s, notes: e.target.value }))} /></label>
      </div>
      <p className="hint">Can stay blank at scoping. If Restoration is planned, Ahmed must enter numeric values when he saves the Validation plan.</p>
    </section>
    <div className="sample-list">
      {st.samples.map((s) => <SampleCard key={s.id} s={s} open={open.has(s.id)} onToggle={() => toggle(s.id)} editable={editable} set={(fn) => setSample(s.id, fn)} />)}
    </div>
    {editable && <div className="action-bar">
      <span className={st.scope.dirty ? 'dirty' : ''}>{st.scope.dirty ? 'Unsaved changes' : st.scope.savedAt ? `Draft saved ${time(st.scope.savedAt)}` : 'No changes yet'}{blockers.length ? ` · ${blockers.length} sample${blockers.length === 1 ? '' : 's'} ${blockers.length === 1 ? 'needs' : 'need'} information` : ' · all samples ready'}</span>
      <button type="button" className="outline-button" onClick={onSave}>Save draft</button>
      <button type="button" className="primary-button" onClick={onReview}>Review and release</button>
    </div>}
  </>;
}

function SampleCard({ s, open, onToggle, editable, set }: { s: SampleDraft; open: boolean; onToggle: () => void; editable: boolean; set: (fn: (s: SampleDraft) => SampleDraft) => void }) {
  const sum = sampleSummary(s);
  const cat = catalogueFor(s.fluid);
  const teams = teamsOf(s.team);
  const shown = new Set([...(teams.includes('PVT') ? cat.pvt : []), ...(teams.includes('Chemical') ? cat.chemical : []), ...cat.other].map((t) => t.id));
  const hidden = s.tests.filter((id) => !shown.has(id));
  const [more, setMore] = useState(false);
  const outsourcedCount = Object.keys(s.outsourced).length, extra = s.custom.length + s.tests.filter((id) => cat.other.some((t) => t.id === id)).length;
  const toggleTest = (id: string) => set((x) => { const on = x.tests.includes(id); const outsourced = { ...x.outsourced }; if (on) delete outsourced[id]; return { ...x, tests: on ? x.tests.filter((t) => t !== id) : [...x.tests, id], outsourced }; });
  const testGroup = (title: string, team: Team, list: ReturnType<typeof catalogueFor>['pvt']) => <div className={'test-group ' + (team === 'PVT' ? 'g-pvt' : 'g-chem')}>
    <h4>{title}<span>{team === 'PVT' ? 'to Ahmed Al Shereiqi' : 'to Al Yaqdhan Al Bahri'}</span></h4>
    {list.map((t) => <label key={t.id} className={'test-row' + (s.tests.includes(t.id) ? ' on' : '')}><input type="checkbox" checked={s.tests.includes(t.id)} disabled={!editable} onChange={() => toggleTest(t.id)} /><span>{t.name}{t.method && <em>{t.method}</em>}</span>{s.tests.includes(t.id) && <TeamTag team={team} />}{s.outsourced[t.id] && <Chip tone="info">Outsourced</Chip>}</label>)}
  </div>;
  return <article className={'sample-card' + (open ? ' open' : '')}>
    <button type="button" className="sample-head" aria-expanded={open} onClick={onToggle}>
      {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      <span className="summary-line">{sum.parts.map((p, i) => <span key={i} className={i === 0 ? 'sid' : ''}>{p}</span>)}{outsourcedCount > 0 && <span>{outsourcedCount} outsourced</span>}</span>
      <Chip tone={sum.ready ? 'ok' : 'warn'}>{sum.ready ? 'Ready' : sum.status}</Chip>
    </button>
    {open && <div className="sample-body">
      <p className="container-line">{s.container}</p>
      <section className="q"><h3><b>1</b> Fluid type</h3>
        <Choice label="Fluid type" value={s.fluid} disabled={!editable} onChange={(v) => set((x) => ({ ...x, fluid: v as FluidChoice }))} options={[...fluidOptions.map((f) => ({ value: f as FluidChoice, label: f })), { value: 'custom' as FluidChoice, label: '+ Add another' }]} />
        {s.fluid === 'custom' && <label className="inline-field"><span>Custom fluid type</span><input placeholder="e.g. Volatile Oil" value={s.customFluid} disabled={!editable} onChange={(e) => set((x) => ({ ...x, customFluid: e.target.value }))} /><small>Fluid tests are shown for both methods; choose the one that applies.</small></label>}
      </section>
      <section className="q"><h3><b>2</b> Responsible team</h3>
        <Choice label="Responsible team" value={s.team} disabled={!editable} onChange={(v) => set((x) => ({ ...x, team: v }))} options={[{ value: 'PVT', label: 'PVT' }, { value: 'Chemical', label: 'Chemical' }, { value: 'Both', label: 'Both' }]} />
      </section>
      <section className="q"><h3><b>3</b> Validation required?</h3>
        <Choice label="Validation required?" value={s.validation === null ? '' : s.validation ? 'yes' : 'no'} disabled={!editable} onChange={(v) => set((x) => ({ ...x, validation: v === 'yes' }))} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        {pvtAddedForValidation(s) ? <p className="side-note pvt"><b>PVT added for Validation.</b> Ahmed Al Shereiqi plans and assigns the Validation steps. The other tests stay with Chemical.</p>
          : s.validation ? <p className="side-note">Ahmed Al Shereiqi selects the applicable steps (Opening Pressure → Recombination) after release.</p> : null}
      </section>
      <section className="q"><h3><b>4</b> Required tests</h3>
        {s.validation && <div className="validation-line"><Check size={15} /> Validation <span>PVT procedure · steps chosen by Ahmed</span><TeamTag team="PVT" /></div>}
        {!teams.length ? <p className="empty">Choose the responsible team to see the tests.</p> : <div className={'test-groups' + (teams.length > 1 ? ' two' : '')}>
          {teams.includes('PVT') && testGroup('PVT Tests', 'PVT', cat.pvt)}
          {teams.includes('Chemical') && testGroup('Chemical Tests', 'Chemical', cat.chemical)}
        </div>}
        {hidden.length > 0 && <div className="mismatch">{hidden.map((id) => <p key={id}>{testLabel(id)} is selected but not offered for {teamText(s.team)}.{editable && <button type="button" className="text-button" onClick={() => toggleTest(id)}>Remove</button>}</p>)}</div>}
      </section>
      <section className="q"><button type="button" className="more-toggle" aria-expanded={more} onClick={() => setMore(!more)}>{more ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<b>5</b> Other tests and outsourcing<span>{[extra ? `${extra} other` : '', outsourcedCount ? `${outsourcedCount} outsourced` : ''].filter(Boolean).join(' · ') || 'none'}</span></button>
        {more && <OtherAndOutsourcing s={s} editable={editable} set={set} />}
      </section>
      {sampleIssues(s).length > 0 && <ul className="issues">{sampleIssues(s).map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>}
  </article>;
}

function OtherAndOutsourcing({ s, editable, set }: { s: SampleDraft; editable: boolean; set: (fn: (s: SampleDraft) => SampleDraft) => void }) {
  const cat = catalogueFor(s.fluid), teams = teamsOf(s.team);
  const ownerOptions = (teams.length ? teams : (['PVT', 'Chemical'] as Team[]));
  const items = [...s.tests.map((id) => ({ key: id, label: testLabel(id), team: ownerOf(s, id) })), ...s.custom.map((c) => ({ key: 'custom:' + c.id, label: c.name || 'Unnamed test', team: c.owner || undefined }))];
  return <div className="more-body">
    <h4>Other tests</h4>
    {cat.other.map((t) => <div key={t.id} className="other-row"><label><input type="checkbox" checked={s.tests.includes(t.id)} disabled={!editable} onChange={() => set((x) => ({ ...x, tests: x.tests.includes(t.id) ? x.tests.filter((i) => i !== t.id) : [...x.tests, t.id] }))} /> {t.name} <em>catalogue · no default team</em></label>
      {s.tests.includes(t.id) && <select aria-label={`Owner for ${t.name}`} value={s.owners[t.id] || ''} disabled={!editable} onChange={(e) => set((x) => ({ ...x, owners: { ...x.owners, [t.id]: e.target.value as Team } }))}><option value="">Owner…</option>{ownerOptions.map((o) => <option key={o}>{o}</option>)}</select>}</div>)}
    {s.custom.map((c) => <div key={c.id} className="other-row custom"><input aria-label="Custom test name" placeholder="Custom test name" value={c.name} disabled={!editable} onChange={(e) => set((x) => ({ ...x, custom: x.custom.map((y) => (y.id === c.id ? { ...y, name: e.target.value } : y)) }))} />
      <select aria-label="Owner" value={c.owner} disabled={!editable} onChange={(e) => set((x) => ({ ...x, custom: x.custom.map((y) => (y.id === c.id ? { ...y, owner: e.target.value as Team } : y)) }))}><option value="">Owner…</option>{ownerOptions.map((o) => <option key={o}>{o}</option>)}</select>
      {editable && <button type="button" className="icon-btn" aria-label="Remove custom test" onClick={() => set((x) => { const o = { ...x.outsourced }; delete o['custom:' + c.id]; return { ...x, custom: x.custom.filter((y) => y.id !== c.id), outsourced: o }; })}><Trash2 size={15} /></button>}</div>)}
    {editable && <button type="button" className="text-button add" onClick={() => set((x) => ({ ...x, custom: [...x.custom, { id: Date.now().toString(36), name: '', owner: teams.length === 1 ? teams[0] : '' }] }))}><Plus size={14} /> Add custom test</button>}
    <h4>Outsourcing</h4>
    {!items.length ? <p className="empty">Select a test first. Any selected test can be sent to a third-party lab.</p> : items.map((i) => { const o = s.outsourced[i.key]; return <div key={i.key} className={'out-row' + (o ? ' on' : '')}>
      <label><input type="checkbox" checked={!!o} disabled={!editable} onChange={() => set((x) => { const n = { ...x.outsourced }; if (n[i.key]) delete n[i.key]; else n[i.key] = { provider: '', coordinator: '' }; return { ...x, outsourced: n }; })} /> {i.label} {i.team && <TeamTag team={i.team} />}</label>
      {o && <div className="out-fields">
        <input aria-label="Provider" placeholder="Third-party provider" value={o.provider} disabled={!editable} onChange={(e) => set((x) => ({ ...x, outsourced: { ...x.outsourced, [i.key]: { ...o, provider: e.target.value } } }))} />
        <select aria-label="Internal coordinator" value={o.coordinator} disabled={!editable} onChange={(e) => set((x) => ({ ...x, outsourced: { ...x.outsourced, [i.key]: { ...o, coordinator: e.target.value } } }))}><option value="">Coordinator: lead assigns after release</option>{(i.team ? teamMembers(i.team) : people.filter((p) => p.team)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <small>The coordinator is the internal person accountable for dispatch and results.</small></div>}
    </div>; })}
  </div>;
}

function ReviewDialog({ st, onClose, onRelease }: { st: DemoState; onClose: () => void; onRelease: () => void }) {
  const ready = canRelease(st), blockers = scopeBlockers(st);
  const totals = st.samples.map(routeSample).reduce((a, r) => ({ pvt: a.pvt + r.pvt.length + (r.validation ? 1 : 0), chem: a.chem + r.chemical.length, out: a.out + r.outsourced.length }), { pvt: 0, chem: 0, out: 0 });
  return <div className="backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <header><div><span className="eyebrow">REVIEW BEFORE RELEASE</span><h2 id="review-title">{st.job.id} · what each lead receives</h2><p>{totals.pvt} to Ahmed Al Shereiqi (PVT) · {totals.chem} to Al Yaqdhan Al Bahri (Chemical) · {totals.out} outsourced</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
      <div className="dialog-body">
        {st.samples.map((s) => { const r = routeSample(s), b = blockers.find((x) => x.sampleId === s.id)!; const sum = sampleSummary(s); return <article key={s.id} className={'review-sample' + (b.issues.length ? ' blocked' : '')}>
          <h3><span className="sid">{s.id}</span> {fluidLabel(s)} · {sum.parts[2]}<Chip tone={b.issues.length ? 'warn' : 'ok'}>{b.issues.length ? 'Missing information' : 'Ready'}</Chip></h3>
          {b.issues.length > 0 && <ul className="issues">{b.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
          <div className="route-cols">
            <div className="route pvt"><h4>PVT · Ahmed Al Shereiqi</h4>{!r.validation && !r.pvt.length ? <p className="empty">Nothing for PVT</p> : <ul>{r.validation && <li><b>Validation</b> <em>Ahmed selects the steps</em></li>}{r.pvt.map((i) => <li key={i.key}>{i.label}{i.outsourced && <em> · outsourced</em>}</li>)}</ul>}</div>
            <div className="route chem"><h4>Chemical · Al Yaqdhan Al Bahri</h4>{!r.chemical.length ? <p className="empty">Nothing for Chemical</p> : <ul>{r.chemical.map((i) => <li key={i.key}>{i.label}{i.outsourced && <em> · outsourced</em>}</li>)}</ul>}</div>
            <div className="route out"><h4>Outsourced</h4>{!r.outsourced.length ? <p className="empty">None</p> : <ul>{r.outsourced.map((i) => <li key={i.key}>{i.label}<em> · {i.outsourced!.provider || 'provider missing'} · coordinator {i.outsourced!.coordinator ? nameOf(i.outsourced!.coordinator) : `to be assigned by ${nameOf(leadOf[i.team])}`}</em></li>)}</ul>}</div>
          </div>
          {b.notes.map((n) => <p key={n} className="side-note">{n}</p>)}
        </article>; })}
      </div>
      <footer><span>{ready ? 'After release: the scope is locked and each lead gets one job entry in My work.' : 'Release is available when every sample is ready.'}</span><button type="button" className="outline-button" onClick={onClose}>Back to editing</button><button type="button" className="primary-button" disabled={!ready} onClick={onRelease}>Release scope</button></footer>
    </section>
  </div>;
}

/* ---------------- Lab work ---------------- */

function WorkTab({ st, role, team, setTeam, run }: { st: DemoState; role: PersonId; team: Team; setTeam: (t: Team) => void; run: (fn: (s: DemoState) => DemoState, ok?: string) => boolean }) {
  if (st.scope.status !== 'Released') return <section className="panel empty-state"><h2>No laboratory work yet</h2><p>Work is created when Salim releases the scope.</p></section>;
  const lead = leadOf[team] === role;
  const ids = samplesForTeam(st, team), others = st.samples.filter((s) => !ids.includes(s.id)).map((s) => s.id);
  const mine = myAssignments(st, role);
  return <>
    {!teamOfLead(role) && role !== 'SALIM' && mine.length > 0 && <section className="panel"><h2 className="list-title">Your assignments</h2><WorkTable rows={mine} role={role} run={run} showSample /></section>}
    <div className="work-head"><Choice label="Team" value={team} onChange={setTeam} options={[{ value: 'PVT', label: 'PVT work' }, { value: 'Chemical', label: 'Chemical work' }]} />
      <span>{lead ? `You assign ${team} work. Choose any listed person, including yourself.` : `${nameOf(leadOf[team])} assigns ${team} work.`}</span></div>
    {ids.map((id) => { const s = st.samples.find((x) => x.id === id)!; const tests = st.work.filter((w) => w.sampleId === id && w.team === team && w.kind === 'test'); const plans = team === 'PVT' ? plansFor(st, id) : [];
      return <section key={id} className="panel work-sample"><h3><span className="sid">{id}</span> {fluidLabel(s)} · {pvtAddedForValidation(s) && team === 'PVT' ? 'Validation only (Chemical sample)' : teamText(s.team)}</h3>
        {team === 'Chemical' && s.validation && <p className="hint">Validation for this sample is with PVT (Ahmed Al Shereiqi).</p>}
        {plans.map((p) => <ValidationCard key={p.id + (p.plannedAt || '') + st.work.filter((w) => w.planId === p.id).map((w) => w.assignee + w.status).join()} st={st} plan={p} editable={lead} role={role} run={run} />)}
        {tests.length > 0 && <WorkTable rows={tests} role={role} run={run} assignable={lead} />}
      </section>; })}
    {others.length > 0 && <p className="hint">No {team} work on {others.join(', ')}.</p>}
  </>;
}

function AssignSelect({ w, team, value, onChange, disabled }: { w?: Work; team: Team; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const lead = leadOf[team];
  return <select aria-label={w ? `Assign ${w.title}` : 'Assign'} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
    <option value="">Needs assignment…</option>
    <optgroup label={`${team} team`}>{teamMembers(team).map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === lead ? ' (you)' : ''}</option>)}</optgroup>
    <optgroup label="Other employees">{people.filter((p) => p.team && p.team !== team).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
  </select>;
}

function WorkTable({ rows, role, run, assignable, showSample }: { rows: Work[]; role: PersonId; run: (fn: (s: DemoState) => DemoState, ok?: string) => boolean; assignable?: boolean; showSample?: boolean }) {
  return <div className="work-table">{rows.map((w) => { const locked = !['Not assigned', 'In progress', 'Returned'].includes(w.status);
    return <div key={w.id} className="work-row">
      <div className="w-title"><strong>{showSample ? `${w.sampleId} · ` : ''}{w.kind === 'validation' ? 'Validation · ' : ''}{w.title}</strong><span>{w.source === 'Original' ? 'Original scope' : `Additional · ${w.source}`}{w.outsourced ? ` · Outsourced · ${w.outsourced.provider}` : ''}</span></div>
      <div className="w-assign">{assignable && !locked ? <AssignSelect w={w} team={w.team} value={w.assignee} onChange={(v) => run((s) => assign(s, w.id, v, role, now()), v ? `${w.title} assigned to ${nameOf(v)}.` : undefined)} /> : <span>{w.assignee ? nameOf(w.assignee) : '—'}{w.outsourced && w.assignee ? ' (coordinator)' : ''}</span>}</div>
      <Chip tone={w.assignee ? 'ok' : 'warn'}>{assignmentLabel(w)}</Chip>
      <Chip tone={statusTone(w.status)}>{w.status}</Chip>
      <RowActions w={w} role={role} run={run} />
    </div>; })}</div>;
}

function RowActions({ w, role, run }: { w: Work; role: PersonId; run: (fn: (s: DemoState) => DemoState, ok?: string) => boolean }) {
  const lead = leadOf[w.team] === role;
  const b: ReactNode[] = [];
  if (w.assignee === role && (w.status === 'In progress' || w.status === 'Returned')) b.push(<button key="s" type="button" className="mini primary" onClick={() => run((s) => act(s, w.id, 'submit', role, now()), `Submitted. ${nameOf(leadOf[w.team])} reviews it next.`)}>{w.outsourced ? 'Submit results' : 'Submit workbook'}</button>);
  if (lead && w.status === 'Under team-lead review') b.push(<button key="a" type="button" className="mini primary" onClick={() => run((s) => act(s, w.id, 'approve', role, now()), 'Approved; now awaiting QC.')}>Approve</button>, <button key="r" type="button" className="mini" onClick={() => run((s) => act(s, w.id, 'return', role, now()), 'Returned to the assignee.')}>Return</button>);
  if (lead && w.status === 'Awaiting QC') b.push(<button key="q" type="button" className="mini" title="QC is not configured in this demo" onClick={() => run((s) => act(s, w.id, 'qc', role, now()), 'QC approval recorded (demo).')}>Demo: QC approve</button>);
  return <div className="w-actions">{b}</div>;
}

function ValidationCard({ st, plan, editable, role, run }: { st: DemoState; plan: ValidationPlan; editable: boolean; role: PersonId; run: (fn: (s: DemoState) => DemoState, ok?: string) => boolean }) {
  const work = st.work.filter((w) => w.planId === plan.id);
  // The parent keys this card on the saved plan, so the draft below restarts from the saved steps after each save.
  const [steps, setSteps] = useState<Record<string, string | null>>(() => Object.fromEntries(validationProcedure.map((step) => { const w = work.find((x) => x.title === step); return [step, w ? w.assignee : plan.plannedAt ? null : '']; })));
  const [cond, setCond] = useState<Conditions>(st.conditions);
  const numeric = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));
  const needsPT = steps.Restoration !== null && !(numeric(st.conditions.pressure) && numeric(st.conditions.temperature));
  const assignedCount = work.filter((w) => w.assignee).length;
  return <div className="validation-card">
    <header><div><strong>Validation · {plan.sampleId}</strong><span>{plan.source === 'Original' ? 'Original scope' : `Additional · ${plan.source}`} · {plan.plannedAt ? `Plan saved ${time(plan.plannedAt)} · ${assignedCount}/${work.length} steps assigned` : 'Select the applicable steps and assign each one'}</span></div><Chip tone={plan.plannedAt ? (assignedCount === work.length ? 'ok' : 'warn') : 'warn'}>{plan.plannedAt ? (assignedCount === work.length ? 'Assigned' : 'Needs assignment') : 'Needs plan'}</Chip></header>
    <ol className="steps">{validationProcedure.map((step, i) => { const w = work.find((x) => x.title === step); const on = steps[step] !== null; const started = !!w && !['Not assigned', 'In progress'].includes(w.status);
      return <li key={step} className={on ? 'on' : 'off'}>
        <label className="step-name"><input type="checkbox" checked={on} disabled={!editable || started} onChange={() => setSteps((x) => ({ ...x, [step]: x[step] === null ? (w?.assignee || '') : null }))} /><b>{i + 1}</b> {step}</label>
        {on ? (editable && !started ? <AssignSelect team="PVT" value={steps[step] || ''} onChange={(v) => setSteps((x) => ({ ...x, [step]: v }))} /> : <span className="who">{w?.assignee ? nameOf(w.assignee) : '—'}</span>) : <span className="who muted">Not applicable</span>}
        {w ? <><Chip tone={w.assignee ? 'ok' : 'warn'}>{assignmentLabel(w)}</Chip><Chip tone={statusTone(w.status)}>{w.status}</Chip><RowActions w={w} role={role} run={run} /></> : <span className="who muted">{on && plan.plannedAt ? 'Save to add' : ''}</span>}
      </li>; })}</ol>
    {editable && <footer>
      {needsPT && <div className="pt-required"><b>Restoration needs reservoir conditions.</b>
        <div className="unit-input"><input aria-label="Reservoir pressure" inputMode="decimal" placeholder="Pressure" value={cond.pressure} onChange={(e) => setCond({ ...cond, pressure: e.target.value })} /><select aria-label="Pressure unit" value={cond.pressureUnit} onChange={(e) => setCond({ ...cond, pressureUnit: e.target.value })}>{['psi', 'psia', 'psig', 'bar', 'kPa'].map((u) => <option key={u}>{u}</option>)}</select></div>
        <div className="unit-input"><input aria-label="Reservoir temperature" inputMode="decimal" placeholder="Temperature" value={cond.temperature} onChange={(e) => setCond({ ...cond, temperature: e.target.value })} /><select aria-label="Temperature unit" value={cond.temperatureUnit} onChange={(e) => setCond({ ...cond, temperatureUnit: e.target.value })}>{['°C', '°F', 'K'].map((u) => <option key={u}>{u}</option>)}</select></div>
        <small>Saved values become the job’s reservoir conditions.</small></div>}
      <button type="button" className="text-button" onClick={() => setSteps(Object.fromEntries(validationProcedure.map((s) => [s, steps[s] ?? ''])))}>Select all</button>
      <button type="button" className="primary-button" onClick={() => run((s) => saveValidationPlan(s, plan.id, steps, needsPT ? cond : s.conditions, now()), `Validation plan saved for ${plan.sampleId}.`)}>Save Validation plan</button>
    </footer>}
  </div>;
}

/* ---------------- Additional work ---------------- */

function RequestsTab({ st, role, open, setOpen, run }: { st: DemoState; role: PersonId; open: boolean; setOpen: (v: boolean) => void; run: (fn: (s: DemoState) => DemoState, ok?: string) => boolean }) {
  const [rows, setRows] = useState<RequestRow[]>([blankRequest(st.samples[0]?.id)]);
  const [tried, setTried] = useState(false);
  const rel = st.scope.released;
  if (st.scope.status !== 'Released' || !rel) return <section className="panel empty-state"><h2>Available after release</h2><p>Additional work is requested once the original scope is released.</p></section>;
  const setRow = (i: number, patch: Partial<RequestRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = () => { setTried(true); if (rows.some((r) => requestRowIssues(r).length)) return; if (run((s) => requestAdditional(s, rows, role, now()), `${rows.length} request${rows.length === 1 ? '' : 's'} sent. Existing assignments and completed work are unchanged.`)) { setRows([blankRequest(st.samples[0]?.id)]); setTried(false); setOpen(false); } };
  return <>
    {role === 'SALIM' && !open && <div className="entry-actions left"><button type="button" className="primary-button" onClick={() => setOpen(true)}><Plus size={15} /> Request additional work</button></div>}
    {role === 'SALIM' && open && <section className="panel request-form"><h2 className="list-title">Request additional work <span>1–5 requests, each routed separately</span></h2>
      {rows.map((r, i) => { const sample = st.samples.find((s) => s.id === r.sampleId); const opts = requestOptions(sample, r.route); const sel = r.what.startsWith('custom') ? 'custom' : r.what; const issues = tried ? requestRowIssues(r) : [];
        return <div key={i} className={'req-row' + (issues.length ? ' bad' : '')}><b className="req-n">{i + 1}</b>
          <label><span>Sample</span><select value={r.sampleId} onChange={(e) => setRow(i, { sampleId: e.target.value, what: '' })}>{st.samples.map((s) => <option key={s.id} value={s.id}>{s.id} · {fluidLabel(s)}</option>)}</select></label>
          <label><span>Route to</span><select value={r.route} onChange={(e) => setRow(i, { route: e.target.value as TeamChoice, what: '' })}><option value="PVT">PVT · Ahmed</option><option value="Chemical">Chemical · Al Yaqdhan</option><option value="Both">Both teams</option></select></label>
          <label><span>Work</span><select value={sel} onChange={(e) => setRow(i, { what: e.target.value === 'custom' ? 'custom:' : e.target.value })}><option value="">Choose…</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          {sel === 'custom' && <label><span>Describe</span><input value={r.what.slice(7)} placeholder="Test or work required" onChange={(e) => setRow(i, { what: 'custom:' + e.target.value })} /></label>}
          <label className="grow"><span>Reason</span><input value={r.reason} placeholder="Why is this needed?" onChange={(e) => setRow(i, { reason: e.target.value })} /></label>
          {rows.length > 1 && <button type="button" className="icon-btn" aria-label={`Remove request ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}
          {issues.length > 0 && <p className="row-issue">{issues.join(' · ')}</p>}
        </div>; })}
      <div className="req-actions">{rows.length < 5 && <button type="button" className="text-button add" onClick={() => setRows([...rows, blankRequest(st.samples[0]?.id)])}><Plus size={14} /> Add another request ({rows.length}/5)</button>}<span /><button type="button" className="outline-button" onClick={() => { setOpen(false); setTried(false); }}>Cancel</button><button type="button" className="primary-button" onClick={submit}>Submit {rows.length} request{rows.length === 1 ? '' : 's'}</button></div>
    </section>}
    <section className="panel"><h2 className="list-title">Requests</h2>
      {!st.requests.length ? <p className="empty">No additional work has been requested.</p> : <div className="req-list">{st.requests.map((r) => <div key={r.id} className="req-item"><span className="mono">{r.id}</span><div><strong>{r.sampleId} · {r.label}</strong><span>{teamText(r.route)} · {r.reason} · {nameOf(r.by)} · {time(r.at)}</span></div><Chip tone={requestStatus(st, r) === 'Completed' ? 'ok' : requestStatus(st, r).startsWith('Assigned') ? 'info' : 'warn'}>{requestStatus(st, r)}</Chip></div>)}</div>}
    </section>
    <details className="panel released-scope"><summary>Original released scope · v1 · {time(rel.at)} (read-only)</summary>
      {rel.samples.map((s) => { const r = routeSample(s); return <div key={s.id} className="rel-row"><span className="sid">{s.id}</span><span>{fluidLabel(s)} · {teamText(s.team)}</span><span>PVT: {[r.validation ? 'Validation' : '', ...r.pvt.map((i) => i.label)].filter(Boolean).join(', ') || '—'}</span><span>Chemical: {r.chemical.map((i) => i.label).join(', ') || '—'}</span>{r.outsourced.length > 0 && <span>Outsourced: {r.outsourced.map((i) => `${i.label} (${i.outsourced!.provider})`).join(', ')}</span>}</div>; })}
      <p className="hint">Reservoir at release: {rel.conditions.pressure ? `${rel.conditions.pressure} ${rel.conditions.pressureUnit}` : 'P not provided'} · {rel.conditions.temperature ? `${rel.conditions.temperature} ${rel.conditions.temperatureUnit}` : 'T not provided'}</p>
    </details>
  </>;
}

function History({ st }: { st: DemoState }) {
  return <section className="panel"><h2 className="list-title">History</h2><ol className="log">{[...st.log].reverse().map((l, i) => <li key={i}><time>{time(l.at)}</time><span><b>{nameOf(l.by)}</b> {l.text}</span></li>)}</ol></section>;
}

createRoot(document.getElementById('root')!).render(<App />);
