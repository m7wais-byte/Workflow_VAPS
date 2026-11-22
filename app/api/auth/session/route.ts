import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { reply } from "../../../../server/http";
export const dynamic = "force-dynamic";
/** Who is signed in, from the server session only. */
export function GET(request: Request) {
  return signedIn(apiEnv(), request, async ({ session }) => reply({ employeeId: session.employeeId, username: session.username, mustChangePassword: session.mustChangePassword, expiresAt: session.expiresAt }), { allowPasswordChange: true });
}
