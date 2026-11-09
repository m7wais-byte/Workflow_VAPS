// Sampling plan for a job: one or more sampling types, each with its own quantity.
// Separator Sampling is counted in sets (1 set = 1 oil + 1 gas cylinder) with editable oil and gas cylinder counts;
// every cylinder becomes its own sample record. Records are numbered in one running sequence across all types.

export const SEPARATOR = 'Separator Sampling';
export const CASED_HOLE = 'Cased Hole (Bottomhole / Downhole Sampling)';

export type SamplingPlanRow = {
  source: string;
  /** Samples (or, for Separator Sampling, sets). */
  count: string;
  /** Separator Sampling only: oil and gas cylinders. Default to the number of sets. */
  oil?: string;
  gas?: string;
  note?: string;
};

export type PlannedRecord = { id: string; source: string; phase?: 'Oil' | 'Gas'; set?: number };

const n = (v?: string) => { const x = Number(v); return Number.isInteger(x) && x >= 0 ? x : 0; };
export const isSeparator = (row: Pick<SamplingPlanRow, 'source'>) => row.source === SEPARATOR;

/** New row for a type when it is ticked. Cased Hole keeps its 3-sample default. */
export const newPlanRow = (source: string): SamplingPlanRow => source === SEPARATOR ? { source, count: '1', oil: '1', gas: '1', note: '' } : { source, count: source === CASED_HOLE ? '3' : '1', note: '' };

/** Records a row creates: cylinders for Separator Sampling, otherwise samples. */
export const rowRecords = (row: SamplingPlanRow) => isSeparator(row) ? n(row.oil) + n(row.gas) : n(row.count);
export const planRecordCount = (plan: SamplingPlanRow[]) => plan.reduce((sum, row) => sum + rowRecords(row), 0);

/** Splits `total` cylinders over `sets` sets as evenly as possible, earlier sets first. */
const spread = (total: number, sets: number) => Array.from({ length: sets }, (_, i) => Math.floor(total / sets) + (i < total % sets ? 1 : 0));

/** Sample records in one running sequence (1.01, 1.02 …) across every type in the plan. */
export function planRecords(plan: SamplingPlanRow[]): PlannedRecord[] {
  const out: PlannedRecord[] = [];
  const push = (r: Omit<PlannedRecord, 'id'>) => out.push({ id: `1.${String(out.length + 1).padStart(2, '0')}`, ...r });
  for (const row of plan) {
    if (isSeparator(row)) {
      const sets = Math.max(1, n(row.count)), oil = spread(n(row.oil), sets), gas = spread(n(row.gas), sets);
      for (let s = 0; s < sets; s++) {
        for (let i = 0; i < oil[s]; i++) push({ source: row.source, phase: 'Oil', set: s + 1 });
        for (let i = 0; i < gas[s]; i++) push({ source: row.source, phase: 'Gas', set: s + 1 });
      }
    } else for (let i = 0; i < n(row.count); i++) push({ source: row.source });
  }
  return out;
}

/** Short quantity text for one row, e.g. "3 sets · 3 oil + 6 gas cylinders" or "3 samples". */
export function rowSummary(row: SamplingPlanRow) {
  if (isSeparator(row)) { const sets = n(row.count); return `${sets} set${sets === 1 ? '' : 's'} · ${n(row.oil)} oil + ${n(row.gas)} gas cylinder${n(row.oil) + n(row.gas) === 1 ? '' : 's'}`; }
  const c = n(row.count); return `${c} sample${c === 1 ? '' : 's'}`;
}

/** Problems that block sending. `label` turns a source into display text (e.g. "Other — Transfer"). */
export function planErrors(plan: SamplingPlanRow[], label: (source: string) => string = (s) => s): string[] {
  const errors: string[] = [];
  if (!plan.length) return ['Select at least one sampling type.'];
  const whole = (v: string | undefined, min: number, max: number) => { const x = Number(v); return Number.isInteger(x) && x >= min && x <= max; };
  for (const row of plan) {
    const name = label(row.source);
    if (isSeparator(row)) {
      if (!whole(row.count, 1, 20)) errors.push(`${name}: enter a whole number of sets from 1 to 20.`);
      if (!whole(row.oil, 0, 40) || !whole(row.gas, 0, 40)) errors.push(`${name}: enter whole oil and gas cylinder counts from 0 to 40.`);
      else if (n(row.oil) + n(row.gas) < 1) errors.push(`${name}: at least one oil or gas cylinder is required.`);
    } else if (!whole(row.count, 1, 20)) errors.push(`${name}: enter a whole sample count from 1 to 20.`);
    if (row.source === CASED_HOLE && whole(row.count, 1, 20) && n(row.count) < 3 && !(row.note || '').trim()) errors.push(`${name}: add a note explaining the request for fewer than 3 cased-hole samples.`);
  }
  if (planRecordCount(plan) > 60) errors.push('A job can hold at most 60 sample records. Split the request into separate jobs.');
  return errors;
}

/** Plan for jobs saved before several sampling types were supported. */
export function legacyPlan(job: { samplingPlan?: SamplingPlanRow[]; samplingSource?: string; requestedSampleCount?: string; sampleCountNotes?: string; samples?: unknown[] }): SamplingPlanRow[] {
  if (job.samplingPlan?.length) return job.samplingPlan;
  if (!job.samplingSource) return [];
  const count = job.requestedSampleCount || String(job.samples?.length || 1);
  // Older separator jobs counted single samples; they are kept as that many oil cylinders in one set each.
  return [job.samplingSource === SEPARATOR ? { source: SEPARATOR, count, oil: count, gas: '0', note: job.sampleCountNotes || '' } : { source: job.samplingSource, count, note: job.sampleCountNotes || '' }];
}

/** Record label used on sample cards, e.g. "Separator Sampling · Set 1 · Gas". */
export const recordLabel = (r: { samplingSource?: string; phase?: string; set?: number }) => [r.samplingSource, r.set ? `Set ${r.set}` : '', r.phase].filter(Boolean).join(' · ');
