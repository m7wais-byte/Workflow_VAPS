/**
 * Microsoft 365 pilot: mirrors jobs and their uploaded files to a VAPS-owned SharePoint test site through Microsoft
 * Graph (application permission, client-credentials flow). D1 + R2 stay the system of record; SharePoint is a copy.
 *
 *  - A job's first save creates  <Jobs library>/<Job ID>/Sampling  and  <Job ID>/Lab  (existing folders are reused).
 *  - Every save adds or updates exactly one row in the Job Register list, keyed by Job ID (the list's Title column,
 *    which IT sets to "Enforce unique values").
 *  - An upload made for a job goes to that job's Sampling or Lab folder. A name clash never replaces the existing
 *    file: SharePoint keeps both and the new copy gets a numbered name, which is recorded and returned.
 *  - A SharePoint failure never blocks or undoes the VAPS save. It is recorded in D1 (sharepoint_jobs /
 *    sharepoint_files) and retried on the job's next save, or by an administrator (POST /api/admin/sharepoint).
 *
 * Credentials (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET) are Worker variables/secrets read only here; nothing in
 * this module is sent to the browser except a status and, for a failure, a short message.
 */
import type { JobRecord } from "../app/page";
import { audit } from "./auth";

export const SECTIONS = { sampling: "Sampling", lab: "Lab" } as const;
export type Section = keyof typeof SECTIONS;
export const isSection = (v: unknown): v is Section => v === "sampling" || v === "lab";

export type SharePointConfig = { tenantId: string; clientId: string; clientSecret: string; hostname: string; sitePath: string; library: string; register: string };
export type SyncStatus = { status: "off" | "ok" | "error"; message?: string };

const GRAPH = "https://graph.microsoft.com/v1.0";
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Null when the pilot is not configured: VAPS then works exactly as before. */
export function sharePointConfig(env: Record<string, unknown>): SharePointConfig | null {
  const tenantId = text(env.MS_TENANT_ID), clientId = text(env.MS_CLIENT_ID), clientSecret = text(env.MS_CLIENT_SECRET), site = text(env.SHAREPOINT_SITE_URL);
  if (!tenantId || !clientId || !clientSecret || !site) return null;
  let url: URL;
  try { url = new URL(site); } catch { return null; }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".sharepoint.com")) return null;
  return { tenantId, clientId, clientSecret, hostname: url.hostname, sitePath: url.pathname.replace(/\/+$/, ""), library: text(env.SHAREPOINT_LIBRARY) || "Jobs", register: text(env.SHAREPOINT_REGISTER_LIST) || "Job Register" };
}

class GraphError extends Error { constructor(readonly status: number, message: string) { super(message); } }
/** Messages shown to employees never include tokens, IDs or Graph response bodies. */
const safeMessage = (e: unknown) => e instanceof GraphError
  ? (e.status === 401 || e.status === 403 ? "SharePoint refused access (check the app registration and its site permission)." : e.status === 404 ? "The SharePoint site, Jobs library or Job Register list was not found." : `SharePoint returned an error (${e.status}).`)
  : "SharePoint could not be reached.";

/* ---------- Graph client ---------- */

type Token = { value: string; expires: number };
const tokens = new Map<string, Token>();
const targets = new Map<string, { siteId: string; driveId: string; listId: string }>();

