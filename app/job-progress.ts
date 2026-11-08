/**
 * Overall job progress: a plain-language overview of the planned work, its status and its schedule, for the job page
 * and the client progress view. Built on the same workflow calculation as every other view (job-flow.ts) and on the
 * saved laboratory activities; it never adds a manual completion flag, a test, a date or a percentage of its own.
 *
 * Status language (one mapping for the whole overview):
 *   Unassigned / Scheduled                       → Not started
 *   In Progress / Changes Requested (returned)   → In progress
 *   Workbook Submitted / Awaiting QC / QC Return → Under review
 *   Completed (QC approved)                      → Completed
 * Schedule warnings (Overdue) are separate from the work status.
 */
import type { JobRecord } from './page';
import type { Responsibilities } from './authorization';
import { storedResponsibilities } from './authorization';
import { jobFlow, activityStep, type FlowState, type FlowStep, type JobFlow } from './job-flow';
import { operationsFor, isDraft, legacyDispatch, unplannedValidation, latest, type ActivityRecord, type Stream, type WorkState } from './operations-model';
import { durationOf, dayConvention, type ScheduleEstimate } from './schedule-estimate';

export type ProgressStatus = 'not-started' | 'in-progress' | 'under-review' | 'completed';
export const progressStatusLabel: Record<ProgressStatus, string> = { 'not-started': 'Not started', 'in-progress': 'In progress', 'under-review': 'Under review', completed: 'Completed' };
export type ProgressGroup = 'sampling' | 'receipt' | 'PVT' | 'Chemical' | 'report';
export const progressGroupLabel: Record<ProgressGroup, string> = { sampling: 'Sampling', receipt: 'Sample receipt', PVT: 'PVT', Chemical: 'Chemical', report: 'Final report' };
export type ProgressStageId = 'created' | 'sampling' | 'receipt' | 'lab' | 'report';

/** Expected dates for one row. Client view: only explicitly client-visible planner estimates. */
export type RowSchedule = { start?: string; days?: number; finish?: string;
  /** plan = planner estimate; team = the team lead's internal assignment dates (internal view only). */source: 'plan' | 'team'; clientVisible: boolean };
export type ProgressRow = {
  key: string; label: string; group: ProgressGroup; status: ProgressStatus;
  /** Short plain-language detail, e.g. "2 of 3 samples completed" or "In transit to the laboratory". No names or comments. */detail?: string;
  samples?: number; done?: number; total?: number; additional?: boolean; thirdParty?: boolean;
  schedule?: RowSchedule; actual?: string; overdue: boolean;
  /** Internal only: the workflow needs attention (returned for correction, setting missing). Never sent to the client. */attention?: string;
};
export type ProgressStage = { id: ProgressStageId; label: string; status: ProgressStatus; current: boolean; at?: string; note?: string; planned?: boolean; rows: string[] };
export type ExpectedCompletion = { date?: string; kind: 'actual' | 'confirmed' | 'provisional' | 'tbc'; reason?: string };
export type ProgressView = {
  audience: 'internal' | 'client'; jobId: string; client: string; location: string; sampling?: string;
  stages: ProgressStage[]; rows: ProgressRow[]; currentStage: string; now: string; next: string; sentence: string;
  done: number; total: number; expected: ExpectedCompletion; lastUpdate?: string; scopeConfirmed: boolean; overdue: number;
  convention: typeof dayConvention; closed: boolean; draft: boolean; legacy: boolean; notes: string[];
};

/** Many parts → one status: completed when all are; not started when none has started; under review when everything left is in review. */
export function combineProgress(states: ProgressStatus[]): ProgressStatus {
  if (!states.length) return 'not-started';
  if (states.every((s) => s === 'completed')) return 'completed';
  if (states.every((s) => s === 'not-started')) return 'not-started';
  const open = states.filter((s) => s !== 'completed');
  return open.every((s) => s === 'under-review') ? 'under-review' : 'in-progress';
}
/** Internal laboratory state → client language. */
export function workStatus(status: WorkState): ProgressStatus {
  switch (status) {
    case 'Completed': return 'completed';
    case 'Workbook Submitted': case 'Awaiting QC': case 'QC Returned': return 'under-review';
    case 'In Progress': case 'Changes Requested': return 'in-progress';
    default: return 'not-started';
  }
}

