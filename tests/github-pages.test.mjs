import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

// Bundles a module as the Sites build (no env) or the GitHub Pages build (base path + static flag).
const pagesEnv = { BASE_URL: "/Workflow_VAPS/", VITE_VAPS_TARGET: "github-pages" };
const bundle = async (entry, env) => {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent", define: env ? { "import.meta.env": JSON.stringify(env) } : {} });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
};

test("Sites build keeps root paths and sharing enabled", async () => {
  const d = await bundle("app/deployment.ts");
  assert.equal(d.staticPages, false);
  assert.equal(d.basePath, "/");
  assert.equal(d.assetUrl("/vaps-logo.png"), "/vaps-logo.png");
});

test("Pages build resolves stored root-relative assets under the repository path", async () => {
  const d = await bundle("app/deployment.ts", pagesEnv);
  assert.equal(d.staticPages, true);
  assert.equal(d.assetUrl("/vaps-logo.png"), "/Workflow_VAPS/vaps-logo.png");
  assert.equal(d.assetUrl("/client-logos/pdo.png"), "/Workflow_VAPS/client-logos/pdo.png");
  assert.equal(d.assetUrl("/Workflow_VAPS/vaps-logo.png"), "/Workflow_VAPS/vaps-logo.png", "never doubles the base");
  for (const kept of ["data:image/png;base64,AA", "blob:x", "https://example.com/a.png", "//cdn/a.png", ""]) assert.equal(d.assetUrl(kept), kept);
  assert.equal(d.assetUrl(undefined), "");
});

test("Pages build never calls the summary API", async () => {
  const sharing = await bundle("app/job-sharing.ts", pagesEnv);
  const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
  let calls = 0; const realFetch = globalThis.fetch; globalThis.fetch = async () => { calls++; return new Response("{}"); };
  try {
    const job = { id: "J1", stages: [], samples: [], requiredTests: [] };
    assert.equal(await sharing.syncShare(job, "link"), undefined);
    await sharing.stopShare("J1"); await sharing.pauseShare("J1"); await sharing.resumeShare(job);
    assert.equal(calls, 0);
    assert.equal(sharing.getShare("J1"), undefined, "no share record is created");
  } finally { globalThis.fetch = realFetch; delete globalThis.localStorage; }
});

test("Pages share panel explains why sharing is off instead of showing controls", () => {
  const source = fs.readFileSync(new URL("../app/job-qr.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(staticPages\) return <section[^]*?sharingUnavailableMessage/);
});

// Output checks run after `npm run build:pages`; skipped when dist-pages/ has not been built.
const dist = new URL("../dist-pages/", import.meta.url);
test("Pages output uses the repository base path and ships no records", { skip: !fs.existsSync(new URL("index.html", dist)) }, () => {
  const html = fs.readFileSync(new URL("index.html", dist), "utf8");
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!/^https:\/\/fonts\./.test(url)) assert.match(url, /^\/Workflow_VAPS\//, url);
  assert.ok(fs.existsSync(new URL(".nojekyll", dist)));
  assert.match(fs.readFileSync(new URL("404.html", dist), "utf8"), /location\.replace\("\/Workflow_VAPS\/"/);
  const files = fs.readdirSync(dist, { recursive: true }).map(String);
  assert.deepEqual(files.filter(f => /\.(xlsx?|xlsm|csv|json|sqlite|db|env|pem)$/i.test(f) || f.includes(".openai")), []);
  assert.ok(files.includes("vaps-logo.png") && files.some(f => f.endsWith("pdo.png")));
});
