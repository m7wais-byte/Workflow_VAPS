import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

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
  /** Signed-in account that made the change (migration 0003); null for imports and entries written before sign-in. */accountId: text("account_id"),
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

/* ---------- Employee sign-in (migration 0003) ---------- */

/**
 * Sign-in accounts. The login identity (username) is separate from the employee record: `employee_id` is the stable
 * internal employee ID (e.g. SALIM) from the employee directory, never the editable name or employee code.
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  /** Lower-case, trimmed. */username: text("username").notNull().unique(),
  employeeId: text("employee_id").notNull().unique(),
  /** Optional sign-in email (migration 0004). Stored trimmed and lower-case; the unique index makes duplicates impossible whatever the capitalisation. */email: text("email").unique(),
  /** `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`; never the password itself. */passwordHash: text("password_hash").notNull(),
  mustChangePassword: integer("must_change_password").notNull().default(1),
  active: integer("active").notNull().default(1),
  passwordChangedAt: text("password_changed_at"),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by"),
  updatedAt: text("updated_at").notNull(),
  /** Migration 0005: when the employee set their own password from an invitation (or the account existed before invitations). Null = invited, not yet active. */activatedAt: text("activated_at"),
  /** Migration 0005: last invitation sent. */invitedAt: text("invited_at"),
  /** Migration 0005: last successful sign-in. */lastSignInAt: text("last_sign_in_at"),
});

/**
 * Invitation links (migration 0005). Only a SHA-256 hash of the one-time token is stored; the token itself exists
 * only in the email. A link works once, until it expires, and stops working when a newer invitation is sent.
 */
export const invitations = sqliteTable("invitations", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  revokedAt: text("revoked_at"),
}, (t) => [index("invitations_account_idx").on(t.accountId)]);

/** Server sessions. Only a SHA-256 hash of the cookie token is stored. */
export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  accountId: text("account_id").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  revokeReason: text("revoke_reason"),
}, (t) => [index("sessions_account_idx").on(t.accountId)]);

/** Failed sign-in counters per username and per client address. */
export const authThrottle = sqliteTable("auth_throttle", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  lockedUntil: text("locked_until"),
});

/** Activity history shown in the company overview and the employee profile. */
export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  action: text("action").notNull(),
  jobId: text("job_id"),
  at: text("at").notNull(),
}, (t) => [index("activity_log_at_idx").on(t.at)]);

/** Uploaded workbooks and report files. The bytes live in the R2 bucket (binding FILES) under `id`. */
export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  type: text("type").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
});

/* ---------- Temporary OneDrive for Business pilot (migration 0006). D1 stays the system of record. ---------- */

/** The one connected VAPS Microsoft account. `sealed` / `pending` are AES-GCM encrypted (ONEDRIVE_TOKEN_KEY); never plain tokens. */
export const onedriveAuth = sqliteTable("onedrive_auth", {
  id: text("id").primaryKey(),
  /** not-connected | pending | connected | expired */status: text("status").notNull(),
  account: text("account"),
  /** Encrypted refresh token. */sealed: text("sealed"),
  /** Encrypted device code of a sign-in in progress. */pending: text("pending"),
  pendingExpires: text("pending_expires"),
  pendingInterval: integer("pending_interval"),
  connectedAt: text("connected_at"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull(),
});

/** One row per job copied to OneDrive: its <Job ID>, Sampling and Lab folder IDs. */
export const onedriveJobs = sqliteTable("onedrive_jobs", {
  jobId: text("job_id").primaryKey(),
  folderId: text("folder_id"),
  samplingId: text("sampling_id"),
  labId: text("lab_id"),
  folderUrl: text("folder_url"),
  /** ok | error */status: text("status").notNull(),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull(),
});

/** Job files routed to a job folder (app/file-routing.ts). `source`: "upload" (R2) or "job" (scope-of-work in the job record). */
export const onedriveFiles = sqliteTable("onedrive_files", {
  fileId: text("file_id").primaryKey(),
  jobId: text("job_id").notNull(),
  purpose: text("purpose").notNull(),
  section: text("section").notNull(),
  source: text("source").notNull(),
  name: text("name").notNull(),
  /** pending | ok | error | replaced */status: text("status").notNull(),
  itemId: text("item_id"),
  /** The name OneDrive kept (numbered when the name was already taken). */copyName: text("copy_name"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("onedrive_files_job_idx").on(t.jobId, t.status)]);

/**
 * Outgoing email outbox and send log (server/notify.ts). One row per message; `dedupe_key` is unique, so a retried
 * workflow action or a repeated save never queues the same message twice. Invitation rows keep no body (the one-time
 * link must not be stored); notification rows keep their rendered subject and body so a failed send can be retried.
 * `audience`: invite | staff | client. `status`: queued | sent | failed | blocked (recipient not allowed) | skipped.
 */
export const mailOutbox = sqliteTable("mail_outbox", {
  id: text("id").primaryKey(),
  dedupeKey: text("dedupe_key").notNull(),
  audience: text("audience").notNull(),
  event: text("event").notNull(),
  jobId: text("job_id"),
  employeeId: text("employee_id"),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  textBody: text("text_body"),
  htmlBody: text("html_body"),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
  updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("mail_outbox_dedupe_idx").on(t.dedupeKey), index("mail_outbox_status_idx").on(t.status, t.createdAt), index("mail_outbox_job_idx").on(t.jobId)]);