const isoDay = (v?: string) => v ? v.slice(0, 10) : undefined;
const maxDate = (list: (string | undefined)[]) => list.filter(Boolean).sort().at(-1) as string | undefined;
const minDate = (list: (string | undefined)[]) => list.filter(Boolean).sort()[0] as string | undefined;
const shortName = (title: string) => title.split(' — ').slice(1).join(' — ') || title;
const group0 = (title: string) => title.includes(' — ') ? title.split(' — ')[0] : '';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const activities = (n: number) => `${n} ${n === 1 ? 'activity' : 'activities'}`;
const fmt = (v: string) => { const d = new Date(v.length === 10 ? v + 'T00:00:00' : v); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : v; };

type Options = { roles?: Responsibilities; employees?: { id: string; active: boolean }[]; today: string; audience?: 'internal' | 'client'; flow?: JobFlow };

/** Sampling type as saved on the job (Other uses the typed label). */
export const samplingLabel = (job: JobRecord) => job.samplingSource === 'Other' && job.otherSamplingType ? 'Other — ' + job.otherSamplingType : job.samplingSource || '';
export const jobLocation = (job: JobRecord) => [job.fieldArea, job.wellMode === 'multiple' ? (job.wells || []).filter(Boolean).join(', ') : job.well].filter(Boolean).join(' · ');
/** Field sampling, delivery straight to the laboratory, or not decided yet. */
export function samplingMode(job: JobRecord): 'field' | 'delivered' | 'unknown' {
  if (job.samplingRequired === false || /Transfer/i.test(job.samplingSource || '')) return 'delivered';
  if (job.samplingRequired === true || job.samplingSource) return 'field';
  return 'unknown';
}

/** Last time the workflow itself moved (schedule-estimate edits alone are not progress). */
export function lastProgressUpdate(job: JobRecord): string | undefined {
  const o = operationsFor(job), history = o.history || [];
  const lastEstimate = history.filter((h) => h.action === 'estimate').map((h) => h.at).sort().at(-1);
  if (!lastEstimate || (job.lastUpdatedAt && job.lastUpdatedAt > lastEstimate)) return job.lastUpdatedAt || undefined;
  return maxDate([...history.filter((h) => h.action !== 'estimate').map((h) => h.at), o.dispatchedAt, job.createdAt]) || job.lastUpdatedAt || undefined;
}

