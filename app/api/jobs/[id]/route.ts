import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { readJson, reply } from "../../../../server/http";
import { saveJob } from "../../../../server/workspace";
import { syncJob } from "../../../../server/sharepoint";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** Creates or saves a job from the job editor ({ job, revision, commands? }). */
export function PUT(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, who }) => {
    const { id } = await route.params;
    const saved = await saveJob(db, ctx, who, decodeURIComponent(id), await readJson(request));
    // Microsoft 365 pilot: folders on first save, register row on every save. Never blocks or undoes the VAPS save.
    return reply({ ...saved, sharepoint: await syncJob(env, db, env.FILES, saved.job, who) });
  });
}
