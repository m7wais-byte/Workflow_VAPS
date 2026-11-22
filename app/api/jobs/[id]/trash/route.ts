import { apiEnv } from "../../../../../server/env";
import { signedIn } from "../../../../../server/api";
import { fail, readJson, reply } from "../../../../../server/http";
import { trashOrRestore } from "../../../../../server/workspace";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** { mode: "trash" | "restore", revision } — needs the Delete and restore jobs permission (checked in trashJob/restoreJob). */
export function POST(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, ctx, who }) => {
    const { id } = await route.params;
    const body = await readJson<{ mode?: unknown; revision?: unknown }>(request, 1000);
    if (body.mode !== "trash" && body.mode !== "restore") throw fail(400, "Unknown action.");
    return reply(await trashOrRestore(db, ctx, who, decodeURIComponent(id), body.mode, body.revision));
  });
}
