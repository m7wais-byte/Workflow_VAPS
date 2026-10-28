import { containerComplete, containerLabel, isGlass, type ContainerFields } from './sample-container';
/** The parts of a sample record the sampling checks read. */
export type SampleRecord = ContainerFields & { id: string; depth?: string; sampler?: string; samplerSerial?: string; fieldData?: Record<string, string>; dataComplete?: boolean };
export type SamplingJob = { samplingSource?: string; samples?: SampleRecord[]; stages?: { name: string; status: string }[] };
export const preparesEquipment = (source = '') => source === 'Cased Hole (Bottomhole / Downhole Sampling)' || source === 'Open Hole (SPMC - Field Sampling)';
const shippingFields = ['sampleBottleVolume', 'sampleVolume', 'fluidRemaining', 'finalPressure', 'finalTemperature'];
const matchedFields = ['initialOpeningPressure', 'initialOpeningTemperature', 'receivingBottleOpeningPressure', 'receivingBottleOpeningTemperature', 'transferPressure', 'transferTemperature', 'transferDuration'];
const productionFields = ['bhp', 'bht', 'whp', 'wht', 'chokeSize', 'stableSince', 'separatorPressure', 'separatorTemperature', 'oilRate', 'correctedBy', 'gasRate', 'waterRate', 'gasGravity', 'condensateGravity', 'oilLineTemperature', 'gasDifferentialPressure', 'gasPressure', 'gasTemperature', 'fbFactor', 'fpvFactor', 'cgr', 'wor', 'bsw', 'h2s', 'co2'];
/** Standard sample data sheet checks. Glass containers need only their own ID, never bottle inventory fields. */
export function standardSheetErrors(sample: SampleRecord): string[] {
  const f = sample.fieldData || {}, v = (key: string) => (f[key] || '').trim();
  const errors: string[] = [];
  const missing = [!v('samplingDate') && 'Sampling Date', !v('samplingTime') && 'Sampling Time', !v('sampleNature') && 'Sample Nature', !(sample.depth || '').trim() && 'Sampling Point / Depth', !v('flowPeriod') && 'Flow Period', !v('formation') && 'Formation', !v('perforations') && 'Perforations'].filter(Boolean);
  if (missing.length) errors.push(`Identification: complete ${missing.join(', ')}.`);
  if (!containerComplete(sample)) errors.push(isGlass(sample) ? 'Shipping Conditions: the glass container ID is required.' : 'Shipping Conditions: Bottle Type and Bottle Number are required.');
  if (shippingFields.some((key) => !v(key))) errors.push('Shipping Conditions: enter every value or record N/A where it does not apply.');
  if (matchedFields.some((key) => !v(key))) errors.push('Matched / Transfer Conditions: enter every value or record N/A.');
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
    if (!containerComplete(sample)) issues.push({ target: `sample:${sample.id}:container`, label: label + ' · container', text: isGlass(sample) ? 'Glass container ID is missing.' : 'Bottle type and number are missing.' });
    if (preparesEquipment(job.samplingSource) && (!sample.sampler || !(sample.samplerSerial || '').trim())) issues.push({ target: `sample:${sample.id}`, label, text: 'Prepared sampler reference is missing.' });
    for (const error of standardSheetErrors(sample).filter((e) => !e.startsWith('Shipping Conditions: the glass') && !e.startsWith('Shipping Conditions: Bottle Type'))) issues.push({ target: `sample:${sample.id}:data`, label: label + ' · data sheet', text: error });
    if (!sample.dataComplete) issues.push({ target: `sample:${sample.id}:data`, label: label + ' · data sheet', text: 'Not marked complete.' });
  }
  return issues;
}
/** Review-comment targets offered to the approver: sections, then each sample and its parts. */
export function reviewTargets(job: SamplingJob): { target: string; label: string }[] {
  return [{ target: 'job', label: 'Job details' }, { target: 'preparation', label: 'Preparation' }, { target: 'events', label: 'Sequence of events' },
    ...(job.samples || []).flatMap((s) => [{ target: `sample:${s.id}`, label: `Sample ${s.id}` }, { target: `sample:${s.id}:container`, label: `Sample ${s.id} · container (${containerLabel(s)})` }, { target: `sample:${s.id}:data`, label: `Sample ${s.id} · sampling data` }])];
}
/** Default sampling-report summary generated from the recorded job and samples. */
export function samplingSummary(job: SamplingJob & { clientName?: string; well?: string; jobNumber?: string }): string {
  const source = job.samplingSource || '';
  const action = source === 'Cased Hole (Bottomhole / Downhole Sampling)' ? 'bottom-hole sampling and sample transfer activities' : `${source || 'sampling'} activities`;
  return `VAPS was contracted by ${job.clientName || 'the client'} to perform ${action} for well ${job.well || 'not recorded'}. A total of ${job.samples?.length || 0} samples were collected or handled and recorded under job ${job.jobNumber || ''}.`;
}
