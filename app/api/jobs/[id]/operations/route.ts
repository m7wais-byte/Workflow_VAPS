import { apiEnv } from "../../../../../server/env";
import { signedIn } from "../../../../../server/api";
import { readJson, reply } from "../../../../../server/http";
import { runJobOperations } from "../../../../../server/workspace";
import { notifyJobChange } from "../../../../../server/notify";
import { syncJob } from "../../../../../server/onedrive";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** Workflow commands ({ commands, revision }), applied with the session's employee as the actor. */
export function POST(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, who }) => {
    const { id } = await route.params;
    const { change, ...saved } = await runJobOperations(db, ctx, who, decodeURIComponent(id), await readJson(request));
    const copy = await syncJob(env, db, env.FILES, saved.job, who);
    // Email notifications for this change (off unless configured). Never blocks or undoes the save.
    const mail = change ? await notifyJobChange(env, db, ctx, who, change) : undefined;
    return reply({ ...saved, copy, ...(mail && mail.queued ? { mail } : {}) });
  });
}
