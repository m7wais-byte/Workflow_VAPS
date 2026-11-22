import { env } from "cloudflare:workers";
import type { ApiEnv } from "./api";
/** Worker bindings and variables (D1 `DB`, R2 `FILES`, AUTH_* settings). Secrets are never read by the browser. */
export const apiEnv = () => env as unknown as ApiEnv;
