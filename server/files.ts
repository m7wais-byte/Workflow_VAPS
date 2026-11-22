/**
 * Workbooks and report files: bytes in the R2 bucket (binding FILES), metadata in D1.
 *
 * A file is released only to an employee who may open a job that references it (or who uploaded it and has not yet
 * attached it), and, for workbooks, who holds the View workbook / Download workbook permission.
 */
import { fail } from "./http";
import { audit } from "./auth";
import { can, loadJobs, visibleJobs, type Context, type Who } from "./workspace";
import type { Actor } from "../app/operations-model";
import { isFilePurpose, type FilePurpose } from "../app/file-routing";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const workbookName = /\.(xlsx?|xlsm|csv|pdf|docx?|ods)$/i;

export function filesBucket(env: Record<string, unknown>): R2Bucket {
  const bucket = env.FILES as R2Bucket | undefined;
  if (!bucket) throw fail(503, "File storage is not configured on this server (R2 binding FILES). No file was stored.");
  return bucket;
}

/**
 * Cloud copy pilot (OneDrive): an upload made for a job names the job and the file's purpose (app/file-routing.ts), which
 * decides its folder (Sampling or Lab). The employee must be able to open that job; this is checked before anything
 * is stored. No job given: stored in Workflow VAPS only, as before.
 */
export async function uploadTarget(db: D1Database, ctx: Context, actor: Actor, form: FormData): Promise<{ jobId: string; purpose: FilePurpose } | null> {
  const jobId = form.get("jobId"), purpose = form.get("purpose");
  if (jobId === null && purpose === null) return null;
  if (typeof jobId !== "string" || !jobId || !isFilePurpose(purpose) || purpose === "scope-of-work") throw fail(400, "The upload must name its job and what the file is (sampling sheet, sampling report, lab workbook, external results or final report).");
  const stored = (await loadJobs(db)).get(jobId);
  if (!stored || !visibleJobs(ctx, actor, new Map([[jobId, stored]])).length) throw fail(stored ? 403 : 404, stored ? "You do not have access to the job this file belongs to." : "Save the job before attaching files to it.");
  return { jobId, purpose };
}

export async function uploadFile(db: D1Database, bucket: R2Bucket, who: Who, form: FormData, at = new Date().toISOString()) {
  const file = form.get("file");
  const anyType = form.get("anyType") === "1";
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_BYTES) throw fail(400, "Choose a non-empty file up to 20 MB.");
  if (!anyType && !workbookName.test(file.name)) throw fail(400, "Choose a non-empty Excel, CSV, PDF, Word or ODS workbook up to 20 MB.");
  const id = crypto.randomUUID(), name = file.name.slice(0, 200), type = (file.type || "application/octet-stream").slice(0, 120);
  await bucket.put(id, await file.arrayBuffer(), { httpMetadata: { contentType: type } });
  await db.prepare("INSERT INTO files (id, name, size, type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, name, file.size, type, who.employeeId, at).run();
  await audit(db, { ...who, action: "file.uploaded", target: id, detail: { name, size: file.size } }, at);
  return { id, name, size: file.size, type };
}

/**
 * Laboratory workbooks (files of a laboratory activity) are restricted to workbook-permission holders; sampling and
 * final report documents are not. This is decided here from the job records, never from the request.
 */
const isWorkbook = (jobs: { job: { operations?: { activities?: { files?: { id: string }[] }[] } } }[], id: string) => jobs.some(({ job }) => (job.operations?.activities || []).some((a) => (a.files || []).some((f) => f.id === id)));

export async function readFile(db: D1Database, bucket: R2Bucket, ctx: Context, actor: Actor, who: Who, id: string, mode: "view" | "download") {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw fail(404, "This file is not available.");
  const meta = await db.prepare("SELECT id, name, size, type, uploaded_by FROM files WHERE id = ?").bind(id).first<{ id: string; name: string; size: number; type: string; uploaded_by: string }>();
  if (!meta) throw fail(404, "This file is not available on the server. Ask the submitter for the original; its metadata has been retained.");
  const jobs = await loadJobs(db);
  const referencing = new Map([...jobs].filter(([, s]) => JSON.stringify(s.job).includes(id)));
  const allowed = referencing.size ? visibleJobs(ctx, actor, referencing).length > 0 : meta.uploaded_by === actor.id;
  if (!allowed) throw fail(403, "You do not have access to the job this file belongs to.");
  // Not yet attached to a job: a workbook upload stays restricted for anyone but its uploader.
  const restricted = referencing.size ? isWorkbook([...referencing.values()], id) : false;
  if (restricted && !can(ctx, actor, mode === "view" ? "viewWorkbook" : "downloadWorkbook"))
    throw fail(403, mode === "view" ? "You do not have the View workbook permission. Ask an administrator in Settings → Authorization." : "You do not have the Download workbook permission. Ask an administrator in Settings → Authorization.");
  const object = await bucket.get(id);
  if (!object) throw fail(404, "This file is not available on the server.");
  await audit(db, { ...who, action: mode === "view" ? "file.viewed" : "file.downloaded", target: id });
  const safeName = meta.name.replace(/[^\w.\- ()]/g, "_");
  return new Response(object.body, { headers: {
    "Content-Type": meta.type, "Content-Length": String(meta.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'", "Content-Disposition": `${mode === "view" ? "inline" : "attachment"}; filename="${safeName}"`,
  } });
}
