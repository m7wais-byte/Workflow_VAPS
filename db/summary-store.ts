import { env } from "cloudflare:workers";
export function summaryDb() { if (!env.DB) throw new Error("Summary storage unavailable"); return env.DB; }
