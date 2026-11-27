# Official staff rollout — release checklist

Prepared 23 Nov 2026 on `claude/happy-turing-aylxbq`. Review only. Nothing was merged, deployed, invited or emailed.

**Update 28 Nov 2026.** Carried into the release branch. That branch already holds [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md) (test deployment, migrations, rollback, backups), [DOCKER.md](DOCKER.md) (local run and restore drill) and [REVIEW-PR68-2026-11-27.md](REVIEW-PR68-2026-11-27.md). Deployment, rollback and backup steps below now point to those documents. The 23 Nov findings are kept, with dated notes where they changed.

**Status: BLOCKED.** Not ready for approval yet. See "Open items", and the fixes REVIEW-PR68-2026-11-27.md lists before the live OneDrive and email tests.

## 1. What is in the release

| Order | PR | Branch (head) | Base | Adds | State |
|---|---|---|---|---|---|
| 1 | #64 OneDrive pilot | `claude/onedrive-pilot` (`ccb02db`) | `main` (`d9f2943`) | migration `0006_onedrive_pilot` | Draft. Live Microsoft test not run |
| 2 | #65 Admin setup message + `/api/deployment` | `claude/optimistic-lamport-5n9r0k` (`fd76f10`) | #64 branch | no migration | Open, clean |
| 3 | #66 Email via Graph (bsg@visionaps.com) | `claude/optimistic-lamport-5n9r0k-graph-mail` (`39df999`) | #65 branch | migration `0007_mail_outbox` | Draft. Real delivery not tested |
| — | #63 SharePoint pilot | `claude/intelligent-hamilton-0nvypw` (`d773a84`) | `main` | `0006_m365_pilot` (duplicate number) | **Out of this release** |

The stack is linear: #64 ⊂ #65 ⊂ #66, all from today's `main`. `main` has not moved, so there are no rebases.

**Build to deploy:** the `main` merge commit created after step 3 below. Record its SHA here once it exists: `________`.
Today's content candidate is `39df999` (the #66 head), which is identical in content to what `main` will hold after the three merges.

**Update 28 Nov:** `origin/main` is still `d9f2943`. The three branches now travel together in the PR #68 branch (`claude/determined-carson-64dvid`). It merged the #66 branch head (with #64 and #65 under it) at `23c355c`, and the OneDrive follow-up branch `claude/kind-archimedes-bds5um` at `fab3653`. The #66 head has moved past `39df999` since. If #68 is merged instead of the three PRs, §2 becomes one merge of #68. Either way, record the commit actually deployed: `<address>/api/deployment` shows it.

## 2. Merge order (after approval only)

