// Like tests/fixtures/sites-api.mjs, but persists D1/R2 to disk and applies only migrations not yet recorded,
// so the same database can be created by one build and upgraded by another (as a hosted deploy would).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire(process.cwd() + '/');
const { build } = req('esbuild');
const { Miniflare } = req('miniflare');
export async function start(routes, extra, envExtra, persist) {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("") } }', d1Databases: ['DB'], r2Buckets: ['FILES'], d1Persist: persist + '/d1', r2Persist: persist + '/r2' });
  const DB = await mf.getD1Database('DB'), FILES = await mf.getR2Bucket('FILES');
  await DB.prepare('CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT)').run();
  const applied = [];
  for (const file of fs.readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    if (await DB.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').bind(file).first()) continue;
    const stmts = fs.readFileSync('drizzle/' + file, 'utf8').split('--> statement-breakpoint').filter((s) => s.trim()).map((s) => DB.prepare(s));
    await DB.batch([...stmts, DB.prepare('INSERT INTO d1_migrations VALUES (?, ?)').bind(file, new Date().toISOString())]);
    applied.push(file);
  }
  globalThis.__vapsTestEnv = { DB, FILES, ...envExtra };
  const entry = Object.entries(routes).map(([n, p]) => `export * as ${n} from ${JSON.stringify('./' + p)};`).join('\n') + '\n' + extra;
  const stub = { name: 'workers-env', setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const env = globalThis.__vapsTestEnv;' })); } };
  const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [stub], define: { 'import.meta.env': '{}' }, jsx: 'automatic' });
  const api = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
  const ORIGIN = 'https://vaps.example';
  async function call(route, method, path, { json, cookie, params = {}, body } = {}) {
    const h = new Headers();
    if (json !== undefined) h.set('Content-Type', 'application/json');
    if (method !== 'GET') { h.set('Origin', ORIGIN); h.set('X-VAPS-Request', '1'); }
    if (cookie) h.set('Cookie', cookie);
    const res = await api[route][method](new Request(ORIGIN + path, { method, headers: h, body: json !== undefined ? JSON.stringify(json) : body }), { params: Promise.resolve(params) });
    const ct = res.headers.get('Content-Type') || ''; const buf = Buffer.from(await res.arrayBuffer());
    let data; try { data = JSON.parse(buf.toString()); } catch { data = buf; }
    return { status: res.status, data, ct, setCookie: res.headers.get('Set-Cookie') || '' };
  }
  return { mf, DB, FILES, api, call, applied };
}
export const routes = {
  login: 'app/api/auth/login/route.ts', session: 'app/api/auth/session/route.ts', password: 'app/api/auth/password/route.ts',
  invitation: 'app/api/auth/invitation/route.ts', invite: 'app/api/admin/invitations/route.ts', accounts: 'app/api/admin/accounts/route.ts',
  workspace: 'app/api/workspace/route.ts', record: 'app/api/workspace/records/[key]/route.ts', job: 'app/api/jobs/[id]/route.ts', operations: 'app/api/jobs/[id]/operations/route.ts', files: 'app/api/files/route.ts', file: 'app/api/files/[id]/route.ts',
};
export const extra = ['export * as auth from "./server/auth.ts";', 'export { testOutbox } from "./server/mail.ts";',
  'export { defaultFieldData } from "./app/sample-defaults.ts";', 'export { cylinderCatalog } from "./app/cylinder-catalog.ts";'].join('\n');
export const cookieOf = (c) => c.split(';')[0];
