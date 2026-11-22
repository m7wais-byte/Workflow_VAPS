# VAPS Workflow — Production readiness review

Review date: 22 November 2026 · Branch reviewed: `main` at `e6f6a02` · Scope: review only. No application code, settings, records or deployments were changed.

## 1. Verdict

The **workflow logic is ready**. The **platform under it is not**. The app is a single-page React client in which every job, setting, employee, password, permission check, audit entry and uploaded file lives in one browser. Employees on different computers do not see the same records, and anyone can sign in as anyone. These are infrastructure gaps, not workflow gaps. The workflow model (`app/operations-model.ts`, `app/job-access.ts`, `app/work-items.ts`) is pure TypeScript with no browser dependencies, so it can move to the server mostly unchanged.

Before official use, three things are required:
1. A server-owned database for jobs, settings and employees.
2. Real sign-in with server sessions, with the workflow commands enforced on the server.
3. Server file storage for workbooks and reports.

The existing Cloudflare Worker + D1 stack (the "Sites" edition) can provide all three. A new platform is not needed. The GitHub Pages edition cannot provide any of them.

## 2. What already works (verified in code and by running it)

| Area | Evidence |
|---|---|
| Complete workflow: dispatch → sampling data → data review → sampling report approval → laboratory scope (Phase 1 Validation / Phase 2 tests) → assignment → workbook → team-lead review → QC → final report → client approval and disposal → cylinder release | `app/operations-model.ts` (27 command types, line 299) |
| Each command checks the actor's permission and duty at the moment of action, using freshly read settings | `freshActor()` `app/page.tsx:516`; `applyJobOperation` `app/job-access.ts:58` |
| Job-level access rule (who may open or act on a job), applied to routes and to every command | `app/job-access.ts:15-46` |
| Per-job optimistic revision; stale saves are refused | `operations.revision`, `app/operations-model.ts:782`; check at `app/page.tsx:510` |
| Per-job history entries record `{at, by, action, reason}` | `app/operations-model.ts:782` |
| Duties are separate from permissions, and an empty duty blocks its step instead of falling back to a default | `app/authorization.ts:80-121` |
| Corrupt saved settings block actions instead of resetting them | `app/page.tsx:560-577` |
| Historical records are read without being rewritten (BVT read as PVT, legacy paths kept) | `app/operations-model.ts:75-78` |
| Stable internal employee IDs (SALIM, WILFRED, SHEREIQI, BAHRI, …, MA001) | `app/employee-directory.ts:5-9` |
| PVT/PV terminology: the PVT stream, "PV" as a Validation step, Chemistry labels over the stored `Chemical` value | `app/lab-work.ts:23`, `app/team-name.ts` |
| Type check passes. 239 of 241 tests pass and 2 are skipped (environment-dependent). The Sites build and the Pages build both succeed. | Run during this review |

## 3. Where data lives today

| Data | Storage | Key / location |
|---|---|---|
| Jobs (all workflow records, history, reports metadata) | browser `localStorage` | `vaps-demo-jobs-v1` (`app/page.tsx:92`) |
| Activity log (capped at 80 entries) | `localStorage` | `vaps-demo-activity-v1` (`app/page.tsx:93`, cap at `:982`) |
| Job number counter | `localStorage` | `vaps-demo-global-job-counter-<year>-om-format-v2` (`app/page.tsx:97`) |
| Clients | `localStorage` | `vaps-demo-clients-v1` (`app/page.tsx:114`) |
| Employees, departments, positions, **passwords in plain text** | `localStorage` | `vaps-directory-v1` (`app/employee-directory.ts:4`) |
| Permissions / duties / lab teams | `localStorage` | `vaps-authorization-v1`, `vaps-responsibilities-v1`, `vaps-lab-teams-v1` |
| Test catalogue / routing, equipment, request lists, company, custom cylinders, cylinder status | `localStorage` | `vaps-test-catalogue-v1`, `vaps-test-routing-v1`, `vaps-lab-equipment-v1`, `vaps-request-lists-v1`, `vaps-company-v1`, `vaps-custom-bottles-v1`, `vaps-cylinder-status-v1` |
| Demo override of duties, teams and routing | `localStorage` | `vaps-demo-setup-v1` (`app/demo-setup.ts:5`) |
| Uploaded workbooks, G-sheets, final report files | browser IndexedDB | `vaps-workbooks-v1` (`app/workbook-storage.ts:12`) |
| PVT request book | IndexedDB | `vaps-request-book` (`app/request-store.ts:5`) |
| Signed-in identity | `sessionStorage` (employee ID only) | `vaps-demo-session-v1` (`app/page.tsx:91`) |
| Generated sampling/scope/client reports | generated in the browser (html2pdf) from the job record | `app/sampling-report.tsx:296` |
| **Server (D1)** | one table, `job_summaries`, for client share links only; sharing is switched off | `db/schema.ts`, `app/deployment.ts:343` |

