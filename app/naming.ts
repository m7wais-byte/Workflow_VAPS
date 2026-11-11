import { migrateFieldData } from "./sample-defaults";
// General equipment names used across the app. Older saved records (tool and brand names) are converted on load,
// so a job saved before the rename reads the same as a new one.

export const OPEN_HOLE_FIELD = 'Open Hole – Field Sampling';
export const OPEN_HOLE_TRANSFER = 'Open Hole – Lab Transfer';
/** The single downhole sampler choice; the tool model is not recorded. */
export const DOWNHOLE_TOOL = 'Downhole sampling tool';
/** Cylinder types as used by the sampling team. */
export const cylinderTypes = ['PDS', 'Titanium', 'SPS', 'SPS-SAM', 'GSB'] as const;

const sourceRename: Record<string, string> = {
  'Open Hole (SPMC - Field Sampling)': OPEN_HOLE_FIELD,
  'Open Hole (MPSR - Lab Transfer)': OPEN_HOLE_TRANSFER,
  'Open Hole (MDT Transfer)': OPEN_HOLE_TRANSFER,
};
// Records saved while neutral Type A–E names were in use go back to the original cylinder type names.
const cylinderRename: Record<string, string> = { 'Type A': 'PDS', 'Type B': 'Titanium', 'Type C': 'SPS', 'Type D': 'SPS-SAM', 'Type E': 'GSB' };
const specRename: Record<string, string> = {
  'Cylinder Type B - 10K - 629 cc': 'Cylinder - 10K PDS - 629 cc ProLight Titanium',
  'Cylinder Type B - 10K - 700 cc': 'Cylinder - 10K PDS - 700 cc Titanium',
  'Cylinder Type A - 10K - 700 cc': 'Cylinder - 10K PDS - 700 cc',
  'Cylinder Type C - 10K - 700 cc (DOT)': 'Cylinder - 10K SPS - 700 cc Steel (DOT)',
  'Cylinder Type C - 10K - 700 cc': 'Cylinder - 10K SPS - 700 cc Steel',
  'Cylinder Type D - 15K - 830/1000 cc (TPED)': 'Cylinder - 15K SPS/PDS Steel Coated 830/1000 cc TPED',
  'Cylinder Type E - 3K - 20 L': 'Cylinder - GAS 20 litre 3K Luxfer',
};
/** Sample nature codes: open-hole field sampling (OHS) and open-hole lab transfer (OHT). */
const natureRename: Record<string, string> = { SPMC: 'OHS', MPSR: 'OHT', MDT: 'OHT' };
const oldSamplers = new Set(['SPS', 'SRS', 'MPSR', 'SPMC', 'Baker BHS']);

export const renameSource = <T extends string | undefined>(source: T): T => (source && sourceRename[source] ? sourceRename[source] : source) as T;
export const renameCylinderType = (type: string) => cylinderRename[type] || type;
export const renameSampler = (sampler: string) => (oldSamplers.has(sampler) ? DOWNHOLE_TOOL : sampler);

/** Specification text with the original cylinder type, e.g. "Cylinder Type A - 10K - 700 cc" → "Cylinder - 10K PDS - 700 cc". */
export function renameSpecification(spec: string) {
  if (!spec) return spec;
  if (specRename[spec]) return specRename[spec];
  return spec.replace(/^Cylinder (Type [A-E])\b/, (_m, t: string) => `Cylinder - ${cylinderRename[t]}`);
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
    ...(job.samples ? { samples: job.samples.map((s) => ({ ...s, ...(s.sampler !== undefined ? { sampler: renameSampler(s.sampler) } : {}), ...(s.bottle !== undefined ? { bottle: renameCylinderType(s.bottle) } : {}), ...(s.samplingSource !== undefined ? { samplingSource: renameSource(s.samplingSource) } : {}), ...(s.fieldData ? { fieldData: migrateFieldData(s.fieldData.sampleNature && natureRename[s.fieldData.sampleNature] ? { ...s.fieldData, sampleNature: natureRename[s.fieldData.sampleNature] } : s.fieldData) } : {}) })) } : {}),
  };
  if (job.samplingSource === undefined) delete next.samplingSource;
  return JSON.stringify(next) === json ? job : next;
}
/** Converts a custom inventory cylinder to the general names. */
export const migrateCylinder = <T extends { type: string; specification: string }>(c: T): T => ({ ...c, type: renameCylinderType(c.type), specification: renameSpecification(c.specification) });
