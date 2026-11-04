/**
 * Laboratory Scope of Work — interactive demo model (fictional data, browser-only).
 *
 * Reuses the live app's catalogue (`app/test-catalogue.ts`), default test routing and Validation step names
 * (`app/lab-work.ts`) so test names and team ownership match the app. Everything else here is demo state:
 * nothing reads or writes the app's own `vaps-*` records.
 */
import { builtInTests, defaultRouting } from '../app/test-catalogue';
import { validationStepNames } from '../app/lab-work';

export type Team = 'PVT' | 'Chemical';
export type TeamChoice = Team | 'Both';
export type PersonId = 'SALIM' | 'SHEREIQI' | 'BAHRI' | 'NASSER' | 'RANJITH' | 'YAQEEN' | 'AHAD';
export type Person = { id: PersonId; name: string; title: string; team?: Team; initials: string };

/** Names and team membership from the app's employee directory and laboratory team defaults. */
export const people: Person[] = [
  { id: 'SALIM', name: 'Salim Al Maqbali', title: 'Scope selection', initials: 'SA' },
  { id: 'SHEREIQI', name: 'Ahmed Al Shereiqi', title: 'PVT Team Lead', team: 'PVT', initials: 'AS' },
  { id: 'BAHRI', name: 'Al Yaqdhan Al Bahri', title: 'Chemical Team Lead', team: 'Chemical', initials: 'AB' },
  { id: 'NASSER', name: 'Nasser Al Saqri', title: 'PVT team', team: 'PVT', initials: 'NS' },
  { id: 'RANJITH', name: 'Ranjith', title: 'PVT team', team: 'PVT', initials: 'R' },
  { id: 'YAQEEN', name: 'Yaqeen Al Haddabi', title: 'PVT team', team: 'PVT', initials: 'YH' },
  { id: 'AHAD', name: 'Ahad Al Aasmi', title: 'Chemical team', team: 'Chemical', initials: 'AA' },
];
export const person = (id: string) => people.find((p) => p.id === id);
export const nameOf = (id: string) => person(id)?.name || id;
export const leadOf: Record<Team, PersonId> = { PVT: 'SHEREIQI', Chemical: 'BAHRI' };
export const teamMembers = (team: Team) => people.filter((p) => p.team === team);
export const isLead = (id: string) => id === 'SHEREIQI' || id === 'BAHRI';
export const teamOfLead = (id: string): Team | undefined => (id === 'SHEREIQI' ? 'PVT' : id === 'BAHRI' ? 'Chemical' : undefined);

/* ---------------- Catalogue (from the app) ---------------- */

export const fluidOptions = ['Black Oil', 'Gas Condensate', 'Water', 'Chemical', 'OBM'] as const;
export type FluidChoice = (typeof fluidOptions)[number] | 'custom' | '';
const routing = defaultRouting();
export type CatTest = { id: string; name: string; method?: string; team?: Team };
const methodName: Record<string, string> = { 'Black Oil': 'Black Oil method', 'Gas Condensates (GC)': 'Gas Condensate method' };
const fluidGroupOf: Record<string, string> = { 'Black Oil': 'Black Oil', 'Gas Condensate': 'Gas Condensates (GC)' };
const toCat = (t: (typeof builtInTests)[number], withMethod: boolean): CatTest => ({ id: t.id, name: t.name, method: withMethod ? methodName[t.group] : undefined, team: routing[t.id] });
export const catalogue = builtInTests.filter((t) => t.name !== 'Validation');
export const catTest = (id: string) => catalogue.find((t) => t.id === id);