Effect: every browser holds its own separate copy of the company. When the coordinator dispatches a job on one PC, the sampling engineer does not see it on another PC. The cross-tab `storage` listener (`app/page.tsx:579`) reloads settings only, not jobs.

## 4. Findings

### 4.1 Launch blockers

| # | Finding | Evidence |
|---|---|---|
| B1 | **No shared data.** Jobs, settings and employees are per browser. Multi-user operation is impossible: each employee sees only what was done in their own browser. | §3; `app/page.tsx:672-694` loads everything from `localStorage` |
| B2 | **Sign-in is client-side only, with known passwords.** Every seeded employee has the password `1234` (`app/employee-directory.ts:13`, `:46`). The login page displays `MA001 · 1234` (`app/page.tsx:1947`, `app/demo-data.ts:13`). Passwords are stored and compared in plain text in the browser (`app/page.tsx:1046`). | — |
| B3 | **The user switch lets anyone become anyone.** "Demo: view as employee" changes the session to any active employee without a password (`app/page.tsx:1990`). Editing `sessionStorage['vaps-demo-session-v1']` has the same effect. | — |
| B4 | **Every permission check is browser-only.** `hasPermission` (`app/page.tsx:547`), `freshActor` (`:516`), `canOpenJob` (`app/job-access.ts:52`) and the workbook gate (`app/workbook-storage.ts:20-28`) all read browser storage. The server enforces nothing for jobs, settings or files because the server has no API for them. | Only API: `app/api/job-summary/[id]/route.ts` |
| B5 | **Identity comes from the browser on every write.** The actor ID is `currentEmployee.id` from `sessionStorage`. It is written into `history.by`, `lastUpdatedById`, `createdById`, `submittedBy`, `approvedBy` and the activity log (`app/page.tsx:981`, `app/operations-model.ts:782`). Approval signatures (sampling approval, QC, final approval) therefore prove nothing. Timestamps come from the browser clock. | — |
| B6 | **Uploaded files cannot be shared.** Workbooks and report files exist only in the uploader's IndexedDB. A team lead or QC reviewer on another PC gets "This file is not available in this browser" (`app/workbook-storage.ts:39`). The team-lead → QC review chain cannot work across computers. | — |
| B7 | **No backup or recovery.** Clearing browser data, a profile reset or a lost laptop deletes the records. The only exports are the request-book CSV (`app/requests.tsx:205`) and a manual console snippet in `GITHUB-PAGES.md`. | — |
| B8 | **New employees cannot sign in.** The employee form saves `password:''` (`app/settings-pages.tsx`), login requires a non-empty password (`app/page.tsx:1046`), and no screen sets or resets a password. | — |
| B9 | **The demo setup can silently replace real duties.** While `vaps-demo-setup-v1.enabled` is true, its duties, teams and routing override the saved Settings (`app/authorization.ts:71-77`, `app/page.tsx:541-544`). It also rewrites itself on read (AHAD→WILFRED, `app/demo-setup.ts:24`). Leaving it on in production would assign QC review and other duties wrongly. | — |
| B10 | **The hosting decision is open.** The GitHub Pages edition (public, static, `.github/workflows/pages.yml`) cannot host auth or shared data, and it publishes the employee list and default password in its JavaScript bundle. The Sites edition (`.openai/hosting.json`, D1 binding `DB`, no R2) is the only candidate with a server, but it has never been exercised against a real D1 database (WORKFLOW-IMPLEMENTATION.md "Remaining production blockers" 5). | — |

### 4.2 Required improvements (before or alongside launch)

