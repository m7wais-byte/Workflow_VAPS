/**
 * PVT Request Book: every liquid / gas sample sent for composition analysis. It is a separate register from the job
 * workflow; nothing here reads or changes jobs. Rules follow the laboratory's Excel request book:
 * a single request is numbered with the next base number (5932); a staged request is base × 100 + stage (593201…593208).
 */
export const requestStatuses = ['Received', 'In progress', 'Completed', 'Delivered'] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export type RequestRecord = {
  /** Request number as text: "5931", "593102", or a historical form such as "4387-01". */
  no: string;
  /** ISO date (yyyy-mm-dd); empty when a historical date could not be read. */
  date: string;
  job: string; client: string; well: string; sample: string; cylinder: string; experiment: string;
  liquid: number; gas: number;
  /** Gas balloon number, or "None". */
  balloon: string;
  h2s: boolean;
  doneBy: string;
  status: RequestStatus;
  completed: string; delivered: string;
  comments: string;
  savedBy: string; savedAt: string;
};

/** One stage row of the request form. `no` is set for stages that already exist. */
export type StageDraft = { no?: string; date: string; liquid: boolean; gas: boolean; balloon: string; status: RequestStatus; completed: string; delivered: string };
export type RequestDraft = {
  /** Group being edited; undefined for a new request. */
  group?: string;
  job: string; client: string; well: string; sample: string; cylinder: string; experiment: string; doneBy: string;
  /** null until the H2S question is answered. */
  h2s: boolean | null;
  comments: string;
  stages: StageDraft[];
};
export const maxStages = 8;

const whole = (no: string) => /^\d+$/.test(no) ? Number(no) : NaN;
/**
 * Base number used for "next request number": 4-digit numbers, 6-digit numbers ÷ 100 and text such as "4387-01".
 * 5-digit numbers follow no rule in the old book and are ignored.
 */
export function baseNumber(no: string): number | null {
  const n = whole(no);
  if (!Number.isNaN(n)) return n >= 100000 && n < 1000000 ? Math.floor(n / 100) : n > 0 && n < 10000 ? n : null;
  const text = /^(\d{1,4})-\d+$/.exec(no.trim());
  return text ? Number(text[1]) : null;
}
/** Requests that belong together (one request and its stages) share this key. */
export const groupKey = (no: string) => { const base = baseNumber(no); return base === null ? no : String(base); };
const stageOf = (no: string) => { const n = whole(no); return n >= 100000 && n < 1000000 ? n % 100 : 0; };
export const nextBase = (numbers: string[]) => Math.max(0, ...numbers.map((no) => baseNumber(no) ?? 0)) + 1;

/**
 * Numbers for the stages of one request. One stage keeps the plain base number. Two or more are base × 100 + stage;
 * stages that already carry a staged number keep it, so adding a stage never renumbers the others. A single request
 * that gains stages becomes stage 01.
 */
export function stageNumbers(base: number, existing: (string | undefined)[]): string[] {
  if (existing.length === 1) return [existing[0] ?? String(base)];
  let next = Math.max(0, ...existing.map((no) => (no ? stageOf(no) : 0)));
  return existing.map((no) => (no && stageOf(no) ? no : String(base * 100 + ++next)));
}

/** Completed and Delivered dates follow the status: filled when reached, cleared when the request is reopened. */
export function withStatus<T extends { status: RequestStatus; completed: string; delivered: string }>(record: T, status: RequestStatus, today: string): T {
  const done = status === 'Completed' || status === 'Delivered';
  return { ...record, status, completed: done ? record.completed || today : '', delivered: status === 'Delivered' ? record.delivered || today : '' };
}
export const isOpen = (record: { status: RequestStatus }) => record.status === 'Received' || record.status === 'In progress';

export const newStage = (today: string, previous?: StageDraft): StageDraft =>
  ({ date: previous?.date || today, liquid: previous?.liquid ?? true, gas: previous?.gas ?? true, balloon: '', status: 'Received', completed: '', delivered: '' });
export const blankDraft = (today: string, keep: Partial<RequestDraft> = {}): RequestDraft =>
  ({ job: '', client: '', well: '', sample: '', cylinder: '', experiment: '', doneBy: '', h2s: null, comments: '', stages: [newStage(today)], ...keep });