export function jobProgressView(job: JobRecord, opts: Options): ProgressView {
  const audience = opts.audience || 'internal', client = audience === 'client';
  const roles = opts.roles || storedResponsibilities();
  const flow = opts.flow || jobFlow(job, roles, opts.employees);
  const o = operationsFor(job), draft = isDraft(job), modern = !!job.operations || draft;
  const plan = o.progressPlan || {};
  const steps = new Map<string, FlowStep>(flow.sections.flatMap((s) => s.groups.flatMap((g) => g.steps)).map((s) => [s.id, s]));
  const st = (id: string) => steps.get(id);
  const attentionOf = (list: (FlowStep | undefined)[]) => { const x = list.find((s) => s && s.state === 'blocked'); return x ? (x.correction ? 'Returned for correction' : x.detail) : undefined; };
  const rows: ProgressRow[] = [];
  const stages: ProgressStage[] = [];
  const notes: string[] = [];

  const scheduleFor = (key: string, team?: { start?: string; finish?: string }): RowSchedule | undefined => {
    const e: ScheduleEstimate | undefined = plan[key];
    if (e && (!client || e.clientVisible)) return { start: e.start, days: e.days, finish: e.finish, source: 'plan', clientVisible: e.clientVisible };
    if (!client && team && (team.start || team.finish)) return { start: team.start, finish: team.finish, days: team.start && team.finish && team.finish >= team.start ? durationOf(team.start, team.finish) : undefined, source: 'team', clientVisible: false };
    return undefined;
  };
  const row = (r: Omit<ProgressRow, 'overdue' | 'schedule'> & { team?: { start?: string; finish?: string } }): ProgressRow => {
    const { team, ...rest } = r;
    const schedule = scheduleFor(r.key, team);
    const overdue = r.status !== 'completed' && !!schedule?.finish && schedule.finish < opts.today && !draft;
    const out: ProgressRow = { ...rest, schedule, overdue };
    if (client) delete out.attention;
    if (r.status !== 'completed') delete out.actual;
    rows.push(out); return out;
  };

  // 1 · Job created
  const createdAt = o.dispatchedAt || (legacyDispatch(job) ? job.createdAt : undefined);
  stages.push({ id: 'created', label: 'Job created', status: draft ? 'in-progress' : 'completed', current: false, at: draft ? undefined : isoDay(createdAt || job.createdAt), note: draft ? 'Job details being prepared' : undefined, rows: [] });

  if (!modern) {
    // Recorded in the earlier workflow: its own recorded stages, without estimates.
    for (const s of flow.sections) {
      const status: ProgressStatus = s.state === 'completed' ? 'completed' : s.state === 'not-started' ? 'not-started' : 'in-progress';
      const r = row({ key: 'legacy:' + s.id, label: s.label, group: s.id === 'sampling' ? 'sampling' : s.id === 'report' ? 'report' : 'PVT', status, detail: s.summary, actual: isoDay(s.completedAt) });
      stages.push({ id: s.id === 'sampling' ? 'sampling' : s.id === 'report' ? 'report' : 'lab', label: s.id === 'laboratory' ? 'Laboratory testing' : s.label, status, current: false, at: status === 'completed' ? r.actual : undefined, rows: [r.key] });
    }
    notes.push('Recorded in the earlier workflow. Schedule estimates are not available for this job.');
  } else {
    // 2 · Sampling or sample receipt
    const mode = samplingMode(job), method = samplingLabel(job);
    const prep = st('sampling:preparation'), data = st('sampling:data'), approval = st('sampling:approval');
    const samplingStatus: ProgressStatus = approval?.state === 'completed' ? 'completed'
      : data?.state === 'completed' ? 'under-review'
      : prep?.state === 'completed' || data?.state === 'in-progress' || data?.state === 'blocked' ? 'in-progress' : 'not-started';
    const samples = job.samples?.length || Number(job.requestedSampleCount) || 0;
    const first = mode === 'delivered'
      ? row({ key: 'transfer', label: method ? `Sample transfer — ${method}` : 'Sample transfer', group: 'receipt', status: samplingStatus, detail: samples ? plural(samples, 'sample') : undefined, actual: isoDay(approval?.at), attention: attentionOf([prep, data, st('sampling:data-review'), st('sampling:report'), approval]) })
      : row({ key: 'sampling', label: mode === 'unknown' ? 'Sampling type to be confirmed' : method, group: 'sampling', status: samplingStatus,
          detail: [jobLocation(job), samples ? plural(samples, 'sample') : ''].filter(Boolean).join(' · ') || undefined, actual: isoDay(approval?.at), attention: attentionOf([prep, data, st('sampling:data-review'), st('sampling:report'), approval]) });
    const stageRows = [first.key];
    // Physical receipt at the laboratory applies whenever laboratory work is planned or released.
    const required = o.activities.filter((a) => a.required), toPlan = unplannedValidation(job);
    const labApplies = !o.scopeConfirmedAt || required.length > 0 || toPlan.length > 0;
    if (labApplies) {
      const receipt = st('lab:receipt'), h = o.handover;
      const status: ProgressStatus = receipt?.state === 'completed' ? 'completed' : h ? 'in-progress' : 'not-started';
      stageRows.push(row({ key: 'receipt', label: 'Samples received at laboratory', group: mode === 'delivered' ? 'receipt' : 'sampling', status, detail: status === 'in-progress' ? 'In transit to the laboratory' : undefined, actual: isoDay(h?.receivedAt), attention: attentionOf([receipt]) }).key);
    }
    const sRows = rows.filter((r) => stageRows.includes(r.key));
    const sStatus = combineProgress(sRows.map((r) => r.status));
    stages.push({ id: mode === 'delivered' ? 'receipt' : 'sampling', label: mode === 'delivered' ? 'Sample receipt' : mode === 'unknown' ? 'Sampling / sample receipt' : 'Sampling', status: sStatus, current: false,
      at: sStatus === 'completed' ? maxDate(sRows.map((r) => r.actual)) : undefined, rows: stageRows });

    // 3 · Laboratory testing: one row per test (per stream), Validation as one summary row; additional work in its own row.
    if (labApplies) {
      const scopeById = new Map(o.scope.map((s) => [s.id, s]));
      const batchOf = (scopeId: string) => { const s = scopeById.get(scopeId); return s?.source === 'Additional work' ? 'add:' + s.at : 'orig'; };
      type Inst = { sample: string; status: ProgressStatus; at?: string; start?: string; due?: string; external: boolean; attention?: string };
      type Bucket = { key: string; stream: Stream; name: string; title: string; validation: boolean; additional: boolean; batch: string; order: number; insts: Map<string, Inst[]> };
      const buckets = new Map<string, Bucket>();
      const bucket = (stream: Stream, title: string, validation: boolean, batch: string) => {
        const name = validation ? 'Validation' : title;
        const key = `lab:${stream}:${name}:${batch}`;
        if (!buckets.has(key)) buckets.set(key, { key, stream, name, title, validation, additional: batch !== 'orig', batch, order: buckets.size, insts: new Map() });
        return buckets.get(key)!;
      };
      for (const a of required) {
        const b = bucket(a.stream, a.title, a.kind === 'validation', batchOf(a.scopeId));
        const step = activityStep(a, roles, false);
        const list = b.insts.get(a.sampleId) || [];
        list.push({ sample: a.sampleId, status: workStatus(a.status), at: isoDay(step.at), start: a.start || undefined, due: a.due || undefined, external: !!a.external, attention: step.state === 'blocked' ? (step.correction ? 'Returned for correction' : step.detail) : undefined });
        b.insts.set(a.sampleId, list);
      }
      // Validation requested but steps not chosen yet: planned for the sample, not started.
      for (const r of toPlan) { const b = bucket('PVT', 'Validation', true, r.source === 'Additional work' ? 'add:' + r.at : 'orig'); for (const id of r.sampleIds) b.insts.set(id, [...(b.insts.get(id) || []), { sample: id, status: 'not-started', external: false }]); }
      // A short test name used in more than one fluid method gets its method, so rows stay distinct.
      const namesUsed = new Map<string, Set<string>>();
      for (const b of buckets.values()) if (!b.validation) namesUsed.set(shortName(b.title), (namesUsed.get(shortName(b.title)) || new Set()).add(group0(b.title)));
      const display = (b: Bucket) => { if (b.validation) return 'Validation'; const n = shortName(b.title); return (namesUsed.get(n)?.size || 0) > 1 && group0(b.title) ? `${n} (${group0(b.title)})` : n; };
      const ordered = [...buckets.values()].sort((x, y) => (x.stream === y.stream ? 0 : x.stream === 'PVT' ? -1 : 1) || (x.batch === y.batch ? 0 : x.batch === 'orig' ? -1 : y.batch === 'orig' ? 1 : x.batch.localeCompare(y.batch)) || Number(y.validation) - Number(x.validation) || x.order - y.order);
      for (const b of ordered) {
        const perSample = [...b.insts.entries()].sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true }));
        const sampleStatus = perSample.map(([, list]) => combineProgress(list.map((i) => i.status)));
        const all = perSample.flatMap(([, list]) => list);
        const n = perSample.length, done = sampleStatus.filter((s) => s === 'completed').length;
        const status = combineProgress(sampleStatus);
        const label = `${display(b)} — ${n === 1 ? 'Sample ' + perSample[0][0] : plural(n, 'sample')}`;
        const detail = [n > 1 && status !== 'completed' && status !== 'not-started' ? `${done} of ${n} samples completed` : '', b.additional ? 'Additional work' : '', all.some((i) => i.external) ? 'Third-party laboratory' : ''].filter(Boolean).join(' · ') || undefined;
        const team = all.every((i) => i.start && i.due) ? { start: minDate(all.map((i) => i.start)), finish: maxDate(all.map((i) => i.due)) } : undefined;
        row({ key: b.key, label, group: b.stream, status, detail, samples: n, done, total: n, additional: b.additional || undefined, thirdParty: all.some((i) => i.external) || undefined,
          actual: status === 'completed' ? maxDate(all.map((i) => i.at)) : undefined, attention: all.find((i) => i.attention)?.attention, team });
      }
      const labRows = rows.filter((r) => r.group === 'PVT' || r.group === 'Chemical');
      const pendingAdd = o.additions.filter((a) => !a.confirmedAt).length;
      const status = labRows.length ? combineProgress(labRows.map((r) => r.status)) : 'not-started';
      const note = !o.scopeConfirmedAt ? 'Laboratory scope awaiting confirmation' : pendingAdd ? `${plural(pendingAdd, 'additional work request')} awaiting confirmation` : undefined;
      stages.push({ id: 'lab', label: 'Laboratory testing', status: status === 'completed' && (pendingAdd || !o.scopeConfirmedAt) ? 'in-progress' : status, current: false, planned: !o.scopeConfirmedAt || undefined,
        at: status === 'completed' ? maxDate(labRows.map((r) => r.actual)) : undefined, note, rows: labRows.map((r) => r.key) });
    }

    // 4 · Final report
    const prepStep = st('report:prep'), check = st('report:check'), approve = st('report:approval');
    const final = latest(o.finalReports), previous = o.finalReports.filter((r) => r.status === 'Approved' && r.approvedAt);
    const reopened = !flow.closed && previous.length > 0;
    const rStatus: ProgressStatus = approve?.state === 'completed' ? 'completed'
      : approve?.state === 'in-progress' || approve?.state === 'blocked' || check?.state === 'in-progress' ? 'under-review'
      : prepStep?.state === 'in-progress' || prepStep?.state === 'blocked' ? 'in-progress' : 'not-started';
    const rRow = row({ key: 'report', label: reopened ? 'Revised final report' : 'Final report', group: 'report', status: rStatus,
      detail: reopened ? `Earlier report issued ${fmt(previous.at(-1)!.approvedAt!)} · revision for additional work` : undefined, additional: reopened || undefined,
      actual: isoDay(final?.approvedAt), attention: attentionOf([prepStep, check, approve]) });
    stages.push({ id: 'report', label: 'Final report', status: rStatus, current: false, at: rStatus === 'completed' ? rRow.actual : undefined, rows: [rRow.key] });
  }

  // Current stage: the first one not completed.
  const current = stages.find((s) => s.status !== 'completed');
  if (current) current.current = true;
  const closed = modern ? flow.closed : !current;

  const counted = rows;
  const done = counted.filter((r) => r.status === 'completed').length;
  const expected = expectedCompletion(rows, stages, closed, o.scopeConfirmedAt);
  const live = rows.filter((r) => r.status === 'in-progress' || r.status === 'under-review');
  const now = closed ? 'All planned work is completed' : draft ? 'Job details are being prepared' : live.length ? describeNow(live) : 'Waiting for the next activity to start';
  const nextRow = rows.filter((r) => r.status === 'not-started').sort((a, b) => (a.schedule?.start || '9999').localeCompare(b.schedule?.start || '9999') || rows.indexOf(a) - rows.indexOf(b))[0];
  const next = closed ? 'No further work planned' : nextRow ? nextRow.label + (nextRow.schedule?.start ? ` · planned start ${fmt(nextRow.schedule.start)}` : '')
    : stages.find((s) => s.status === 'not-started')?.label || (stages.find((s) => s.id === 'lab')?.planned ? 'Confirmation of the laboratory scope' : 'Completion of the work in progress');
  return {
    audience, jobId: job.jobNumber || job.id, client: job.clientName, location: jobLocation(job), sampling: samplingLabel(job) || undefined,
    stages, rows, currentStage: closed ? 'Completed' : current?.label || 'Not started', now, next, sentence: sentenceFor(stages, rows, expected, closed, draft),
    done, total: counted.length, expected, lastUpdate: lastProgressUpdate(job), scopeConfirmed: !!o.scopeConfirmedAt, overdue: rows.filter((r) => r.overdue).length,
    convention: dayConvention, closed, draft, legacy: !modern, notes,
  };
}

