# Employee sign-in and server-side permissions (Sites edition)

Status: **implemented for review, not deployed.** The GitHub Pages edition stays a browser-only demo with no real accounts.

## What changed

| Area | Before | Now (Sites edition) |
|---|---|---|
| Sign-in | Employee ID + shared demo password checked in the browser | Individual username + password checked on the server (`/api/auth/login`) |
| Identity | Browser `sessionStorage`; "Demo: view as employee" selector | HttpOnly server session; the acting employee is always the session's employee. Selector removed in both editions |
| Records | One browser (`localStorage` / IndexedDB) | Shared D1 database (jobs, settings, request book, activity) and R2 bucket (files) |
| Permissions | Checked in the browser only | Re-checked on the server for every read and change, with the same workflow rules |

### Accounts and employees
- `accounts` links one login to one existing employee record by its **internal employee ID** (e.g. `SALIM`). The username, the employee's name and the employee code are independent; renaming an employee never changes the login.
- No public registration and no automatic or demo accounts. The first administrator is created with `scripts/create-account.mjs`; everyone else is created in **Settings → Sign-in accounts** (requires *Manage authorization*).
- Accounts never grant permissions. Permissions and duties stay in Settings → Authorization, as before.
- Employee records can be deactivated but not removed (IDs are permanent). Deactivating the employee or the account blocks sign-in and ends existing sessions.

### Passwords
- Stored only as PBKDF2-HMAC-SHA-256 hashes (random 16-byte salt, 100,000 iterations — the Cloudflare Workers maximum) via the platform Web Crypto API. The algorithm and work factor are stored with each hash; hashes are upgraded at the next sign-in if the setting is raised.
- Minimum 12 characters. Administrators issue random temporary passwords (shown once); the employee must change it before anything else works.
- *My Profile → Sign-in & password* changes the own password after verifying the current one; all other sessions are revoked.

### Sessions
- 256-bit random token in a `__Host-vaps_session` cookie: `HttpOnly; Secure; SameSite=Strict; Path=/`. Only its SHA-256 hash is stored.
- Absolute expiry (default 12 h) and idle expiry (default 120 min). Revoked on sign-out, password change, password reset, account deactivation and *Sign out everywhere*.
- When a session ends, the next request returns the employee to the sign-in page with the reason.

### Attack protection
- **Guessing:** 5 failed attempts per username (or 30 per client address) in 15 minutes pause sign-in for 15 minutes. Unknown, wrong, inactive and paused all return the same message and similar timing.
- **Cross-site requests:** every state-changing request must carry the `X-VAPS-Request: 1` header and come from the site's own origin, in addition to the SameSite=Strict cookie.
- **Spoofing:** employee IDs in request bodies are ignored or rejected. Workflow state (`operations`) changes only through workflow commands run by the server; "done by" fields in a saved job must name the signed-in employee; the server stamps `lastUpdatedById`.

### Server-side permission checks
- **Reads** (`/api/workspace`): an employee receives only the jobs they may open (the existing `canOpenJob` rule: assignments, duties, company overview), Trash only with *Delete and restore jobs*, and activity history only for themselves unless they hold *Company overview*.
- **Workflow commands** (`/api/jobs/:id/operations`): the server runs the same `applyJobOperation` as the interface with the session's employee — sampling, scope release, laboratory planning and execution, team-lead review, QC and final approval keep their existing rules.
- **Job editor saves** (`/api/jobs/:id`): the server version of the editor's save rules (job details only by a coordinator, sampling records only by the assigned working engineer once the job has started, locked data stays locked, identity fields immutable).
- **Settings** (`/api/workspace/records/:key`): each record needs the permission the Settings page needs and is validated with the same readers.
- **Files** (`/api/files/:id`): released only to employees who may open a job that references the file; laboratory workbooks also need *View / Download workbook* (decided by the server, not the request).
- Every change is written to `audit_events` with the authenticated account and employee IDs.

## Deployment configuration (no secret values are needed)

| Item | Value | Notes |
|---|---|---|
| D1 binding | `DB` | Already declared in `.openai/hosting.json` |
| R2 binding | `FILES` | **New**: `.openai/hosting.json` now declares `"r2": "FILES"`. Without it uploads and downloads return "File storage is not configured" |
| Migration | `drizzle/0001_auth_and_shared_workspace.sql` | Additive only; `job_summaries` is untouched |
| `AUTH_SESSION_MAX_HOURS` | optional, default `12` (1–72) | Absolute session lifetime |
| `AUTH_SESSION_IDLE_MINUTES` | optional, default `120` (5–1440) | Idle timeout |
| `APP_ORIGIN` | optional | Comma-separated extra allowed origins if the site is served behind a different public hostname |

HTTPS is required in production (the `__Host-` cookie is Secure). There are no API keys or passwords to configure.

### Creating the first administrator
```bash
node scripts/create-account.mjs <username> MA001
```
The script prints a temporary password once (never written to disk) and writes the SQL (hash only) to a private temp file. Run it against the production database, then delete the file:
```bash
npx wrangler d1 execute <database-name> --remote --file <printed path>
```
The administrator signs in, chooses a password, and creates the other accounts in Settings → Sign-in accounts.

## Existing browser records
Nothing is imported automatically. Production starts with empty shared storage and the built-in defaults (seed employee IDs, default permissions and duties). Records currently held in individual browsers (jobs, settings, request book, workbooks in IndexedDB) need a **reviewed migration** before go-live — see blockers below.

## Verification (local)
- `tests/auth-server.test.mjs` (16 tests) runs the real API route handlers against a local D1 and R2 (Miniflare): sign-in success/failure, unknown vs wrong vs inactive, throttling, cross-site refusal, sign-out, absolute and idle expiry, administrator revocation, deactivated account and employee, password change and revocation of other sessions, forced first-login change, unauthenticated access to every internal API, spoofing attempts, settings/accounts/Trash permissions, QC and scope duties, sampling-record ownership, workbook release, send-to-sampling, no-op saves.
- Existing suite: 255 passing, 2 skipped (environment-dependent). The shared-summary API test was also run against a local server with a session.
- Browser check (Playwright, local dev server with local D1): sign-in, wrong password, forced password change, account creation, client added on one device visible on another, coordinator draft saved under his name, QC approval through the interface applied by the server, lab engineer's direct API attempt refused, revocation returning to sign-in, mobile layout without horizontal overflow.

## Remaining blockers before real employee access
1. **Hosting confirmation:** confirm the Sites platform provisions the R2 binding `FILES` and applies `drizzle/` migrations on deploy (the build packages them in `dist/.openai`), then run the bootstrap step. Not exercised against the real hosting here.
2. **Migration of existing browser records:** decide which browser holds the authoritative records, export them, review them, and import them with an administrator-run tool (not built in this change). Until then production starts empty. Workbook files stored in a browser's IndexedDB must be uploaded again.
3. **Password hashing strength:** PBKDF2 at 100,000 iterations is the Workers limit and below OWASP's current PBKDF2 guidance (600,000). It is acceptable with the 12-character minimum and throttling; a memory-hard hash (Argon2id/scrypt) would need a paid CPU allowance or an external auth service.
4. **Client sharing** remains switched off (`clientSharingEnabled = false`); external links still need client-side identity and per-job allow-lists.
5. **Housekeeping:** expired session and throttle rows are not purged automatically (small volumes; a scheduled cleanup can be added).
6. **Account lifecycle:** there is no self-service password reset (by design: an administrator issues a temporary password). Microsoft 365 sign-in and email notifications are deferred.
