import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { fail, readJson, reply } from "../../../../server/http";
import { createAccount, listAccounts } from "../../../../server/auth";
import { can } from "../../../../server/workspace";
export const dynamic = "force-dynamic";
/** Account administration requires the Manage authorization permission. */
export function GET(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, ctx, actor }) => {
    if (!can(ctx, actor, "authorization")) throw fail(403, "You do not have permission to manage sign-in accounts.");
    return reply({ accounts: await listAccounts(db) });
  });
}
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, ctx, actor, who }) => {
    if (!can(ctx, actor, "authorization")) throw fail(403, "You do not have permission to manage sign-in accounts.");
    const body = await readJson<{ username?: unknown; employeeId?: unknown; email?: unknown }>(request, 4000);
    const created = await createAccount(db, who, body, (id) => !!ctx.directory?.employees.some((e) => e.id === id && e.active));
    return reply(created, 201);
  });
}
