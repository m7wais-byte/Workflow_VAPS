import { apiEnv } from "../../../../../server/env";
import { signedIn } from "../../../../../server/api";
import { fail, reply } from "../../../../../server/http";
import { loadJobs, visibleJobs } from "../../../../../server/workspace";
import { jobSyncStatus } from "../../../../../server/onedrive";
import { administratorId } from "../../../../../app/authorization";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** OneDrive pilot: copy status of one job, for anyone who can open the job. Connect and retry are MA001 only (/api/admin/onedrive). */
export function GET(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, actor }) => {
    const id = decodeURIComponent((await route.params).id), stored = (await loadJobs(db)).get(id);
    if (!stored || !visibleJobs(ctx, actor, new Map([[id, stored]])).length) throw fail(stored ? 403 : 404, stored ? "You do not have access to this job." : "Job no longer exists.");
    return reply({ ...(await jobSyncStatus(env, db, id)), canManage: actor.id === administratorId });
  });
}
