/**
 * Employee sign-in: accounts, server sessions, failed-attempt throttling and password changes (Cloudflare D1).
 * The acting employee is always taken from the session row, never from the request body, URL or browser storage.
 */
import { burnPasswordCheck, hashPassword, needsRehash, passwordProblem, randomToken, sha256Hex, temporaryPassword, verifyPassword } from "./passwords";
import { fail, readCookie, cookieName, type AuthConfig } from "./http";

export type AccountRow = { id: string; username: string; email: string | null; employee_id: string; password_hash: string; must_change_password: number; active: number; activated_at: string | null; password_changed_at: string | null; created_at: string; updated_at: string };
export type Session = { idHash: string; accountId: string; username: string; employeeId: string; mustChangePassword: boolean; expiresAt: string };

/** One message for every failed sign-in: it never reveals whether the username exists, is inactive or is locked. */
export const SIGN_IN_FAILED = "Sign-in failed. Check your work email or employee ID and your password and try again. After several failed attempts, sign-in is paused for 15 minutes.";

const USER_LIMIT = 5, ADDRESS_LIMIT = 30, WINDOW_MINUTES = 15, LOCK_MINUTES = 15;
const TOUCH_MINUTES = 5;
const minutes = (n: number) => n * 60_000;

export const normalizeUsername = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
export const validUsername = (u: string) => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u);
/** Emails are compared and stored trimmed and lower-case, so capitalisation never creates a second address. */
export const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
/**
 * The account for a sign-in name: a work email (contains "@"), an employee ID (any capitalisation), or the username
 * of an account created before invitations. The employee ID is checked first, so it always means that employee.
 */
async function findAccount(db: D1Database, identifier: string) {
  if (identifier.includes("@")) return db.prepare("SELECT * FROM accounts WHERE email = ?").bind(identifier).first<AccountRow>();
  return (await db.prepare("SELECT * FROM accounts WHERE lower(employee_id) = ?").bind(identifier).first<AccountRow>())
    ?? db.prepare("SELECT * FROM accounts WHERE username = ?").bind(identifier).first<AccountRow>();
}

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
  // The sign-in name is a username or the account's email (either form, any capitalisation).
  const username = normalizeUsername(input.username);
  const password = typeof input.password === "string" ? input.password : "";
  if (!username || username.length > 254 || !password || password.length > 256) { await burnPasswordCheck(password || "x"); throw fail(401, SIGN_IN_FAILED); }
  const account = await findAccount(db, username);
  // Failed attempts count per account, so the username and the email share one limit; unknown names count by name.
  const userKey = account ? "account:" + account.id : "user:" + username, addressKey = "addr:" + input.address;
  const [user, address] = await Promise.all([throttleState(db, userKey, now), throttleState(db, addressKey, now)]);
  if (user.locked || address.locked) { await burnPasswordCheck(password); await audit(db, { accountId: account?.id, employeeId: account?.employee_id, action: "auth.sign_in_blocked", target: username }, at); throw fail(429, SIGN_IN_FAILED); }
  const ok = account ? await verifyPassword(password, account.password_hash) : (await burnPasswordCheck(password), false);
  if (!account || !ok || !account.active || !(await employeeActive(account.employee_id))) {
    await recordFailure(db, userKey, USER_LIMIT, now); await recordFailure(db, addressKey, ADDRESS_LIMIT, now);
    await audit(db, { accountId: account?.id, employeeId: account?.employee_id, action: "auth.sign_in_failed", target: username, detail: { reason: !account ? "unknown" : !ok ? "password" : "inactive" } }, at);
    throw fail(401, SIGN_IN_FAILED);
  }
  await db.prepare("DELETE FROM auth_throttle WHERE key = ?").bind(userKey).run();
  if (needsRehash(account.password_hash)) await db.prepare("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(password), at, account.id).run();
  const signedIn = await startSession(db, config, account, nowDate);
  await audit(db, { accountId: account.id, employeeId: account.employee_id, action: "auth.sign_in", detail: { with: username.includes("@") ? "email" : account.employee_id.toLowerCase() === username ? "employee ID" : "username" } }, at);
  return signedIn;
}