Use **"Create a merge commit"** (the repo's existing style). Do not squash: squashing #64 would make the #65 and #66 branches diverge from `main`.

1. Owners mark #64 and #66 ready (live tests passed). Then merge #64 → `main`.
2. Retarget #65 to `main`, then merge.
3. Retarget #66 to `main`, then merge.
4. Pull `main`, rebuild, and confirm the migrations 0000–0007 are present.
   - Sites hosting: `dist/.openai/drizzle` lists them.
   - Cloudflare (update 28 Nov): `drizzle/` lists them, and `.github/workflows/deploy-test.yml` applies them before the new code goes live (DEPLOY-CLOUDFLARE.md §2). Docker applies them at every start (DOCKER.md).

## 3. Migration order on the official database

The database must already hold 0000–0005 (current `main`). The release applies only:

1. `0006_onedrive_pilot.sql`: creates `onedrive_auth`, `onedrive_jobs`, `onedrive_files`.
2. `0007_mail_outbox.sql`: creates `mail_outbox` and its indexes.

Both only create new tables. They change no existing table and no existing row.

Verified locally (`release/upgrade-test/`): `main` created 9 accounts (MA001, the 4 Super Users and 4 Normal Users), one job at revision 5 and an uploaded G-sheet. The candidate then applied only 0006 + 0007, and:

- accounts, password hashes, the job payload and file metadata were byte-identical afterwards;
- existing sessions stayed valid;
- all 9 users signed in with their existing passwords;
- the G-sheet downloaded byte-for-byte from `FILES`;
- the job accepted its next command;
- the unassigned Normal User was refused the job and the file (403).

## 4. Settings for the release (staff invitations and client notifications OFF)

Where to set them (update 28 Nov): on Cloudflare, *Worker → Settings → Variables and Secrets* (DEPLOY-CLOUDFLARE.md §2, steps 3–4). Values entered there survive every deploy (`keep_vars`). The email settings are described in EMAIL-SETUP.md §2.

| Setting | Release value |
|---|---|
| `DB` / `FILES` bindings | Present. Check with `GET /api/deployment` → `bindings.DB: true, FILES: true` |
| `APP_ORIGIN` | The official dashboard URL (single value) |
| `MAIL_PROVIDER` | **unset** (nothing is sent). Set it only for step 7 |
| `MAIL_ALLOWED_RECIPIENTS` | unset. For step 7: the first group's exact addresses only, **never `*`** |
| `NOTIFY_STAFF` | unset during preparation |
| `NOTIFY_CLIENT` | **unset**. Clients get no email in this rollout |
| `ONEDRIVE_*` | unset unless the OneDrive pilot is approved as company storage (open item O3) |
| `ADMIN_SETUP_TOKEN` | Remove after MA001 exists. `/api/deployment` then reports setup as completed |

## 5. Backup and rollback

Updated 28 Nov: backups and rollback are described in DEPLOY-CLOUDFLARE.md §3–4 and DOCKER.md ("Backup and restore").

**Before deploying:**
1. Back up the database and every uploaded file:
   `node scripts/backup/backup.mjs --remote --db <D1 name> --bucket <R2 bucket>` (DEPLOY-CLOUDFLARE.md §4).
   - The folder holds `database.sql`, the files and a manifest with row counts per table and a checksum for every file.
   - The backup contains records. Keep it private and never commit it.
2. D1 Time Travel keeps 30 days of database history on Workers Paid. It is a second line of defence for the database only: R2 has no Time Travel.
3. Do not rely on Settings → **Export all records**: it reads one browser's `localStorage` and IndexedDB, not the server database (`app/data-export.ts:23`). Server backups are made only by the scripts in step 1, outside the app.
   - The restore drill passed locally in Docker on 27 Nov (DOCKER.md). It has not yet been run against Cloudflare: see O2.
4. Record the current build: `build` in `<address>/api/deployment`, or the deployment list under *Workers & Pages → <worker> → Deployments*.

**Rollback:** redeploy the previous build, from *Workers & Pages → <worker> → Deployments* or with `npx wrangler rollback` (DEPLOY-CLOUDFLARE.md §3).
- A rollback restores the code only. 0006 and 0007 only add tables, and the previous build ignores them, so no down-migration is needed.
- Restore data only if it was damaged. That loses changes made after the restore point.
  - **D1 Time Travel:** `npx wrangler d1 time-travel restore <D1 name> --timestamp=<unix seconds>` overwrites the database in place. It prints a bookmark that undoes it.
  - **Backup folder:** `scripts/backup/restore.mjs` writes only into a new, empty database and bucket, then checks row counts and every file.

## 6. Checks before inviting anyone

1. `GET /api/deployment`: `build` = the SHA from §1; `DB`/`FILES` true; `appOrigin` = the official URL; `mail.provider` = null.
2. MA001 signs in at the official URL. Settings → Sign-in accounts shows MA001 as **Administrator**, and SALIM, SHEREIQI, WILFRED and BAHRI as **Super Users**. Everyone else shows as **Normal User**.
3. Employee IDs in the directory are unchanged (no renumbering).
4. Upload a sample file to a test job and download it again (exercises `FILES`).
5. A Normal User test account sees only a job assigned to them, or a job waiting for their action. A direct link to another job is refused.
6. `/api/admin/mail` shows no `sent` rows.
7. **Only after approval:** set `MAIL_PROVIDER=graph` and `MAIL_ALLOWED_RECIPIENTS` = the first group's addresses, then send the invitations.

## 7. First onboarding group (after approval)

Proposed group: MA001 (already active), **SALIM** and **WILFRED** (coordination Super Users), **SHEREIQI** (lab Super User) and **MOHSIN** (one Normal User, to check the narrowed view). Each one opens the one-time link (72 h), sets a password, signs in at the same dashboard address, and confirms what they can see. Widen to the remaining staff only after a clean day.

## 8. Open items

| # | Item | Owner |
|---|---|---|
| O1 | Official URL, audience (private, workspace only?) and the currently deployed build: not visible from the repo. *Update 28 Nov:* the test deployment runs on a VAPS-owned Cloudflare account behind Cloudflare Access, and `<address>/api/deployment` shows its build (DEPLOY-CLOUDFLARE.md). The official address, for example a custom domain such as `workflow.visionaps.com`, is still a VAPS IT decision | VAPS Administrator / VAPS IT |
| O2 | D1/R2 backup and restore on the hosting: unverified. *Update 28 Nov:* `scripts/backup/` (database and files, checked manifest) and D1 Time Travel are in place. The restore drill passed in Docker but has not been run against Cloudflare. Still to decide: where backups are kept, how often they run and for how long | VAPS (hosting owner) |
| O3 | Company-approved file storage: today R2 `FILES` (on the test deployment, the VAPS Cloudflare bucket). OneDrive is a *copy* in one person's OneDrive (pilot). VAPS approval is needed for either | VAPS / VAPS IT |
| O4 | #64 live OneDrive test, then mark it ready. *Update 28 Nov:* fix REVIEW-PR68 O1, O2 and O3/E4 first | OneDrive pilot chat |
| O5 | #66 real delivery test from bsg@visionaps.com, then mark it ready. *Update 28 Nov:* fix REVIEW-PR68 E1–E6 first | BSG email chat |
| O6 | Whether the hosting applies `dist/.openai/drizzle` migrations on deploy, and how it records them. *Update 28 Nov: resolved for Cloudflare.* `deploy-test.yml` applies the `drizzle/` migrations with `wrangler d1 migrations apply`, which records them in the database, before the new code goes live | Resolved (Cloudflare) |
| O7 | `/api/deployment` answers without sign-in. Acceptable only if the site is private (O1). Otherwise restrict it to MA001 (REVIEW-PR68 D1) | PR #65 owner |

## 9. Picking up SharePoint (#63) later

- Rebase #63 onto the new `main`. 11 shared files conflict (file routing, job and file routes, schema, panel, CSS).
- Delete its `0006_m365_pilot.sql` and the 0006 snapshot, then run `npm run db:generate`. That produces **0008** with `prevId` = 0007's snapshot.
- Do not just rename the file. Its journal `when` (1795342022979) is older than 0006/0007, and timestamp-based migrators skip a migration that is older than the last one applied.
- Update `tests/migrations.test.mjs` and `tests/server-store.test.mjs`.
- Decide on one Microsoft storage target. OneDrive and SharePoint both hook the same save and upload paths and share `app/file-routing.ts`. Running both would copy each file twice.
