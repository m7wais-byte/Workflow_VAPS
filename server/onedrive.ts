/**
 * Temporary OneDrive for Business pilot. Workflow VAPS (D1 + R2) stays the system of record; OneDrive holds a copy.
 *
 *  - Parent folder: the OneDrive folder link in ONEDRIVE_PARENT_URL (private server configuration, never in the repo).
 *  - A job's first successful save creates <parent>/<Job ID>/Sampling and <parent>/<Job ID>/Lab. Existing folders are
 *    reused (a retry, a second save, or bookkeeping lost).
 *  - Job files go to Sampling or Lab by purpose (app/file-routing.ts, shared with the SharePoint pilot). A name clash
 *    keeps both files: the new copy gets a numbered name, which is recorded and shown in the job.
 *  - OneDrive unavailable: the Workflow VAPS save/upload still succeeds; the failure is recorded, shown in the job, and
 *    retried on the next save or by MA001.
 *
 * Authorization: delegated (Files.ReadWrite), with the VAPS Microsoft account that owns the parent folder, through the
 * device sign-in flow (microsoft.com/devicelogin). MA001 starts it in Workflow VAPS; the account holder signs in and
 * approves. The app registration is a public client, so there is no client secret. The refresh token is stored in D1
 * encrypted with ONEDRIVE_TOKEN_KEY (AES-GCM); access tokens live only in memory. Nothing here is sent to the browser
 * except statuses, the connected account's name and the one-time sign-in code shown to MA001.
 */
import type { JobRecord } from "../app/page";
import { audit } from "./auth";
import { filePurposes, sectionFolder, type FilePurpose, type FileSection } from "../app/file-routing";

export type OneDriveConfig = { tenant: string; clientId: string; parentUrl: string; key: string; expectedAccount: string };
export type SyncStatus = { status: "off" | "ok" | "error"; message?: string };
type Who = { accountId: string; employeeId: string };

const GRAPH = "https://graph.microsoft.com/v1.0";
/**
 * Least privilege: delegated Files.ReadWrite reaches only the signed-in account's own OneDrive, which is enough for a
 * parent folder in that OneDrive (Microsoft lists it as least privileged for /shares, folder creation and upload).
 * No admin consent is required by default. Files.ReadWrite.All would only be needed for a folder in someone else's
 * OneDrive, which this pilot does not support.
 */
const SCOPE = "offline_access User.Read Files.ReadWrite";
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Null when the pilot is not configured: Workflow VAPS then works exactly as before. */
export function oneDriveConfig(env: Record<string, unknown>): OneDriveConfig | null {
  const clientId = text(env.ONEDRIVE_CLIENT_ID), parentUrl = text(env.ONEDRIVE_PARENT_URL), key = text(env.ONEDRIVE_TOKEN_KEY);
  if (!clientId || !parentUrl || key.length < 32) return null;
  try { if (new URL(parentUrl).protocol !== "https:") return null; } catch { return null; }
  return { tenant: text(env.ONEDRIVE_TENANT_ID) || "organizations", clientId, parentUrl, key, expectedAccount: text(env.ONEDRIVE_ACCOUNT).toLowerCase() };
}

class GraphError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const NOT_CONNECTED = "OneDrive is not connected. MA001 must connect the VAPS Microsoft account in Workflow VAPS.";
/** Messages shown to employees never include tokens, codes, IDs, the folder link or Graph response bodies. */
const safeMessage = (e: unknown) => e instanceof GraphError
  ? (e.status === 412 ? NOT_CONNECTED : e.status === 401 || e.status === 403 ? "OneDrive refused access (the connected account cannot write to the pilot folder, or its sign-in has expired)." : e.status === 404 ? "The OneDrive pilot folder was not found. It must be a folder in the connected account's own OneDrive (check the folder link in the server settings)." : `OneDrive returned an error (${e.status}).`)
  : "OneDrive could not be reached.";

/* ---------- Token storage (refresh token encrypted at rest) ---------- */

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function aesKey(secret: string) { return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]); }
async function seal(secret: string, plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return b64(iv) + "." + b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), new TextEncoder().encode(plain)));
}
async function open(secret: string, sealed: string) {
  const [iv, data] = sealed.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(secret), unb64(data)));
}

