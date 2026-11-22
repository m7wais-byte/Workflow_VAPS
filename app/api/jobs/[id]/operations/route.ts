import { apiEnv } from "../../../../../server/env";
import { signedIn } from "../../../../../server/api";
import { readJson, reply } from "../../../../../server/http";
import { runJobOperations } from "../../../../../server/workspace";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** Workflow commands ({ commands, revision }), applied with the session's employee as the actor. */
export function POST(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, ctx, who }) => {
    const { id } = await route.params;
    return reply(await runJobOperations(db, ctx, who, decodeURIComponent(id), await readJson(request)));
  });
}
