import { apiEnv } from "../../../server/env";
import { signedIn } from "../../../server/api";
import { reply } from "../../../server/http";
import { workspaceFor } from "../../../server/workspace";
export const dynamic = "force-dynamic";
/** The signed-in employee's workspace: shared settings and the jobs they may open. */
export function GET(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, ctx, session, who }) => reply(await workspaceFor(db, ctx, { ...who, username: session.username, mustChangePassword: session.mustChangePassword })));
}
