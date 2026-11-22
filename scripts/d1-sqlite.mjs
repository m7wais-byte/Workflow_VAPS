// D1-compatible adapter over node:sqlite, used by the tests and by the local staging import (scripts/vaps-import.mjs).
// Applies the project's migrations once, in order, and runs a batch as one transaction, as D1 does.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrations = resolve(import.meta.dirname, '..', 'drizzle');

export function d1(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
    exec: () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  });
  sqlite.exec('CREATE TABLE IF NOT EXISTS _vaps_migrations (name TEXT PRIMARY KEY)');
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    if (sqlite.prepare('SELECT 1 FROM _vaps_migrations WHERE name = ?').get(file)) continue;
    sqlite.exec('BEGIN');
    for (const sql of readFileSync(resolve(migrations, file), 'utf8').split('--> statement-breakpoint')) if (sql.trim()) sqlite.exec(sql);
    sqlite.prepare('INSERT INTO _vaps_migrations (name) VALUES (?)').run(file);
    sqlite.exec('COMMIT');
  }
  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try { const out = statements.map((s) => s.exec()); sqlite.exec('COMMIT'); return out; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    sqlite,
  };
}
