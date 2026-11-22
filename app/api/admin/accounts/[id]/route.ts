import { apiEnv } from "../../../../../server/env";
import { signedIn } from "../../../../../server/api";
import { fail, readJson, reply } from "../../../../../server/http";
import { resetAccountPassword, revokeSessionsByAdmin, setAccountActive, setAccountEmail } from "../../../../../server/auth";
import { can } from "../../../../../server/workspace";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** { action: "reset-password" | "revoke-sessions" | "deactivate" | "reactivate" | "set-email", email? } */
export function POST(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, ctx, actor, who }) => {
    if (!can(ctx, actor, "authorization")) throw fail(403, "You do not have permission to manage sign-in accounts.");
    const { id } = await route.params;
    const body = await readJson<{ action?: unknown; email?: unknown }>(request, 2000);
    if (body.action === "set-email") return reply(await setAccountEmail(db, who, id, body.email));
    if (body.action === "reset-password") return reply(await resetAccountPassword(db, who, id));
    if (body.action === "revoke-sessions") { await revokeSessionsByAdmin(db, who, id); return reply({ revoked: true }); }
    if (body.action === "deactivate" || body.action === "reactivate") { await setAccountActive(db, who, id, body.action === "reactivate"); return reply({ active: body.action === "reactivate" }); }
    throw fail(400, "Unknown account action.");
  });
}