function describeNow(live: ProgressRow[]): string {
  const parts: string[] = [];
  for (const g of ['sampling', 'receipt', 'PVT', 'Chemical', 'report'] as ProgressGroup[]) {
    const list = live.filter((r) => r.group === g);
    if (!list.length) continue;
    if (g === 'PVT' || g === 'Chemical') {
      const inProg = list.filter((r) => r.status === 'in-progress').length, review = list.length - inProg;
      parts.push(`${g} testing: ${[inProg ? activities(inProg) + ' in progress' : '', review ? activities(review) + ' under review' : ''].filter(Boolean).join(', ')}`);
    } else for (const r of list) {
      const state = r.status === 'under-review' ? 'under review' : 'in progress';
      parts.push(r.key === 'receipt' ? 'Samples in transit to the laboratory' : r.key === 'sampling' ? `Sampling ${state}` : r.key === 'transfer' ? `Sample transfer ${state}` : r.status === 'under-review' ? `${r.label} under review` : `${r.label} in preparation`);
    }
  }
  return parts.join(' · ');
}

/**
 * Overall expected finish. The final report date is the overall finish; it is confirmed only when the laboratory scope is
 * released and every open activity before it has an expected completion on or before it. Parallel activities are never added
 * together: the latest of them is what matters.
 */
