import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import { execSync } from "node:child_process";

// Build identifier shown by GET /api/deployment, so the running deployment can be matched to a commit.
const buildId = (() => {
  let commit = "nogit";
  try { commit = execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }
  return `${commit} ${new Date().toISOString()}`;
})();

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

// Cloudflare deploys (GitHub Actions, see DEPLOY-CLOUDFLARE.md) set VAPS_DEPLOY_* at build time to name the real
// Worker, D1 database and R2 bucket. When they are unset (local development) nothing below changes: the placeholder
// D1 id keeps pointing at the existing local database in .wrangler/state.
function deployValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set when VAPS_DEPLOY_WORKER_NAME is set (Cloudflare deploy build).`);
  return value;
}
const deployTarget = process.env.VAPS_DEPLOY_WORKER_NAME?.trim()
  ? {
      workerName: deployValue("VAPS_DEPLOY_WORKER_NAME"),
      d1Name: deployValue("VAPS_DEPLOY_D1_NAME"),
      d1Id: deployValue("VAPS_DEPLOY_D1_ID"),
      r2Bucket: deployValue("VAPS_DEPLOY_R2_BUCKET"),
    }
  : null;

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  ...(deployTarget
    ? {
        name: deployTarget.workerName,
        // Settings and secrets are kept in the Cloudflare dashboard; a deploy must never remove them.
        keep_vars: true,
        workers_dev: true,
        // Preview URLs would expose unreviewed versions outside the Access policy on the workers.dev address.
        preview_urls: false,
        observability: { enabled: true },
      }
    : {}),
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: deployTarget?.d1Name ?? "site-creator-d1",
          database_id: deployTarget?.d1Id ?? SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: deployTarget?.r2Bucket ?? "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: { __VAPS_BUILD__: JSON.stringify(buildId) },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
