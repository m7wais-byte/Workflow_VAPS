import { apiEnv } from "../../../server/env";
import { signedIn } from "../../../server/api";
import { fail, readJson, reply } from "../../../server/http";
import { can } from "../../../server/workspace";
import { listRequests, saveRequestDraft } from "../../../server/requests";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, ctx, actor }) => {
    if (!can(ctx, actor, "requests") && !can(ctx, actor, "requestsOverview")) throw fail(403, "You do not have access to the request book.");
    return reply({ records: await listRequests(db) });
  });
}
/** Saves a new or edited request ({ draft, today }). */
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, ctx, actor, who }) => {
    if (!can(ctx, actor, "requests")) throw fail(403, "You do not have permission to add or edit requests.");
    const name = ctx.directory?.employees.find((e) => e.id === who.employeeId)?.name || who.employeeId;
    return reply({ records: await saveRequestDraft(db, who, name, await readJson(request)) });
  });
}
