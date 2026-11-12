import { containerComplete, containerLabel, containerMissing, containerNoun, isAtmospheric, type ContainerFields } from './sample-container';
/** The parts of a sample record the sampling checks read. */
export type SampleRecord = ContainerFields & { id: string; depth?: string; sampler?: string; samplerSerial?: string; fieldData?: Record<string, string>; dataComplete?: boolean };
export type SamplingJob = { samplingSource?: string; samples?: SampleRecord[]; stages?: { name: string; status: string }[] };
export const preparesEquipment = (source = '') => source === 'Cased Hole (Bottomhole / Downhole Sampling)' || source === 'Open Hole – Field Sampling' || source === 'Open Hole (SPMC - Field Sampling)';
const shippingFields = ['sampleBottleVolume', 'sampleVolume', 'fluidRemaining', 'finalPressure', 'finalTemperature'];
export const matchedFields = ['openingPressureReservoir', 'openingTemperatureReservoir', 'openingPressureAmbient', 'openingTemperatureAmbient', 'transferPressure', 'transferTemperature', 'transferDuration'];
/** Production conditions during sampling. On a separator job they are recorded once per set. */
export const productionFields = ['bhp', 'bht', 'whp', 'wht', 'chokeSize', 'stableSince', 'separatorPressure', 'separatorTemperature', 'oilRate', 'correctedBy', 'gasRate', 'waterRate', 'gasGravity', 'condensateGravity', 'oilLineTemperature', 'gasDifferentialPressure', 'gasPressure', 'gasTemperature', 'fbFactor', 'fpvFactor', 'cgr', 'gor', 'wor', 'bsw', 'h2s', 'co2'];
/** Standard sample data sheet checks. Glass bottles and IATA cans need only a volume, never cylinder inventory fields. */
export function standardSheetErrors(sample: SampleRecord): string[] {
  const f = sample.fieldData || {}, v = (key: string) => (f[key] || '').trim();
  const errors: string[] = [];
  const missing = [!v('samplingDate') && 'Sampling Date', !v('samplingTime') && 'Sampling Time', !v('sampleNature') && 'Sample Nature', !v('samplingPoint') && 'Sampling Point', !(sample.depth || '').trim() && 'Depth', !v('flowPeriod') && 'Flow Period', !v('formation') && 'Formation', !v('perforations') && 'Perforations'].filter(Boolean);
  if (missing.length) errors.push(`Identification: complete ${missing.join(', ')}.`);
  if (!containerComplete(sample)) errors.push(isAtmospheric(sample) ? `Shipping Conditions: the ${containerNoun(sample)} volume is required.` : 'Shipping Conditions: Cylinder Type and Cylinder Number are required.');
  if (shippingFields.some((key) => !v(key))) errors.push('Shipping Conditions: enter every value or record N/A where it does not apply.');
  if (matchedFields.some((key) => !v(key))) errors.push('Transfer Conditions: enter every value or record N/A.');
  if (productionFields.some((key) => !v(key))) errors.push('Production Conditions: enter every value or record N/A.');
  return errors;
}
export const preparationDone = (job: SamplingJob) => { const stage = job.stages?.find((s) => s.name === 'Sampling Preparation'); return !stage || stage.status === 'Completed' || stage.status === 'Skipped'; };
export type SamplingIssue = { target: string; label: string; text: string };
/** Everything missing before sampling data can be submitted, grouped by section and sample. */
export function samplingIssues(job: SamplingJob): SamplingIssue[] {
  const issues: SamplingIssue[] = [];
  if (!preparationDone(job)) issues.push({ target: 'preparation', label: 'Preparation', text: 'Complete the preparation step.' });
  if (!job.samples?.length) issues.push({ target: 'job', label: 'Samples', text: 'No sample records exist.' });
  for (const sample of job.samples || []) {
    const label = 'Sample ' + sample.id;
    if (!containerComplete(sample)) issues.push({ target: `sample:${sample.id}:container`, label: label + ' · container', text: containerMissing(sample) });
    if (preparesEquipment(job.samplingSource) && (!sample.sampler || !(sample.samplerSerial || '').trim())) issues.push({ target: `sample:${sample.id}`, label, text: 'Prepared sampler reference is missing.' });
    for (const error of standardSheetErrors(sample).filter((e) => !/^Shipping Conditions: (the .* volume is required|Cylinder Type)/.test(e))) issues.push({ target: `sample:${sample.id}:data`, label: label + ' · data sheet', text: error });
    if (!sample.dataComplete) issues.push({ target: `sample:${sample.id}:data`, label: label + ' · data sheet', text: 'Not marked complete.' });
  }
  return issues;
}
/** Review-comment targets offered to the approver: sections, then each sample and its parts. */
export function reviewTargets(job: SamplingJob): { target: string; label: string }[] {
  return [{ target: 'job', label: 'Job details' }, { target: 'preparation', label: 'Preparation' }, { target: 'events', label: 'Sequence of events' },
    ...(job.samples || []).flatMap((s) => [{ target: `sample:${s.id}`, label: `Sample ${s.id}` }, { target: `sample:${s.id}:container`, label: `Sample ${s.id} · container (${containerLabel(s)})` }, { target: `sample:${s.id}:data`, label: `Sample ${s.id} · sampling data` }])];
}
const countWords = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const count = (n: number) => countWords[n] || String(n);
/** Activity wording for each recorded sampling type; nothing beyond the type itself is implied. */
const activities: Record<string, string> = {
  'Open Hole – Lab Transfer': 'open hole sample transfer (laboratory transfer)',
  'Open Hole – Field Sampling': 'open hole field sampling',
  // Names saved before the general names were introduced.
  'Open Hole (MPSR - Lab Transfer)': 'open hole sample transfer (laboratory transfer)',
  'Open Hole (MDT Transfer)': 'open hole sample transfer (laboratory transfer)',
  'Open Hole (SPMC - Field Sampling)': 'open hole field sampling',
  'Cased Hole (Bottomhole / Downhole Sampling)': 'cased hole bottomhole sampling',
  'Wellhead Sampling': 'wellhead sampling', 'Separator Sampling': 'separator sampling', 'Station Sampling': 'station sampling',
};
/** "Four PDS", "Two PDS and One glass bottle" — grouped by the recorded type, in first-seen order. */
const plural = ['glass bottle', 'IATA can'];
function grouped(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  const parts = [...counts].map(([name, n]) => `${count(n)} ${name}${plural.includes(name) && n > 1 ? 's' : ''}`);
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] || '';
}
type SummaryJob = SamplingJob & { clientName?: string; well?: string; wells?: string[]; wellMode?: string; jobNumber?: string; otherSamplingType?: string };
/**
 * Default sampling-report summary in the reference report's concise style, built only from recorded information:
 * the recorded sampling type, the recorded receiving containers and samplers, and the job's well. It makes no
 * transfer, shipping, regulation or approval claims; the preparer edits the text before submission when needed.
 */