/** Tests for the sample: fluid tests follow the fluid type (both methods when the fluid has none of its own). */
export function catalogueFor(fluid: FluidChoice): { pvt: CatTest[]; chemical: CatTest[]; other: CatTest[] } {
  const group = fluidGroupOf[fluid];
  const fluidTests = catalogue.filter((t) => t.section === 'Fluid tests' && (!group || t.group === group)).map((t) => toCat(t, !group));
  const general = catalogue.filter((t) => t.section === 'General analysis' || t.section === 'Specialised analysis').map((t) => toCat(t, false));
  return {
    pvt: [...fluidTests.filter((t) => t.team !== 'Chemical'), ...general.filter((t) => t.team === 'PVT')],
    chemical: general.filter((t) => t.team === 'Chemical'),
    other: catalogue.filter((t) => t.section === 'Other tests').map((t) => toCat(t, false)),
  };
}
export const testLabel = (id: string) => { const t = catTest(id); if (!t) return id; return t.section === 'Fluid tests' ? `${t.name} (${methodName[t.group]})` : t.name; };

/** The Validation procedure in the app's defined order, from Opening Pressure through Recombination. */
export const validationProcedure: string[] = validationStepNames.filter((s) => s !== 'Sample Transfer');

/* ---------------- Scope draft ---------------- */

export type Outsource = { provider: string; coordinator: string };
export type CustomTest = { id: string; name: string; owner: Team | '' };
export type SampleDraft = {
  id: string; container: string; fluid: FluidChoice; customFluid: string; team: TeamChoice | ''; validation: boolean | null;
  /** Catalogue IDs. EOR-style tests with no default team carry their owner in `owners`. */
  tests: string[]; owners: Record<string, Team>; custom: CustomTest[];
  /** Keyed by catalogue ID or `custom:<id>`. */
  outsourced: Record<string, Outsource>; notes: string;
};
export type Conditions = { pressure: string; pressureUnit: string; temperature: string; temperatureUnit: string };
export type ScopeItem = { key: string; label: string; team: Team; outsourced?: Outsource };

export const teamsOf = (c: TeamChoice | ''): Team[] => (c === 'Both' ? ['PVT', 'Chemical'] : c ? [c] : []);
export const fluidLabel = (s: SampleDraft) => (s.fluid === 'custom' ? s.customFluid.trim() || 'Custom fluid' : s.fluid || 'Fluid not set');
export const ownerOf = (s: SampleDraft, id: string): Team | undefined => catTest(id)?.section === 'Other tests' ? s.owners[id] : routing[id];

/** Every selected item with the team that owns it (Validation excluded; it is a separate PVT procedure). */
export function scopeItems(s: SampleDraft): ScopeItem[] {
  const fromCatalogue = s.tests.map((id) => ({ key: id, label: testLabel(id), team: ownerOf(s, id) as Team, outsourced: s.outsourced[id] }));
  const custom = s.custom.map((c) => ({ key: 'custom:' + c.id, label: c.name.trim() || 'Unnamed test', team: c.owner as Team, outsourced: s.outsourced['custom:' + c.id] }));
  return [...fromCatalogue, ...custom];
}
export const testCount = (s: SampleDraft) => scopeItems(s).length + (s.validation ? 1 : 0);
/** Chemical-only sample that still needs PVT for Validation. */
export const pvtAddedForValidation = (s: SampleDraft) => s.team === 'Chemical' && s.validation === true;

