// Runs the Sites API route handlers in Node against a local D1 database and R2 bucket (Miniflare), as the Worker would.
import fs from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

export async function startSitesApi(routes, extraExports = '') {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("") } }', d1Databases: ['DB'], r2Buckets: ['FILES'] });
  const DB = await mf.getD1Database('DB'), FILES = await mf.getR2Bucket('FILES');
  for (const file of fs.readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort())
    for (const statement of fs.readFileSync('drizzle/' + file, 'utf8').split('--> statement-breakpoint')) if (statement.trim()) await DB.prepare(statement).run();
  globalThis.__vapsTestEnv = { DB, FILES };
  const entry = Object.entries(routes).map(([name, path]) => `export * as ${name} from ${JSON.stringify('./' + path)};`).join('\n') + '\n' + extraExports;
  const stub = { name: 'workers-env', setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const env = globalThis.__vapsTestEnv;' })); } };
  const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [stub], define: { 'import.meta.env': '{}' }, jsx: 'automatic' });
  const api = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
  const ORIGIN = 'https://vaps.example';
  async function call(route, method, path, { json, cookie, params = {} } = {}) {
    const h = new Headers();
    if (json !== undefined) h.set('Content-Type', 'application/json');
    if (method !== 'GET') { h.set('Origin', ORIGIN); h.set('X-VAPS-Request', '1'); }
    if (cookie) h.set('Cookie', cookie);
    const response = await api[route][method](new Request(ORIGIN + path, { method, headers: h, body: json !== undefined ? JSON.stringify(json) : undefined }), { params: Promise.resolve(params) });
    const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, setCookie: response.headers.get('Set-Cookie') || '' };
  }
  return { mf, DB, FILES, api, call };
}
