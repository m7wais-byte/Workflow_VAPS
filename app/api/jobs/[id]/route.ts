import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { readJson, reply } from "../../../../server/http";
import { saveJob } from "../../../../server/workspace";
import { notifyJobChange } from "../../../../server/notify";
import { syncJob } from "../../../../server/onedrive";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** Creates or saves a job from the job editor ({ job, revision, commands? }). */
export function PUT(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, who }) => {
    const { id } = await route.params;
    const { change, ...saved } = await saveJob(db, ctx, who, decodeURIComponent(id), await readJson(request));
    // OneDrive pilot: job folders on the first save, pending file copies on every save. Never blocks or undoes the VAPS save.
    const copy = await syncJob(env, db, env.FILES, saved.job, who);
    // Email notifications for this change (off unless configured). Never blocks or undoes the save.
    const mail = change ? await notifyJobChange(env, db, ctx, who, change) : undefined;
    return reply({ ...saved, copy, ...(mail && mail.queued ? { mail } : {}) });
  });
}
