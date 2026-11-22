import { apiEnv } from "../../../server/env";
import { reply } from "../../../server/http";
import { setupSecretState } from "../../../server/auth";
import { oneDriveConfig } from "../../../server/onedrive";
export const dynamic = "force-dynamic";
declare const __VAPS_BUILD__: string | undefined;
/**
 * Deployment check (`GET /api/deployment`): which build is running and whether its bindings and settings arrive.
 * Booleans and non-secret identifiers only: never a secret value, its length, a token, the OneDrive folder link or IDs.
 */
export function GET() {
  const env = apiEnv() as unknown as Record<string, unknown>;
  const has = (name: string) => typeof env[name] === "string" && (env[name] as string).trim() !== "";
  return reply({
    build: typeof __VAPS_BUILD__ === "string" ? __VAPS_BUILD__ : "unknown",
    bindings: { DB: !!env.DB, FILES: !!env.FILES },
    appOrigin: String(env.APP_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean),
    adminSetupSecret: setupSecretState(env),
    oneDrive: { configured: !!oneDriveConfig(env), clientId: has("ONEDRIVE_CLIENT_ID"), tenantId: has("ONEDRIVE_TENANT_ID"), account: has("ONEDRIVE_ACCOUNT"), parentLink: has("ONEDRIVE_PARENT_URL"), tokenKeyOk: typeof env.ONEDRIVE_TOKEN_KEY === "string" && env.ONEDRIVE_TOKEN_KEY.trim().length >= 32 },
    mail: { provider: String(env.MAIL_PROVIDER || "") || null },
  });
}
