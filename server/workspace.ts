/**
 * Shared workspace storage (D1) with server-side permission checks.
 *
 * Every check reuses the workflow's own rules (job access, permissions, duties, workflow commands) by running them
 * against the records stored here, through `runWithStorage`. The acting employee is always the session's employee.
 */
import { runWithStorage, sharedKeys, isSharedKey, type SharedKey, type StorageLike } from "../app/app-storage";
import { loadDirectory, validateDirectory, directoryKey, type Directory } from "../app/employee-directory";
import { readAuthorization, authorizationKey, readResponsibilities, responsibilitiesKey, storedResponsibilities, unassignedResponsibilities, type Authorization, type Permission } from "../app/authorization";
import { storedTestRouting, readSavedRouting, testRoutingKey } from "../app/test-routing";
import { storedLabTeams, readLabTeams, labTeamsKey } from "../app/lab-teams";
import { readCustomTests, testCatalogueKey, catalogueIds } from "../app/test-catalogue";
import { readEquipment, equipmentKey } from "../app/lab-equipment";
import { readRequestLists, requestListsKey } from "../app/request-book";
import { readCylinderStatus, cylinderStatusKey } from "../app/cylinder-status";
import { validateBottle, bottleStorageKey, type Bottle } from "../app/bottle-inventory";
import { migrateJobNames } from "../app/naming";
import { hasAccess, isDraft, canSeeDraft, samplingWorkers, samplingTeam, samplingStarted, samplingDataLocked, dataSnapshot, trashJob, restoreJob, latest, type Actor, type Command } from "../app/operations-model";
import { canOpenJob, applyJobOperation, noJobAccessMessage } from "../app/job-access";
import { applyOperation } from "../app/operations-model";
import { prepareJobForSave } from "../app/job-save";
import { coordinator, canWork } from "../app/team-workflow";
import { assertJobNumberAvailable } from "../app/job-numbering";
import type { JobRecord } from "../app/page";
import { fail } from "./http";
import { auditStatement } from "./auth";

export type Records = Map<string, string>;
export type StoredJob = { job: JobRecord; revision: number };
export type Who = { accountId: string; employeeId: string };

const readOnly = (values: Records): StorageLike => ({ getItem: (key) => values.get(key) ?? null, setItem: () => {}, removeItem: () => {} });
/** Runs workflow logic against the given records. */
export const withRecords = <T,>(values: Records, work: () => T) => runWithStorage(readOnly(values), work);

export async function loadRecords(db: D1Database): Promise<{ values: Records; revisions: Map<string, number> }> {
  const { results } = await db.prepare("SELECT key, value, revision FROM settings").all<{ key: string; value: string; revision: number }>();
  const values: Records = new Map(), revisions = new Map<string, number>();
  for (const row of results) if (isSharedKey(row.key)) { values.set(row.key, row.value); revisions.set(row.key, row.revision); }
  return { values, revisions };
}

export async function loadJobs(db: D1Database): Promise<Map<string, StoredJob>> {
  const { results } = await db.prepare("SELECT id, payload, revision FROM jobs").all<{ id: string; payload: string; revision: number }>();
  const map = new Map<string, StoredJob>();
  for (const row of results) { try { map.set(row.id, { job: migrateJobNames(JSON.parse(row.payload) as JobRecord), revision: row.revision }); } catch { /* an unreadable row is never served or overwritten */ } }
  return map;
}

/** Directory without the browser-demo `password` field. */
export function publicDirectory(directory: Directory): Directory {
  return { ...directory, employees: directory.employees.map(({ password: _password, ...rest }) => { void _password; return rest; }) };
}

export type Context = { directory: Directory | null; policy: Authorization | null; values: Records };
/** Settings read the same way the interface reads them. Unreadable settings deny access instead of falling back. */
export function context(values: Records): Context {
  return withRecords(values, () => {
    let directory: Directory | null = null, policy: Authorization | null = null;
    try { directory = loadDirectory(); } catch { directory = null; }
    if (directory) { try { policy = readAuthorization(values.get(authorizationKey) ?? null, directory.employees.map((e) => e.id)); } catch { policy = null; } }
    return { directory, policy, values };
  });
}
export const employeeActive = (ctx: Context, id: string) => !!ctx.directory?.employees.some((e) => e.id === id && e.active);