/** Plain-language problems that stop a request from being saved; empty when it can be saved. */
export function draftProblems(draft: RequestDraft, today: string): string[] {
  const missing: string[] = ([['job', 'Job No.'], ['well', 'Well name'], ['experiment', 'Experiment'], ['doneBy', 'Done by']] as const).filter(([key]) => !draft[key].trim()).map(([, label]) => label);
  if (draft.h2s === null) missing.push('the H2S question');
  const problems = missing.length ? ['Please fill: ' + missing.join(', ') + '.'] : [];
  if (!draft.stages.length || draft.stages.length > maxStages) problems.push(`A request has 1 to ${maxStages} stages.`);
  draft.stages.forEach((stage, index) => {
    const label = draft.stages.length > 1 ? `Stage ${index + 1}` : 'The request';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stage.date)) problems.push(`${label} needs a date.`);
    else if (stage.date > today) problems.push(`${label} has a date in the future.`);
    if (!stage.liquid && !stage.gas) problems.push(`${label} needs Liquid, Gas or both.`);
  });
  return problems;
}

/** The stored records for a draft. `numbers` come from stageNumbers; the caller has already checked draftProblems. */
export function draftRecords(draft: RequestDraft, numbers: string[], savedBy: string, today: string): RequestRecord[] {
  const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
  return draft.stages.map((stage, index) => withStatus({
    no: numbers[index], date: stage.date, job: clean(draft.job), client: clean(draft.client), well: clean(draft.well), sample: clean(draft.sample), cylinder: clean(draft.cylinder),
    experiment: clean(draft.experiment), liquid: stage.liquid ? 1 : 0, gas: stage.gas ? 1 : 0, balloon: stage.gas && clean(stage.balloon) ? clean(stage.balloon) : 'None', h2s: draft.h2s === true,
    doneBy: clean(draft.doneBy), status: stage.status, completed: stage.completed, delivered: stage.delivered, comments: clean(draft.comments), savedBy, savedAt: today,
  }, stage.status, today));
}

const byNumber = (a: RequestRecord, b: RequestRecord) => (whole(a.no) || 0) - (whole(b.no) || 0) || a.no.localeCompare(b.no);
/** Newest request first; the stages of one request stay together in stage order. */
export const newestFirst = (records: RequestRecord[]) => [...records].sort((a, b) => (baseNumber(b.no) ?? 0) - (baseNumber(a.no) ?? 0) || byNumber(a, b));
export const groupRecords = (records: RequestRecord[], group: string) => records.filter((record) => groupKey(record.no) === group).sort(byNumber);

/** The form for an existing request with all its stages. */
export function draftOf(records: RequestRecord[], group: string): RequestDraft | null {
  const stages = groupRecords(records, group);
  if (!stages.length) return null;
  const first = stages[0];
  return { group, job: first.job, client: first.client, well: first.well, sample: first.sample, cylinder: first.cylinder, experiment: first.experiment, doneBy: first.doneBy, h2s: stages.some((s) => s.h2s), comments: first.comments,
    stages: stages.map((s) => ({ no: s.no, date: s.date, liquid: s.liquid > 0, gas: s.gas > 0, balloon: s.balloon === 'None' ? '' : s.balloon, status: s.status, completed: s.completed, delivered: s.delivered })) };
}

