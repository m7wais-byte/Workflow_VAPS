import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const jobSummaries = sqliteTable("job_summaries", { id: text("id").primaryKey(), editHash: text("edit_hash").notNull(), audience: text("audience").notNull(), payload: text("payload").notNull(), revision: integer("revision").notNull().default(1), updatedAt: text("updated_at").notNull() });

/**
 * Sign-in accounts. The login identity (username) is separate from the employee record: `employee_id` is the stable
 * internal employee ID (e.g. SALIM) from the employee directory, never the editable name or employee code.
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  /** Lower-case, trimmed. */
  username: text("username").notNull().unique(),
  employeeId: text("employee_id").notNull().unique(),
  /** `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`; never the password itself. */
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: integer("must_change_password").notNull().default(1),
  active: integer("active").notNull().default(1),
  passwordChangedAt: text("password_changed_at"),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by"),
  updatedAt: text("updated_at").notNull(),
});

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

/** Append-only audit trail. `account_id` and `employee_id` always come from the authenticated session. */
export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull(),
  accountId: text("account_id"),
  employeeId: text("employee_id"),
  action: text("action").notNull(),
  target: text("target"),
  detail: text("detail"),
}, (t) => [index("audit_events_target_idx").on(t.target)]);

/** Shared settings and registers (employee directory, authorization, duties, catalogue, clients …), one JSON value per key. */
export const workspaceRecords = sqliteTable("workspace_records", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

/** Job records, one JSON payload per job. `revision` guards against lost updates. */
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

/** Request book records (request number is the key). */
export const requestRecords = sqliteTable("request_records", {
  no: text("no").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

/** Activity history shown in the company overview and the employee profile. */
export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  action: text("action").notNull(),
  jobId: text("job_id"),
  at: text("at").notNull(),
}, (t) => [index("activity_log_at_idx").on(t.at)]);

/** Uploaded workbooks and report files. The bytes live in the R2 bucket under `id`. */
export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  type: text("type").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
});