/** Blocking problems, in the order the editor asks the questions. */
export function sampleIssues(s: SampleDraft): string[] {
  const out: string[] = [];
  if (!s.fluid) out.push('Choose the fluid type');
  if (s.fluid === 'custom' && !s.customFluid.trim()) out.push('Enter the custom fluid name');
  if (!s.team) out.push('Choose the responsible team');
  if (s.validation === null) out.push('Answer “Validation required?”');
  if (!s.tests.length && !s.custom.length && !s.validation) out.push('Select at least one test or Validation');
  const allowed = teamsOf(s.team);
  for (const id of s.tests) {
    const owner = ownerOf(s, id);
    if (!owner) out.push(`Choose the team for ${testLabel(id)}`);
    else if (s.team && !allowed.includes(owner)) out.push(`${testLabel(id)} is a ${owner} test; the sample is ${teamText(s.team)}`);
  }
  for (const c of s.custom) {
    if (!c.name.trim()) out.push('Name the custom test');
    if (!c.owner) out.push(`Choose the owner for ${c.name.trim() || 'the custom test'}`);
    else if (s.team && !allowed.includes(c.owner)) out.push(`${c.name.trim() || 'Custom test'} is owned by ${c.owner}; the sample is ${teamText(s.team)}`);
  }
  for (const item of scopeItems(s)) if (item.outsourced && !item.outsourced.provider.trim()) out.push(`Enter the provider for ${item.label}`);
  return out;
}
/** Non-blocking notes shown in review. */
export function sampleNotes(s: SampleDraft): string[] {
  return scopeItems(s).filter((i) => i.outsourced && !i.outsourced.coordinator && i.team).map((i) => `${i.label}: coordinator to be assigned by ${nameOf(leadOf[i.team])} after release`);
}
export const teamText = (c: TeamChoice | '') => (c === 'Both' ? 'PVT + Chemical' : c || 'Team not set');
export function sampleSummary(s: SampleDraft) {
  const issues = sampleIssues(s), n = testCount(s);
  const team = pvtAddedForValidation(s) ? 'Chemical + PVT Validation' : teamText(s.team);
  return { parts: [s.id, fluidLabel(s), team, s.validation ? 'Validation' : s.validation === false ? 'No Validation' : 'Validation ?', `${n} ${n === 1 ? 'test' : 'tests'}`], ready: !issues.length, status: issues.length ? issues[0] : 'Ready' };
}

/** What each lead receives for a sample, as the review shows it. */
export function routeSample(s: SampleDraft) {
  const items = scopeItems(s);
  return {
    validation: !!s.validation,
    pvt: items.filter((i) => i.team === 'PVT'),
    chemical: items.filter((i) => i.team === 'Chemical'),
    outsourced: items.filter((i) => i.outsourced),
  };
}

/* ---------------- Released work ---------------- */

/** The app's six laboratory states (`labStatus` in operations-model.ts). */
export type WorkStatus = 'Not assigned' | 'In progress' | 'Under team-lead review' | 'Returned' | 'Awaiting QC' | 'QC approved';
export type Work = { id: string; sampleId: string; team: Team; kind: 'test' | 'validation'; title: string; planId?: string; assignee: string; status: WorkStatus; outsourced?: Outsource; source: string };
export type ValidationPlan = { id: string; sampleId: string; source: string; plannedAt?: string; plannedBy?: string };
export type RequestRow = { sampleId: string; route: TeamChoice; what: string; reason: string };
export type AdditionalRequest = { id: string; batch: number; sampleId: string; route: TeamChoice; what: string; label: string; reason: string; by: string; at: string; workIds: string[]; planId?: string };
export type LogEntry = { at: string; by: string; text: string };
export type Released = { version: number; at: string; by: string; samples: SampleDraft[]; conditions: Conditions; notes: string };

export type DemoState = {
  v: 1;
  job: { id: string; client: string; field: string; well: string; samplingType: string; due: string };
  conditions: Conditions; notes: string;
  samples: SampleDraft[];
  scope: { status: 'Draft' | 'Released'; savedAt?: string; dirty: boolean; released?: Released };
  work: Work[]; plans: ValidationPlan[]; requests: AdditionalRequest[]; log: LogEntry[]; seq: number;
};

export const assigned = (w: Work) => !!w.assignee;
export const assignmentLabel = (w: Work) => (w.assignee ? 'Assigned' : w.outsourced ? 'Needs coordinator' : 'Needs assignment');
export const workFor = (st: DemoState, team: Team) => st.work.filter((w) => w.team === team);
export const plansFor = (st: DemoState, sampleId?: string) => st.plans.filter((p) => !sampleId || p.sampleId === sampleId);
/** Samples that carry any work for the team (Validation counts for PVT). */
export function samplesForTeam(st: DemoState, team: Team): string[] {
  const ids = new Set(workFor(st, team).map((w) => w.sampleId));
  if (team === 'PVT') st.plans.forEach((p) => ids.add(p.sampleId));
  return st.samples.map((s) => s.id).filter((id) => ids.has(id));
}

