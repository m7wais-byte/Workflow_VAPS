/**
 * Request pipeline for protected API routes: same-origin check for mutations, session lookup, and the acting
 * employee built from the session. Route handlers never read an employee ID from the request.
 */
import { assertSameOrigin, authConfig, clearSessionCookie, fail, handle, reply, type AuthConfig } from "./http";
import { readSession, type Session } from "./auth";
import { actorFor, context, employeeActive, loadRecords, type Context } from "./workspace";
import type { Actor } from "../app/operations-model";

export type ApiEnv = { DB: D1Database; FILES?: R2Bucket } & Record<string, unknown>;
export type Signed = { db: D1Database; env: ApiEnv; config: AuthConfig; session: Session; ctx: Context; actor: Actor; who: { accountId: string; employeeId: string } };

const SESSION_ENDED: Record<string, string> = {
  missing: "Sign in to continue.",
  expired: "Your session has expired. Sign in again to continue.",
  revoked: "Your session was ended (signed out, password changed or revoked by an administrator). Sign in again.",
  inactive: "This account is not active. Contact your administrator.",
};

export function database(env: ApiEnv): D1Database {
  if (!env.DB) throw fail(503, "The workspace database is not configured on this server.");
  return env.DB;
}

/**
 * Runs `work` for a signed-in employee. `allowPasswordChange` routes stay reachable while a temporary password must
 * still be replaced; everything else is blocked until it is.
 */
export function signedIn(env: ApiEnv, request: Request, work: (s: Signed) => Promise<Response>, options: { allowPasswordChange?: boolean } = {}) {
  return handle(async () => {
    const db = database(env), config = authConfig(env);
    if (!["GET", "HEAD"].includes(request.method)) assertSameOrigin(request, config);
    const { values } = await loadRecords(db);
    const ctx = context(values);
    const result = await readSession(db, config, request, async (id) => employeeActive(ctx, id));
    if (!result.session) return reply({ error: SESSION_ENDED[result.reason], signedOut: true, reason: result.reason }, 401, result.reason === "missing" ? {} : { "Set-Cookie": clearSessionCookie(request) });
    const session = result.session;
    if (session.mustChangePassword && !options.allowPasswordChange) throw fail(403, "Change your temporary password to continue.");
    const actor = actorFor(ctx, session.employeeId);
    return work({ db, env, config, session, ctx, actor, who: { accountId: session.accountId, employeeId: session.employeeId } });
  });
}
