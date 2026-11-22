/**
 * Sites edition: the signed-in workspace held in memory and kept in step with the server.
 *
 * The server is the authority. Every change is sent with the revision it was based on; the server re-checks the
 * signed-in employee's permissions and either stores it (returning the stored version) or refuses it. On a refusal
 * or a conflict the workspace reloads from the server, so the screen never keeps a change that was not saved.
 */
"use client";
import type { FilePurpose } from "./file-routing";
import { installBrowserStore, isSharedKey, jobsKey, activityKey, type StorageLike } from "./app-storage";
import type { JobRecord } from "./page";
import type { Command } from "./operations-model";

export type Me = { accountId: string; employeeId: string; username: string; mustChangePassword: boolean };
export type Workspace = { me: Me; records: Record<string, string>; revisions: Record<string, number>; jobs: { job: JobRecord; revision: number }[]; jobIndex: { id: string; jobNumber?: string; globalSequence?: number; trash: boolean }[]; activities: unknown[] };
type Intent = { kind: "operations"; commands: Command[] } | { kind: "trash" | "restore" } | { kind: "save"; base?: JobRecord; commands?: Command[] };

export class ApiError extends Error { constructor(public status: number, message: string, public signedOut = false) { super(message); } }

/** Every request carries the same-origin marker header; the session cookie is HttpOnly and never visible here. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-VAPS-Request", "1");
  let body = init.body;
  if (init.json !== undefined) { headers.set("Content-Type", "application/json"); body = JSON.stringify(init.json); }
  let response: Response;
  try { response = await fetch(path, { ...init, body, headers, credentials: "same-origin", cache: "no-store" }); }
  catch { throw new ApiError(0, "The server could not be reached. Check your connection; nothing was saved."); }
  const data = (await response.json().catch(() => ({}))) as { error?: string; signedOut?: boolean };
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent("vaps-signed-out", { detail: data.error || "Your session has ended. Sign in again." }));
    throw new ApiError(response.status, data.error || "The request failed. Please retry.", !!data.signedOut);
  }
  return data as T;
}

let records = new Map<string, string>();
let revisions = new Map<string, number>();
let jobs: JobRecord[] = [];
const jobRevisions = new Map<string, number>();
let jobIndex: Workspace["jobIndex"] = [];
let signedIn: Me | null = null;
/** The signed-in employee as confirmed by the server (interface hints only; the server checks every request). */
export const signedInEmployee = () => signedIn?.employeeId || null;
let activities: unknown[] = [];
const intents = new Map<string, Intent>();
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<(event: SyncEvent) => void>();
export type SyncEvent = { type: "job"; job: JobRecord } | { type: "error"; message: string } | { type: "saved" };
export const onSync = (listener: (event: SyncEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = (event: SyncEvent) => listeners.forEach((l) => l(event));

/** Job numbers of every job (for job creators), so new numbers never collide with jobs this employee cannot open. */
export const allJobNumbers = () => jobIndex;
export const loadedActivities = () => activities;

/** Runs server writes one at a time, in the order they were made, so each one is based on the previous result. */
let generation = 0;
function enqueue(work: () => Promise<void>) {
  const mine = generation;
  // After a refusal every later queued change is dropped: it was based on a version the server did not accept.
  queue = queue.then(() => mine === generation ? work().then(() => emit({ type: "saved" })) : undefined).catch((error: unknown) => {
    generation++;
    const message = error instanceof Error ? error.message : "The change could not be saved.";
    emit({ type: "error", message: `Not saved: ${message}` });
  });
  return queue;
}
/** Resolves when every queued change has been answered by the server. */
export const settled = () => queue.then(() => undefined, () => undefined);

/** Declares how the next saved version of a job reaches the server (workflow commands, Trash, or an editor save). */
export function jobIntent(id: string, intent: Intent) { intents.set(id, intent); }

/** A job as compared for changes: the history timeline and update stamp are maintained by the server. */
const comparable = (job: JobRecord) => { const { workflowHistory: _h, lastUpdatedAt: _a, lastUpdatedById: _b, ...rest } = job; void _h; void _a; void _b; return JSON.stringify(rest); };

function sendJobs(next: JobRecord[]) {
  const before = new Map(jobs.map((j) => [j.id, comparable(j)]));
  // Only jobs the employee acted on are sent (declared with jobIntent). Other differences are local display
  // normalisation done on every save; the server copy stays as stored.
  const changed = next.filter((j) => intents.has(j.id) && before.get(j.id) !== comparable(j));
  for (const j of next) if (!changed.includes(j)) intents.delete(j.id);
  jobs = next;
  for (const job of changed) {
    const intent = intents.get(job.id)!;
    intents.delete(job.id);
    enqueue(async () => {
      const revision = jobRevisions.get(job.id) ?? 0, id = encodeURIComponent(job.id);
      const result = intent.kind === "operations"
        ? await api<{ job: JobRecord; revision: number }>(`/api/jobs/${id}/operations`, { method: "POST", json: { commands: intent.commands, revision } })
        : intent.kind !== "save"
          ? await api<{ job: JobRecord; revision: number }>(`/api/jobs/${id}/trash`, { method: "POST", json: { mode: intent.kind, revision } })
          : await api<{ job: JobRecord; revision: number }>(`/api/jobs/${id}`, { method: "PUT", json: { job: intent.base || job, revision, ...(intent.commands ? { commands: intent.commands } : {}) } });
      jobRevisions.set(result.job.id, result.revision);
      jobs = jobs.map((j) => j.id === result.job.id ? result.job : j);
      emit({ type: "job", job: result.job });
    });
  }
}

function sendActivities(next: { id: string; action: string; jobId?: string }[]) {
  const known = new Set((activities as { id: string }[]).map((a) => a.id));
  activities = next;
  for (const entry of next.filter((a) => !known.has(a.id)).reverse()) enqueue(async () => { await api("/api/activities", { method: "POST", json: { action: entry.action, jobId: entry.jobId } }); });
}

function sendRecord(key: string, value: string) {
  if (records.get(key) === value) return;
  records.set(key, value);
  enqueue(async () => {
    const result = await api<{ revision: number; value: string }>(`/api/workspace/records/${encodeURIComponent(key)}`, { method: "PUT", json: { value, revision: revisions.get(key) ?? 0 } });
    revisions.set(key, result.revision);
    records.set(key, result.value);
  });
}

/** Storage seen by the workspace in the Sites edition: shared records in memory, preferences in this browser. */
const store: StorageLike = {
  getItem(key) {
    if (key === jobsKey) return JSON.stringify(jobs);
    if (key === activityKey) return JSON.stringify(activities);
    if (isSharedKey(key)) return records.get(key) ?? null;
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key, value) {
    if (key === jobsKey) return sendJobs(JSON.parse(value));
    if (key === activityKey) return sendActivities(JSON.parse(value));
    if (isSharedKey(key)) return sendRecord(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* preference only */ }
  },
  removeItem(key) { if (!isSharedKey(key) && key !== jobsKey && key !== activityKey) try { window.localStorage.removeItem(key); } catch { /* preference only */ } },
};

/** Loads the signed-in workspace from the server and makes it the workspace storage. */
export async function loadWorkspace(): Promise<Workspace> {
  const data = await api<Workspace>("/api/workspace");
  generation++;
  records = new Map(Object.entries(data.records));
  revisions = new Map(Object.entries(data.revisions));
  jobs = data.jobs.map((j) => j.job);
  jobRevisions.clear(); for (const j of data.jobs) jobRevisions.set(j.job.id, j.revision);
  jobIndex = data.jobIndex; activities = data.activities; intents.clear(); signedIn = data.me;
  installBrowserStore(store);
  return data;
}

export function clearWorkspace() {
  generation++;
  records = new Map(); revisions = new Map(); jobs = []; jobRevisions.clear(); jobIndex = []; activities = []; intents.clear(); signedIn = null;
  installBrowserStore(null);
}

/* ---------- files (Sites edition) ---------- */
/** Which job a file belongs to and what it is; the server picks its OneDrive folder from that (OneDrive pilot). */
export type UploadTarget = { jobId: string; purpose: FilePurpose };
export type CopyResult = { status: "off" | "ok" | "error"; message?: string; name?: string; renamed?: boolean; savedInVaps?: boolean };
/** Sent after each job upload so the job's OneDrive panel can say what happened (`vaps-file-copy` window event). */
export type CopyUpload = { jobId: string; name: string; purpose: FilePurpose; copy: CopyResult };
export async function uploadToServer(file: File, anyType: boolean, target?: UploadTarget) {
  const form = new FormData(); form.set("file", file); if (anyType) form.set("anyType", "1");
  if (target) { form.set("jobId", target.jobId); form.set("purpose", target.purpose); }
  const { id, name, size, type, copy } = await api<{ id: string; name: string; size: number; type: string; copy?: CopyResult }>("/api/files", { method: "POST", body: form });
  // The OneDrive copy is secondary: the Workflow VAPS upload already succeeded. The job panel reports the copy.
  if (target && copy && typeof window !== "undefined") window.dispatchEvent(new CustomEvent<CopyUpload>("vaps-file-copy", { detail: { jobId: target.jobId, name, purpose: target.purpose, copy } }));
  return { id, name, size, type };
}
/** Fetches a file the server releases to this employee. The server decides which files are restricted workbooks. */
export async function fileFromServer(id: string, mode: "view" | "download"): Promise<Blob> {
  const response = await fetch(`/api/files/${encodeURIComponent(id)}?mode=${mode}`, { credentials: "same-origin", cache: "no-store", headers: { "X-VAPS-Request": "1" } });
  if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; if (response.status === 401) window.dispatchEvent(new CustomEvent("vaps-signed-out", { detail: data.error })); throw new ApiError(response.status, data.error || "The file could not be opened."); }
  return response.blob();
}