export function scopeBlockers(st: DemoState) {
  return st.samples.map((s) => ({ sampleId: s.id, issues: sampleIssues(s), notes: sampleNotes(s) }));
}
export const canRelease = (st: DemoState) => st.scope.status === 'Draft' && scopeBlockers(st).every((b) => !b.issues.length);

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const stamp = (at: string) => at;

export function saveDraft(st: DemoState, at: string): DemoState {
  if (st.scope.status !== 'Draft') return st;
  return { ...st, scope: { ...st.scope, dirty: false, savedAt: at }, log: [...st.log, { at, by: 'SALIM', text: 'Saved the laboratory scope draft' }] };
}

/** Release: freeze the scope and create one work item per selected test, plus one Validation planning item per sample. */
export function release(st: DemoState, at: string): DemoState {
  if (!canRelease(st)) throw Error('Complete the missing information before release.');
  let seq = st.seq;
  const work: Work[] = [], plans: ValidationPlan[] = [];
  for (const s of st.samples) {
    if (s.validation) plans.push({ id: `VAL-${s.id}-${++seq}`, sampleId: s.id, source: 'Original' });
    for (const item of scopeItems(s)) work.push({ id: `W-${++seq}`, sampleId: s.id, team: item.team, kind: 'test', title: item.label, assignee: item.outsourced?.coordinator || '', status: item.outsourced?.coordinator ? 'In progress' : 'Not assigned', outsourced: item.outsourced, source: 'Original' });
  }
  const released: Released = { version: 1, at: stamp(at), by: 'SALIM', samples: clone(st.samples), conditions: clone(st.conditions), notes: st.notes };
  return { ...st, seq, work: [...st.work, ...work], plans: [...st.plans, ...plans], scope: { status: 'Released', dirty: false, savedAt: st.scope.savedAt, released }, log: [...st.log, { at, by: 'SALIM', text: `Released the laboratory scope (v1): ${work.filter((w) => w.team === 'PVT').length} PVT tests, ${work.filter((w) => w.team === 'Chemical').length} Chemical tests, Validation for ${plans.map((p) => p.sampleId).join(', ') || 'no samples'}` }] };
}

const numeric = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));

/**
 * Ahmed saves a Validation plan: chosen steps in procedure order, each with its own (optional) assignee.
 * Restoration needs numeric reservoir pressure and temperature; values entered here become the job's conditions.
 * Steps already started are kept; untouched unselected steps are removed.
 */
export function saveValidationPlan(st: DemoState, planId: string, steps: Record<string, string | null>, conditions: Conditions, at: string): DemoState {
  const plan = st.plans.find((p) => p.id === planId);
  if (!plan) throw Error('Validation plan not found.');
  const chosen = validationProcedure.filter((s) => steps[s] !== null && steps[s] !== undefined);
  if (!chosen.length) throw Error('Select at least one Validation step.');
  if (chosen.includes('Restoration') && !(numeric(conditions.pressure) && numeric(conditions.temperature))) throw Error('Enter numeric reservoir pressure and temperature for Restoration.');
  let seq = st.seq;
  const existing = st.work.filter((w) => w.planId === planId);
  const kept = existing.filter((w) => chosen.includes(w.title) || (w.status !== 'Not assigned' && w.status !== 'In progress'));
  const keptUpdated = kept.map((w) => chosen.includes(w.title) && (w.status === 'Not assigned' || w.status === 'In progress') ? { ...w, assignee: steps[w.title] || '', status: (steps[w.title] ? 'In progress' : 'Not assigned') as WorkStatus } : w);
  const added: Work[] = chosen.filter((t) => !existing.some((w) => w.title === t)).map((t) => ({ id: `W-${++seq}`, sampleId: plan.sampleId, team: 'PVT', kind: 'validation', title: t, planId, assignee: steps[t] || '', status: steps[t] ? 'In progress' : 'Not assigned', source: plan.source }));
  const others = st.work.filter((w) => w.planId !== planId);
  const order = (w: Work) => validationProcedure.indexOf(w.title);
  const planWork = [...keptUpdated, ...added].sort((a, b) => order(a) - order(b));
  const conditionsChanged = chosen.includes('Restoration');
  return {
    ...st, seq, work: [...others, ...planWork],
    conditions: conditionsChanged ? { ...conditions, pressure: conditions.pressure.trim(), temperature: conditions.temperature.trim() } : st.conditions,
    plans: st.plans.map((p) => (p.id === planId ? { ...p, plannedAt: at, plannedBy: 'SHEREIQI' } : p)),
    log: [...st.log, { at, by: 'SHEREIQI', text: `Saved the Validation plan for ${plan.sampleId}: ${chosen.join(' → ')}` }],
  };
}

