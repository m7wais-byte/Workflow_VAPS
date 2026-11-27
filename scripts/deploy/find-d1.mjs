#!/usr/bin/env node
// Reads `wrangler d1 list --json` from stdin and prints the UUID of the D1 database with the given name.
// Never creates anything: a missing database stops the deploy, so a typo can never start an empty database.
//   npx wrangler d1 list --json | node scripts/deploy/find-d1.mjs <database-name>
const name = process.argv[2];
if (!name) { console.error('Usage: node scripts/deploy/find-d1.mjs <database-name>'); process.exit(2); }
let input = '';
for await (const chunk of process.stdin) input += chunk;
// The JSON list starts at the beginning of a line; a warning such as "▲ [WARNING] …" must not be mistaken for it.
const start = input.search(/^\[/m);
let list = null;
try { if (start >= 0) list = JSON.parse(input.slice(start)); } catch { list = null; }
if (!Array.isArray(list)) {
  console.error('Could not read the D1 database list from Wrangler. Check CLOUDFLARE_API_TOKEN (needs D1 Edit) and CLOUDFLARE_ACCOUNT_ID.');
  process.exit(1);
}
const match = list.filter((db) => db && db.name === name);
if (match.length !== 1 || typeof match[0].uuid !== 'string') {
  console.error(match.length > 1
    ? `More than one D1 database is named "${name}". Keep exactly one.`
    : `D1 database "${name}" was not found in this Cloudflare account. Create it once (DEPLOY-CLOUDFLARE.md, step 3): npx wrangler d1 create ${name}`);
  process.exit(1);
}
console.log(match[0].uuid);
