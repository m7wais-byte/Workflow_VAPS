/**
 * The part of the Cloudflare D1 API the data layer uses. The real `env.DB` binding satisfies it; tests use a
 * node:sqlite adapter (scripts/d1-sqlite.mjs). `batch` runs its statements in one transaction.
 */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<{ meta: { changes: number } }[]>;
}

/** A refusal with the HTTP status the API layer should return. The message is safe to show to the employee. */
export class StoreError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 422 | 503) { super(message); this.name = 'StoreError'; }
}

/**
 * Audit row written in the same batch as the change, only when the preceding statement changed exactly one row,
 * so a refused or stale write leaves no audit entry and a successful one always has one.
 */
export const auditAfterChange = "INSERT INTO audit_log (at, actor_id, action, record_type, record_id, detail) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1";

export type AuditEntry = { id: number; at: string; actorId: string; action: string; recordType: string; recordId: string; detail: unknown };

export async function listAudit(db: D1Like, recordType: string, recordId: string): Promise<AuditEntry[]> {
  const { results } = await db.prepare("SELECT id, at, actor_id, action, record_type, record_id, detail FROM audit_log WHERE record_type = ? AND record_id = ? ORDER BY id").bind(recordType, recordId).all<{ id: number; at: string; actor_id: string; action: string; record_type: string; record_id: string; detail: string }>();
  return results.map(r => ({ id: r.id, at: r.at, actorId: r.actor_id, action: r.action, recordType: r.record_type, recordId: r.record_id, detail: JSON.parse(r.detail) }));
}