export function expectedCompletion(rows: ProgressRow[], stages: ProgressStage[], closed: boolean, scopeConfirmedAt?: string): ExpectedCompletion {
  const report = rows.find((r) => r.group === 'report');
  if (closed) return { date: report?.actual || stages.at(-1)?.at, kind: 'actual' };
  if (!report) return { kind: 'tbc' };
  const finish = report.schedule?.source === 'plan' ? report.schedule.finish : undefined;
  if (!finish) return { kind: 'tbc' };
  const upstream = rows.filter((r) => r.group !== 'report' && r.status !== 'completed');
  const missing = upstream.filter((r) => !(r.schedule?.source === 'plan' && r.schedule.finish));
  const later = upstream.filter((r) => r.schedule?.source === 'plan' && r.schedule.finish && r.schedule.finish > finish);
  if (!scopeConfirmedAt && stages.some((s) => s.id === 'lab')) return { date: finish, kind: 'provisional', reason: 'Laboratory scope awaiting confirmation' };
  if (later.length) return { date: finish, kind: 'provisional', reason: `${activities(later.length)} expected to finish after this date` };
  if (missing.length) return { date: finish, kind: 'provisional', reason: `${activities(missing.length)} without an expected completion` };
  return { date: finish, kind: 'confirmed' };
}

