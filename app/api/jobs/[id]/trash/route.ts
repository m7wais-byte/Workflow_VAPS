import { apiEnv } from "../../../../../server/env";
import { signedIn } from "../../../../../server/api";
import { fail, readJson, reply } from "../../../../../server/http";
import { trashOrRestore } from "../../../../../server/workspace";
import { syncJob } from "../../../../../server/onedrive";
import { backgroundResult } from "../../../../../server/background";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** { mode: "trash" | "restore", revision } — needs the Delete and restore jobs permission (checked in trashJob/restoreJob). */
export function POST(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, who }) => {
    const { id } = await route.params;
    const body = await readJson<{ mode?: unknown; revision?: unknown }>(request, 1000);
    if (body.mode !== "trash" && body.mode !== "restore") throw fail(400, "Unknown action.");
    const saved = await trashOrRestore(db, ctx, who, decodeURIComponent(id), body.mode, body.revision);
    // Trashing never creates OneDrive folders; a restore resumes pending copies (after the reply, at most 2 s waited for).
    if (body.mode === "trash") return reply({ ...saved, copy: { status: "off" } });
    const copy = await backgroundResult("onedrive", () => syncJob(env, db, env.FILES, saved.job, who), 2000);
    return reply({ ...saved, copy: copy ?? { status: "queued" } });
  });
}