| # | Finding | Evidence |
|---|---|---|
| R1 | **The administrator is hard-coded as `MA001`, so the role cannot be transferred.** The ID appears in 11 places outside the seed data. Some use the `administratorId` constant (`app/authorization.ts:2`, `:67`; `app/job-access.ts:20`). Others hard-code the literal `'MA001'`: `app/operations-model.ts:193`, `:196`, `:723`; `app/operations-workspace.tsx:249`, `:397`; `app/page.tsx:2021`, `:2026`, `:2079`, `:2080`. `app/employee-directory.ts:19` and `:25` refuse any directory in which MA001 is not active. MA001 also bypasses every permission except `createJob`, `deleteJobs`, `viewWorkbook` and `downloadWorkbook`. | — |
| R2 | **Settings changes are not fully audited.** Authorization and directory saves record no activity entry (`app/page.tsx:2139`, `:525`). Duties and lab-team saves record only a text line with no before/after values. The activity log keeps only the latest 80 entries per browser. | — |
| R3 | **Concurrent editing in the sampling editor.** `updateCurrentJob` writes the in-memory jobs array (`app/page.tsx:1038`), and so does `reassignJob` (`:1833`). Neither re-reads storage first, so a second tab can overwrite another job's newer state. Workflow commands are protected (`:510`); editor saves are not. On the server this becomes a per-job revision check on every write. | — |
| R4 | **Some writes bypass the command model.** Sampling editor saves, reassignment, Trash/restore, clients, cylinders, settings and the request book write storage directly. Each needs its own server endpoint and permission check; they are not covered by `applyJobOperation`. | `persistJobs` callers `app/page.tsx:513,966,976,1038,1833,1850` |
| R5 | **Demo content and wording remain throughout.** "Local demo environment / Prototype credentials" (`app/page.tsx:1933`). "Demo environment · Data stays on this device" (`:1975`). "Local demo" pill (`:1998`). "Load demo jobs" banner and `loadDemoData` (`:2017`, `:1844`). The fictional DEMO client `X` (`app/demo-data.ts:12`). "Local demo: permissions apply…" (`app/authorization-settings.tsx:91`). "Select an active trial profile" errors (`app/page.tsx:507`, `:517`). Storage keys are named `vaps-demo-*`; keep these internal names for the migration reader. | — |
| R6 | **Client share API trusts a header.** `GET` treats any request with an `oai-authenticated-user-id` header as signed in (`app/api/job-summary/[id]/route.ts:90`). That is only safe if the platform strips that header from incoming requests, which could not be verified. Sharing is off (`app/deployment.ts:343`); keep it off until a per-client allow-list exists. | — |
| R7 | **The planned employee name needs confirming.** The directory has "Mohammed Al Awaisi", ID `MA001`, position "Software Developer" (`app/employee-directory.ts:9`). The brief names "Mohammed Hilal Al Awaisi" as administrator. | — |
| R8 | **Most employees have no email address** (`email:''` for all seeds). This must be filled in before password reset or Microsoft 365 work can start. | `app/employee-directory.ts:13` |
| R9 | **No error monitoring.** Failures surface only as on-screen notices. There is no server log of failed saves or refused actions. | — |

### 4.3 Optional improvements

| # | Finding | Evidence |
|---|---|---|
| O1 | Lint fails with 17 errors, all unused variables in two test files. Earlier docs say lint passed. | `tests/weekly-board.test.mjs:7-36`, `tests/lab.test.mjs:8` |
| O2 | `app/page.tsx` is 2,551 lines and mixes state, storage and UI. Moving storage behind a small data layer would reduce risk during the server migration. | — |
| O3 | CI tests and deploys only the Pages edition. The Sites build is not checked in CI. | `.github/workflows/pages.yml` |
| O4 | Starter-template files remain: README intro, `examples/d1/`, `app/chatgpt-auth.ts` (unused), `workflow-review.png` at the repo root. | — |
| O5 | Terminology is consistent. One "PVT lab" label (`app/job-briefing.tsx:111`) differs from the "Laboratory" naming used elsewhere. The clarification item "PV terminology in older records" is still open (`app/operations-model.ts:61`). | — |
| O6 | The production bundle exceeds the chunk-size warning. Code-split heavy views (reports, html2pdf). | build output |

### 4.4 Tests: what exists and what is missing

