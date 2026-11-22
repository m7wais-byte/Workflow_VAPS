import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { readJson, reply } from "../../../../server/http";
import { changeOwnPassword } from "../../../../server/auth";
export const dynamic = "force-dynamic";
/** Changes the signed-in employee's own password; other sessions are signed out. */
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, session }) => {
    const body = await readJson<{ currentPassword?: unknown; newPassword?: unknown }>(request, 4000);
    await changeOwnPassword(db, session, body);
    return reply({ changed: true });
  }, { allowPasswordChange: true });
}
