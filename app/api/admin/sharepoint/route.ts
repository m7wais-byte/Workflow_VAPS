import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { fail, readJson, reply } from "../../../../server/http";
import { loadJobs } from "../../../../server/workspace";
import { jobSyncStatus, sharePointConfig, syncJob, syncProblems } from "../../../../server/sharepoint";
import { administratorId } from "../../../../app/authorization";
export const dynamic = "force-dynamic";
/** Microsoft 365 pilot, Administrator (MA001) only: GET lists jobs/files not yet copied; POST { jobId } retries one job and returns its status. */
export function GET(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, actor }) => {
    if (actor.id !== administratorId) throw fail(403, "Only the Administrator can view SharePoint sync.");
    return reply({ configured: !!sharePointConfig(env), ...(await syncProblems(db)) });
  });
}
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, actor, who }) => {
    if (actor.id !== administratorId) throw fail(403, "Only the Administrator can retry SharePoint sync.");
    const { jobId } = await readJson<{ jobId?: unknown }>(request, 1000);
    const stored = typeof jobId === "string" ? (await loadJobs(db)).get(jobId) : undefined;
    if (!stored) throw fail(404, "Job no longer exists.");
    const sharepoint = await syncJob(env, db, env.FILES, stored.job, who);
    return reply({ jobId, sharepoint, ...(await jobSyncStatus(env, db, stored.job.id)), canRetry: true });
  });
}