What exists: 241 Node tests, mostly model tests. They cover commands, permissions and duties, job access, work items, progress, sampling, lab, reports, cylinders, settings parsing and the Pages build. The shared-summary API test is skipped without `WORKFLOW_TEST_URL` (`tests/workflow-api.test.mjs:3-4`).

Missing for real use:
- Server authentication (login, lockout, session expiry, logout).
- Server enforcement: a request without a session is refused, and a request naming another actor is ignored.
- Each API endpoint's permission check.
- Concurrent writes (revision conflict).
- Migration import: idempotent, preserves IDs, rejects collisions.
- File upload/download authorization.
- Administrator transfer, including the "last administrator cannot be removed" rule.
- An end-to-end two-user test on two browser contexts.

## 5. Hosting assessment

| Option | Auth and shared data possible? | Change needed | Assessment |
|---|---|---|---|
| GitHub Pages (current public edition) | No. Static files only. | — | Retire it for operations, or keep it as a training demo with fictional data only. |
| "Sites" edition (Worker + D1, `.openai/hosting.json`) | Yes in principle: route handlers, D1, an optional R2 binding | Add tables and APIs; enable R2 (`"r2": "FILES"`) | Least code change. **Unverified:** whether the platform allows app-set session cookies, app secrets and D1 backups/export, and whether it strips `oai-*` headers from client requests. Data residency for client data on a third-party hosting platform is a VAPS decision. |
| Same code on a VAPS-owned Cloudflare account (Workers + D1 + R2) | Yes | Add `wrangler.jsonc`, real D1/R2 IDs and a deploy workflow; keep the same code | **Recommended if Sites cannot confirm the points above.** Same runtime and libraries (`vite.config.ts` already uses `@cloudflare/vite-plugin`), D1 point-in-time restore, and VAPS owns the data and account. Integrates cleanly with Microsoft Entra ID later. |

Rebuilding on another stack is not justified. The model, UI and build already target Workers and D1.

## 6. Implementation plan

Each step leaves the app working. Workflow rules, IDs, duties and reports stay unchanged.

### Phase 0 — Prerequisites
1. Decide hosting (§8 D1). Provision D1 and R2 in a private environment. Use a staging copy for testing.
2. Freeze a backup: export every VAPS browser key and both IndexedDB databases from each browser that holds real records (step M1 below).
3. Fill in employee emails and confirm the employee list. Confirm the administrator record (R7).

### Phase 1 — Server data layer (prerequisite for A)
- D1 tables (Drizzle, `db/schema.ts`, new migration in `drizzle/`):
  - `employees`: existing `id` as primary key, name, department/position IDs, `employee_code`, `email`, `active`, `is_admin`.
  - `credentials`: `employee_id`, `password_hash`, `salt`, `iterations`, `must_change`, `failed_count`, `locked_until`, `updated_at`.
  - `sessions`: SHA-256 of the token, `employee_id`, `created_at`, `expires_at`, `last_seen`, `user_agent`.
  - `settings`: key, JSON value, revision, `updated_by`, `updated_at`. One row per current `vaps-*` settings key, so the existing parsers (`readAuthorization`, `readResponsibilities`, `readLabTeams`, …) keep validating the stored values.
  - `jobs`: `id`, JSON payload, `revision`, `updated_by`, `updated_at`, `trashed`.
  - `audit_log`: `id`, `at` (server time), `actor_id`, `action`, `record_type`, `record_id`, `before`/`after` JSON, IP, session ID. Append-only, never capped.
  - `files`: id, R2 key, name, size, type, job ID, uploaded by/at.
  - `requests`: the request book, keyed by `no`.
- APIs under `app/api/…`. Each handler resolves the session, then builds `Actor` from D1 instead of from `localStorage`:
  - `POST /api/jobs/:id/commands` runs the existing `applyJobOperation`. It enforces `revision`, writes `operations.history` with the server-side actor and time, and writes an `audit_log` row.
  - Endpoints for the editor saves listed in R4, each repeating the checks currently in `updateCurrentJob`.
  - Settings, directory and client endpoints, gated by the same permissions as today.
  - Files: `POST` upload to R2, and `GET` stream that checks `viewWorkbook`/`downloadWorkbook` on the server. No public R2 URLs.
- Client: replace direct `localStorage` reads and writes with fetch calls. Keep `localStorage` only for UI preferences (filters, return-to, "seen" markers). React state and UI components stay as they are.
- Remove the demo override from the server's view of settings: `withDemoRoles` and `activeDemoSetup` must never apply on the server.