/** A lead assigns one test (or reassigns before it is submitted). Any listed employee, including the lead. */
export function assign(st: DemoState, workId: string, assignee: string, by: string, at: string): DemoState {
  const w = st.work.find((x) => x.id === workId);
  if (!w) throw Error('Work item not found.');
  if (by !== leadOf[w.team]) throw Error(`Only ${nameOf(leadOf[w.team])} assigns ${w.team} work.`);
  if (w.status !== 'Not assigned' && w.status !== 'In progress' && w.status !== 'Returned') throw Error('Submitted work cannot be reassigned.');
  return { ...st, work: st.work.map((x) => (x.id === workId ? { ...x, assignee, status: assignee ? (x.status === 'Returned' ? 'Returned' : 'In progress') : 'Not assigned' } : x)), log: [...st.log, { at, by, text: assignee ? `Assigned ${w.sampleId} · ${w.title} to ${nameOf(assignee)}` : `Cleared the assignee of ${w.sampleId} · ${w.title}` }] };
}

/** Existing review chain: assignee submits → team lead approves or returns → QC. */
export function act(st: DemoState, workId: string, action: 'submit' | 'approve' | 'return' | 'qc', by: string, at: string): DemoState {
  const w = st.work.find((x) => x.id === workId);
  if (!w) throw Error('Work item not found.');
  const next: Record<typeof action, [WorkStatus[], WorkStatus, string]> = {
    submit: [['In progress', 'Returned'], 'Under team-lead review', w.outsourced ? 'Submitted external results for review' : 'Submitted the workbook'],
    approve: [['Under team-lead review'], 'Awaiting QC', 'Approved the workbook; sent to QC'],
    return: [['Under team-lead review'], 'Returned', 'Returned the workbook for changes'],
    qc: [['Awaiting QC'], 'QC approved', 'Recorded QC approval (demo)'],
  };
  const [from, to, text] = next[action];
  if (!from.includes(w.status)) throw Error('That action is not available at this stage.');
  if (action === 'submit' && by !== w.assignee) throw Error('Only the assignee submits this work.');
  if (action !== 'submit' && by !== leadOf[w.team]) throw Error(`Only ${nameOf(leadOf[w.team])} reviews ${w.team} work.`);
  return { ...st, work: st.work.map((x) => (x.id === workId ? { ...x, status: to } : x)), log: [...st.log, { at, by, text: `${text}: ${w.sampleId} · ${w.title}` }] };
}

