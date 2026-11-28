// Shared helpers for scripts/backup/backup.mjs and restore.mjs: Wrangler calls against either the local
// (Docker / Miniflare) database and file storage or the Cloudflare ones, with the same commands.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const wranglerBin = join(root, 'node_modules', '.bin', 'wrangler');

export function parseArgs(argv, usage) {
  const args = { mode: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--local' || a === '--remote') args.mode = a.slice(2);
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else throw new Error(`Unexpected argument ${a}\n${usage}`);
  }
  if (!args.mode) throw new Error(`Choose --local or --remote.\n${usage}`);
  return args;
}

/**
 * The target: local uses docker/wrangler.local.jsonc (same names as the dev server) and the local state folder;
 * remote looks the D1 database up by name in the Cloudflare account (never creates it) and writes a temporary config.
 */
export function target(args) {
  if (args.mode === 'local') {
    return {
      mode: 'local', db: 'site-creator-d1', bucket: 'site-creator-r2',
      config: join(root, 'docker', 'wrangler.local.jsonc'),
      persist: resolve(args['persist-to'] || join(root, '.wrangler', 'state')),
    };
  }
  if (!args.db || !args.bucket) throw new Error('--remote needs --db <D1 name> and --bucket <R2 bucket name>.');
  const list = JSON.parse(extractJson(wrangler(['d1', 'list', '--json'], null)));
  const match = list.filter((d) => d.name === args.db);
  if (match.length !== 1) throw new Error(`D1 database "${args.db}" was not found (or is not unique) in this Cloudflare account.`);
  const dir = mkdtempSync(join(tmpdir(), 'vaps-backup-'));
  const config = join(dir, 'wrangler.json');
  writeFileSync(config, JSON.stringify({ name: 'vaps-backup', compatibility_date: '2026-05-15',
    d1_databases: [{ binding: 'DB', database_name: args.db, database_id: match[0].uuid }],
    r2_buckets: [{ binding: 'FILES', bucket_name: args.bucket }] }));
  return { mode: 'remote', db: args.db, bucket: args.bucket, config, persist: null };
}

function extractJson(text) {
  const start = text.search(/^[[{]/m);
  if (start < 0) throw new Error('Wrangler did not return JSON:\n' + text.slice(0, 500));
  return text.slice(start);
}

export function wrangler(argv, t, options = {}) {
  const full = [...argv];
  if (t) {
    full.push('--config', t.config);
    if (t.mode === 'local') full.push('--local', '--persist-to', t.persist);
    else full.push('--remote');
  }
  if (!existsSync(wranglerBin)) throw new Error('Wrangler is not installed here (run npm ci).');
  return execFileSync(wranglerBin, full, {
    cwd: root, encoding: options.binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(root, '.wrangler', 'logs') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Runs SQL and returns the rows of each statement. */
export function query(t, sql) {
  const out = JSON.parse(extractJson(wrangler(['d1', 'execute', t.db, '--json', '--command', sql], t)));
  return out.map((r) => r.results);
}

export const tableCounts = (t) => {
  const [tables] = query(t, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
  if (!tables.length) return {};
  const rows = query(t, tables.map((r) => `SELECT COUNT(*) AS n FROM "${r.name}"`).join('; '));
  return Object.fromEntries(tables.map((r, i) => [r.name, rows[i][0].n]));
};

/**
 * `wrangler d1 export` has no --persist-to: locally it reads `<config folder>/.wrangler/state`. A temporary config is
 * written next to the `.wrangler` folder that holds the state, so the export reads the same database as the other
 * commands. The dump is then checked to contain rows for every table that has rows.
 */
export function exportDatabase(t, output, counts) {
  if (t.mode === 'remote') wrangler(['d1', 'export', t.db, '--output', output, '--skip-confirmation'], t);
  else {
    if (basename(t.persist) !== 'state' || basename(dirname(t.persist)) !== '.wrangler') throw new Error('--persist-to must end in .wrangler/state for a local export.');
    const config = join(dirname(dirname(t.persist)), `.vaps-export-${process.pid}.wrangler.json`);
    writeFileSync(config, readFileSync(t.config, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace('"../drizzle"', JSON.stringify(join(root, 'drizzle'))));
    try { wrangler(['d1', 'export', t.db, '--output', output, '--local', '--config', config], null); }
    finally { rmSync(config, { force: true }); }
  }
  const sql = readFileSync(output, 'utf8');
  const missing = Object.entries(counts).filter(([name, n]) => n > 0 && !new RegExp(`INSERT INTO "?${name}"?[ (]`).test(sql)).map(([name]) => name);
  if (missing.length) throw new Error(`The export has no rows for ${missing.join(', ')}: it did not read the expected database.`);
}

export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
export const fileIdPattern = /^[0-9a-f-]{36}$/i;
export { root };