type AuthRow = { status: string; account: string | null; sealed: string | null; pending: string | null; pending_expires: string | null; pending_interval: number | null; connected_at: string | null; last_error: string | null };
const authRow = (db: D1Database) => db.prepare("SELECT status, account, sealed, pending, pending_expires, pending_interval, connected_at, last_error FROM onedrive_auth WHERE id = 'default'").first<AuthRow>();
async function saveAuth(db: D1Database, fields: Partial<AuthRow>, at: string) {
  // status is NOT NULL and SQLite checks that before ON CONFLICT: the insert always carries one, but only the fields
  // given are updated (a token rotation or a second sign-in must not change the stored status).
  const cols = Object.keys(fields) as (keyof AuthRow)[], insert = cols.includes("status") ? cols : [...cols, "status" as const];
  await db.prepare(`INSERT INTO onedrive_auth (id, ${insert.join(", ")}, updated_at) VALUES ('default', ${insert.map(() => "?").join(", ")}, ?) ON CONFLICT(id) DO UPDATE SET ${cols.map((k) => `${k} = excluded.${k}`).join(", ")}, updated_at = excluded.updated_at`)
    .bind(...insert.map((k) => k === "status" ? fields.status ?? "not-connected" : fields[k] ?? null), at).run();
}

const tokenUrl = (c: OneDriveConfig) => `https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`;
async function tokenRequest(c: OneDriveConfig, params: Record<string, string>) {
  const r = await fetch(tokenUrl(c), { method: "POST", body: new URLSearchParams({ client_id: c.clientId, ...params }), signal: AbortSignal.timeout(15_000) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } };
}

