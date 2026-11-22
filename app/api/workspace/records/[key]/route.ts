import { apiEnv } from "../../../../../server/env";
import { signedIn } from "../../../../../server/api";
import { readJson, reply } from "../../../../../server/http";
import { saveRecord } from "../../../../../server/workspace";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ key: string }> };
export function PUT(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, ctx, actor, who }) => {
    const { key } = await route.params;
    const body = await readJson<{ value?: unknown; revision?: unknown }>(request);
    return reply(await saveRecord(db, ctx, actor, who, decodeURIComponent(key), body.value, body.revision));
  });
}
