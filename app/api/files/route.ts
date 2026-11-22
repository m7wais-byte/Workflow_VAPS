import { apiEnv } from "../../../server/env";
import { signedIn } from "../../../server/api";
import { fail, reply } from "../../../server/http";
import { filesBucket, uploadFile, uploadTarget, MAX_FILE_BYTES } from "../../../server/files";
import { mirrorFile, routeFile } from "../../../server/sharepoint";
export const dynamic = "force-dynamic";
/**
 * Uploads one file (multipart field "file"); returns its reference for the job record. With "jobId" and "section"
 * (sampling | lab) it is also copied to that job's SharePoint folder (Microsoft 365 pilot); the reply's `sharepoint`
 * says whether that worked. The VAPS copy in R2 is stored either way.
 */
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, actor, who }) => {
    if (!(request.headers.get("Content-Type") || "").startsWith("multipart/form-data")) throw fail(415, "Send the file as form data.");
    if (Number(request.headers.get("Content-Length") || 0) > MAX_FILE_BYTES + 100_000) throw fail(413, "Choose a file up to 20 MB.");
    const form = await request.formData(), bucket = filesBucket(env);
    const target = await uploadTarget(db, ctx, actor, form);
    const saved = await uploadFile(db, bucket, who, form);
    if (!target) return reply(saved, 201);
    await routeFile(db, saved.id, target.jobId, target.section, new Date().toISOString());
    return reply({ ...saved, sharepoint: await mirrorFile(env, db, bucket, saved.id, who) }, 201);
  });
}
