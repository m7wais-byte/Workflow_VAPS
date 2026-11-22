import { apiEnv } from "../../../../server/env";
import { database } from "../../../../server/api";
import { assertSameOrigin, authConfig, clientAddress, handle, readJson, reply, sessionCookie } from "../../../../server/http";
import { signIn } from "../../../../server/auth";
import { context, employeeActive, loadRecords } from "../../../../server/workspace";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return handle(async () => {
    const env = apiEnv(), db = database(env), config = authConfig(env);
    assertSameOrigin(request, config);
    const body = await readJson<{ username?: unknown; password?: unknown }>(request, 4000);
    const ctx = context((await loadRecords(db)).values);
    const result = await signIn(db, config, { username: body.username, password: body.password, address: clientAddress(request) }, async (id) => employeeActive(ctx, id));
    return reply({ signedIn: true, mustChangePassword: result.session.mustChangePassword }, 200, { "Set-Cookie": sessionCookie(request, result.token, result.maxAgeSeconds) });
  });
}
