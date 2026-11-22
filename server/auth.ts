/**
 * Employee sign-in: accounts, server sessions, failed-attempt throttling and password changes (Cloudflare D1).
 * The acting employee is always taken from the session row, never from the request body, URL or browser storage.
 */
import { burnPasswordCheck, hashPassword, needsRehash, passwordProblem, randomToken, sha256Hex, temporaryPassword, verifyPassword } from "./passwords";
import { fail, readCookie, cookieName, type AuthConfig } from "./http";

export type AccountRow = { id: string; username: string; employee_id: string; password_hash: string; must_change_password: number; active: number; password_changed_at: string | null; created_at: string; updated_at: string };
export type Session = { idHash: string; accountId: string; username: string; employeeId: string; mustChangePassword: boolean; expiresAt: string };

/** One message for every failed sign-in: it never reveals whether the username exists, is inactive or is locked. */
export const SIGN_IN_FAILED = "Sign-in failed. Check your username and password and try again. After several failed attempts, sign-in is paused for 15 minutes.";

const USER_LIMIT = 5, ADDRESS_LIMIT = 30, WINDOW_MINUTES = 15, LOCK_MINUTES = 15;
const TOUCH_MINUTES = 5;
const minutes = (n: number) => n * 60_000;

export const normalizeUsername = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
export const validUsername = (u: string) => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u);

export type AuditInput = { accountId?: string | null; employeeId?: string | null; action: string; target?: string | null; detail?: unknown };
const auditSql = (afterChange: boolean) => "INSERT INTO audit_log (at, actor_id, action, record_type, record_id, detail, account_id) " + (afterChange ? "SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1" : "VALUES (?, ?, ?, ?, ?, ?, ?)");
/**
 * One audit_log row (the append-only trail from the data layer). `actor_id` is the session's employee, or
 * "anonymous" for a sign-in attempt with no known account; `record_type` is the action's prefix (auth, account, job …).
 * With `afterChange`, the row is written only if the preceding statement in the same batch changed exactly one row.
 */
export function auditStatement(db: D1Database, entry: AuditInput, at = new Date().toISOString(), afterChange = false) {
  return db.prepare(auditSql(afterChange)).bind(at, entry.employeeId || "anonymous", entry.action, entry.action.split(".")[0], entry.target || entry.accountId || "-", JSON.stringify(entry.detail ?? {}).slice(0, 1_000_000), entry.accountId ?? null);
}
export async function audit(db: D1Database, entry: AuditInput, at = new Date().toISOString()) { await auditStatement(db, entry, at).run(); }

async function throttleState(db: D1Database, key: string, now: number) {
  const row = await db.prepare("SELECT failures, window_started_at, locked_until FROM auth_throttle WHERE key = ?").bind(key).first<{ failures: number; window_started_at: string; locked_until: string | null }>();
  if (!row) return { failures: 0, locked: false };
  const locked = !!row.locked_until && Date.parse(row.locked_until) > now;
  const fresh = Date.parse(row.window_started_at) + minutes(WINDOW_MINUTES) > now;
  return { failures: fresh ? row.failures : 0, locked };
}
async function recordFailure(db: D1Database, key: string, limit: number, now: number) {
  const state = await throttleState(db, key, now);
  const failures = state.failures + 1;
  const windowStart = state.failures ? undefined : new Date(now).toISOString();
  const lockedUntil = failures >= limit ? new Date(now + minutes(LOCK_MINUTES)).toISOString() : null;
  await db.prepare(`INSERT INTO auth_throttle (key, failures, window_started_at, locked_until) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_started_at = COALESCE(?, auth_throttle.window_started_at), locked_until = COALESCE(excluded.locked_until, auth_throttle.locked_until)`)
    .bind(key, failures, windowStart || new Date(now).toISOString(), lockedUntil, windowStart || null).run();
}

export type EmployeeCheck = (employeeId: string) => Promise<boolean>;

