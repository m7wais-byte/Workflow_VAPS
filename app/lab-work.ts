import type { JobRecord } from "./page";

export type LabTestProgress = {
  status: "Not started" | "In progress" | "On hold" | "Completed";
  notes: string;
  scopeText: string;
  updatedBy?: string;
  updatedAt?: string;
};

/** Ahmed's laboratory plan for one job. Progress itself stays in job.labTests. */
export type LabPlan = {
  validationSteps: string[];          // subset of validationStepNames, chosen per job
  tests: string[];                    // detailed test keys (scope / catalogue names or "Other")
  assignees: Record<string, string>;  // item key -> employee id
  savedBy?: string;
  savedAt?: string;
};

export type LabItem = { key: string; label: string; kind: "validation" | "test"; assignee?: string; requested: boolean; progress: LabTestProgress };

/** Single unified validation checklist, in the defined lab order. */
export const validationStepNames = ["Sample Transfer", "Opening Pressure", "Restoration", "Water Check", "Agitation", "Charging", "Flash", "PV", "Direct Density", "Recombination"] as const;

export const scopeTestGroups = [
  { name: "Black Oil", tests: ["Validation", "Recombination", "DL", "Sep Test", "Viscosity"] },
  { name: "Gas Condensates (GC)", tests: ["Validation", "Recombination", "Cryo", "CCE", "CVD", "Sep Test"] },
  { name: "Others", tests: ["Water Analysis", "Compositional Analysis"] },
  { name: "Specialised Analysis", tests: ["SARA", "Pour Point", "Wax Content", "Asphaltene Content", "WAT", "EOR"] },
];
export const scopeTestOptions = scopeTestGroups.flatMap((group) => group.tests.map((test) => `${group.name} — ${test}`));

export const validationKey = (step: string) => "validation:" + step;
export const isValidationTest = (test: string) => test === "Validation" || test.endsWith(" — Validation");
export const validationRequested = (job: JobRecord) => (job.requiredTests || []).some(isValidationTest);
export const requestedDetailedTests = (job: JobRecord) => [...new Set((job.requiredTests || []).filter((test) => !isValidationTest(test)))];
export const labRequested = (job: JobRecord) => (job.requiredTests || []).length > 0;

export function scopeText(job: JobRecord, test: string) {
  return test === "Other" ? job.otherTests?.trim() || "Other — details not specified" : test;
}
export function itemLabel(job: JobRecord, key: string) {
  return key.startsWith("validation:") ? key.slice(11) : scopeText(job, key);
}

export function currentProgress(job: JobRecord, test: string): LabTestProgress {
  const saved = job.labTests?.[test];
  return saved?.scopeText === scopeText(job, test) ? saved : { status: "Not started", notes: "", scopeText: scopeText(job, test) };
}

/** Plan keys, in tracker order. Validation steps only count while Validation is in the job's scope. */
export function planKeys(job: JobRecord, plan = job.labPlan): string[] {
  if (!plan) return [];
  const steps = validationRequested(job) ? validationStepNames.filter((step) => plan.validationSteps.includes(step)).map(validationKey) : [];
  return [...steps, ...[...new Set(plan.tests)].filter((test) => !isValidationTest(test))];
}

/** The work actually assigned for this job. Nothing is tracked until a plan is saved. */
export function labItems(job: JobRecord): LabItem[] {
  const requested = requestedDetailedTests(job);
  return planKeys(job).map((key) => ({
    key, label: itemLabel(job, key), kind: key.startsWith("validation:") ? "validation" : "test",
    assignee: job.labPlan?.assignees[key] || undefined, requested: key.startsWith("validation:") || requested.includes(key), progress: currentProgress(job, key),
  }));
}

export type LabState = "not-requested" | "awaiting-plan" | "awaiting-assignment" | "assigned" | "in-progress" | "on-hold" | "completed";
export const labStateLabel: Record<LabState, string> = {
  "not-requested": "No lab work requested", "awaiting-plan": "Awaiting lab plan", "awaiting-assignment": "Awaiting assignment",
  assigned: "Assigned · not started", "in-progress": "In progress", "on-hold": "On hold", completed: "Lab work complete",
};

/** Lab completion. Jobs planned before step-level planning keep their recorded per-test progress. */
export function labComplete(job: JobRecord) {
  if (!labRequested(job)) return true;
  if (job.labPlan) { const items = labItems(job); return items.length > 0 && items.every((item) => item.progress.status === "Completed"); }
  return (job.requiredTests || []).every((test) => currentProgress(job, test).status === "Completed");
}

export function labProgress(job: JobRecord) {
  const items = labItems(job);
  const done = items.filter((item) => item.progress.status === "Completed").length;
  const legacyDone = !job.labPlan && labRequested(job) && labComplete(job);
  let state: LabState;
  if (!labRequested(job)) state = "not-requested";
  else if (legacyDone || (items.length && done === items.length)) state = "completed";
  else if (!job.labPlan || !items.length) state = "awaiting-plan";
  else if (items.some((item) => item.progress.status === "On hold")) state = "on-hold";
  else if (items.some((item) => item.progress.status !== "Not started")) state = "in-progress";
  else if (items.some((item) => !item.assignee)) state = "awaiting-assignment";
  else state = "assigned";
  return { items, done, total: items.length, state, label: labStateLabel[state] };
}

/** Keep progress for work that is still requested or planned; drop progress for removed or replaced work. */
export function reconcileLabScope(job: JobRecord): JobRecord {
  if (!job.labTests) return job;
  const keep = new Set([...(job.requiredTests || []), ...planKeys(job), ...(job.labPlan?.validationSteps || []).map(validationKey)]);
  return { ...job, labTests: Object.fromEntries(Object.entries(job.labTests).filter(([test, progress]) =>
    keep.has(test) && progress.scopeText === scopeText(job, test)
  )) };
}
