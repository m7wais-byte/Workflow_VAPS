import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { fail, readJson, reply } from "../../../../server/http";
import { loadJobs } from "../../../../server/workspace";
import { connectionStatus, disconnect, jobSyncStatus, pollSignIn, startSignIn, syncJob } from "../../../../server/onedrive";
import { administratorId } from "../../../../app/authorization";
export const dynamic = "force-dynamic";
/**
 * OneDrive pilot, Administrator (MA001) only.
 * GET: connection status (never tokens). POST { action }: "connect" starts the Microsoft device sign-in and returns the
 * sign-in address and one-time code; "poll" checks whether it was approved; "disconnect" removes the stored token;
 * "retry" with { jobId } re-runs that job's folders and pending copies and returns its status.
 */
export function GET(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, actor }) => {
    if (actor.id !== administratorId) throw fail(403, "Only the Administrator can manage the OneDrive connection.");
    return reply(await connectionStatus(env, db));
  });
}
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, actor, who }) => {
    if (actor.id !== administratorId) throw fail(403, "Only the Administrator can manage the OneDrive connection.");
    const body = await readJson<{ action?: unknown; jobId?: unknown }>(request, 1000);
    if (body.action === "connect") return reply(await startSignIn(env, db, who));
    if (body.action === "poll") return reply(await pollSignIn(env, db, who));
    if (body.action === "disconnect") { await disconnect(db, who); return reply(await connectionStatus(env, db)); }
    if (body.action === "retry") {
      const stored = typeof body.jobId === "string" ? (await loadJobs(db)).get(body.jobId) : undefined;
      if (!stored) throw fail(404, "Job no longer exists.");
      const copy = await syncJob(env, db, env.FILES, stored.job, who);
      return reply({ copy, ...(await jobSyncStatus(env, db, stored.job.id)), canManage: true });
    }
    throw fail(400, "Unknown action.");
  });
}