/** What a request row may ask for, by route. Values are catalogue IDs, 'validation' or 'custom'. */
export function requestOptions(sample: SampleDraft | undefined, route: TeamChoice): { value: string; label: string }[] {
  if (!sample) return [];
  const cat = catalogueFor(sample.fluid);
  const opts: { value: string; label: string }[] = [];
  if (route === 'PVT') opts.push({ value: 'validation', label: 'Validation (PVT procedure)' }, ...cat.pvt.map((t) => ({ value: t.id, label: testLabel(t.id) })));
  if (route === 'Chemical') opts.push(...cat.chemical.map((t) => ({ value: t.id, label: t.name })));
  opts.push({ value: 'custom', label: route === 'Both' ? 'Describe the work (sent to both teams)' : 'Other test (describe)' });
  return opts;
}
export const blankRequest = (sampleId = ''): RequestRow => ({ sampleId, route: 'PVT', what: '', reason: '' });

export function requestRowIssues(r: RequestRow): string[] {
  const out: string[] = [];
  if (!r.sampleId) out.push('Choose the sample');
  if (!r.what) out.push('Choose the work');
  if (r.what.startsWith('custom') && !r.what.slice(7).trim()) out.push('Describe the work');
  if (!r.reason.trim()) out.push('Give the reason');
  return out;
}

/**
 * Additional work after release: 1–5 separate requests in one submission. Each adds new work for its own sample and
 * team(s). Existing work items, assignments, statuses and the released scope are never changed.
 */
export function requestAdditional(st: DemoState, rows: RequestRow[], by: string, at: string): DemoState {
  if (st.scope.status !== 'Released') throw Error('Release the scope first.');
  if (rows.length < 1 || rows.length > 5) throw Error('Submit between one and five requests.');
  rows.forEach((r, i) => { const issues = requestRowIssues(r); if (issues.length) throw Error(`Request ${i + 1}: ${issues[0]}.`); });
  let seq = st.seq;
  const batch = Math.max(0, ...st.requests.map((r) => r.batch)) + 1;
  const work: Work[] = [], plans: ValidationPlan[] = [], requests: AdditionalRequest[] = [];
  for (const r of rows) {
    const id = `AR-${String(st.requests.length + requests.length + 1).padStart(2, '0')}`;
    const custom = r.what.startsWith('custom') ? r.what.slice(7).trim() : '';
    const label = r.what === 'validation' ? 'Validation' : custom || testLabel(r.what);
    const req: AdditionalRequest = { id, batch, sampleId: r.sampleId, route: r.route, what: r.what.startsWith('custom') ? 'custom' : r.what, label, reason: r.reason.trim(), by, at, workIds: [] };
    if (r.what === 'validation') { const p = { id: `VAL-${r.sampleId}-${++seq}`, sampleId: r.sampleId, source: id }; plans.push(p); req.planId = p.id; }
    else for (const team of teamsOf(r.route)) { const w: Work = { id: `W-${++seq}`, sampleId: r.sampleId, team, kind: 'test', title: label, assignee: '', status: 'Not assigned', source: id }; work.push(w); req.workIds.push(w.id); }
    requests.push(req);
  }
  return { ...st, seq, work: [...st.work, ...work], plans: [...st.plans, ...plans], requests: [...st.requests, ...requests], log: [...st.log, { at, by, text: `Requested additional work: ${requests.map((r) => `${r.id} ${r.sampleId} · ${r.label} → ${teamText(r.route)}`).join('; ')}` }] };
}

export function requestStatus(st: DemoState, r: AdditionalRequest): string {
  const plan = r.planId ? st.plans.find((p) => p.id === r.planId) : undefined;
  const items = st.work.filter((w) => r.workIds.includes(w.id) || (plan && w.planId === plan.id));
  if (plan && !plan.plannedAt) return 'Awaiting Validation plan · ' + nameOf(leadOf.PVT);
  if (!items.length) return 'Awaiting assignment';
  if (items.every((w) => w.status === 'QC approved')) return 'Completed';
  const waiting = items.filter((w) => !w.assignee).map((w) => nameOf(leadOf[w.team]));
  if (waiting.length) return 'Needs assignment · ' + [...new Set(waiting)].join(' & ');
  return 'Assigned · in progress';
}

