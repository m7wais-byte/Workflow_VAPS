import { apiEnv } from "../../../../server/env";
import { database } from "../../../../server/api";
import { assertSameOrigin, authConfig, clearSessionCookie, cookieName, handle, readCookie, reply } from "../../../../server/http";
import { audit, revokeSession } from "../../../../server/auth";
import { sha256Hex } from "../../../../server/passwords";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return handle(async () => {
    const env = apiEnv(), db = database(env);
    assertSameOrigin(request, authConfig(env));
    const token = readCookie(request, cookieName(request));
    if (/^[a-f0-9]{64}$/.test(token)) {
      const idHash = await sha256Hex(token);
      const row = await db.prepare("SELECT s.account_id, a.employee_id FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id_hash = ? AND s.revoked_at IS NULL").bind(idHash).first<{ account_id: string; employee_id: string }>();
      await revokeSession(db, idHash, "signed_out");
      if (row) await audit(db, { accountId: row.account_id, employeeId: row.employee_id, action: "auth.sign_out" });
    }
    return reply({ signedOut: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
  });
}
