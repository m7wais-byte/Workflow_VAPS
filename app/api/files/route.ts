import { apiEnv } from "../../../server/env";
import { signedIn } from "../../../server/api";
import { fail, reply } from "../../../server/http";
import { filesBucket, uploadFile, MAX_FILE_BYTES } from "../../../server/files";
export const dynamic = "force-dynamic";
/** Uploads one file (multipart field "file"); returns its reference for the job record. */
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, who }) => {
    if (!(request.headers.get("Content-Type") || "").startsWith("multipart/form-data")) throw fail(415, "Send the file as form data.");
    if (Number(request.headers.get("Content-Length") || 0) > MAX_FILE_BYTES + 100_000) throw fail(413, "Choose a file up to 20 MB.");
    return reply(await uploadFile(db, filesBucket(env), who, await request.formData()), 201);
  });
}
