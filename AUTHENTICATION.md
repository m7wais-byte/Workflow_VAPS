# Employee sign-in and server-side permissions (Sites edition)

Status: **implemented for review, not deployed.** The GitHub Pages edition stays a browser-only demo with no real accounts.

This branch (`claude/integration-auth-data-layer`) combines the employee sign-in work with the production review, the D1 data layer and the browser export/import tools. The data layer's tables are canonical: `settings`, `jobs`, `requests`, `audit_log`, `browser_archive` (migrations 0001–0002). Sign-in adds migration **0003** (`accounts`, `sessions`, `auth_throttle`, `activity_log`, `files`, and a nullable `audit_log.account_id`), purely additive.

## What changed

| Area | Before | Now (Sites edition) |
|---|---|---|
| Sign-in | Employee ID + shared demo password checked in the browser | Individual username + password checked on the server (`/api/auth/login`) |
| Identity | Browser `sessionStorage`; "Demo: view as employee" selector | HttpOnly server session; the acting employee is always the session's employee. Selector removed in both editions |
| Records | One browser (`localStorage` / IndexedDB) | Shared D1 tables `settings`, `jobs`, `requests`, `activity_log` and R2 bucket `FILES` (metadata in `files`) |
| Permissions | Checked in the browser only | Re-checked on the server for every read and change, with the same workflow rules |

### Accounts and employees
- `accounts` links one login to one existing employee record by its **internal employee ID** (e.g. `SALIM`). The username, the employee's name and the employee code are independent; renaming an employee never changes the login.
- No public registration and no automatic or demo accounts. The first administrator is created with `scripts/create-account.mjs`; everyone else is created in **Settings → Sign-in accounts** (requires *Manage authorization*).
- Accounts never grant permissions. Permissions and duties stay in Settings → Authorization, as before.
- Employee records can be deactivated but not removed (IDs are permanent). Deactivating the employee or the account blocks sign-in and ends existing sessions.

### Sign-in email (migration 0004)
- Settings → Sign-in accounts lets holders of *Manage authorization* add, change or remove an account's **sign-in email** (also when creating the account). This is the login email on the account, separate from the contact email in the employee directory.
- Employees sign in with their **username or their email**, and the same password. Accounts without an email keep using the username only.
- Emails are stored trimmed and lower-case with a unique index, so the same address cannot be given to two accounts in any capitalisation (also under concurrent requests). Usernames cannot contain "@", so the two never collide.
- Failed attempts count per account, so trying the username and the email does not double the allowed guesses. Every change is audited (`account.email_changed`, before and after).

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
- Every change is written to `audit_log` (`actor_id` = employee, `account_id` = signed-in account). Settings saves record the value before and after; job writes and their audit entry are one transaction.

## Invitation-only onboarding (migration 0005)
- **One dashboard URL** for everyone (the site root). There is no public registration: an account exists only because the Administrator invited that employee.
- **Settings → Sign-in accounts** (Administrator, MA001): for each employee in the directory, enter the **work email** (pre-filled from the employee record when it has one), choose the **access level** and press **Send invitation**.
- The email contains a **one-time link** (`<dashboard>/#invite=<token>`) that expires after 72 hours (`INVITE_TTL_HOURS`). Only a SHA-256 hash of the token is stored, the token is in the URL fragment (never sent to the server in a request line or Referer), and it is never logged or audited. Resending replaces the old link; deactivating the pending account cancels it.
- The account stays **inactive until the employee sets their own password** from the link. Then they are signed in, and afterwards sign in with their **work email or employee ID** (any capitalisation) and that password.
- **Employee IDs:** existing employees keep their fixed IDs (SALIM, MA001, …). A new employee added in Settings → Employees gets the next free fixed ID (`VAPS-001`, `VAPS-002`, …), shown read-only and never changed; IDs that differ only by capitalisation are refused. The free-text field formerly labelled "Employee ID" is now "Staff code".
- The status column shows Not invited / Invitation sent (with expiry) / Invitation expired / Active (with **last sign-in**) / Deactivated. Every invitation, activation and role change is audited.
- **Mohammed (MA001) remains the Administrator.** The transfer to Zaid is not part of this change.

## Access roles
| Role | Who | Access |
|---|---|---|
| Administrator | MA001 (fixed) | As before: all pages; invitations and access roles; job creation, deletion and workbooks only when granted |
| Super User | Salim Al Maqbali, Ahmed Al Shereiqi, Wilfred Mendonca, Al Yaqdhan Al Bahri (initial list) | The extra permissions configured for them in Settings → Authorization (company overview, job creation, settings, workbooks …) |
| Normal User | Everyone else | Job details, sampling, PVT analysis, inventory, request book only. A job opens only if it is **directly assigned** to them (sampling engineer or team, driver, laboratory test owner, coordinator who created or dispatched it) or it **now requires a workflow action assigned to them** (e.g. a workbook awaiting their QC review). Other permissions have no effect, even if ticked |

