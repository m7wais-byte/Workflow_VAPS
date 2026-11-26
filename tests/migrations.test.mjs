// Migrations apply cleanly to a fresh database and as an upgrade of a database that already holds 0000–0002 and data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const files = fs.readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort();
const apply = (db, list) => { for (const f of list) { db.exec('BEGIN'); for (const sql of fs.readFileSync('drizzle/' + f, 'utf8').split('--> statement-breakpoint')) if (sql.trim()) db.exec(sql); db.exec('COMMIT'); } };
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const columns = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

test('the journal lists every migration file in order, and 0003–0005 only add', () => {
  const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8')).entries.map((e) => e.tag + '.sql');
  assert.deepEqual(journal, files);
  assert.deepEqual(files, ['0000_magenta_phalanx.sql', '0001_chubby_ben_urich.sql', '0002_flawless_vanisher.sql', '0003_employee_sign_in.sql', '0004_account_sign_in_email.sql', '0005_invitations.sql', '0006_onedrive_pilot.sql', '0007_mail_outbox.sql']);
  for (const f of ['0003_employee_sign_in.sql', '0004_account_sign_in_email.sql']) assert.doesNotMatch(fs.readFileSync('drizzle/' + f, 'utf8'), /DROP|DELETE|UPDATE |RENAME/i, f + ': no destructive statements');
  // 0005 adds and back-fills activated_at for accounts that already had passwords; it removes nothing.
  assert.doesNotMatch(fs.readFileSync('drizzle/0005_invitations.sql', 'utf8'), /DROP|DELETE|RENAME/i);
  // 0006 (OneDrive pilot) only adds three tracking tables.
  assert.doesNotMatch(fs.readFileSync('drizzle/0006_onedrive_pilot.sql', 'utf8'), /DROP|DELETE|UPDATE |RENAME|ALTER/i);
  // 0007 (email outbox) only adds one table and its indexes.
  assert.doesNotMatch(fs.readFileSync('drizzle/0007_mail_outbox.sql', 'utf8'), /DROP|DELETE|UPDATE |RENAME|ALTER/i);
});

test('fresh database: all migrations apply', () => {
  const db = new DatabaseSync(':memory:'); apply(db, files);
  assert.deepEqual(tables(db), ['accounts', 'activity_log', 'audit_log', 'auth_throttle', 'browser_archive', 'files', 'invitations', 'job_summaries', 'jobs', 'mail_outbox', 'onedrive_auth', 'onedrive_files', 'onedrive_jobs', 'requests', 'sessions', 'settings']);
  assert.ok(columns(db, 'audit_log').includes('account_id'));
  assert.ok(columns(db, 'accounts').includes('email'));
});

test('upgrade: a database with 0000–0002 and records keeps every row when 0003 is applied', () => {
  const db = new DatabaseSync(':memory:'); apply(db, files.slice(0, 3));
  const at = '2026-11-01T00:00:00.000Z';
  db.prepare("INSERT INTO job_summaries (id, edit_hash, audience, payload, revision, updated_at) VALUES ('s1', 'h', 'link', '{}', 1, ?)").run(at);
  db.prepare("INSERT INTO settings (key, value, revision, updated_by, updated_at) VALUES ('vaps-directory-v1', '{\"employees\":[]}', 3, 'MA001', ?)").run(at);
  db.prepare("INSERT INTO jobs (id, job_number, payload, revision, trashed, updated_by, updated_at) VALUES ('OM-P-26-001', 'OM-P-26-001', '{\"id\":\"OM-P-26-001\"}', 7, 0, 'MA001', ?)").run(at);
  db.prepare("INSERT INTO audit_log (at, actor_id, action, record_type, record_id, detail) VALUES (?, 'MA001', 'imported', 'job', 'OM-P-26-001', '{}')").run(at);
  db.prepare("INSERT INTO requests (no, payload, updated_by, updated_at) VALUES ('101', '{}', 'MA001', ?)").run(at);
  db.prepare("INSERT INTO browser_archive (export_id, key, value, sha256, exported_at, imported_by, imported_at) VALUES ('e', 'k', 'v', 'x', ?, 'MA001', ?)").run(at, at);
  const before = Object.fromEntries(['job_summaries', 'settings', 'jobs', 'audit_log', 'requests', 'browser_archive'].map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()]));
  apply(db, files.slice(3));
  for (const [t, rows] of Object.entries(before)) {
    const after = db.prepare(`SELECT * FROM ${t}`).all();
    assert.equal(after.length, rows.length, t);
    if (t === 'audit_log') assert.deepEqual(after.map(({ account_id, ...r }) => (assert.equal(account_id, null), r)), rows.map((r) => ({ ...r })));
    else assert.deepEqual(after, rows, t);
  }
  db.prepare("INSERT INTO audit_log (at, actor_id, action, record_type, record_id, detail, account_id) VALUES (?, 'SALIM', 'auth.sign_in', 'auth', 'a1', '{}', 'a1')").run(at);
});

test('upgrade: accounts created before 0004 keep working and get no email; emails are unique', () => {
  const db = new DatabaseSync(':memory:'); apply(db, files.slice(0, 4));
  const add = (id, user, emp) => db.prepare("INSERT INTO accounts (id, username, employee_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, 'h', 't', 't')").run(id, user, emp);
  add('a1', 'salim.vaps', 'SALIM'); add('a2', 'wilfred.vaps', 'WILFRED');
  apply(db, files.slice(4, 5));
  assert.deepEqual(db.prepare('SELECT id, username, email FROM accounts ORDER BY id').all().map((r) => ({ ...r })), [{ id: 'a1', username: 'salim.vaps', email: null }, { id: 'a2', username: 'wilfred.vaps', email: null }]);
  db.prepare("UPDATE accounts SET email = 'salim@vaps.example' WHERE id = 'a1'").run();
  assert.throws(() => db.prepare("UPDATE accounts SET email = 'salim@vaps.example' WHERE id = 'a2'").run(), /UNIQUE/);
});

test('upgrade to 0005: existing accounts count as activated, nothing else changes', () => {
  const db = new DatabaseSync(':memory:'); apply(db, files.slice(0, 5));
  db.prepare("INSERT INTO accounts (id, username, employee_id, password_hash, created_at, updated_at, password_changed_at) VALUES ('a1', 'ma001', 'MA001', 'h', '2026-11-01', '2026-11-01', '2026-11-02')").run();
  db.prepare("INSERT INTO accounts (id, username, employee_id, password_hash, created_at, updated_at) VALUES ('a2', 'salim.vaps', 'SALIM', 'h', '2026-11-03', '2026-11-03')").run();
  apply(db, files.slice(5));
  assert.deepEqual(db.prepare('SELECT id, active, activated_at, invited_at, last_sign_in_at FROM accounts ORDER BY id').all().map((r) => ({ ...r })),
    [{ id: 'a1', active: 1, activated_at: '2026-11-02', invited_at: null, last_sign_in_at: null }, { id: 'a2', active: 1, activated_at: '2026-11-03', invited_at: null, last_sign_in_at: null }]);
});