/* ---------- dashboard figures ---------- */
export type RequestStats = { requests: number; liquid: number; gas: number; h2s: number; open: number; completedCount: number; averageDays: number | null };
const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
export function requestStats(records: RequestRecord[]): RequestStats {
  const days = records.filter((r) => r.completed && r.date).map((r) => dayNumber(r.completed) - dayNumber(r.date));
  return { requests: records.length, liquid: records.reduce((sum, r) => sum + r.liquid, 0), gas: records.reduce((sum, r) => sum + r.gas, 0), h2s: records.filter((r) => r.h2s).length,
    open: records.filter(isOpen).length, completedCount: days.length, averageDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null };
}
export type Breakdown = RequestStats & { label: string };
/** Figures per value of one field, largest first (or in label order for years). Empty values read "Not recorded". */
export function breakdown(records: RequestRecord[], key: (record: RequestRecord) => string, byLabel = false): Breakdown[] {
  const groups = new Map<string, RequestRecord[]>();
  for (const record of records) { const label = key(record) || 'Not recorded'; if (!groups.has(label)) groups.set(label, []); groups.get(label)!.push(record); }
  const rows = [...groups].map(([label, list]) => ({ label, ...requestStats(list) }));
  return byLabel ? rows.sort((a, b) => a.label.localeCompare(b.label)) : rows.sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));
}
/** The twelve months ending with the month of `today`, oldest first, as "yyyy-mm". */
export function lastTwelveMonths(today: string): string[] {
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  return Array.from({ length: 12 }, (_, i) => { const m = month - 11 + i, y = year + Math.floor((m - 1) / 12), mm = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${String(mm).padStart(2, '0')}`; });
}
export type Period = 'all' | '12m' | string;
export function inPeriod(record: RequestRecord, period: Period, today: string): boolean {
  if (period === 'all') return true;
  if (period === '12m') return !!record.date && record.date.slice(0, 7) >= lastTwelveMonths(today)[0];
  return record.date.startsWith(period);
}

/* ---------- dropdown lists (Settings → Request Book lists) ---------- */
export type RequestLists = { clients: string[]; experiments: string[]; doneBy: string[]; balloons: string[] };
export const requestListLabels: Record<keyof RequestLists, string> = { clients: 'Clients', experiments: 'Experiments', doneBy: 'Done by', balloons: 'Balloon numbers' };
export const requestListsKey = 'vaps-request-lists-v1';
/** Starting lists, taken from the Lists sheet of the laboratory's request book. */
export const defaultRequestLists = (): RequestLists => ({
  clients: ['PDO', 'OXY', 'Daleel', 'NA'],
  experiments: ['Diff stage', 'BHS Flash', 'Gas Validation', 'Sep test stage', 'Sep. Flash', 'CVD stage', 'Cryo', 'Sep test flash', 'STO', 'Diff. Flash', 'Water flash', 'CVD Flash', 'OBM', 'Recomb Flash', 'VL9 Reference Crude Oil', 'VL2 Reference Gas Condensate'],
  doneBy: ['Ahmed M', 'Ranjith', 'Nasser', 'Ahad', 'Al-Yaqdhan', 'Salim', 'Yaqeen', 'Abdullah', 'Krishna', 'Yousuf', 'Ebtihal', 'Wilfred', 'Saif', 'WM'],
  balloons: ['460661', '460857', '040M', '558509', '544164', '544351', '460914', '531500', '460906', '059M', '538063', '555598', '053M', '488292', '531481', 'Pressure Vessel', '601281', '531580', '601364', '601106', '487863', '531592', '532501', '556144', '046M', '045M', '531623', '555978', '601263', '044M', '542043', '542092', '042M', '050M', '542008', '518656', '558500', '542687', '549482', '537376', '556000', 'Glass Vial', '566144', '424587'],
});
/** Lists from storage. Unreadable data is reported, never silently replaced. */
export function readRequestLists(raw: string | null): RequestLists {
  if (raw === null) return defaultRequestLists();
  const value = JSON.parse(raw);
  const keys = Object.keys(requestListLabels) as (keyof RequestLists)[];
  if (!value || typeof value !== 'object' || keys.some((key) => !Array.isArray(value[key]) || value[key].some((item: unknown) => typeof item !== 'string' || !item.trim()))) throw Error('Invalid request list settings');
  return Object.fromEntries(keys.map((key) => [key, [...value[key]]])) as RequestLists;
}
/** A list with one value added. Throws a plain-language reason when the value cannot be added. */
export function addListValue(list: string[], value: string): string[] {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) throw Error('Type a value first.');
  if (clean.length > 60) throw Error('Keep the value to 60 characters or fewer.');
  if (list.some((item) => item.toLowerCase() === clean.toLowerCase())) throw Error(`“${clean}” is already in the list.`);
  return [...list, clean];
}
/** The "Done by" list entry for the signed-in employee, matched on the name ("Nasser" ↔ "Nasser Al Saqri"); '' if none. */
export function doneByFor(employeeName: string, list: string[]): string {
  const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');
  const name = letters(employeeName);
  return list.filter((item) => letters(item).length > 2 && name.startsWith(letters(item))).sort((a, b) => b.length - a.length)[0] || '';
}
