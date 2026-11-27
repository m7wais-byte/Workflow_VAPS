#!/usr/bin/env node
// Backs up the Workflow VAPS database (D1) and every uploaded file (R2) into one folder with a checked manifest.
//
//   Local (Docker, app stopped):  node scripts/backup/backup.mjs --local [--out backups/<name>]
//   Cloudflare:                   node scripts/backup/backup.mjs --remote --db vaps-test-db --bucket vaps-test-files [--out ...]
//                                 (needs `npx wrangler login` or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
//
// Output: database.sql (full SQL export), files/<file id> (the stored bytes), manifest.json (row count per table,
// each file's name, type, size and SHA-256, and the SHA-256 of database.sql). The folder contains operational
// records: keep it private and never commit it. Files are found through the database's `files` table, which every
// upload and import writes; objects in the bucket that no record refers to are not copied.
import { mkdirSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs, target, wrangler, query, tableCounts, exportDatabase, sha256, fileIdPattern, root } from './lib.mjs';

const usage = 'Usage: node scripts/backup/backup.mjs (--local [--persist-to dir] | --remote --db <name> --bucket <name>) [--out dir]';
const args = parseArgs(process.argv.slice(2), usage);
const t = target(args);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = resolve(args.out || join(root, 'backups', `vaps-${t.mode}-${stamp}`));
mkdirSync(out, { recursive: true });
if (readdirSync(out).length) throw new Error(`${out} is not empty. Choose a new --out folder.`);
mkdirSync(join(out, 'files'));

console.log(`Backing up the ${t.mode} database "${t.db}" and bucket "${t.bucket}" to ${out}`);
const tables = tableCounts(t);
exportDatabase(t, join(out, 'database.sql'), tables);

const [files] = query(t, 'SELECT id, name, size, type FROM files ORDER BY uploaded_at, id');
const copied = [];
for (const f of files) {
  if (!fileIdPattern.test(f.id)) throw new Error(`Unexpected file id ${JSON.stringify(f.id)} in the files table.`);
  const path = join(out, 'files', f.id);
  wrangler(['r2', 'object', 'get', `${t.bucket}/${f.id}`, '--file', path], t);
  const size = statSync(path).size;
  if (size !== f.size) throw new Error(`File ${f.id} (${f.name}): ${size} bytes in storage, ${f.size} in the database.`);
  copied.push({ id: f.id, name: f.name, type: f.type, size, sha256: sha256(path) });
}

const manifest = {
  format: 'vaps-backup-1', createdAt: new Date().toISOString(), source: { mode: t.mode, database: t.db, bucket: t.bucket },
  database: { file: 'database.sql', sha256: sha256(join(out, 'database.sql')), tables },
  files: copied,
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Done: ${Object.keys(tables).length} tables (${Object.values(tables).reduce((a, b) => a + b, 0)} rows), ${copied.length} files.`);
console.log(`Manifest: ${join(out, 'manifest.json')}`);
