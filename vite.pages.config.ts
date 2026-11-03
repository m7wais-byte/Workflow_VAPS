// Static, browser-only build for GitHub Pages: `npm run build:pages` → dist-pages/.
// The Sites build (vite.config.ts, Vinext + Cloudflare + D1) is separate and unchanged.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Project Pages are served from https://<owner>.github.io/<repository>/.
const base = (process.env.VAPS_PAGES_BASE || "/Workflow_VAPS/").replace(/\/?$/, "/");
const siteUrl = (process.env.VAPS_PAGES_URL || "https://m7wais-byte.github.io" + base).replace(/\/?$/, "/");
const outDir = resolve(import.meta.dirname, "dist-pages");

// Read by app/deployment.ts and %VITE_…% placeholders in github-pages/index.html.
process.env.VITE_VAPS_TARGET = "github-pages";
process.env.VITE_VAPS_SITE_URL = siteUrl;

/** Adds .nojekyll and a 404 page that sends unknown paths (e.g. old /track/ links) back to the app. */
function githubPagesFiles(): Plugin {
  return {
    name: "vaps-github-pages-files",
    apply: "build",
    async closeBundle() {
      await writeFile(resolve(outDir, ".nojekyll"), "");
      const target = JSON.stringify(base);
      await writeFile(resolve(outDir, "404.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>VAPS</title><script>location.replace(${target} + location.hash);</script></head><body><p>This page is not part of the VAPS GitHub Pages edition. <a href="${base}">Open the VAPS workspace</a>.</p></body></html>\n`);
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname, "github-pages"),
  base,
  publicDir: resolve(import.meta.dirname, "public"),
  envDir: import.meta.dirname,
  plugins: [react(), githubPagesFiles()],
  resolve: { alias: { "@": import.meta.dirname } },
  build: { outDir, emptyOutDir: true, sourcemap: false },
});