/** The acting employee for permission checks, built only from the session's employee ID and the stored settings. */
export function actorFor(ctx: Context, employeeId: string, jobs: JobRecord[] = []): Actor {
  if (!ctx.directory || !ctx.policy) throw fail(503, "The saved employee directory or authorization settings cannot be read. Access is blocked until an administrator restores them.");
  const directory = ctx.directory, policy = ctx.policy;
  return withRecords(ctx.values, () => {
    let roles; try { roles = storedResponsibilities(); } catch { roles = { ...unassignedResponsibilities }; }
    const ids = directory.employees.map((e) => e.id);
    return { id: employeeId, employees: directory.employees, policy, roles, routing: storedTestRouting(), teams: storedLabTeams(ids), jobs, departments: directory.departments };
  });
}
export const can = (ctx: Context, actor: Actor, permission: Permission) => withRecords(ctx.values, () => hasAccess(actor, permission));

/** Jobs this employee may read: the same job-access rule that guards opening a job; Trash only for Delete & restore holders. */
export function visibleJobs(ctx: Context, actor: Actor, jobs: Map<string, StoredJob>): StoredJob[] {
  return withRecords(ctx.values, () => [...jobs.values()].filter(({ job }) => job.trash ? hasAccess(actor, "deleteJobs") && canSeeDraft(job, actor) : canOpenJob(job, actor)));
}

/* ---------- shared settings ---------- */

const permissionFor: Record<SharedKey, Permission[]> = {
  "vaps-directory-v1": ["employees"], "vaps-authorization-v1": ["authorization"], "vaps-responsibilities-v1": ["authorization"], "vaps-lab-teams-v1": ["authorization"],
  "vaps-test-catalogue-v1": ["tests"], "vaps-test-routing-v1": ["tests"], "vaps-lab-equipment-v1": ["tests"], "vaps-request-lists-v1": ["requestsOverview"],
  "vaps-company-v1": ["company"], "vaps-demo-clients-v1": ["settings"], "vaps-custom-bottles-v1": ["inventory"], "vaps-cylinder-status-v1": ["inventory", "sampling"],
};
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const invalid = () => fail(400, "These settings are not valid and were not saved.");

/** Validates a settings value with the same readers the interface uses; returns the value to store. */
export function validateRecord(ctx: Context, key: SharedKey, raw: string): string {
  if (raw.length > 1_500_000) throw fail(413, "These settings are too large to save.");
  let value: unknown; try { value = JSON.parse(raw); } catch { throw invalid(); }
  const ids = ctx.directory?.employees.map((e) => e.id) || [];
  try {
    switch (key) {
      case "vaps-directory-v1": {
        const next = value as Directory;
        if (!isObject(next) || !Array.isArray(next.employees) || !Array.isArray(next.departments) || !Array.isArray(next.positions)) throw invalid();
        for (const e of next.employees) if (!isObject(e) || typeof e.id !== "string" || !e.id || typeof e.name !== "string" || typeof e.active !== "boolean") throw invalid();
        validateDirectory(next);
        // Employee IDs are permanent: records can be deactivated, never removed, so history and accounts stay linked.
        const nextIds = new Set(next.employees.map((e) => e.id));
        const removed = ids.filter((id) => !nextIds.has(id));
        if (removed.length) throw fail(400, "Employee records cannot be removed; deactivate them instead.");
        return JSON.stringify(publicDirectory(next));
      }
      case "vaps-authorization-v1": return JSON.stringify(readAuthorization(raw, ids));
      case "vaps-responsibilities-v1": { const roles = readResponsibilities(raw); if (Object.values(roles).some((id) => id && !ids.includes(id))) throw invalid(); return JSON.stringify(roles); }
      case "vaps-lab-teams-v1": return JSON.stringify(readLabTeams(raw, ids));
      case "vaps-test-catalogue-v1": readCustomTests(raw); return raw;
      case "vaps-test-routing-v1": { const custom = readCustomTests(ctx.values.get(testCatalogueKey) ?? null); readSavedRouting(raw, catalogueIds(custom)); return raw; }
      case "vaps-lab-equipment-v1": readEquipment(raw); return raw;
      case "vaps-request-lists-v1": readRequestLists(raw); return raw;
      case "vaps-company-v1": { if (!isObject(value) || typeof value.name !== "string" || typeof value.displayName !== "string" || Object.values(value).some((v) => typeof v !== "string")) throw invalid(); const logo = String(value.logo || ""); if (logo && !logo.startsWith("/") && !/^data:image\/(png|jpeg|webp);base64,/.test(logo)) throw invalid(); return raw; }
      case "vaps-demo-clients-v1": { if (!Array.isArray(value) || !value.length || value.some((c) => !isObject(c) || typeof c.code !== "string" || typeof c.name !== "string")) throw invalid(); return raw; }
      case "vaps-custom-bottles-v1": {
        if (!Array.isArray(value)) throw invalid();
        const previous = JSON.parse(ctx.values.get(bottleStorageKey) || "[]") as Bottle[];
        const serials = new Set((value as Bottle[]).map((b) => String(b?.serial || "").trim().toLowerCase()));
        if (previous.some((b) => !serials.has(String(b.serial).trim().toLowerCase()))) throw fail(400, "Cylinders cannot be removed from the inventory.");
        const checked: Bottle[] = [];
        for (const b of value as Bottle[]) { if (!isObject(b) || ![b.type, b.serial, b.capacity, b.specification].every((v) => typeof v === "string") || validateBottle(b, checked)) throw invalid(); checked.push(b); }
        return raw;
      }
      case "vaps-cylinder-status-v1": { if (!isObject(value)) throw invalid(); readCylinderStatus(raw); return raw; }
    }
  } catch (error) { if (error instanceof Error && "status" in error) throw error; throw invalid(); }
  throw invalid();
}

