// Cylinder status register. A cylinder can be chosen for a job only when it is Ready and not in use.
// In use and Returned (needs cleaning) come from the jobs themselves, so they never drift from the workflow:
//  - In use: a job that is not in Trash records the cylinder serial on one of its samples and has not released it.
//  - Returned · needs cleaning: the job released its cylinders after it finished, and nobody has checked
//    the cylinder since.
// Every other state is set by the sampling team in the register and kept with a history.

export const cylinderStatusKey = 'vaps-cylinder-status-v1';

export type CylinderState = 'not-checked' | 'ready' | 'in-use' | 'returned' | 'maintenance' | 'damaged';
export const cylinderStateLabel: Record<CylinderState, string> = {
  'not-checked': 'Not checked',
  ready: 'Ready',
  'in-use': 'In use',
  returned: 'Returned · needs cleaning',
  maintenance: 'Under maintenance',
  damaged: 'Damaged · out of service',
};
/** Workflow colours: gray not started, green ready, orange in progress, red needs attention. */
export const cylinderStateTone: Record<CylinderState, 'idle' | 'ok' | 'warn' | 'risk'> = {
  'not-checked': 'idle', ready: 'ok', 'in-use': 'warn', returned: 'risk', maintenance: 'warn', damaged: 'risk',
};
/** States the sampling team sets by hand. In use and Returned come from the jobs. */
export const settableStates: CylinderState[] = ['ready', 'maintenance', 'damaged', 'not-checked'];

export type ReadyChecks = { emptied: boolean; cleaned: boolean; calibrated: boolean; pressureTested: boolean };
export const readyCheckLabels: Record<keyof ReadyChecks, string> = {
  emptied: 'Remaining sample disposed',
  cleaned: 'Cleaned',
  calibrated: 'Calibrated',
  pressureTested: 'Pressure tested',
};
export type StatusEntry = { state: CylinderState; by: string; at: string; note?: string; checks?: ReadyChecks; fromJob?: string };
export type CylinderRecord = StatusEntry & { history: StatusEntry[] };
export type CylinderStatusMap = Record<string, CylinderRecord>;

type SampleRef = { id: string; bottleSerial?: string; containerType?: string };
export type CylinderJob = {
  id: string; jobNumber: string; trash?: unknown; status?: string;
  samples?: SampleRef[];
  operations?: { cylindersReleased?: { by: string; at: string } };
};

const key = (serial: string) => serial.trim().toLowerCase();

export function readCylinderStatus(raw?: string | null): CylinderStatusMap {
  try {
    const text = raw !== undefined ? raw : typeof localStorage === 'undefined' ? null : localStorage.getItem(cylinderStatusKey);
    const value = text ? JSON.parse(text) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

/** Cylinder serials a job holds (glass containers are not in the cylinder inventory). */
export const jobCylinders = (job: CylinderJob) => [...new Set((job.samples || []).filter((s) => s.containerType !== 'Glass container' && s.bottleSerial?.trim()).map((s) => s.bottleSerial!.trim()))];

export type EffectiveStatus = { state: CylinderState; job?: { id: string; jobNumber: string; sampleIds: string[] }; record?: CylinderRecord; releasedAt?: string };

/** Status of every cylinder used by a job, plus the register records. */
export function cylinderStatuses(jobs: CylinderJob[], records: CylinderStatusMap) {
  const inUse = new Map<string, EffectiveStatus['job']>();
  const released = new Map<string, { job: EffectiveStatus['job']; at: string }>();
  for (const job of jobs) {
    if (job.trash) continue;
    for (const serial of jobCylinders(job)) {
      const ref = { id: job.id, jobNumber: job.jobNumber, sampleIds: (job.samples || []).filter((s) => s.bottleSerial?.trim() === serial).map((s) => s.id) };
      const rel = job.operations?.cylindersReleased;
      if (!rel) inUse.set(key(serial), ref);
      else { const prev = released.get(key(serial)); if (!prev || prev.at < rel.at) released.set(key(serial), { job: ref, at: rel.at }); }
    }
  }
  return (serial: string): EffectiveStatus => {
    const record = records[key(serial)] || records[serial];
    const used = inUse.get(key(serial));
    if (used) return { state: 'in-use', job: used, record };
    const rel = released.get(key(serial));
    if (rel && (!record || record.at < rel.at)) return { state: 'returned', job: rel.job, record, releasedAt: rel.at };
    return { state: record?.state && record.state !== 'in-use' && record.state !== 'returned' ? record.state : 'not-checked', record };
  };
}

/** Whether a cylinder may be chosen for a sample: Ready and not used by any job, or already this sample's own cylinder. */
export function selectable(status: EffectiveStatus, jobId: string, sampleId: string) {
  if (status.state === 'ready') return true;
  return status.state === 'in-use' && status.job?.id === jobId && status.job.sampleIds.length === 1 && status.job.sampleIds[0] === sampleId;
}

/** Records a new status set by the sampling team. Ready needs every check; maintenance and damage need a note. */
export function setCylinderStatus(records: CylinderStatusMap, serial: string, entry: Omit<StatusEntry, 'at'> & { at?: string }, current: EffectiveStatus): CylinderStatusMap {
  if (!settableStates.includes(entry.state)) throw Error('This status is set by the workflow, not by hand.');
  if (current.state === 'in-use') throw Error(`Cylinder ${serial} is in use on job ${current.job?.jobNumber}. Its status changes after the job releases it.`);
  if (entry.state === 'ready') {
    const c = entry.checks;
    if (!c || !c.emptied || !c.cleaned || !c.calibrated || !c.pressureTested) throw Error('Tick every check (sample disposed, cleaned, calibrated, pressure tested) before setting the cylinder to Ready.');
  }
  if ((entry.state === 'maintenance' || entry.state === 'damaged') && !entry.note?.trim()) throw Error('Describe the maintenance or damage in the note.');
  const at = entry.at || new Date().toISOString();
  const k = key(serial), prev = records[k];
  const next: StatusEntry = { state: entry.state, by: entry.by, at, note: entry.note?.trim() || undefined, checks: entry.state === 'ready' ? entry.checks : undefined, fromJob: current.state === 'returned' ? current.job?.jobNumber : undefined };
  return { ...records, [k]: { ...next, history: [...(prev?.history || []), next] } };
}