### A. Employee login and removal of the user switch
1. Add `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` and `POST /api/auth/password`.
   - Hash passwords with WebCrypto PBKDF2-SHA-256, 100,000 iterations (the Workers maximum), and a per-user salt.
   - Sessions use a random 32-byte token in an `HttpOnly; Secure; SameSite=Lax` cookie. Store only the token's hash. Use an 8–12 h idle expiry (decision D6).
   - Lock an account for 15 minutes after 5 failed attempts. Use the same error message for an unknown user and a wrong password.
   - Check `Origin` on state-changing requests.
2. Username = the existing employee ID (`MA001`, `SALIM`, …). This matches today's login field. Alternatively, use `employeeCode` (decision D3).
3. Replace `handleLogin` and `logout` (`app/page.tsx:1044-1063`) with these endpoints. Set `currentEmployee` from `/api/auth/me`, never from `sessionStorage`.
4. Remove:
   - the "Demo: view as employee" selector (`app/page.tsx:1990`);
   - the demo hint and its credentials (`:1947`, `app/demo-data.ts:13`);
   - the `password` field from `Employee`, plus the `'1234'` seeds and the HUMAID migration password (`app/employee-directory.ts:1`, `:13`, `:46`);
   - the demo-setup pill and the "Load demo jobs" banner;
   - the demo wording listed in R5.

   Keep `demo-data.ts` for tests only.
5. Add a first-sign-in password change (`must_change`) and a "change my password" screen in My Profile.
6. Gate the whole app behind the session. Unauthenticated API calls return 401. The GitHub Pages workflow either stops deploying or deploys a training build with fictional data and no real employee list (decision D1).

### B. Administrator account management
1. Replace the hard-coded `MA001` with an `is_admin` flag on the employee record (or an `administration` permission), loaded into `Actor`. Change `allowed`/`hasAccess` (`app/authorization.ts:67`, `app/operations-model.ts:193`) and the literal-`'MA001'` sites listed in R1 to use it. Keep `explicitPermissions` exactly as it is: an administrator still does not create or delete jobs, or open workbooks, unless explicitly granted.
2. Rule: at least one active administrator must always exist, enforced on the server. This replaces the "MA001 must stay active" check (`app/employee-directory.ts:19`, `:25`).
3. Transfer: an administrator grants `is_admin` to another active employee. The new holder signs in. The original holder then removes their own flag. Both changes go to `audit_log`.
4. Settings → Employees gains, for administrators only:
   - create employee, which issues a one-time temporary password shown once (`must_change`);
   - reset password;
   - deactivate, which revokes all of that employee's sessions immediately;
   - unlock;
   - view the last sign-in.
   No password is ever displayed or stored in readable form.
5. Seed only MA001 as administrator at go-live, with a one-time password set through a deploy-time bootstrap step, not a value in the repository.
6. Add an audit view for administrators: filter `audit_log` by employee, job and date. Include authorization and directory changes with before/after values (closes R2).

### C. Microsoft 365 integration (later — do not build now)
1. Register an app in VAPS's Microsoft Entra ID tenant (decision D7: who owns the tenant and grants admin consent).
2. Sign-in: add an "Sign in with Microsoft" OIDC flow (authorization code + PKCE) on the server. Link an Entra account to the existing employee record by verified email or Entra object ID, stored in a new `external_identities` table. Employee IDs, duties and history stay unchanged. Once everyone has signed in with Microsoft, passwords can be disabled per employee.
3. Email: use the Microsoft Graph `sendMail` permission (application permission restricted to one mailbox with an Exchange application access policy, or delegated from a service account). Sending runs from a server-side outbox table:
   - triggered by successful commands, starting with `dispatch` as already specified in WORKFLOW-IMPLEMENTATION.md "Email integration handoff";
   - idempotency key = job ID + event + event time;
   - status queued / sent / failed, with retry;
   - never blocks or rolls back the workflow action.
4. OneDrive/SharePoint job folders (`<Job ID>/01 Sampling`, `/02 Lab/PVT`, `/02 Lab/Chemistry`) can later replace or mirror R2 through Graph. Keep R2 as the system of record until that is decided.
5. Phase A's design (server sessions, one employee table, an outbox-ready audit log) is what makes C an addition rather than a rewrite.