/** Verifies a username and password. Unknown, inactive and locked accounts all fail with the same message and timing. */
export async function signIn(db: D1Database, config: AuthConfig, input: { username: unknown; password: unknown; address: string }, employeeActive: EmployeeCheck, nowDate = new Date()) {
  const now = nowDate.getTime(), at = nowDate.toISOString();
  const username = normalizeUsername(input.username);
  const password = typeof input.password === "string" ? input.password : "";
  const userKey = "user:" + username, addressKey = "addr:" + input.address;
  if (!username || !password || password.length > 256) { await burnPasswordCheck(password || "x"); throw fail(401, SIGN_IN_FAILED); }
  const [user, address] = await Promise.all([throttleState(db, userKey, now), throttleState(db, addressKey, now)]);
  if (user.locked || address.locked) { await burnPasswordCheck(password); await audit(db, { action: "auth.sign_in_blocked", target: username }, at); throw fail(429, SIGN_IN_FAILED); }
  const account = await db.prepare("SELECT * FROM accounts WHERE username = ?").bind(username).first<AccountRow>();
  const ok = account ? await verifyPassword(password, account.password_hash) : (await burnPasswordCheck(password), false);
  if (!account || !ok || !account.active || !(await employeeActive(account.employee_id))) {
    await recordFailure(db, userKey, USER_LIMIT, now); await recordFailure(db, addressKey, ADDRESS_LIMIT, now);
    await audit(db, { accountId: account?.id, employeeId: account?.employee_id, action: "auth.sign_in_failed", target: username, detail: { reason: !account ? "unknown" : !ok ? "password" : "inactive" } }, at);
    throw fail(401, SIGN_IN_FAILED);
  }
  await db.prepare("DELETE FROM auth_throttle WHERE key = ?").bind(userKey).run();
  if (needsRehash(account.password_hash)) await db.prepare("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(password), at, account.id).run();
  const token = randomToken(), idHash = await sha256Hex(token);
  const expiresAt = new Date(now + config.sessionMaxHours * 3_600_000).toISOString();
  await db.prepare("INSERT INTO sessions (id_hash, account_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(idHash, account.id, at, at, expiresAt).run();
  await audit(db, { accountId: account.id, employeeId: account.employee_id, action: "auth.sign_in" }, at);
  return { token, maxAgeSeconds: config.sessionMaxHours * 3600, session: { idHash, accountId: account.id, username: account.username, employeeId: account.employee_id, mustChangePassword: !!account.must_change_password, expiresAt } satisfies Session };
}

export type SessionResult = { session: Session } | { session: null; reason: "missing" | "expired" | "revoked" | "inactive" };

/** Resolves the session cookie. Expired (absolute or idle), revoked and deactivated sessions are refused. */
export async function readSession(db: D1Database, config: AuthConfig, request: Request, employeeActive: EmployeeCheck, nowDate = new Date()): Promise<SessionResult> {
  const token = readCookie(request, cookieName(request));
  if (!/^[a-f0-9]{64}$/.test(token)) return { session: null, reason: "missing" };
  const idHash = await sha256Hex(token);
  const row = await db.prepare(`SELECT s.id_hash, s.account_id, s.last_seen_at, s.expires_at, s.revoked_at, a.username, a.employee_id, a.must_change_password, a.active
    FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id_hash = ?`).bind(idHash).first<{ id_hash: string; account_id: string; last_seen_at: string; expires_at: string; revoked_at: string | null; username: string; employee_id: string; must_change_password: number; active: number }>();
  if (!row) return { session: null, reason: "missing" };
  if (row.revoked_at) return { session: null, reason: "revoked" };
  const now = nowDate.getTime();
  if (Date.parse(row.expires_at) <= now || Date.parse(row.last_seen_at) + minutes(config.sessionIdleMinutes) <= now) {
    await db.prepare("UPDATE sessions SET revoked_at = ?, revoke_reason = 'expired' WHERE id_hash = ? AND revoked_at IS NULL").bind(nowDate.toISOString(), idHash).run();
    return { session: null, reason: "expired" };
  }
  if (!row.active || !(await employeeActive(row.employee_id))) return { session: null, reason: "inactive" };
  if (Date.parse(row.last_seen_at) + minutes(TOUCH_MINUTES) <= now) await db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?").bind(nowDate.toISOString(), idHash).run();
  return { session: { idHash, accountId: row.account_id, username: row.username, employeeId: row.employee_id, mustChangePassword: !!row.must_change_password, expiresAt: row.expires_at } };
}

export async function revokeSession(db: D1Database, idHash: string, reason: string, at = new Date().toISOString()) {
  await db.prepare("UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE id_hash = ? AND revoked_at IS NULL").bind(at, reason, idHash).run();
}
/** Revokes every session of an account, optionally keeping one (the session that changed its own password). */
export async function revokeAccountSessions(db: D1Database, accountId: string, reason: string, keepIdHash?: string, at = new Date().toISOString()) {
  await db.prepare("UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE account_id = ? AND revoked_at IS NULL AND id_hash <> ?").bind(at, reason, accountId, keepIdHash || "").run();
}

/** Changes the signed-in employee's own password after verifying the current one; all other sessions are revoked. */
export async function changeOwnPassword(db: D1Database, session: Session, input: { currentPassword?: unknown; newPassword?: unknown }, at = new Date().toISOString()) {
  const account = await db.prepare("SELECT * FROM accounts WHERE id = ?").bind(session.accountId).first<AccountRow>();
  if (!account || !account.active) throw fail(401, "Your session has ended. Sign in again.");
  if (typeof input.currentPassword !== "string" || !(await verifyPassword(input.currentPassword, account.password_hash))) {
    await audit(db, { accountId: account.id, employeeId: account.employee_id, action: "auth.password_change_failed" }, at);
    throw fail(400, "The current password is not correct.");
  }
  const problem = passwordProblem(input.newPassword, account.username);
  if (problem) throw fail(400, problem);
  if (await verifyPassword(input.newPassword as string, account.password_hash)) throw fail(400, "Choose a password different from the current one.");
  await db.prepare("UPDATE accounts SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(input.newPassword as string), at, at, account.id).run();
  await revokeAccountSessions(db, account.id, "password_changed", session.idHash, at);
  await audit(db, { accountId: account.id, employeeId: account.employee_id, action: "auth.password_changed" }, at);
}

/* ---------- Administrator account management ---------- */

export type AccountSummary = { id: string; username: string; employeeId: string; active: boolean; mustChangePassword: boolean; passwordChangedAt: string | null; createdAt: string; activeSessions: number };
export async function listAccounts(db: D1Database, now = new Date().toISOString()): Promise<AccountSummary[]> {
  const { results } = await db.prepare(`SELECT a.id, a.username, a.employee_id, a.active, a.must_change_password, a.password_changed_at, a.created_at,
    (SELECT COUNT(*) FROM sessions s WHERE s.account_id = a.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS active_sessions FROM accounts a ORDER BY a.username`).bind(now).all<{ id: string; username: string; employee_id: string; active: number; must_change_password: number; password_changed_at: string | null; created_at: string; active_sessions: number }>();
  return results.map((r) => ({ id: r.id, username: r.username, employeeId: r.employee_id, active: !!r.active, mustChangePassword: !!r.must_change_password, passwordChangedAt: r.password_changed_at, createdAt: r.created_at, activeSessions: r.active_sessions }));
}

type Admin = { accountId: string; employeeId: string };
/** Creates an account for an existing employee record and returns a one-time temporary password. */
export async function createAccount(db: D1Database, admin: Admin, input: { username?: unknown; employeeId?: unknown }, employeeExists: (id: string) => boolean, at = new Date().toISOString()) {
  const username = normalizeUsername(input.username), employeeId = typeof input.employeeId === "string" ? input.employeeId : "";
  if (!validUsername(username)) throw fail(400, "Usernames are 3–40 characters: letters, digits, dot, hyphen or underscore.");
  if (!employeeExists(employeeId)) throw fail(400, "Choose an active employee from the directory.");
  if (await db.prepare("SELECT id FROM accounts WHERE username = ?").bind(username).first()) throw fail(409, "That username is already in use.");
  if (await db.prepare("SELECT id FROM accounts WHERE employee_id = ?").bind(employeeId).first()) throw fail(409, "This employee already has an account. Reset its password instead.");
  const id = crypto.randomUUID(), temporary = temporaryPassword();
  await db.prepare("INSERT INTO accounts (id, username, employee_id, password_hash, must_change_password, active, created_at, created_by, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)")
    .bind(id, username, employeeId, await hashPassword(temporary), at, admin.accountId, at).run();
  await audit(db, { ...admin, action: "account.created", target: id, detail: { username, employeeId } }, at);
  return { id, username, employeeId, temporaryPassword: temporary };
}

/** Issues a new temporary password: the account must change it at next sign-in and every session is revoked. */
export async function resetAccountPassword(db: D1Database, admin: Admin, accountId: string, at = new Date().toISOString()) {
  const account = await db.prepare("SELECT id, username FROM accounts WHERE id = ?").bind(accountId).first<{ id: string; username: string }>();
  if (!account) throw fail(404, "Account not found.");
  const temporary = temporaryPassword();
  await db.prepare("UPDATE accounts SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").bind(await hashPassword(temporary), at, accountId).run();
  await db.prepare("DELETE FROM auth_throttle WHERE key = ?").bind("user:" + account.username).run();
  await revokeAccountSessions(db, accountId, "password_reset", undefined, at);
  await audit(db, { ...admin, action: "account.password_reset", target: accountId }, at);
  return { id: accountId, username: account.username, temporaryPassword: temporary };
}

export async function setAccountActive(db: D1Database, admin: Admin, accountId: string, active: boolean, at = new Date().toISOString()) {
  if (accountId === admin.accountId && !active) throw fail(400, "You cannot deactivate your own account.");
  const result = await db.prepare("UPDATE accounts SET active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, at, accountId).run();
  if (!result.meta.changes) throw fail(404, "Account not found.");
  if (!active) await revokeAccountSessions(db, accountId, "deactivated", undefined, at);
  await audit(db, { ...admin, action: active ? "account.reactivated" : "account.deactivated", target: accountId }, at);
}

export async function revokeSessionsByAdmin(db: D1Database, admin: Admin, accountId: string, at = new Date().toISOString()) {
  await revokeAccountSessions(db, accountId, "revoked_by_administrator", undefined, at);
  await audit(db, { ...admin, action: "account.sessions_revoked", target: accountId }, at);
}