/** "Sampling is completed. PVT testing is in progress, and Chemical testing is scheduled to begin on 12 Nov 2026. Expected report delivery: 30 Nov 2026." */
export function sentenceFor(stages: ProgressStage[], rows: ProgressRow[], expected: ExpectedCompletion, closed: boolean, draft: boolean): string {
  if (draft) return 'The job is being prepared. The planned work will be shown here once it is confirmed.';
  if (closed) return `All planned work is completed${expected.date ? ' and the final report was issued on ' + fmt(expected.date) : ''}.`;
  const out: string[] = [];
  const startOf = (list: ProgressRow[]) => { const s = list.map((r) => r.schedule?.source === 'plan' ? r.schedule.start : undefined); return s.every(Boolean) ? minDate(s) : undefined; };
  const phrase = (subject: string, status: ProgressStatus, list: ProgressRow[], verb = 'is') => status === 'completed' ? `${subject} ${verb} completed`
    : status === 'under-review' ? `${subject} ${verb} under review`
    : status === 'in-progress' ? `${subject} ${verb} in progress`
    : startOf(list) ? `${subject} ${verb} scheduled to begin on ${fmt(startOf(list)!)}` : `${subject} has not started yet`;
  const s = stages.find((x) => x.id === 'sampling' || x.id === 'receipt');
  if (s) {
    const first = rows.find((r) => r.key === s.rows[0]);
    const receipt = rows.find((r) => r.key === 'receipt');
    if (first) out.push(phrase(s.id === 'sampling' ? 'Sampling' : 'Sample transfer', first.status, [first]) + (first.status === 'completed' && receipt && receipt.status !== 'completed' ? (receipt.status === 'in-progress' ? ' and the samples are in transit to the laboratory' : '') : '') + '.');
  }
  const lab = stages.find((x) => x.id === 'lab');
  if (lab) {
    if (lab.planned) out.push('Laboratory scope awaiting confirmation.');
    else {
      const streams = (['PVT', 'Chemical'] as const).map((g) => { const list = rows.filter((r) => r.group === g); return { g, list, status: combineProgress(list.map((r) => r.status)) }; }).filter((x) => x.list.length);
      const sameMoving = streams.length === 2 && streams[0].status === streams[1].status && streams[0].status !== 'not-started';
      if (sameMoving) out.push(phrase('PVT and Chemical testing', streams[0].status, [], 'are') + '.');
      else if (streams.length) out.push(streams.map((x) => phrase(`${x.g} testing`, x.status, x.list)).join(', and ') + '.');
      if (lab.note) out.push(lab.note + '.');
    }
  }
  const report = rows.find((r) => r.group === 'report');
  if (report && report.status !== 'not-started') out.push(report.status === 'under-review' ? 'The final report is under review.' : 'The final report is in preparation.');
  if (expected.date && expected.kind !== 'actual') out.push(`Expected report delivery: ${fmt(expected.date)}${expected.kind === 'provisional' ? ' (provisional)' : ''}.`);
  else out.push('Expected report delivery: to be confirmed.');
  return out.join(' ');
}

/** Values a client may see, ready for the shared summary. Strips internal fields defensively. */
export function clientProgress(view: ProgressView): ProgressView {
  return { ...view, audience: 'client', rows: view.rows.map((r) => { const out = { ...r }; delete out.attention; return out.schedule && out.schedule.source !== 'plan' ? { ...out, schedule: undefined, overdue: false } : out; }) };
}

/** Rows grouped for display in their stage order. */
export const rowsOf = (view: Pick<ProgressView, 'rows'>, stage: ProgressStage) => stage.rows.map((k) => view.rows.find((r) => r.key === k)!).filter(Boolean);
/** Statuses that read as "work is moving" share the amber family; FlowState is reused for icons. */
export const asFlowState = (s: ProgressStatus): FlowState => s === 'completed' ? 'completed' : s === 'not-started' ? 'not-started' : 'in-progress';
export type { ActivityRecord };