## 7. Preserving existing employee records and operational data

Nothing in the browser is rewritten. Migration is a one-way copy with checks.

- **M1 — Export (read-only).** Add a temporary "Export all records" button for the administrator. It writes one JSON file containing every `vaps-*` `localStorage` key exactly as stored, plus all records from `vaps-workbooks-v1` (as base64) and `vaps-request-book`, plus a manifest of counts and SHA-256 hashes. Exclude `vaps-demo-session-v1`, `vaps-job-summary-links-v1` and `vaps-demo-setup-v1`. Run it on every browser that holds real work. Keep the files off email and the repository (they contain client data).
- **M2 — Choose the source of truth.** If more than one browser holds real jobs, the copies have diverged. An import report lists jobs that appear in more than one file with different `operations.revision`. A person decides which copy wins (decision D2). The importer never merges automatically.
- **M3 — Import (staging first, then production).** A server-side administrator import:
  - Parses each key with the existing validators. Rejected data stops the import and reports why.
  - Inserts employees with their existing IDs.
  - Inserts jobs with their existing `id` and `jobNumber`. It never renumbers.
  - Uploads files to R2 under their existing file IDs, so job references stay valid.
  - Inserts request-book rows by `no` (the existing `importRequests` already skips collisions).
  - Writes one `audit_log` row per imported record, marked "imported from browser export <hash>".
  - Is idempotent: running it again changes nothing.
  - Demo jobs (client code `X`, `DEMO-*` serials) are skipped unless explicitly selected.
- **M4 — Verify.** Compare the counts and hashes from the export manifest with the database. Open sample jobs as their real owners and check the reports render unchanged.
- **M5 — Freeze the old copies.** After cut-over, the browser app shows a read-only notice when it finds old `vaps-*` keys, and does not delete them for a retention period (decision D5).
- Historical signatures (`by` fields recorded under the demo login) are imported as recorded. They are marked as entered before authenticated sign-in. They are not reattributed or invented.

## 8. Decisions that need your input

| # | Decision |
|---|---|
| D1 | Hosting: stay on Sites (after confirming cookies, secrets, backups and header stripping with the platform) or move the same code to a VAPS-owned Cloudflare account. What happens to the public GitHub Pages edition? |
| D2 | Which browser(s) and computer(s) hold the authoritative records today, and who decides conflicts? |
| D3 | Username format: existing internal ID (`SALIM`) or `employeeCode`? |
| D4 | Password policy: minimum length, and whether to force periodic changes (not recommended). |
| D5 | Retention of old browser copies, and the backup schedule (for example a daily D1 export plus D1 point-in-time restore). |
| D6 | Session length, and whether employees may stay signed in on shared lab PCs. |
| D7 | Microsoft 365: tenant owner, sender mailbox, and whether Microsoft sign-in replaces passwords. |
| D8 | Confirm the administrator record (R7) and whether the administrator keeps the "all permissions except explicit ones" behaviour. |
| D9 | Whether the 12 open workflow clarification items (`app/operations-model.ts:55-66`) must be closed before launch. QC review is currently unassigned by default. |

## 9. What could not be verified

- The deployed Sites site: URL, whether it is in use, its real D1 contents, and its access policy (only `.openai/hosting.json` is in the repository).
- The Sites platform: whether it allows custom cookies and secrets, whether it strips `oai-authenticated-*` headers from client requests, and its backup and data-location terms.
- What real records exist in employees' browsers, and how many browsers hold them.
- The live GitHub Pages deployment state. The GitHub connector failed to connect during this session, so Actions runs were not inspected.
- The shared-summary API against a real D1 database (`tests/workflow-api.test.mjs` is skipped without `WORKFLOW_TEST_URL`).
- PDF layout output and browser behaviour. No browser session was run in this review.

## 10. Checks run during this review

- `npx tsc --noEmit -p .`: passed.
- `npm run test:pages`: 241 tests, 239 passed, 0 failed, 2 skipped.
- `npm run build` (Sites): built, and `dist/.openai/` contains `hosting.json` and `drizzle/`.
- `npm run build:pages`: built, with a chunk-size warning.
- `npm run lint`: 17 errors and 9 warnings, all errors in test files (O1).
