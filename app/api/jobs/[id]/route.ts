import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { readJson, reply } from "../../../../server/http";
import { saveJob } from "../../../../server/workspace";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** Creates or saves a job from the job editor ({ job, revision, commands? }). */
export function PUT(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, ctx, who }) => {
    const { id } = await route.params;
    return reply(await saveJob(db, ctx, who, decodeURIComponent(id), await readJson(request)));
  });
}