export function samplingSummary(job: SummaryJob): string {
  const source = (job.samplingSource || '').trim();
  const other = (job.otherSamplingType || '').trim();
  const activity = activities[source] || (source === 'Other' && other ? `sampling (${other})` : 'sampling');
  const samples = job.samples || [], n = samples.length;
  const paragraphs = [`Vision Advanced Petroleum Solutions was contracted by ${job.clientName || 'the client'} for ${activity}.`];
  if (!n) { paragraphs.push('No samples are recorded for this job.'); return paragraphs.join('\n\n'); }
  const typed = samples.map((s) => isAtmospheric(s) ? (s.containerType === 'IATA can' ? 'IATA can' : 'glass bottle') : (s.bottle || '').trim()).filter(Boolean);
  const untyped = n - typed.length;
  paragraphs.push(`A total of ${count(n)} ${n === 1 ? 'sample was' : 'samples were'} recorded${typed.length ? ` in ${grouped(typed)}` : ''}.${untyped && typed.length ? ` The container type is not recorded for ${count(untyped).toLowerCase()} ${untyped === 1 ? 'sample' : 'samples'}.` : ''}`);
  const samplers = samples.map((s) => (s.sampler || '').trim()).filter(Boolean);
  if (samplers.length) paragraphs.push(`Samplers recorded: ${grouped(samplers)}.`);
  const wells = job.wellMode === 'multiple' ? (job.wells || []).map((w) => w.trim()).filter(Boolean) : [];
  if (wells.length > 1) paragraphs.push(`The samples are recorded for the wells ${wells.join(', ')}.`);
  else if ((job.well || '').trim()) paragraphs.push(`All of the samples are recorded for the well ${job.well!.trim()}.`);
  return paragraphs.join('\n\n');
}