export async function saveRecord(db: D1Database, ctx: Context, actor: Actor, who: Who, key: string, raw: unknown, revision: unknown, at = new Date().toISOString()) {
  if (!isSharedKey(key)) throw fail(404, "Unknown settings record.");
  if (typeof raw !== "string" || !Number.isInteger(revision) || (revision as number) < 0) throw fail(400, "The settings could not be read.");
  if (!permissionFor[key].every((p) => can(ctx, actor, p))) throw fail(403, "You do not have permission to change these settings.");
  const value = validateRecord(ctx, key, raw);
  const write = revision === 0
    ? db.prepare("INSERT INTO settings (key, value, revision, updated_by, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(key) DO NOTHING").bind(key, value, who.employeeId, at)
    : db.prepare("UPDATE settings SET value = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE key = ? AND revision = ?").bind(value, who.employeeId, at, key, revision);
  const before = ctx.values.get(key);
  // The setting and its audit entry (with the value before and after) are written together or not at all.
  const [result] = await db.batch([write, auditStatement(db, { ...who, action: "setting.saved", target: key, detail: { fromRevision: revision, toRevision: (revision as number) + 1, before: before === undefined ? null : JSON.parse(before), after: JSON.parse(value) } }, at, true)]);
  if (!result.meta.changes) throw fail(409, "These settings were changed by someone else. The workspace will reload with the saved version.");
  return { revision: (revision as number) + 1, value };
}

/* ---------- jobs ---------- */

/** Job-detail fields that only a job coordinator changes (the job editor applies them for coordinators only). */
const coordinatorFields = ["jobResponsibleId", "requestedSampleCount", "samplingPlan", "contextUnits", "samplingSources", "samplingInstructions", "samplingTeamIds", "requiredTests", "otherTests", "sampleCountNotes",
  "countryCode", "dateReceived", "description", "assignedEngineerId", "assignedDriverId", "clientFocalPoint", "clientFocalPointContact", "clientFocalPointEmail", "fieldArea", "well", "wellMode", "wells", "rigInstallation",
  "plannedDepth", "formation", "perforationInterval", "wellheadLocation", "chokeSize", "whp", "wht", "facility", "separatorId", "separatorStage", "samplingPoint", "separatorPressure", "separatorTemperature", "relatedWell",
  "locationNotes", "otherDescription", "otherSamplingType", "oilRate", "gasRate", "waterRate", "dueDate", "clientName"] as const;
const immutableFields = ["id", "jobNumber", "globalSequence", "clientCode", "createdById", "createdAt", "ownerId"] as const;
/** Fields that record who did something: a change must name the signed-in employee. */
const stampKeys = new Set(["createdBy", "createdById", "completedBy", "dataCompletedBy", "lastUpdatedBy", "deletedBy", "approvedBy", "by", "submittedBy", "reviewedBy", "checkedBy"]);
/** Server-maintained fields: never accepted from the browser. */
const serverFields = ["lastUpdatedById", "lastUpdatedAt", "workflowHistory", "operations", "trash"] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const jobIdPattern = /^[A-Z]{2}-[A-Z0-9]-\d{2}-\d{3,}(~\d+)?$/;