- Only the Administrator changes access levels (the server refuses anyone else, including *Manage authorization* holders); Authorization shows each employee's level and disables Super-User-only permissions for Normal Users.
- **Workflow duties and approval rules are unchanged**: scope selection, team-lead review, QC, final approval, client approval and the rest still follow Settings → Authorization → duties. A role never grants a duty or an approval. All current duty holders are Super Users.
- A Normal User with a duty (e.g. QC reviewer) opens a job while it waits for their action, and not after: once the QC review is done and nothing else is assigned to them, the job closes for them again. The same rule applies to the job list, direct links, workflow actions and file downloads, all checked on the server.
- With the default permission settings, nobody's access changes: the elevated permissions were already held only by the four Super Users and MA001.

## Email for invitations (needed before launch)
Invitations are the only email the app sends. Nothing is sent until this is configured, and invitations are refused with "Email is not configured" in the meantime.

| Setting | Value | Notes |
|---|---|---|
| `MAIL_PROVIDER` | `resend` | Resend's HTTP API, callable from Cloudflare Workers. (`test` = no email, link shown on screen: local development only, never on a deployed site) |
| `MAIL_FROM` | e.g. `VAPS Workspace <no-reply@<your-domain>>` | Must be on a domain verified with the provider |
| `RESEND_API_KEY` | **secret** | Stored as a Worker secret, never in the repository |
| `APP_ORIGIN` | the dashboard URL, e.g. `https://<dashboard host>` | **Required** for invitations: links are built from it, never from a request's Host header |
| `MAIL_REPLY_TO` | optional, e.g. the administrator's mailbox | Replies to invitations |
| `INVITE_TTL_HOURS` | optional, default `72` (1–336) | Link lifetime |

