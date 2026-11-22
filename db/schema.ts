import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

/** Client share links (existing; sharing is switched off in app/deployment.ts). */
export const jobSummaries = sqliteTable("job_summaries", { id: text("id").primaryKey(), editHash: text("edit_hash").notNull(), audience: text("audience").notNull(), payload: text("payload").notNull(), revision: integer("revision").notNull().default(1), updatedAt: text("updated_at").notNull() });

/**
 * Shared settings, one row per existing browser key (e.g. `vaps-directory-v1`, `vaps-authorization-v1`), so the
 * existing validators in app/ keep checking the stored value. `revision` increases on every write.
 * The employee directory is stored without passwords; credentials get their own table with sign-in (Phase A).
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  revision: integer("revision").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * One row per job record, keyed by the existing internal job ID. `payload` is the JobRecord exactly as the app
 * stores it. `revision` is the row's write counter, used to refuse stale saves (separate from operations.revision).
 */
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  jobNumber: text("job_number").notNull(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull(),
  trashed: integer("trashed").notNull().default(0),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("jobs_job_number").on(t.jobNumber)]);

/** Append-only audit trail. Actor and time are set on the server, never taken from the browser. */
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  recordType: text("record_type").notNull(),
  recordId: text("record_id").notNull(),
  /** JSON: before/after revisions, command types, a summary of what changed. */detail: text("detail").notNull(),
}, (t) => [index("audit_record").on(t.recordType, t.recordId), index("audit_actor").on(t.actorId, t.at)]);

/** PVT request book, one row per request number (`no`), the record exactly as the app stores it. */
export const requests = sqliteTable("requests", {
  no: text("no").primaryKey(),
  payload: text("payload").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Browser records imported verbatim that the server does not read yet (clients, company, cylinders, equipment,
 * request lists, job counter, activity log, …). Kept unchanged, per export, until the step that serves each one
 * validates and moves it. Never edited.
 */
export const browserArchive = sqliteTable("browser_archive", {
  exportId: text("export_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  sha256: text("sha256").notNull(),
  exportedAt: text("exported_at").notNull(),
  importedBy: text("imported_by").notNull(),
  importedAt: text("imported_at").notNull(),
}, (t) => [primaryKey({ columns: [t.exportId, t.key] })]);
