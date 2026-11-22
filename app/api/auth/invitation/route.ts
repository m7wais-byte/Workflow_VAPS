import { apiEnv } from "../../../../server/env";
import { database } from "../../../../server/api";
import { assertSameOrigin, authConfig, fail, handle, readJson, reply, sessionCookie } from "../../../../server/http";
import { acceptInvitation, checkInvitation } from "../../../../server/auth";
import { context, employeeActive, loadRecords } from "../../../../server/workspace";
export const dynamic = "force-dynamic";
/**
 * The invitation link's page: { action: "check", token } shows who the link is for; { action: "accept", token, password }
 * sets the password, activates the account and signs the employee in. Nothing here works without a valid link.
 */
export function POST(request: Request) {
  return handle(async () => {
    const env = apiEnv(), db = database(env), config = authConfig(env);
    assertSameOrigin(request, config);
    const body = await readJson<{ action?: unknown; token?: unknown; password?: unknown }>(request, 4000);
    const ctx = context((await loadRecords(db)).values);
    const active = async (id: string) => employeeActive(ctx, id);
    if (body.action === "check") {
      const info = await checkInvitation(db, body.token, active);
      return reply({ ...info, name: ctx.directory?.employees.find((e) => e.id === info.employeeId)?.name || info.employeeId });
    }
    if (body.action !== "accept") throw fail(400, "Unknown action.");
    const result = await acceptInvitation(db, config, { token: body.token, password: body.password }, active);
    return reply({ activated: true }, 200, { "Set-Cookie": sessionCookie(request, result.token, result.maxAgeSeconds) });
  });
}