DNS on the sending domain (from the provider's dashboard): SPF and DKIM records, plus a DMARC policy. Check with the VAPS IT/Microsoft 365 administrator before adding them, so they do not conflict with the existing mail setup; a subdomain (e.g. `mail.<domain>`) avoids touching the main domain's records. Send one invitation to a test mailbox first and check it is not marked as spam. Microsoft 365 / Graph sending remains deferred.

## Deployment configuration (no secret values are needed)

| Item | Value | Notes |
|---|---|---|
| D1 binding | `DB` | Already declared in `.openai/hosting.json` |
| R2 binding | `FILES` | **New**: `.openai/hosting.json` now declares `"r2": "FILES"`. Without it uploads and downloads return "File storage is not configured" |
| Migrations | `drizzle/0001`–`0005` | 0003–0004 add only; 0005 adds invitations and marks accounts that already have a password as activated. Verified fresh and as upgrades |
| `AUTH_SESSION_MAX_HOURS` | optional, default `12` (1–72) | Absolute session lifetime |
| `AUTH_SESSION_IDLE_MINUTES` | optional, default `120` (5–1440) | Idle timeout |
| `ADMIN_SETUP_TOKEN` | secret, only for the one-time setup | Remove after the Administrator account exists |
| `APP_ORIGIN` | **required for invitations** | The dashboard URL (first value); further comma-separated values are extra allowed origins |

HTTPS is required in production (the `__Host-` cookie is Secure). The only secret is the mail provider's API key (see Email for invitations).

### Creating the Administrator on Sites (one-time setup)
Sites gives no direct database access, so the Administrator account is created in the browser:
1. In the Sites panel, add the secret **`ADMIN_SETUP_TOKEN`**: a random value of at least 32 characters, e.g. from `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Keep it private.
2. Open `<site address>/#setup`, enter the secret, and choose your password. This creates **MA001 only** (any other ID in the request is ignored), activates it and signs you in.
3. Setup then closes for good: once an MA001 account exists, every further attempt is refused, even with the secret still set. Simultaneous attempts cannot create a second account (the database insert itself is conditional). Five wrong secrets pause setup for 15 minutes from that address.
4. Remove `ADMIN_SETUP_TOKEN` from the Sites panel afterwards. Without it (or with a value shorter than 32 characters) setup is switched off entirely.
The secret and the password are never logged or written to the audit trail; the audit records `account.setup` and any refused attempts.

**If /#setup says "not available":** the message now says which case applies, without revealing the value:
- *"does not receive ADMIN_SETUP_TOKEN"*: the running deployment has no such secret. Check the exact name (case, no spaces) on **this** site's project (the pilot and the official site are separate projects with separate secrets), then **redeploy the saved version**: Sites applies secrets only to a new deployment.
- *"shorter than 32 characters"*: the secret arrives but is too short (surrounding spaces and newlines are ignored). Save a longer value and redeploy.

`GET <site>/api/deployment` shows the running build (commit and build time), whether `DB` and `FILES` are bound, `APP_ORIGIN`, and `adminSetupSecret: missing | too_short | ok`. It never shows a secret, its length, or the OneDrive folder link.

### Creating the first administrator (VAPS-owned Cloudflare / direct database access)
```bash
node scripts/create-account.mjs ma001 MA001
```
The script prints a temporary password once (never written to disk) and writes the SQL (hash only) to a private temp file. Run it against the production database, then delete the file:
```bash
npx wrangler d1 execute <database-name> --remote --file <printed path>
```
The Administrator signs in with `MA001` and the temporary password, chooses a password, then invites everyone else from Settings → Sign-in accounts.

## Existing browser records (reviewed import)
Nothing is imported automatically. Production starts empty with the built-in defaults until the administrator imports:
1. In each browser that holds real work: Settings → **Export all records** (administrator, includes uploaded files).
2. In the Sites edition, signed in as the administrator: Settings → **Import records from a browser export** → the server checks fingerprints and validates every record and shows a report (add / unchanged / conflict) → **Import new records**.
3. Only new records are written, with their existing job IDs, job numbers and employee IDs; nothing is overwritten; a different copy of the same job is reported as a conflict. Every imported record is audited with the export's provenance. Re-running an import changes nothing.
4. Imported: the six workflow settings, clients, company, equipment, request-book lists, cylinders, jobs, the request book, and uploaded files (stored in R2 under their original IDs, so job references stay valid). The browser activity log, job counter and other browser-only records are archived verbatim (`browser_archive`), not shown in the app.
5. Report-only check on a computer without uploading anything: `npm run import:check -- <export.json>`.

## Verification (local)
- `tests/import-signed-in.test.mjs`: export → administrator import through the API → signed-in employees receive the jobs (byte for byte), settings, employee IDs (including a renamed and a newly added employee), request book and workbooks (from R2, with workbook permission enforced); imported jobs accept workflow commands; a re-run adds nothing. `tests/migrations.test.mjs`: fresh and upgrade paths.
- `tests/auth-server.test.mjs` (16 tests) runs the real API route handlers against a local D1 and R2 (Miniflare): sign-in success/failure, unknown vs wrong vs inactive, throttling, cross-site refusal, sign-out, absolute and idle expiry, administrator revocation, deactivated account and employee, password change and revocation of other sessions, forced first-login change, unauthenticated access to every internal API, spoofing attempts, settings/accounts/Trash permissions, QC and scope duties, sampling-record ownership, workbook release, send-to-sampling, no-op saves.
- Existing suite: 255 passing, 2 skipped (environment-dependent). The shared-summary API test was also run against a local server with a session.
- Browser check (Playwright, local dev server with local D1): sign-in, wrong password, forced password change, account creation, client added on one device visible on another, coordinator draft saved under his name, QC approval through the interface applied by the server, lab engineer's direct API attempt refused, revocation returning to sign-in, mobile layout without horizontal overflow.

## Administrator features (status against review section B, "Prompt 3")
| Feature | Status |
|---|---|
| Create account, temporary password, forced change | Done |
| Account deactivation / reactivation (revokes sessions) | Done; deactivating the employee record also blocks sign-in |
| Session revocation (sign out everywhere, on password change/reset) | Done |
| Account-management audit entries | Written to `audit_log` (created, password reset, deactivated, reactivated, sessions revoked, sign-ins and failures) — **no viewer screen yet** |
| Administrator transfer | **Not done.** The administrator is still the hard-coded ID `MA001` (bypasses most permissions; only MA001 may import) |
| Last-administrator protection | **Partial.** The directory refuses to deactivate MA001, and an account cannot deactivate itself, but another *Manage authorization* holder can deactivate or reset MA001's account |
| Audit view, last sign-in shown per employee | Not done |

## Remaining blockers before real employee access
1. **Hosting confirmation:** confirm the Sites platform provisions the R2 binding `FILES` and applies `drizzle/` migrations on deploy (the build packages them in `dist/.openai`), then run the bootstrap step. Not exercised against the real hosting here.
2. **Running the migration:** export every browser holding real work, import the authoritative one first, then resolve reported conflicts by hand (there is no merge). Files uploaded in a browser that is not exported are lost to the server (the import warns about job references with no file). Very large exports are limited by the Worker request size (~100 MB); split by browser if needed.
3. **Password hashing strength:** PBKDF2 at 100,000 iterations is the Workers limit and below OWASP's current PBKDF2 guidance (600,000). It is acceptable with the 12-character minimum and throttling; a memory-hard hash (Argon2id/scrypt) would need a paid CPU allowance or an external auth service.
4. **Client sharing** remains switched off (`clientSharingEnabled = false`); external links still need client-side identity and per-job allow-lists.
5. **Housekeeping:** expired session and throttle rows are not purged automatically (small volumes; a scheduled cleanup can be added).
6. **Prompt 3 (administrator):** `is_admin` instead of `MA001`, administrator transfer, server-enforced last-administrator rule at account level, and an audit viewer.
7. **Two job-write paths:** the HTTP routes use `server/workspace.ts`; the data layer's `server/job-store.ts` / `settings-store.ts` apply the same model functions and are used by the import and its tests. Consolidating them is a follow-up.
8. **Account lifecycle:** there is no self-service password reset (by design: an administrator issues a temporary password). Microsoft 365 sign-in and email notifications are deferred.

## Access model status
- **Super Users and Normal Users:** implemented (see Access roles).
- **Administrator transfer** to a designated employee other than MA001 (Zaid): not implemented; MA001 stays the fixed Administrator until the transfer is explicitly requested.
