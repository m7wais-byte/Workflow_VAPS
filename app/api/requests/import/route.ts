import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { fail, readJson, reply } from "../../../../server/http";
import { can } from "../../../../server/workspace";
import { importRequestRecords } from "../../../../server/requests";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, ctx, actor, who }) => {
    if (!can(ctx, actor, "requestsOverview")) throw fail(403, "Importing the request book needs the Request book overview permission.");
    const body = await readJson<{ records?: unknown }>(request, 20_000_000);
    return reply(await importRequestRecords(db, who, body.records));
  });
}