/* ---------------- My work ---------------- */

export type LeadSummary = { team: Team; samples: string[]; planning: string[]; unassigned: number; review: number; qc: number; total: number };
export function leadSummary(st: DemoState, team: Team): LeadSummary | null {
  if (st.scope.status !== 'Released') return null;
  const work = workFor(st, team), samples = samplesForTeam(st, team);
  if (!samples.length) return null;
  const planning = team === 'PVT' ? st.plans.filter((p) => !p.plannedAt).map((p) => p.sampleId) : [];
  return { team, samples, planning, unassigned: work.filter((w) => !w.assignee).length, review: work.filter((w) => w.status === 'Under team-lead review').length, qc: work.filter((w) => w.status === 'Awaiting QC').length, total: work.length };
}
export const myAssignments = (st: DemoState, id: string) => st.work.filter((w) => w.assignee === id);

/** Who acts next after release, by team, in one line each. */
export function nextActors(st: DemoState): string[] {
  if (st.scope.status !== 'Released') return ['Salim Al Maqbali · review and release the scope'];
  const out: string[] = [];
  for (const team of ['PVT', 'Chemical'] as Team[]) {
    const s = leadSummary(st, team); if (!s) continue;
    const bits = [s.planning.length ? `plan Validation for ${s.planning.join(', ')}` : '', s.unassigned ? `assign ${s.unassigned} ${team} item${s.unassigned === 1 ? '' : 's'}` : '', s.review ? `review ${s.review} submission${s.review === 1 ? '' : 's'}` : ''].filter(Boolean);
    if (bits.length) out.push(`${nameOf(leadOf[team])} · ${bits.join(', ')}`);
  }
  const members = [...new Set(st.work.filter((w) => w.assignee && (w.status === 'In progress' || w.status === 'Returned')).map((w) => w.assignee))];
  if (members.length) out.push(`${members.map(nameOf).join(', ')} · work on assigned tests`);
  return out.length ? out : ['No open actions'];
}

/* ---------------- Seed ---------------- */

export const demoStorageKey = 'vaps-scope-demo-v1';
export function seed(): DemoState {
  const base = (id: string, container: string): SampleDraft => ({ id, container, fluid: '', customFluid: '', team: '', validation: null, tests: [], owners: {}, custom: [], outsourced: {}, notes: '' });
  return {
    v: 1,
    job: { id: 'DEMO-26-0412', client: 'Fictional Energy LLC (demo)', field: 'Demo Field North', well: 'DMO-07', samplingType: 'Separator', due: '2026-11-30' },
    conditions: { pressure: '', pressureUnit: 'psi', temperature: '', temperatureUnit: '°C' },
    notes: '',
    samples: [
      { ...base('S-01', 'Bottle DMO-B-101'), fluid: 'Black Oil', team: 'Both', validation: true, tests: ['Black Oil — DL', 'Specialised Analysis — SARA'] },
      { ...base('S-02', 'Glass container DMO-G-12'), fluid: 'Water', team: 'Chemical', validation: false, tests: ['Others — Water Analysis'] },
      { ...base('S-03', 'Bottle DMO-B-103'), fluid: 'Gas Condensate', team: 'Chemical', validation: true, tests: ['Others — Compositional Analysis'] },
      { ...base('S-04', 'Bottle DMO-B-104'), fluid: 'custom', customFluid: '', team: 'PVT', validation: false, tests: ['Black Oil — Sep Test', 'Black Oil — Viscosity'], outsourced: { 'Black Oil — Viscosity': { provider: 'Example Rheology Lab (fictional)', coordinator: 'RANJITH' } } },
    ],
    scope: { status: 'Draft', dirty: false },
    work: [], plans: [], requests: [], log: [{ at: '2026-11-04T07:30:00.000Z', by: 'SALIM', text: 'Samples received; job ready for laboratory scoping (demo seed)' }], seq: 0,
  };
}