let cached: { key: string; token: string; expires: number } | null = null;
/** A current access token from the stored refresh token; the rotated refresh token is stored again, encrypted. */
async function accessToken(c: OneDriveConfig, db: D1Database): Promise<string> {
  if (cached && cached.key === c.clientId && cached.expires > Date.now() + 60_000) return cached.token;
  const row = await authRow(db);
  if (!row?.sealed || row.status !== "connected") throw new GraphError(412, "not connected");
  const { ok, data } = await tokenRequest(c, { grant_type: "refresh_token", refresh_token: await open(c.key, row.sealed), scope: SCOPE });
  if (!ok || !data.access_token) {
    // Revoked, expired or consent withdrawn: the account must sign in again. Nothing else is changed.
    if (data.error === "invalid_grant" || data.error === "interaction_required") { await saveAuth(db, { status: "expired", sealed: null, last_error: "The Microsoft sign-in expired or was revoked. MA001 must connect OneDrive again." }, new Date().toISOString()); throw new GraphError(412, "expired"); }
    throw new GraphError(503, "token");
  }
  if (data.refresh_token) await saveAuth(db, { sealed: await seal(c.key, data.refresh_token) }, new Date().toISOString());
  cached = { key: c.clientId, token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

async function graph<T = Record<string, unknown>>(c: OneDriveConfig, db: D1Database, method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const raw = body instanceof ArrayBuffer;
    const r = await fetch(GRAPH + path, {
      method, signal: AbortSignal.timeout(30_000), body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      headers: { Authorization: "Bearer " + await accessToken(c, db), ...(body === undefined ? {} : { "Content-Type": raw ? "application/octet-stream" : "application/json" }) },
    });
    if (r.status === 401 && attempt === 0) { cached = null; continue; } // Access token expired early: refresh once.
    if ((r.status === 429 || r.status >= 500) && attempt === 0) { await new Promise((ok) => setTimeout(ok, Math.min(2000, 1000 * Number(r.headers.get("Retry-After") || 1)))); continue; }
    if (!r.ok) throw new GraphError(r.status, `${method} ${path.split("?")[0]}`);
    return (r.status === 204 ? {} : await r.json()) as T;
  }
}

/* ---------- Connecting the VAPS Microsoft account (MA001) ---------- */

export type ConnectionStatus = { configured: boolean; status: "off" | "not-connected" | "pending" | "connected" | "expired"; account: string | null; connectedAt: string | null; error: string | null; signIn?: { url: string; code: string; expiresAt: string } };

export async function connectionStatus(env: Record<string, unknown>, db: D1Database): Promise<ConnectionStatus> {
  const c = oneDriveConfig(env);
  if (!c) return { configured: false, status: "off", account: null, connectedAt: null, error: null };
  const row = await authRow(db);
  const status = (row?.status as ConnectionStatus["status"]) || "not-connected";
  return { configured: true, status, account: row?.account ?? null, connectedAt: row?.connected_at ?? null, error: row?.last_error ?? null };
}

/** Starts the device sign-in. Returns the address and the one-time code to show to MA001 (the code alone grants nothing). */
export async function startSignIn(env: Record<string, unknown>, db: D1Database, who: Who, at = new Date().toISOString()): Promise<ConnectionStatus> {
  const c = oneDriveConfig(env);
  if (!c) return connectionStatus(env, db);
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/devicecode`, { method: "POST", body: new URLSearchParams({ client_id: c.clientId, scope: SCOPE }), signal: AbortSignal.timeout(15_000) });
  const data = await r.json().catch(() => ({})) as { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number; error?: string };
  if (!r.ok || !data.device_code || !data.user_code) {
    const message = data.error === "unauthorized_client" || data.error === "invalid_client" ? "The app registration does not allow device sign-in. In Entra ID → Authentication, set 'Allow public client flows' to Yes." : "Microsoft sign-in could not be started. Check ONEDRIVE_CLIENT_ID and ONEDRIVE_TENANT_ID.";
    await saveAuth(db, { status: (await authRow(db))?.status || "not-connected", last_error: message }, at);
    return { ...(await connectionStatus(env, db)), error: message };
  }
  const expiresAt = new Date(Date.parse(at) + (data.expires_in || 900) * 1000).toISOString();
  await saveAuth(db, { pending: await seal(c.key, data.device_code), pending_expires: expiresAt, pending_interval: data.interval || 5, ...((await authRow(db))?.status === "connected" ? {} : { status: "pending" }), last_error: null }, at);
  await audit(db, { ...who, action: "onedrive.signin-started", target: "onedrive", detail: {} }, at);
  return { ...(await connectionStatus(env, db)), status: "pending", signIn: { url: data.verification_uri || "https://microsoft.com/devicelogin", code: data.user_code, expiresAt } };
}

/** Checks once whether the account holder has signed in and approved. On success the refresh token is stored encrypted. */
export async function pollSignIn(env: Record<string, unknown>, db: D1Database, who: Who, at = new Date().toISOString()): Promise<ConnectionStatus> {
  const c = oneDriveConfig(env), row = await authRow(db);
  if (!c || !row?.pending) return connectionStatus(env, db);
  if (row.pending_expires && Date.parse(row.pending_expires) < Date.parse(at)) { await saveAuth(db, { pending: null, pending_expires: null, status: row.sealed ? "connected" : "not-connected", last_error: "The sign-in code expired before it was approved. Start again." }, at); return connectionStatus(env, db); }
  const { ok, data } = await tokenRequest(c, { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: await open(c.key, row.pending) });
  if (!ok || !data.access_token || !data.refresh_token) {
    if (data.error === "authorization_pending" || data.error === "slow_down") return { ...(await connectionStatus(env, db)), status: "pending" };
    const message = data.error === "authorization_declined" ? "The sign-in was declined." : data.error === "expired_token" ? "The sign-in code expired before it was approved. Start again." : "Microsoft did not approve the sign-in (the tenant may require an administrator to approve this app).";
    await saveAuth(db, { pending: null, pending_expires: null, status: row.sealed ? "connected" : "not-connected", last_error: message }, at);
    return connectionStatus(env, db);
  }
  // Which account approved: only the configured VAPS account may connect (when ONEDRIVE_ACCOUNT is set).
  type Me = { userPrincipalName?: string; mail?: string };
  const me: Me = await fetch(GRAPH + "/me?$select=userPrincipalName,mail", { headers: { Authorization: "Bearer " + data.access_token }, signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : {}) as Promise<Me>).catch(() => ({}));
  const account = (me.userPrincipalName || me.mail || "").toLowerCase();
  if (c.expectedAccount && account !== c.expectedAccount) {
    await saveAuth(db, { pending: null, pending_expires: null, status: row.sealed ? "connected" : "not-connected", last_error: "A different Microsoft account approved the sign-in. Sign in with the VAPS account configured for this pilot." }, at);
    return connectionStatus(env, db);
  }
  await saveAuth(db, { status: "connected", account: account || "Microsoft account", sealed: await seal(c.key, data.refresh_token), pending: null, pending_expires: null, connected_at: at, last_error: null }, at);
  cached = { key: c.clientId, token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  parent = null;
  await audit(db, { ...who, action: "onedrive.connected", target: "onedrive", detail: { account } }, at);
  return connectionStatus(env, db);
}

/** Removes the stored refresh token (also revoke the app at myaccount.microsoft.com → Apps to end it on Microsoft's side). */
export async function disconnect(db: D1Database, who: Who, at = new Date().toISOString()) {
  await saveAuth(db, { status: "not-connected", sealed: null, pending: null, pending_expires: null, account: null, connected_at: null, last_error: null }, at);
  cached = null; parent = null;
  await audit(db, { ...who, action: "onedrive.disconnected", target: "onedrive", detail: {} }, at);
}

/* ---------- Folders ---------- */

type Item = { id: string; name: string; webUrl?: string; folder?: unknown; parentReference?: { driveId?: string } };
const seg = (s: string) => encodeURIComponent(s);
let parent: { url: string; driveId: string; id: string } | null = null;

/** The parent folder from its sharing link (GET /shares/u!<base64url>/driveItem), resolved once per Worker instance. */
async function parentFolder(c: OneDriveConfig, db: D1Database) {
  if (parent?.url === c.parentUrl) return parent;
  const share = "u!" + btoa(c.parentUrl).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  const item = await graph<Item>(c, db, "GET", `/shares/${share}/driveItem?$select=id,name,folder,parentReference`);
  if (!item.folder || !item.parentReference?.driveId) throw new GraphError(404, "parent is not a folder");
  parent = { url: c.parentUrl, driveId: item.parentReference.driveId, id: item.id };
  return parent;
}

/** Creates a folder, or reuses the one already there (a retry, or a second save racing the first). */
async function ensureFolder(c: OneDriveConfig, db: D1Database, driveId: string, parentId: string, name: string): Promise<Item> {
  try { return await graph<Item>(c, db, "POST", `/drives/${driveId}/items/${parentId}/children`, { name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }); }
  catch (e) {
    if (!(e instanceof GraphError && e.status === 409)) throw e;
    const existing = await graph<Item>(c, db, "GET", `/drives/${driveId}/items/${parentId}:/${seg(name)}?$select=id,name,webUrl,folder`);
    if (!existing.folder) throw new GraphError(409, "a file has the folder's name");
    return existing;
  }
}

const folderName = (jobId: string) => { if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,120}$/.test(jobId)) throw new GraphError(400, "job id"); return jobId; };

type JobRow = { folder_id: string | null; sampling_id: string | null; lab_id: string | null; folder_url: string | null };
async function saveJobRow(db: D1Database, id: string, fields: Partial<JobRow> & { status: string; last_error: string | null }, at: string) {
  const cols = Object.keys(fields) as (keyof typeof fields)[];
  await db.prepare(`INSERT INTO onedrive_jobs (job_id, ${cols.join(", ")}, updated_at) VALUES (?, ${cols.map(() => "?").join(", ")}, ?) ON CONFLICT(job_id) DO UPDATE SET ${cols.map((k) => `${k} = excluded.${k}`).join(", ")}, updated_at = excluded.updated_at`)
    .bind(id, ...cols.map((k) => fields[k] ?? null), at).run();
}

/** The job's folders: from D1 when already created, otherwise created (or found) in OneDrive and recorded. */
async function jobFolders(c: OneDriveConfig, db: D1Database, jobId: string, at: string) {
  const { driveId, id: parentId } = await parentFolder(c, db);
  const row = await db.prepare("SELECT folder_id, sampling_id, lab_id, folder_url FROM onedrive_jobs WHERE job_id = ?").bind(jobId).first<JobRow>();
  if (row?.folder_id && row.sampling_id && row.lab_id) return { driveId, row };
  const root = await ensureFolder(c, db, driveId, parentId, folderName(jobId));
  const sampling = await ensureFolder(c, db, driveId, root.id, sectionFolder.sampling), lab = await ensureFolder(c, db, driveId, root.id, sectionFolder.lab);
  const fields = { folder_id: root.id, sampling_id: sampling.id, lab_id: lab.id, folder_url: root.webUrl || null };
  await saveJobRow(db, jobId, { ...fields, status: "ok", last_error: null }, at);
  return { driveId, row: fields };
}

/* ---------- Files ---------- */

type ScopeAttachment = { name?: string; dataUrl?: string };
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Records that an uploaded file belongs to a job, before it is copied (so a failed copy can be retried). */
export async function routeFile(db: D1Database, fileId: string, jobId: string, purpose: FilePurpose, name: string, at: string) {
  await db.prepare("INSERT INTO onedrive_files (file_id, job_id, purpose, section, source, name, status, updated_at) VALUES (?, ?, ?, ?, 'upload', ?, 'pending', ?) ON CONFLICT(file_id) DO NOTHING")
    .bind(fileId, jobId, purpose, filePurposes[purpose].section, name, at).run();
}
export const routedFile = (db: D1Database, jobId: string, purpose: FilePurpose, name: string) =>
  db.prepare("SELECT file_id FROM onedrive_files WHERE job_id = ? AND purpose = ? AND name = ?").bind(jobId, purpose, name).first<{ file_id: string }>();

/** The scope-of-work attachment lives in the job record (data URL). Each distinct attachment is routed once to Sampling. */
async function routeScopeAttachment(db: D1Database, job: JobRecord, at: string) {
  const a = job.scopeOfWorkAttachment as ScopeAttachment | undefined;
  if (!a?.dataUrl || !/^data:[^,]*;base64,/.test(a.dataUrl)) return;
  await db.prepare("INSERT INTO onedrive_files (file_id, job_id, purpose, section, source, name, status, updated_at) VALUES (?, ?, 'scope-of-work', 'sampling', 'job', ?, 'pending', ?) ON CONFLICT(file_id) DO NOTHING")
    .bind("scope-" + (await sha256(a.dataUrl)).slice(0, 40), job.id, String(a.name || "Scope of work").slice(0, 200), at).run();
}
async function scopeBytes(db: D1Database, jobId: string, fileId: string): Promise<ArrayBuffer | null> {
  const row = await db.prepare("SELECT payload FROM jobs WHERE id = ?").bind(jobId).first<{ payload: string }>();
  const a = row && (JSON.parse(row.payload) as JobRecord).scopeOfWorkAttachment as ScopeAttachment | undefined;
  if (!a?.dataUrl || "scope-" + (await sha256(a.dataUrl)).slice(0, 40) !== fileId) return null;
  return unb64(a.dataUrl.slice(a.dataUrl.indexOf(",") + 1)).buffer as ArrayBuffer;
}

const safeName = (n: string) => n.replace(/["*:<>?/\\|#%]/g, "_").replace(/^[.\s~$]+/, "_");
export type FileStatus = SyncStatus & { name?: string; renamed?: boolean; savedInVaps?: boolean };

/**
 * Copies one routed file to <Job ID>/<Sampling|Lab>. Idempotent. `conflictBehavior=rename` keeps any existing file
 * with the same name and gives this copy a numbered name, which is stored and returned (never a silent overwrite).
 */
export async function mirrorFile(env: Record<string, unknown>, db: D1Database, bucket: R2Bucket | undefined, fileId: string, who: Who, at = new Date().toISOString()): Promise<FileStatus> {
  const c = oneDriveConfig(env);
  if (!c) return { status: "off" };
  const routed = await db.prepare("SELECT job_id, section, source, status, name, copy_name FROM onedrive_files WHERE file_id = ?").bind(fileId).first<{ job_id: string; section: FileSection; source: string; status: string; name: string; copy_name: string | null }>();
  if (!routed) return { status: "off" };
  if (routed.status === "ok") return { status: "ok", name: routed.copy_name || routed.name, renamed: !!routed.copy_name && routed.copy_name !== safeName(routed.name), savedInVaps: true };
  try {
    const { driveId, row } = await jobFolders(c, db, routed.job_id, at);
    const bytes = routed.source === "job" ? await scopeBytes(db, routed.job_id, fileId) : await (await bucket?.get(fileId))?.arrayBuffer();
    if (!bytes) throw new GraphError(410, "file bytes");
    const name = safeName(routed.name);
    const put = (f: typeof row) => graph<Item>(c, db, "PUT", `/drives/${driveId}/items/${routed.section === "lab" ? f.lab_id : f.sampling_id}:/${seg(name)}:/content?@microsoft.graph.conflictBehavior=rename`, bytes);
    let item: Item;
    try { item = await put(row); }
    catch (e) {
      // The recorded folder was deleted or moved in OneDrive: forget it, find or re-create the job folders, try once more.
      if (!(e instanceof GraphError && e.status === 404)) throw e;
      await db.prepare("DELETE FROM onedrive_jobs WHERE job_id = ?").bind(routed.job_id).run();
      parent = null;
      item = await put((await jobFolders(c, db, routed.job_id, at)).row);
    }
    await db.prepare("UPDATE onedrive_files SET status = 'ok', item_id = ?, copy_name = ?, last_error = NULL, updated_at = ? WHERE file_id = ?").bind(item.id, item.name, at, fileId).run();
    const renamed = item.name !== name;
    await audit(db, { ...who, action: "onedrive.file.copied", target: fileId, detail: { jobId: routed.job_id, section: routed.section, name: item.name, renamed } }, at);
    return { status: "ok", name: item.name, renamed, savedInVaps: true };
  } catch (e) {
    const replaced = e instanceof GraphError && e.status === 410;
    const message = replaced ? "This version is no longer in Workflow VAPS (it was replaced), so it was not copied." : safeMessage(e);
    await db.prepare("UPDATE onedrive_files SET status = ?, last_error = ?, updated_at = ? WHERE file_id = ?").bind(replaced ? "replaced" : "error", message, at, fileId).run().catch(() => {});
    return { status: "error", message, savedInVaps: true };
  }
}

/**
 * After a job is saved in D1: ensure its folders (first save creates them), route its scope-of-work attachment, then
 * copy its files that have not reached OneDrive yet. Never throws; returns a status for the API reply.
 */
export async function syncJob(env: Record<string, unknown>, db: D1Database, bucket: R2Bucket | undefined, job: JobRecord, who: Who, at = new Date().toISOString()): Promise<SyncStatus> {
  await routeScopeAttachment(db, job, at).catch(() => {});
  const c = oneDriveConfig(env);
  if (!c) return { status: "off" };
  try { await jobFolders(c, db, job.id, at); }
  catch (e) {
    const message = safeMessage(e);
    await saveJobRow(db, job.id, { status: "error", last_error: message }, at).catch(() => {});
    await audit(db, { ...who, action: "onedrive.failed", target: job.id, detail: { step: "folders", message } }, at).catch(() => {});
    return { status: "error", message: message + " The job was saved in Workflow VAPS; OneDrive will be retried on the next save." };
  }
  const { results } = await db.prepare("SELECT file_id FROM onedrive_files WHERE job_id = ? AND status IN ('pending', 'error') ORDER BY updated_at LIMIT 20").bind(job.id).all<{ file_id: string }>();
  let failed = 0;
  for (const f of results) if ((await mirrorFile(env, db, bucket, f.file_id, who, at)).status === "error") failed++;
  return failed ? { status: "error", message: `${failed} file${failed === 1 ? "" : "s"} could not be copied to OneDrive. The originals are saved in Workflow VAPS.` } : { status: "ok" };
}

/** What the job page shows. The folder link is shown only to people who can open the job; OneDrive's own sharing decides who can open it. */
export async function jobSyncStatus(env: Record<string, unknown>, db: D1Database, jobId: string) {
  const job = await db.prepare("SELECT status, last_error, folder_url, updated_at FROM onedrive_jobs WHERE job_id = ?").bind(jobId).first<{ status: string; last_error: string | null; folder_url: string | null; updated_at: string }>();
  const { results } = await db.prepare("SELECT file_id, purpose, section, name, status, copy_name, last_error, updated_at FROM onedrive_files WHERE job_id = ? ORDER BY updated_at, file_id").bind(jobId).all<{ file_id: string; purpose: FilePurpose; section: FileSection; name: string; status: string; copy_name: string | null; last_error: string | null; updated_at: string }>();
  const connection = await connectionStatus(env, db);
  return {
    configured: connection.configured, connected: connection.status === "connected",
    job: job ? { status: job.status, error: job.last_error, folderUrl: job.folder_url, updatedAt: job.updated_at } : null,
    files: results.map((f) => ({ id: f.file_id, purpose: f.purpose, section: f.section, folder: sectionFolder[f.section], name: f.name, status: f.status, copyName: f.copy_name, renamed: !!f.copy_name && f.copy_name !== safeName(f.name), error: f.last_error, savedInVaps: f.status !== "replaced", updatedAt: f.updated_at })),
  };
}

/** Test hook: forget cached tokens and the resolved parent folder. */
export const resetOneDriveCache = () => { cached = null; parent = null; };
