import { apiEnv } from "../../../server/env";
import { signedIn } from "../../../server/api";
import { readJson, reply } from "../../../server/http";
import { addActivity } from "../../../server/workspace";
export const dynamic = "force-dynamic";
/** Records an activity entry under the signed-in employee. */
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, who }) => reply(await addActivity(db, who, await readJson(request, 4000))));
}