/** A new server session for an account (sign-in, or the end of an invitation). Records the last sign-in time. */
async function startSession(db: D1Database, config: AuthConfig, account: AccountRow, nowDate: Date) {
  const at = nowDate.toISOString(), token = randomToken(), idHash = await sha256Hex(token);
  const expiresAt = new Date(nowDate.getTime() + config.sessionMaxHours * 3_600_000).toISOString();
  await db.batch([
    db.prepare("INSERT INTO sessions (id_hash, account_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(idHash, account.id, at, at, expiresAt),
    db.prepare("UPDATE accounts SET last_sign_in_at = ? WHERE id = ?").bind(at, account.id),
  ]);
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

export type AccountSummary = { id: string; username: string; email: string | null; employeeId: string; active: boolean; mustChangePassword: boolean; passwordChangedAt: string | null; createdAt: string; activeSessions: number;
  /** Null while the employee has not yet set a password from an invitation. */activatedAt: string | null; lastSignInAt: string | null; invitedAt: string | null; /** Expiry of the current unused invitation link, if any. */invitationExpiresAt: string | null };
export async function listAccounts(db: D1Database, now = new Date().toISOString()): Promise<AccountSummary[]> {
  const { results } = await db.prepare(`SELECT a.id, a.username, a.email, a.employee_id, a.active, a.must_change_password, a.password_changed_at, a.created_at, a.activated_at, a.last_sign_in_at, a.invited_at,
    (SELECT COUNT(*) FROM sessions s WHERE s.account_id = a.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS active_sessions,
    (SELECT MAX(i.expires_at) FROM invitations i WHERE i.account_id = a.id AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?) AS invitation_expires_at
    FROM accounts a ORDER BY a.username`).bind(now, now).all<{ id: string; username: string; email: string | null; employee_id: string; active: number; must_change_password: number; password_changed_at: string | null; created_at: string; activated_at: string | null; last_sign_in_at: string | null; invited_at: string | null; active_sessions: number; invitation_expires_at: string | null }>();
  return results.map((r) => ({ id: r.id, username: r.username, email: r.email, employeeId: r.employee_id, active: !!r.active, mustChangePassword: !!r.must_change_password, passwordChangedAt: r.password_changed_at, createdAt: r.created_at, activeSessions: r.active_sessions, activatedAt: r.activated_at, lastSignInAt: r.last_sign_in_at, invitedAt: r.invited_at, invitationExpiresAt: r.invitation_expires_at }));
}

type Admin = { accountId: string; employeeId: string };
/** Creates an account for an existing employee record and returns a one-time temporary password. */
export async function createAccount(db: D1Database, admin: Admin, input: { username?: unknown; employeeId?: unknown; email?: unknown }, employeeExists: (id: string) => boolean, at = new Date().toISOString()) {
  const username = normalizeUsername(input.username), employeeId = typeof input.employeeId === "string" ? input.employeeId : "";
  const email = emailInput(input.email);
  if (!validUsername(username)) throw fail(400, "Usernames are 3–40 characters: letters, digits, dot, hyphen or underscore.");
  if (!employeeExists(employeeId)) throw fail(400, "Choose an active employee from the directory.");
  if (await db.prepare("SELECT id FROM accounts WHERE username = ?").bind(username).first()) throw fail(409, "That username is already in use.");
  if (await db.prepare("SELECT id FROM accounts WHERE employee_id = ?").bind(employeeId).first()) throw fail(409, "This employee already has an account. Reset its password instead.");
  const id = crypto.randomUUID(), temporary = temporaryPassword();
  try {
    await db.prepare("INSERT INTO accounts (id, username, email, employee_id, password_hash, must_change_password, active, created_at, created_by, updated_at, activated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)")
      .bind(id, username, email, employeeId, await hashPassword(temporary), at, admin.accountId, at, at).run();
  } catch (error) { throw uniqueFailure(error); }
  await audit(db, { ...admin, action: "account.created", target: id, detail: { username, employeeId, email } }, at);
  return { id, username, email, employeeId, temporaryPassword: temporary };
}

/** An email from the request: "" or missing clears it; anything else must be a valid address. */
function emailInput(value: unknown): string | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  const email = normalizeEmail(value);
  if (!validEmail(email)) throw fail(400, "Enter a valid email address, or leave it empty.");
  return email;
}
/** The database refuses a second account with the same username, employee or email (unique indexes): report which. */
function uniqueFailure(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  if (/UNIQUE/i.test(text) && /email/i.test(text)) return fail(409, "That email address is already used by another account.");
  if (/UNIQUE/i.test(text)) return fail(409, "That username or employee already has an account.");
  return error;
}

/** Adds, changes or removes an account's sign-in email. The username keeps working either way. */
export async function setAccountEmail(db: D1Database, admin: Admin, accountId: string, value: unknown, at = new Date().toISOString()) {
  const email = emailInput(value);
  const before = await db.prepare("SELECT email FROM accounts WHERE id = ?").bind(accountId).first<{ email: string | null }>();
  if (!before) throw fail(404, "Account not found.");
  if (before.email === email) return { id: accountId, email };
  try { await db.prepare("UPDATE accounts SET email = ?, updated_at = ? WHERE id = ?").bind(email, at, accountId).run(); }
  catch (error) { throw uniqueFailure(error); }
  await audit(db, { ...admin, action: "account.email_changed", target: accountId, detail: { before: before.email, after: email } }, at);
  return { id: accountId, email };
}

/** Issues a new temporary password: the account must change it at next sign-in and every session is revoked. */
export async function resetAccountPassword(db: D1Database, admin: Admin, accountId: string, at = new Date().toISOString()) {
  const account = await db.prepare("SELECT id, username, activated_at FROM accounts WHERE id = ?").bind(accountId).first<{ id: string; username: string; activated_at: string | null }>();
  if (!account) throw fail(404, "Account not found.");
  if (!account.activated_at) throw fail(409, "This employee has not activated the account yet. Send the invitation again instead.");
  const temporary = temporaryPassword();
  await db.prepare("UPDATE accounts SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").bind(await hashPassword(temporary), at, accountId).run();
  await db.prepare("DELETE FROM auth_throttle WHERE key IN (?, ?)").bind("account:" + account.id, "user:" + account.username).run();
  await revokeAccountSessions(db, accountId, "password_reset", undefined, at);
  await audit(db, { ...admin, action: "account.password_reset", target: accountId }, at);
  return { id: accountId, username: account.username, temporaryPassword: temporary };
}

export async function setAccountActive(db: D1Database, admin: Admin, accountId: string, active: boolean, at = new Date().toISOString()) {
  if (accountId === admin.accountId && !active) throw fail(400, "You cannot deactivate your own account.");
  // An invited account becomes active only when the employee sets a password; it cannot be switched on here.
  const result = await db.prepare("UPDATE accounts SET active = ?, updated_at = ? WHERE id = ? AND (? = 0 OR activated_at IS NOT NULL)").bind(active ? 1 : 0, at, accountId, active ? 1 : 0).run();
  if (!result.meta.changes) throw fail(active ? 409 : 404, active ? "This employee has not activated the account yet. Send the invitation again instead." : "Account not found.");
  if (!active) { await revokeAccountSessions(db, accountId, "deactivated", undefined, at); await revokeInvitations(db, accountId, at); }
  await audit(db, { ...admin, action: active ? "account.reactivated" : "account.deactivated", target: accountId }, at);
}

export async function revokeSessionsByAdmin(db: D1Database, admin: Admin, accountId: string, at = new Date().toISOString()) {
  await revokeAccountSessions(db, accountId, "revoked_by_administrator", undefined, at);
  await audit(db, { ...admin, action: "account.sessions_revoked", target: accountId }, at);
}

/* ---------- Invitations ---------- */

export const INVITATION_INVALID = "This invitation link is not valid any more: it was already used, it expired, or a newer invitation was sent. Ask your administrator to send a new invitation.";
const revokeInvitations = (db: D1Database, accountId: string, at: string) => db.prepare("UPDATE invitations SET revoked_at = ? WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL").bind(at, accountId).run();

export type InvitationInput = { employeeId: string; employeeName: string; email: unknown };
/**
 * Prepares an invitation for an existing employee record: creates the account if needed (sign-in ID = the fixed
 * employee ID, not yet active), saves the work email, replaces any earlier link and returns the new one-time token.
 * The caller sends the email and calls `cancelInvitation` if sending fails.
 */
export async function createInvitation(db: D1Database, admin: Admin, input: InvitationInput, ttlHours: number, now = new Date()) {
  const at = now.toISOString();
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) throw fail(400, "Enter the employee's work email address.");
  let account = await db.prepare("SELECT * FROM accounts WHERE employee_id = ?").bind(input.employeeId).first<AccountRow>();
  if (account?.activated_at && account.active) throw fail(409, "This employee has already activated the account. Use Reset password if they cannot sign in.");
  if (account?.activated_at && !account.active) throw fail(409, "This account is deactivated. Reactivate it instead of sending an invitation.");
  try {
    if (!account) {
      const username = input.employeeId.toLowerCase();
      if (!validUsername(username)) throw fail(400, "This employee ID cannot be used to sign in. Edit the employee record first.");
      const id = crypto.randomUUID();
      // "!invited" is not a valid password hash: nothing can sign in to this account until the invitation is completed.
      await db.prepare("INSERT INTO accounts (id, username, email, employee_id, password_hash, must_change_password, active, created_at, created_by, updated_at) VALUES (?, ?, ?, ?, '!invited', 0, 0, ?, ?, ?)").bind(id, username, email, input.employeeId, at, admin.accountId, at).run();
      account = await db.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<AccountRow>();
    } else if (account.email !== email) {
      await db.prepare("UPDATE accounts SET email = ?, updated_at = ? WHERE id = ?").bind(email, at, account.id).run();
    }
  } catch (error) { throw uniqueFailure(error); }
  const token = randomToken(), expiresAt = new Date(now.getTime() + ttlHours * 3_600_000).toISOString();
  await db.batch([
    db.prepare("UPDATE invitations SET revoked_at = ? WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL").bind(at, account!.id),
    db.prepare("INSERT INTO invitations (token_hash, account_id, email, created_at, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(await sha256Hex(token), account!.id, email, at, admin.employeeId, expiresAt),
    db.prepare("UPDATE accounts SET invited_at = ?, updated_at = ? WHERE id = ?").bind(at, at, account!.id),
  ]);
  return { accountId: account!.id, employeeId: input.employeeId, email, token, expiresAt };
}
/** Withdraws a link whose email could not be sent. */
export async function cancelInvitation(db: D1Database, token: string, at = new Date().toISOString()) {
  await db.prepare("UPDATE invitations SET revoked_at = ? WHERE token_hash = ? AND used_at IS NULL").bind(at, await sha256Hex(token)).run();
}

type OpenInvitation = { token_hash: string; account_id: string; email: string; expires_at: string; employee_id: string; username: string; active: number; activated_at: string | null };
async function openInvitation(db: D1Database, token: unknown, now: string): Promise<OpenInvitation | null> {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare(`SELECT i.token_hash, i.account_id, i.email, i.expires_at, a.employee_id, a.username, a.active, a.activated_at FROM invitations i JOIN accounts a ON a.id = i.account_id
    WHERE i.token_hash = ? AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`).bind(await sha256Hex(token), now).first<OpenInvitation>();
}

/** What the "set your password" page shows. Any unusable link gets the same answer. */
export async function checkInvitation(db: D1Database, token: unknown, employeeActive: EmployeeCheck, now = new Date().toISOString()) {
  const invitation = await openInvitation(db, token, now);
  if (!invitation || invitation.activated_at || !(await employeeActive(invitation.employee_id))) throw fail(410, INVITATION_INVALID);
  return { employeeId: invitation.employee_id, email: invitation.email, expiresAt: invitation.expires_at };
}

/** The employee sets their password from the link: the link is used up, the account becomes active and is signed in. */
export async function acceptInvitation(db: D1Database, config: AuthConfig, input: { token: unknown; password: unknown }, employeeActive: EmployeeCheck, nowDate = new Date()) {
  const at = nowDate.toISOString();
  const invitation = await openInvitation(db, input.token, at);
  if (!invitation || invitation.activated_at || !(await employeeActive(invitation.employee_id))) throw fail(410, INVITATION_INVALID);
  const problem = passwordProblem(input.password, invitation.employee_id);
  if (problem) throw fail(400, problem);
  const hash = await hashPassword(input.password as string);
  // Marking the link used and activating the account happen together, and only once even if the form is sent twice.
  const [used] = await db.batch([
    db.prepare("UPDATE invitations SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?").bind(at, invitation.token_hash, at),
    db.prepare("UPDATE accounts SET password_hash = ?, must_change_password = 0, active = 1, activated_at = ?, password_changed_at = ?, email = ?, updated_at = ? WHERE id = ? AND activated_at IS NULL AND changes() = 1").bind(hash, at, at, invitation.email, at, invitation.account_id),
  ]);
  if (used.meta.changes !== 1) throw fail(410, INVITATION_INVALID);
  await revokeInvitations(db, invitation.account_id, at);
  await audit(db, { accountId: invitation.account_id, employeeId: invitation.employee_id, action: "account.activated", target: invitation.account_id }, at);
  const account = await db.prepare("SELECT * FROM accounts WHERE id = ?").bind(invitation.account_id).first<AccountRow>();
  return startSession(db, config, account!, nowDate);
}

/* ---------- One-time Administrator setup ---------- */

/**
 * First sign-in account on a hosting platform without direct database access (e.g. Sites): the person holding the
 * server secret ADMIN_SETUP_TOKEN creates the Administrator account (MA001 only) and chooses its password in the
 * browser. It works only while no MA001 account exists; the insert itself refuses a second account, so two
 * simultaneous requests cannot both succeed. Without the secret (or with one shorter than 32 characters) setup is off.
 */
export const SETUP_MIN_SECRET = 32;
export const SETUP_UNAVAILABLE = "Administrator setup is not available on this server.";
export const SETUP_DONE = "Administrator setup has already been completed. Sign in instead.";
const SETUP_LIMIT = 5;
/**
 * The setup secret as the running Worker sees it. Read from the Worker bindings, falling back to process.env
 * (nodejs_compat), and trimmed, so a pasted trailing newline or space does not break the comparison.
 */
const rawSetupSecret = (env: Record<string, unknown>) => {
  const v = env.ADMIN_SETUP_TOKEN ?? (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env?.ADMIN_SETUP_TOKEN;
  return typeof v === "string" ? v.trim() : "";
};
/** "missing" / "too_short" / "ok". Never the value or its length: safe to show on the setup page and in diagnostics. */
export const setupSecretState = (env: Record<string, unknown>): "missing" | "too_short" | "ok" => {
  const s = rawSetupSecret(env);
  return !s ? "missing" : s.length < SETUP_MIN_SECRET ? "too_short" : "ok";
};
export const setupSecret = (env: Record<string, unknown>) => { const s = rawSetupSecret(env); return s.length >= SETUP_MIN_SECRET ? s : null; };
export const setupUnavailableMessage = (state: "missing" | "too_short") => state === "missing"
  ? SETUP_UNAVAILABLE + " The running deployment does not receive ADMIN_SETUP_TOKEN: check the secret's exact name on this site, then redeploy the saved version so the new deployment picks it up."
  : SETUP_UNAVAILABLE + ` The running deployment receives ADMIN_SETUP_TOKEN, but it is shorter than ${SETUP_MIN_SECRET} characters. Save a longer random value and redeploy.`;
export const setupOpen = async (db: D1Database, administratorId: string) => !(await db.prepare("SELECT id FROM accounts WHERE employee_id = ?").bind(administratorId).first());

export async function completeAdministratorSetup(db: D1Database, config: AuthConfig, input: { secret: string; token: unknown; password: unknown; address: string; administratorId: string }, employeeActive: EmployeeCheck, nowDate = new Date()) {
  const now = nowDate.getTime(), at = nowDate.toISOString(), key = "setup:" + input.address;
  if ((await throttleState(db, key, now)).locked) throw fail(429, "Too many attempts. Wait 15 minutes and try again.");
  // Compare fingerprints of equal length in constant time.
  const given = typeof input.token === "string" ? input.token.trim() : "";
  const ok = timingSafeEqualHex(await sha256Hex(given), await sha256Hex(input.secret));
  if (!ok) { await recordFailure(db, key, SETUP_LIMIT, now); await audit(db, { action: "account.setup_refused", detail: { reason: "secret" } }, at); throw fail(403, "The setup secret is not correct."); }
  if (!(await setupOpen(db, input.administratorId))) throw fail(409, SETUP_DONE);
  if (!(await employeeActive(input.administratorId))) throw fail(409, "The Administrator's employee record is not active. Nothing was created.");
  const username = input.administratorId.toLowerCase();
  const problem = passwordProblem(input.password, username);
  if (problem) throw fail(400, problem);
  const id = crypto.randomUUID(), hash = await hashPassword(input.password as string);
  // One statement: the row is written only if no Administrator account exists at that moment.
  const created = await db.prepare(`INSERT INTO accounts (id, username, employee_id, password_hash, must_change_password, active, created_at, created_by, updated_at, activated_at, password_changed_at)
    SELECT ?, ?, ?, ?, 0, 1, ?, 'administrator-setup', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE employee_id = ? OR username = ?)`)
    .bind(id, username, input.administratorId, hash, at, at, at, at, input.administratorId, username).run().catch(() => ({ meta: { changes: 0 } }));
  if (created.meta.changes !== 1) throw fail(409, SETUP_DONE);
  await db.prepare("DELETE FROM auth_throttle WHERE key = ?").bind(key).run();
  await audit(db, { accountId: id, employeeId: input.administratorId, action: "account.setup", target: id, detail: { via: "administrator setup" } }, at);
  const account = await db.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<AccountRow>();
  return startSession(db, config, account!, nowDate);
}
const timingSafeEqualHex = (a: string, b: string) => { let diff = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return diff === 0; };