/** Every changed "who did it" value in `next` compared with `prev` (deep). */
function changedStamps(prev: unknown, next: unknown, out: string[] = [], key = ""): string[] {
  if (stampKeys.has(key) && !same(prev, next) && next !== undefined && next !== "") out.push(String(next));
  if (Array.isArray(next)) next.forEach((item, i) => changedStamps(Array.isArray(prev) ? findMatch(prev, item, i) : undefined, item, out));
  else if (isObject(next)) for (const [k, v] of Object.entries(next)) changedStamps(isObject(prev) ? prev[k] : undefined, v, out, k);
  return out;
}
/** Matches array items by `id` when present (lists are re-sorted), otherwise by position. */
function findMatch(list: unknown[], item: unknown, index: number) {
  if (isObject(item) && typeof item.id === "string") return list.find((p) => isObject(p) && p.id === item.id);
  if (isObject(item) && typeof item.createdAt === "string") return list.find((p) => isObject(p) && p.createdAt === item.createdAt && p.description === item.description);
  return list[index];
}
const assignmentRefs = (j: JobRecord) => [j.responsibleId, j.jobResponsibleId, j.assignedEngineerId, j.assignedDriverId, ...(j.samplingTeamIds || []), ...(j.stages || []).map((s) => s.assignedTo), ...Object.values(j.teamWork || {}).map((t) => t?.owner), ...Object.values(j.labPlan?.assignees || {}), j.report?.preparedBy];

/**
 * Server-side version of the job editor's save rules (app/page.tsx `updateCurrentJob`). Workflow state in
 * `operations` can only change through workflow commands, Trash through its own endpoints.
 */
