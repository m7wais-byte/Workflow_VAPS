#!/usr/bin/env node
// Creates the SQL for one sign-in account with a random temporary password (bootstrap of the Administrator, MA001, or
// recovery when no administrator can sign in). Everyone else is invited from Settings → Sign-in accounts.
// Use the employee ID in lower case as the username (e.g. ma001) so the employee ID signs in too.
//
//   node scripts/create-account.mjs <username> <employee-id>
//
// The temporary password is printed once to this terminal and never written to a file. The SQL (with the password
// hash only) is written to a private temporary file; run it with Wrangler, then delete it:
//   npx wrangler d1 execute <database-name> --remote --file <printed path>
// The employee ID must be an existing internal ID from the employee directory (e.g. MA001), never a name.
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [username = '', employeeId = ''] = process.argv.slice(2);
const user = username.trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(user) || !/^[A-Za-z0-9-]{2,64}$/.test(employeeId)) {
  console.error('Usage: node scripts/create-account.mjs <username> <employee-id>\nUsername: 3–40 letters, digits, dot, hyphen or underscore. Employee ID: the internal directory ID, e.g. MA001.');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({ entryPoints: [join(root, 'server/passwords.ts')], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const { hashPassword, temporaryPassword } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const temporary = temporaryPassword();
const hash = await hashPassword(temporary);
const at = new Date().toISOString(), id = crypto.randomUUID();
const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const sql = `INSERT INTO accounts (id, username, employee_id, password_hash, must_change_password, active, created_at, created_by, updated_at, activated_at) VALUES (${q(id)}, ${q(user)}, ${q(employeeId)}, ${q(hash)}, 1, 1, ${q(at)}, 'bootstrap-script', ${q(at)}, ${q(at)});
INSERT INTO audit_log (at, actor_id, action, record_type, record_id, detail, account_id) VALUES (${q(at)}, 'bootstrap-script', 'account.created', 'account', ${q(id)}, ${q(JSON.stringify({ username: user, employeeId, via: 'bootstrap-script' }))}, NULL);
`;
const file = join(mkdtempSync(join(tmpdir(), 'vaps-account-')), 'create-account.sql');
writeFileSync(file, sql, { mode: 0o600 });
console.log(`Account SQL written to: ${file}`);
console.log(`Username:           ${user}`);
console.log(`Employee ID:        ${employeeId}`);
console.log(`Temporary password: ${temporary}   (shown once; it must be changed at first sign-in)`);
