import { apiEnv } from "../../../server/env";
import { database } from "../../../server/api";
import { assertSameOrigin, authConfig, clientAddress, fail, handle, readJson, reply, sessionCookie } from "../../../server/http";
import { completeAdministratorSetup, SETUP_UNAVAILABLE, setupOpen, setupSecret } from "../../../server/auth";
import { context, employeeActive, loadRecords } from "../../../server/workspace";
import { administratorId } from "../../authorization";
export const dynamic = "force-dynamic";
/**
 * One-time Administrator setup (`<site>/#setup`): { action: "check" } says whether setup is open;
 * { action: "complete", token, password } creates the MA001 account with that password and signs in.
 * Off unless the server secret ADMIN_SETUP_TOKEN (32+ characters) is configured; closed once MA001 has an account.
 */
export function POST(request: Request) {
  return handle(async () => {
    const env = apiEnv(), db = database(env), config = authConfig(env);
    assertSameOrigin(request, config);
    const secret = setupSecret(env);
    if (!secret) throw fail(404, SETUP_UNAVAILABLE);
    const body = await readJson<{ action?: unknown; token?: unknown; password?: unknown }>(request, 4000);
    if (body.action === "check") return reply({ open: await setupOpen(db, administratorId) });
    if (body.action !== "complete") throw fail(400, "Unknown action.");
    const ctx = context((await loadRecords(db)).values);
    const result = await completeAdministratorSetup(db, config, { secret, token: body.token, password: body.password, address: clientAddress(request), administratorId }, async (id) => employeeActive(ctx, id));
    return reply({ created: true, employeeId: administratorId }, 201, { "Set-Cookie": sessionCookie(request, result.token, result.maxAgeSeconds) });
  });
}
