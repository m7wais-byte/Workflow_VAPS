#!/usr/bin/env node
// Restores a backup made by backup.mjs into an EMPTY database and bucket, then checks the result.
//
//   Local (Docker, fresh volume, app stopped): node scripts/backup/restore.mjs --local --in backups/<name>
//   Cloudflare (a new, empty D1 database):     node scripts/backup/restore.mjs --remote --db <new db> --bucket <bucket> --in backups/<name>
//
// Refuses a database that already has tables, so it can never overwrite live records. (To roll the live database back
// in time, use D1 Time Travel instead: see DEPLOY-CLOUDFLARE.md.) Every backup file is checked against the manifest
// before anything is written; afterwards the row count of every table and the SHA-256 of every file read back from
// storage must match the manifest.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, target, wrangler, query, tableCounts, sha256, fileIdPattern } from './lib.mjs';

const usage = 'Usage: node scripts/backup/restore.mjs (--local [--persist-to dir] | --remote --db <name> --bucket <name>) --in <backup dir>';
const args = parseArgs(process.argv.slice(2), usage);
if (!args.in) throw new Error(usage);
const dir = resolve(args.in);
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
if (manifest.format !== 'vaps-backup-1') throw new Error('Not a Workflow VAPS backup (manifest format).');

// 1. The backup itself must be intact.
if (sha256(join(dir, manifest.database.file)) !== manifest.database.sha256) throw new Error('database.sql does not match its checksum.');
for (const f of manifest.files) {
  const path = join(dir, 'files', f.id);
  if (!fileIdPattern.test(f.id) || !existsSync(path) || sha256(path) !== f.sha256) throw new Error(`Backup file ${f.id} (${f.name}) is missing or damaged.`);
}

// 2. The target must be empty.
const t = target(args);
const [existing] = query(t, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
if (existing.length) throw new Error(`The ${t.mode} database "${t.db}" already has tables (${existing.map((r) => r.name).join(', ')}). Restore only into an empty database.`);

console.log(`Restoring ${dir} into the ${t.mode} database "${t.db}" and bucket "${t.bucket}"`);
wrangler(['d1', 'execute', t.db, '--file', join(dir, manifest.database.file), '--yes'], t);
for (const f of manifest.files) {
  wrangler(['r2', 'object', 'put', `${t.bucket}/${f.id}`, '--file', join(dir, 'files', f.id), '--content-type', f.type || 'application/octet-stream'], t);
}

// 3. Check the result against the manifest.
const counts = tableCounts(t);
const wrong = Object.entries(manifest.database.tables).filter(([name, n]) => counts[name] !== n).map(([name, n]) => `${name}: ${counts[name]} restored, ${n} in backup`);
if (wrong.length) throw new Error('Row counts differ:\n  ' + wrong.join('\n  '));
const check = mkdtempSync(join(tmpdir(), 'vaps-restore-check-'));
for (const f of manifest.files) {
  const path = join(check, f.id);
  wrangler(['r2', 'object', 'get', `${t.bucket}/${f.id}`, '--file', path], t);
  if (sha256(path) !== f.sha256) throw new Error(`File ${f.id} (${f.name}) read back from storage does not match the backup.`);
}
console.log(`Restore verified: ${Object.keys(counts).length} tables with matching row counts, ${manifest.files.length} files matching byte for byte.`);