export function checkJobSave(ctx: Context, actor: Actor, stored: JobRecord | undefined, proposed: JobRecord, all: JobRecord[]): void {
  withRecords(ctx.values, () => {
    const me = actor.id;
    if (!isObject(proposed) || !jobIdPattern.test(String(proposed.id)) || !Array.isArray(proposed.stages)) throw fail(400, "The job record could not be read.");
    if (!hasAccess(actor, "jobDetails")) throw fail(403, "You do not have access to job details.");
    const isCoordinator = coordinator(me);
    for (const id of assignmentRefs(proposed)) if (id && !(stored && assignmentRefs(stored).includes(id)) && !actor.employees.some((e) => e.id === id && e.active)) throw fail(400, "New assignments require an active employee.");
    const strip = (j?: JobRecord) => j && Object.fromEntries(Object.entries(j).filter(([k]) => !(serverFields as readonly string[]).includes(k)));
    const stamps = changedStamps(strip(stored), strip(proposed)).filter((id) => id !== me);
    if (stamps.length) throw fail(403, "A job change can only be recorded under your own name.");
    if (!stored) {
      if (!hasAccess(actor, "createJob")) throw fail(403, "You are not authorized to create jobs.");
      if (proposed.createdById !== me || proposed.ownerId !== me) throw fail(403, "A new job is recorded under your own name.");
      if (proposed.operations || proposed.trash) throw fail(400, "A new job starts without workflow records.");
      if (all.some((j) => j.id === proposed.id)) throw fail(409, `Job ID ${proposed.jobNumber || proposed.id} is already in use. Refresh and try again; nothing was saved.`);
      try { assertJobNumberAvailable(proposed, all); } catch (e) { throw fail(409, e instanceof Error ? e.message : "Job number in use."); }
      return;
    }
    if (stored.trash) throw fail(409, "This job is in Trash. Restore it before making changes.");
    for (const field of immutableFields) if (!same(stored[field], proposed[field])) throw fail(400, "The job's identity fields cannot be changed.");
    if (!same(stored.operations, proposed.operations) || !same(stored.trash, proposed.trash)) throw fail(400, "Workflow records change only through workflow actions. Refresh the job and retry.");
    if (!canOpenJob(stored, actor)) throw fail(403, noJobAccessMessage);
    if (isDraft(stored) && !hasAccess(actor, "createJob")) throw fail(403, "You are not authorized to edit draft jobs.");
    const changed = (k: keyof JobRecord) => !same(stored[k], proposed[k]);
    if (coordinatorFields.some((k) => changed(k)) && !isCoordinator) throw fail(403, "Only a job coordinator can change the job details.");
    if (stored.operations && (changed("requiredTests") || changed("otherTests"))) throw fail(400, "The original request is preserved. Record scope changes in Scope → Request additional work, with a reason.");
    const otherKeys = Object.keys({ ...stored, ...proposed }).filter((k) => !(coordinatorFields as readonly string[]).includes(k) && !(immutableFields as readonly string[]).includes(k) && !(serverFields as readonly string[]).includes(k));
    const samplingChanged = otherKeys.some((k) => changed(k as keyof JobRecord));
    if (samplingChanged && !isCoordinator) {
      const workers = samplingWorkers(stored);
      if (!hasAccess(actor, "sampling") && !workers.includes(me)) throw fail(403, "You do not have access to update this work area.");
      if (samplingTeam(stored).includes(me) && !workers.includes(me)) throw fail(403, "You are a backup on this job with view-only access. Ask the job coordinator to give you work access in Job access.");
      if (!workers.includes(me) && !canWork(stored, "sampling", me)) throw fail(403, "Only the accepted sampling owner or a job coordinator can update this job workspace.");
      if (!samplingStarted(stored)) throw fail(403, "Start the job first: open the job briefing and press Start job.");
    }
    if (dataSnapshot(stored) !== dataSnapshot(proposed)) {
      if (samplingDataLocked(stored)) throw fail(409, "The sampling data is submitted or reviewed and is read-only. To correct it, reopen it with a reason in Sampling review & report.");
      const reports = stored.operations?.samplingReports || [];
      if (reports.some((r) => ["Checking", "Awaiting Approval", "Approved"].includes(r.status)) && !["Draft", "Changes Requested"].includes(latest(reports)!.status)) throw fail(409, "Submitted sampling data is locked. Request a report revision before editing.");
    }
    if (stored.operations && stored.report?.reportStatus === "Completed" && changed("report")) throw fail(409, "The approved report cannot be changed.");
    if (!stored.operations && stored.report && stored.report.reportStatus !== "Draft" && (changed("report") || dataSnapshot(stored) !== dataSnapshot(proposed))) {
      const approver = actor.roles?.samplingApproval;
      if (!(approver === me && stored.report.reportStatus === "Awaiting Approval")) throw fail(409, "Reviewed data is locked. The sampling approver must request changes before editing.");
    }
  });
}

const contentOf = (job: JobRecord) => JSON.stringify(Object.fromEntries(Object.entries(job).filter(([k]) => !["workflowHistory", "lastUpdatedAt", "lastUpdatedById"].includes(k))));
const sameContent = (a: JobRecord, b: JobRecord) => isObject(b) && contentOf(a) === contentOf(b);

/** Server-maintained fields are taken from the stored record (or cleared), then the update is stamped. */
function finalize(stored: JobRecord | undefined, proposed: JobRecord, who: Who, values: Records, at: string): JobRecord {
  const next: JobRecord = { ...proposed, operations: stored?.operations, trash: stored?.trash, workflowHistory: stored?.workflowHistory, lastUpdatedById: who.employeeId, lastUpdatedAt: at };
  if (!next.operations) delete next.operations;
  if (!next.trash) delete next.trash;
  return withRecords(values, () => prepareJobForSave(next, stored));
}

