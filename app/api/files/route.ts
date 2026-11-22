import { apiEnv } from "../../../server/env";
import { signedIn } from "../../../server/api";
import { fail, reply } from "../../../server/http";
import { filesBucket, uploadFile, uploadTarget, MAX_FILE_BYTES } from "../../../server/files";
import { mirrorFile, routeFile, routedFile } from "../../../server/onedrive";
export const dynamic = "force-dynamic";
/**
 * Uploads one file (multipart field "file"); returns its reference for the job record. With "jobId" and "purpose"
 * (app/file-routing.ts) it is also copied to that job's Sampling or Lab folder in OneDrive (OneDrive pilot);
 * the reply's `copy` says whether that worked. The Workflow VAPS copy (R2) is stored either way.
 */
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, actor, who }) => {
    if (!(request.headers.get("Content-Type") || "").startsWith("multipart/form-data")) throw fail(415, "Send the file as form data.");
    if (Number(request.headers.get("Content-Length") || 0) > MAX_FILE_BYTES + 100_000) throw fail(413, "Choose a file up to 20 MB.");
    const form = await request.formData(), bucket = filesBucket(env);
    const target = await uploadTarget(db, ctx, actor, form);
    const file = form.get("file"), name = file instanceof File ? file.name.slice(0, 200) : "";
    // An approved sampling report has one PDF per version: copying it again returns the existing copy.
    if (target?.purpose === "sampling-report" && name) {
      const existing = await routedFile(db, target.jobId, target.purpose, name);
      if (existing) return reply({ id: existing.file_id, name, existing: true, copy: await mirrorFile(env, db, bucket, existing.file_id, who) });
    }
    const saved = await uploadFile(db, bucket, who, form);
    if (!target) return reply(saved, 201);
    await routeFile(db, saved.id, target.jobId, target.purpose, saved.name, new Date().toISOString());
    return reply({ ...saved, copy: await mirrorFile(env, db, bucket, saved.id, who) }, 201);
  });
}