async function token(c: SharePointConfig): Promise<string> {
  const key = c.tenantId + "|" + c.clientId, cached = tokens.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.value;
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret, scope: "https://graph.microsoft.com/.default" });
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, { method: "POST", body, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new GraphError(r.status === 400 ? 401 : r.status, "token");
  const data = await r.json() as { access_token: string; expires_in: number };
  tokens.set(key, { value: data.access_token, expires: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

async function graph<T = Record<string, unknown>>(c: SharePointConfig, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const raw = body instanceof ArrayBuffer;
    const r = await fetch(GRAPH + path, {
      method, signal: AbortSignal.timeout(30_000), body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      headers: { Authorization: "Bearer " + await token(c), ...(body === undefined ? {} : { "Content-Type": raw ? "application/octet-stream" : "application/json" }), ...headers },
    });
    // Throttling or a passing outage: one short retry, then give up and record the failure.
    if ((r.status === 429 || r.status >= 500) && attempt === 0) { await new Promise((ok) => setTimeout(ok, Math.min(2000, 1000 * Number(r.headers.get("Retry-After") || 1)))); continue; }
    if (!r.ok) throw new GraphError(r.status, `${method} ${path.split("?")[0]}`);
    return (r.status === 204 ? {} : await r.json()) as T;
  }
}

/** Site, library (drive) and list IDs, resolved once per Worker instance from the configured names. */
async function resolve(c: SharePointConfig) {
  const key = c.hostname + c.sitePath + "|" + c.library + "|" + c.register, known = targets.get(key);
  if (known) return known;
  const site = await graph<{ id: string }>(c, "GET", `/sites/${c.hostname}:${c.sitePath}?$select=id`);
  const drives = await graph<{ value: { id: string; name: string }[] }>(c, "GET", `/sites/${site.id}/drives?$select=id,name`);
  const lists = await graph<{ value: { id: string; displayName: string }[] }>(c, "GET", `/sites/${site.id}/lists?$select=id,displayName`);
  const drive = drives.value.find((d) => d.name === c.library), list = lists.value.find((l) => l.displayName === c.register);
  if (!drive || !list) throw new GraphError(404, "library or list");
  const found = { siteId: site.id, driveId: drive.id, listId: list.id };
  targets.set(key, found);
  return found;
}

type Item = { id: string; name: string; webUrl?: string };
const seg = (s: string) => encodeURIComponent(s);

/** Creates a folder, or reuses the one already there (a retry, or a second save racing the first). */
async function ensureFolder(c: SharePointConfig, driveId: string, parent: { id: string; path: string } | null, name: string): Promise<Item & { path: string }> {
  const path = parent ? parent.path + "/" + name : name;
  try {
    const created = await graph<Item>(c, "POST", parent ? `/drives/${driveId}/items/${parent.id}/children` : `/drives/${driveId}/root/children`, { name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" });
    return { ...created, path };
  } catch (e) {
    if (!(e instanceof GraphError && e.status === 409)) throw e;
    const existing = await graph<Item & { folder?: unknown }>(c, "GET", `/drives/${driveId}/root:/${path.split("/").map(seg).join("/")}?$select=id,name,webUrl,folder`);
    if (!existing.folder) throw new GraphError(409, "a file with the folder's name exists");
    return { ...existing, path };
  }
}

/** Folder names follow the Job ID; characters SharePoint does not allow are refused rather than altered. */
const folderName = (jobId: string) => { if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,120}$/.test(jobId)) throw new GraphError(400, "job id"); return jobId; };

/* ---------- D1 bookkeeping ---------- */

type JobRow = { job_id: string; folder_id: string | null; sampling_id: string | null; lab_id: string | null; folder_url: string | null; register_item_id: string | null };
const jobRow = (db: D1Database, id: string) => db.prepare("SELECT job_id, folder_id, sampling_id, lab_id, folder_url, register_item_id FROM sharepoint_jobs WHERE job_id = ?").bind(id).first<JobRow>();

async function saveJobRow(db: D1Database, id: string, fields: Partial<Omit<JobRow, "job_id">> & { status: string; last_error: string | null }, at: string) {
  const cols = Object.keys(fields) as (keyof typeof fields)[];
  await db.prepare(`INSERT INTO sharepoint_jobs (job_id, ${cols.join(", ")}, updated_at) VALUES (?, ${cols.map(() => "?").join(", ")}, ?)
    ON CONFLICT(job_id) DO UPDATE SET ${cols.map((k) => `${k} = excluded.${k}`).join(", ")}, updated_at = excluded.updated_at`)
    .bind(id, ...cols.map((k) => fields[k] ?? null), at).run();
}

/** The job's three folders: from D1 when already created, otherwise created (or found) in SharePoint and recorded. */
async function jobFolders(c: SharePointConfig, db: D1Database, jobId: string, at: string) {
  const { driveId } = await resolve(c);
  const row = await jobRow(db, jobId);
  if (row?.folder_id && row.sampling_id && row.lab_id) return { driveId, row };
  const root = await ensureFolder(c, driveId, null, folderName(jobId));
  const sampling = await ensureFolder(c, driveId, root, SECTIONS.sampling), lab = await ensureFolder(c, driveId, root, SECTIONS.lab);
  const fields = { folder_id: root.id, sampling_id: sampling.id, lab_id: lab.id, folder_url: root.webUrl || null };
  await saveJobRow(db, jobId, { ...fields, status: "folders", last_error: null }, at);
  return { driveId, row: { job_id: jobId, register_item_id: row?.register_item_id ?? null, ...fields } };
}

/* ---------- Job Register ---------- */

/** One register row per job. Columns are single-line text; the internal names are listed in M365-PILOT.md. */
export function registerFields(job: JobRecord, folderUrl: string | null, at: string) {
  return {
    Title: job.id, JobNumber: job.jobNumber || job.id, ClientName: job.clientName || "", FieldArea: job.fieldArea || "",
    Well: job.well || (job.wells || []).join(", "), Status: job.trash ? "In Trash" : job.status || "", CurrentStage: job.currentStage || "",
    DueDate: job.dueDate || "", FolderUrl: folderUrl || "", UpdatedAt: at,
  };
}

async function upsertRegister(c: SharePointConfig, db: D1Database, job: JobRecord, row: JobRow, at: string): Promise<string> {
  const { siteId, listId } = await resolve(c);
  const items = `/sites/${siteId}/lists/${listId}/items`, fields = registerFields(job, row.folder_url, at);
  if (row.register_item_id) {
    try { await graph(c, "PATCH", `${items}/${row.register_item_id}/fields`, fields); return row.register_item_id; }
    catch (e) { if (!(e instanceof GraphError && e.status === 404)) throw e; } // Row deleted in SharePoint: find or re-add it.
  }
  const find = async () => (await graph<{ value: { id: string }[] }>(c, "GET", `${items}?$select=id&$filter=fields/Title eq '${job.id.replace(/'/g, "''")}'`, undefined, { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" })).value[0]?.id;
  let id = await find();
  if (!id) {
    try { id = (await graph<{ id: string }>(c, "POST", items, { fields })).id; }
    catch (e) { if (!(e instanceof GraphError && e.status === 409)) throw e; id = await find(); if (!id) throw e; } // Unique Title: another save added it first.
    return id;
  }
  await graph(c, "PATCH", `${items}/${id}/fields`, fields);
  return id;
}

/* ---------- Public entry points ---------- */

/**
 * After a job is saved in D1: ensure its folders, add/update its register row, then retry any of its uploads that
 * did not reach SharePoint earlier. Never throws; returns a status for the API reply.
 */
export async function syncJob(env: Record<string, unknown>, db: D1Database, bucket: R2Bucket | undefined, job: JobRecord, who: { accountId: string; employeeId: string }, at = new Date().toISOString()): Promise<SyncStatus> {
  const c = sharePointConfig(env);
  if (!c) return { status: "off" };
  try {
    const { row } = await jobFolders(c, db, job.id, at);
    const itemId = await upsertRegister(c, db, job, row, at);
    await saveJobRow(db, job.id, { register_item_id: itemId, status: "ok", last_error: null }, at);
    if (bucket) {
      const { results } = await db.prepare("SELECT file_id FROM sharepoint_files WHERE job_id = ? AND status <> 'ok' LIMIT 5").bind(job.id).all<{ file_id: string }>();
      for (const f of results) await mirrorFile(env, db, bucket, f.file_id, who, at);
    }
    return { status: "ok" };
  } catch (e) {
    const message = safeMessage(e);
    await saveJobRow(db, job.id, { status: "error", last_error: message }, at).catch(() => {});
    await audit(db, { ...who, action: "sharepoint.failed", target: job.id, detail: { step: "job", message } }, at).catch(() => {});
    return { status: "error", message: message + " The job was saved in VAPS; SharePoint will be retried on the next save." };
  }
}

/** Records that an uploaded file belongs to a job section, before it is copied (so a failed copy can be retried). */
export async function routeFile(db: D1Database, fileId: string, jobId: string, section: Section, at: string) {
  await db.prepare("INSERT INTO sharepoint_files (file_id, job_id, section, status, updated_at) VALUES (?, ?, ?, 'pending', ?) ON CONFLICT(file_id) DO NOTHING").bind(fileId, jobId, section, at).run();
}

export type FileStatus = SyncStatus & { name?: string; renamed?: boolean };

/**
 * Copies one routed file from R2 to <Job ID>/<Section>. Idempotent: a file already copied is not copied again.
 * `conflictBehavior=rename` makes SharePoint keep any existing file with the same name and give this copy a numbered
 * name; the stored and returned name says so, so nothing is overwritten silently.
 */
export async function mirrorFile(env: Record<string, unknown>, db: D1Database, bucket: R2Bucket, fileId: string, who: { accountId: string; employeeId: string }, at = new Date().toISOString()): Promise<FileStatus> {
  const c = sharePointConfig(env);
  if (!c) return { status: "off" };
  const routed = await db.prepare("SELECT f.job_id, f.section, f.status, f.sp_name, m.name FROM sharepoint_files f JOIN files m ON m.id = f.file_id WHERE f.file_id = ?").bind(fileId).first<{ job_id: string; section: Section; status: string; sp_name: string | null; name: string }>();
  if (!routed) return { status: "off" };
  if (routed.status === "ok") return { status: "ok", name: routed.sp_name || routed.name, renamed: !!routed.sp_name && routed.sp_name !== routed.name };
  try {
    const { driveId, row } = await jobFolders(c, db, routed.job_id, at);
    const object = await bucket.get(fileId);
    if (!object) throw new GraphError(404, "file bytes");
    const parent = routed.section === "lab" ? row.lab_id : row.sampling_id;
    const name = routed.name.replace(/["*:<>?/\\|#%]/g, "_").replace(/^[.\s~$]+/, "_");
    const item = await graph<Item>(c, "PUT", `/drives/${driveId}/items/${parent}:/${seg(name)}:/content?@microsoft.graph.conflictBehavior=rename`, await object.arrayBuffer());
    await db.prepare("UPDATE sharepoint_files SET status = 'ok', sp_item_id = ?, sp_name = ?, last_error = NULL, updated_at = ? WHERE file_id = ?").bind(item.id, item.name, at, fileId).run();
    const renamed = item.name !== name;
    await audit(db, { ...who, action: "sharepoint.file.copied", target: fileId, detail: { jobId: routed.job_id, section: routed.section, name: item.name, renamed } }, at);
    return { status: "ok", name: item.name, renamed };
  } catch (e) {
    const message = safeMessage(e);
    await db.prepare("UPDATE sharepoint_files SET status = 'error', last_error = ?, updated_at = ? WHERE file_id = ?").bind(message, at, fileId).run().catch(() => {});
    return { status: "error", message: message + " The file is stored in VAPS; SharePoint will be retried on the job's next save." };
  }
}

/** Administrator overview: jobs and files whose SharePoint copy failed or is still pending. */
export async function syncProblems(db: D1Database) {
  const jobs = (await db.prepare("SELECT job_id, status, last_error, updated_at FROM sharepoint_jobs WHERE status <> 'ok' ORDER BY updated_at DESC LIMIT 100").all()).results;
  const files = (await db.prepare("SELECT file_id, job_id, section, status, last_error, updated_at FROM sharepoint_files WHERE status <> 'ok' ORDER BY updated_at DESC LIMIT 100").all()).results;
  return { jobs, files };
}

/** Test hook: forget cached tokens and resolved IDs. */
export const resetSharePointCache = () => { tokens.clear(); targets.clear(); };