/** Writes the job row and its audit entry in one transaction (the data layer's `jobs` table, with job number and Trash flag). */
async function writeJob(db: D1Database, id: string, job: JobRecord, baseRevision: number, who: Who, at: string, action: string, detail: Record<string, unknown> = {}) {
  const payload = JSON.stringify(job);
  if (new TextEncoder().encode(payload).length > 1_900_000) throw fail(413, "This job record is too large to save. Remove large attachments and retry.");
  const write = baseRevision === 0
    ? db.prepare("INSERT INTO jobs (id, job_number, payload, revision, trashed, updated_by, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(id, job.jobNumber || id, payload, job.trash ? 1 : 0, who.employeeId, at)
    : db.prepare("UPDATE jobs SET payload = ?, job_number = ?, trashed = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ? AND revision = ?").bind(payload, job.jobNumber || id, job.trash ? 1 : 0, who.employeeId, at, id, baseRevision);
  const [result] = await db.batch([write, auditStatement(db, { ...who, action, target: id, detail: { fromRevision: baseRevision, toRevision: baseRevision + 1, operationsRevision: job.operations?.revision, ...detail } }, at, true)]);
  if (!result.meta.changes) throw fail(409, "This job was changed by someone else. The workspace will reload with the saved version; your change was not saved.");
  return baseRevision + 1;
}

/** Commands must be plain workflow commands; the actor inside them is never taken from the request. */
function readCommands(value: unknown): Command[] {
  if (!Array.isArray(value) || !value.length || value.length > 50 || value.some((c) => !isObject(c) || typeof c.type !== "string")) throw fail(400, "The workflow action could not be read.");
  return value as Command[];
}

/** Saves a job from the job editor, optionally followed by workflow commands (Send to Sampling). */
export async function saveJob(db: D1Database, ctx: Context, who: Who, id: string, body: { job?: unknown; revision?: unknown; commands?: unknown }, at = new Date().toISOString()) {
  const jobs = await loadJobs(db), all = [...jobs.values()].map((s) => s.job);
  const stored = jobs.get(id), proposed = body.job as JobRecord;
  const actor = actorFor(ctx, who.employeeId, all);
  // Access is checked before anything else, so a job this employee cannot open reveals nothing about its state.
  if (stored && !withRecords(ctx.values, () => canOpenJob(stored.job, actor))) throw fail(403, noJobAccessMessage);
  if (!Number.isInteger(body.revision) || body.revision !== (stored?.revision ?? 0)) throw fail(409, "This job was changed by someone else. The workspace will reload with the saved version; your change was not saved.");
  if (!isObject(proposed) || proposed.id !== id) throw fail(400, "The job record could not be read.");
  // Nothing but server-maintained fields differs: keep the stored record untouched (no new revision, no audit entry).
  if (stored && body.commands === undefined && sameContent(stored.job, proposed)) return { job: stored.job, revision: stored.revision };
  checkJobSave(ctx, actor, stored?.job, proposed, all);
  let next = finalize(stored?.job, proposed, who, ctx.values, at);
  const commands = body.commands === undefined ? [] : readCommands(body.commands);
  if (commands.length) next = runCommands(ctx, actor, next, commands, at, !stored);
  const revision = await writeJob(db, id, next, stored?.revision ?? 0, who, at, stored ? "job.saved" : "job.created", commands.length ? { commands: commands.map((c) => c.type) } : {});
  return { job: next, revision };
}

function runCommands(ctx: Context, actor: Actor, job: JobRecord, commands: Command[], at: string, creating = false): JobRecord {
  return withRecords(ctx.values, () => {
    try {
      // A new job is dispatched straight after creation, as in the job editor; other commands need job access.
      const updated = commands.reduce((current, command) => creating && command.type === "dispatch" ? applyOperation(current, command, actor, at) : applyJobOperation(current, command, actor, at), job);
      return prepareJobForSave({ ...updated, lastUpdatedById: actor.id, lastUpdatedAt: at }, job);
    } catch (error) { throw fail(403, error instanceof Error ? error.message : "This workflow action is not available to you."); }
  });
}

/** Applies workflow commands on the server with the session's employee as the actor (sampling, scope, lab, QC, approvals). */
export async function runJobOperations(db: D1Database, ctx: Context, who: Who, id: string, body: { commands?: unknown; revision?: unknown }, at = new Date().toISOString()) {
  const jobs = await loadJobs(db), stored = jobs.get(id);
  const actor = actorFor(ctx, who.employeeId, [...jobs.values()].map((s) => s.job));
  if (!stored || !withRecords(ctx.values, () => canOpenJob(stored.job, actor))) throw fail(stored ? 403 : 404, stored ? noJobAccessMessage : "Job no longer exists.");
  if (body.revision !== stored.revision) throw fail(409, "This job was changed by someone else. The workspace will reload with the saved version; your change was not saved.");
  const commands = readCommands(body.commands);
  const next = runCommands(ctx, actor, stored.job, commands, at);
  const revision = await writeJob(db, id, next, stored.revision, who, at, "job.command", { commands: commands.map((c) => c.type) });
  return { job: next, revision };
}

export async function trashOrRestore(db: D1Database, ctx: Context, who: Who, id: string, mode: "trash" | "restore", revision: unknown, at = new Date().toISOString()) {
  const jobs = await loadJobs(db), stored = jobs.get(id);
  const all = [...jobs.values()].map((s) => s.job);
  const actor = actorFor(ctx, who.employeeId, all);
  if (!stored || !visibleJobs(ctx, actor, new Map([[id, stored]])).length) throw fail(stored ? 403 : 404, stored ? noJobAccessMessage : "Job no longer exists.");
  if (revision !== stored.revision) throw fail(409, "This job was changed by someone else. The workspace will reload with the saved version.");
  const next = withRecords(ctx.values, () => {
    try {
      if (mode === "restore") assertJobNumberAvailable(stored.job, all);
      return mode === "trash" ? trashJob(stored.job, actor, at) : restoreJob(stored.job, actor, at);
    } catch (error) { throw fail(403, error instanceof Error ? error.message : "This action is not available to you."); }
  });
  const nextRevision = await writeJob(db, id, next, stored.revision, who, at, mode === "trash" ? "job.trashed" : "job.restored");
  return { job: next, revision: nextRevision };
}

/* ---------- activity history ---------- */

export async function addActivity(db: D1Database, who: Who, input: { action?: unknown; jobId?: unknown }, at = new Date().toISOString()) {
  if (typeof input.action !== "string" || !input.action.trim() || input.action.length > 500) throw fail(400, "The activity could not be read.");
  const id = crypto.randomUUID(), jobId = typeof input.jobId === "string" ? input.jobId.slice(0, 80) : null;
  await db.prepare("INSERT INTO activity_log (id, employee_id, action, job_id, at) VALUES (?, ?, ?, ?, ?)").bind(id, who.employeeId, input.action.trim(), jobId, at).run();
  return { id, employeeId: who.employeeId, action: input.action.trim(), jobId: jobId || "", timestamp: at };
}
/** Company-overview holders see everyone's recent activity; everyone else sees their own. */
export async function listActivities(db: D1Database, ctx: Context, actor: Actor) {
  const all = can(ctx, actor, "companyOverview");
  const query = all ? db.prepare("SELECT id, employee_id, action, job_id, at FROM activity_log ORDER BY at DESC LIMIT 80") : db.prepare("SELECT id, employee_id, action, job_id, at FROM activity_log WHERE employee_id = ? ORDER BY at DESC LIMIT 80").bind(actor.id);
  const { results } = await query.all<{ id: string; employee_id: string; action: string; job_id: string | null; at: string }>();
  return results.map((r) => ({ id: r.id, employeeId: r.employee_id, action: r.action, jobId: r.job_id || "", timestamp: r.at }));
}

/* ---------- the signed-in workspace ---------- */

export async function workspaceFor(db: D1Database, ctx: Context, who: Who & { username: string; mustChangePassword: boolean }) {
  const jobs = await loadJobs(db);
  const all = [...jobs.values()].map((s) => s.job);
  const actor = actorFor(ctx, who.employeeId, all);
  const visible = visibleJobs(ctx, actor, jobs);
  const revisions = await db.prepare("SELECT key, revision FROM settings").all<{ key: string; revision: number }>();
  const records: Record<string, string> = {};
  for (const key of sharedKeys) { const value = ctx.values.get(key); if (value !== undefined) records[key] = key === directoryKey ? JSON.stringify(publicDirectory(JSON.parse(value))) : value; }
  return {
    me: { accountId: who.accountId, employeeId: who.employeeId, username: who.username, mustChangePassword: who.mustChangePassword },
    records,
    revisions: Object.fromEntries(revisions.results.filter((r) => isSharedKey(r.key)).map((r) => [r.key, r.revision])),
    jobs: visible.map(({ job, revision }) => ({ job, revision })),
    // Job creators need every job number (not the records) to number new jobs without collisions.
    jobIndex: can(ctx, actor, "createJob") ? all.map((j) => ({ id: j.id, jobNumber: j.jobNumber, globalSequence: j.globalSequence, trash: !!j.trash })) : [],
    activities: await listActivities(db, ctx, actor),
  };
}

export { responsibilitiesKey, labTeamsKey, testRoutingKey, equipmentKey, requestListsKey, cylinderStatusKey };
