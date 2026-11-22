// D1-compatible adapter over node:sqlite for tests: the same SQL and transaction behaviour the data layer relies on.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

export function d1() {
  const sqlite = new DatabaseSync(':memory:');
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
    exec: () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  });
  const db = {
    prepare: (sql) => statement(sql),
    // D1 runs a batch as one transaction: every statement or none.
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try { const out = statements.map((s) => s.exec()); sqlite.exec('COMMIT'); return out; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    sqlite,
  };
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort())
    for (const sql of readFileSync('drizzle/' + file, 'utf8').split('--> statement-breakpoint')) if (sql.trim()) sqlite.exec(sql);
  return db;
}
