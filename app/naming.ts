// General equipment names used across the app. Older saved records (tool and brand names) are converted on load,
// so a job saved before the rename reads the same as a new one.

export const OPEN_HOLE_FIELD = 'Open Hole – Field Sampling';
export const OPEN_HOLE_TRANSFER = 'Open Hole – Lab Transfer';
/** The single downhole sampler choice; the tool model is not recorded. */
export const DOWNHOLE_TOOL = 'Downhole sampling tool';
/** Neutral cylinder types; pressure rating and volume stay in the specification. */
export const cylinderTypes = ['Type A', 'Type B', 'Type C', 'Type D', 'Type E'] as const;

const sourceRename: Record<string, string> = {
  'Open Hole (SPMC - Field Sampling)': OPEN_HOLE_FIELD,
  'Open Hole (MPSR - Lab Transfer)': OPEN_HOLE_TRANSFER,
  'Open Hole (MDT Transfer)': OPEN_HOLE_TRANSFER,
};
const cylinderRename: Record<string, string> = { PDS: 'Type A', Titanium: 'Type B', SPS: 'Type C', 'SPS-SAM': 'Type D', GSB: 'Type E' };
/** Sample nature codes: open-hole field sampling (OHS) and open-hole lab transfer (OHT). */
const natureRename: Record<string, string> = { SPMC: 'OHS', MPSR: 'OHT', MDT: 'OHT' };
const oldSamplers = new Set(['SPS', 'SRS', 'MPSR', 'SPMC', 'Baker BHS']);

export const renameSource = <T extends string | undefined>(source: T): T => (source && sourceRename[source] ? sourceRename[source] : source) as T;
export const renameCylinderType = (type: string) => cylinderRename[type] || type;
export const renameSampler = (sampler: string) => (oldSamplers.has(sampler) ? DOWNHOLE_TOOL : sampler);

/** General specification text, e.g. "Cylinder - 10K PDS - 700 cc" → "Cylinder Type A - 10K - 700 cc". */
export function renameSpecification(spec: string, type: string) {
  const t = renameCylinderType(type);
  if (!spec || cylinderTypes.some((x) => spec.includes(x))) return spec;
  const pressure = spec.match(/\b(\d+K)\b/)?.[1];
  const volume = spec.match(/(\d+(?:\/\d+)?\s?(?:cc|litre|L))\b/i)?.[1]?.replace(/\s?litre/i, ' L');
  const cert = ['DOT', 'TPED'].filter((c) => spec.includes(c));
  if (!pressure && !volume) return spec.replace(/\b(PDS|SPS-SAM|SPS|GSB)\b/g, (m) => renameCylinderType(m));
  return [`Cylinder ${t}`, pressure, volume].filter(Boolean).join(' - ') + (cert.length ? ` (${cert.join(', ')})` : '');
}

type Named = { samplingSource?: string; samplingSources?: string[]; samplingPlan?: { source: string }[]; samples?: { sampler?: string; bottle?: string; samplingSource?: string; fieldData?: Record<string, string> }[] };
/** Converts one saved job to the general names. Returns the same object when nothing changed. */
export function migrateJobNames<T extends Named>(job: T): T {
  const json = JSON.stringify(job);
  const next: T = {
    ...job,
    samplingSource: renameSource(job.samplingSource),
    ...(job.samplingSources ? { samplingSources: job.samplingSources.map(renameSource) } : {}),
    ...(job.samplingPlan ? { samplingPlan: job.samplingPlan.map((row) => ({ ...row, source: renameSource(row.source) })) } : {}),
    ...(job.samples ? { samples: job.samples.map((s) => ({ ...s, ...(s.sampler !== undefined ? { sampler: renameSampler(s.sampler) } : {}), ...(s.bottle !== undefined ? { bottle: renameCylinderType(s.bottle) } : {}), ...(s.samplingSource !== undefined ? { samplingSource: renameSource(s.samplingSource) } : {}), ...(s.fieldData?.sampleNature && natureRename[s.fieldData.sampleNature] ? { fieldData: { ...s.fieldData, sampleNature: natureRename[s.fieldData.sampleNature] } } : {}) })) } : {}),
  };
  if (job.samplingSource === undefined) delete next.samplingSource;
  return JSON.stringify(next) === json ? job : next;
}
/** Converts a custom inventory cylinder to the general names. */
export const migrateCylinder = <T extends { type: string; specification: string }>(c: T): T => ({ ...c, type: renameCylinderType(c.type), specification: renameSpecification(c.specification, c.type) });
