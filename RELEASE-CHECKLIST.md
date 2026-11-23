# Official staff rollout — release checklist

Prepared 23 Nov 2026 on `claude/happy-turing-aylxbq`. Review only. Nothing was merged, deployed, invited or emailed.

**Status: BLOCKED.** Not ready for your approval yet. See "Open items" for what blocks it.

## 1. What is in the release

| Order | PR | Branch (head) | Base | Adds | State |
|---|---|---|---|---|---|
| 1 | m7wais-byte/Workflow_VAPS#64 OneDrive pilot | `claude/onedrive-pilot` (`ccb02db`) | `main` (`d9f2943`) | migration `0006_onedrive_pilot` | Draft. Live Microsoft test not run |
| 2 | m7wais-byte/Workflow_VAPS#65 Admin setup message + `/api/deployment` | `claude/optimistic-lamport-5n9r0k` (`fd76f10`) | #64 branch | no migration | Open, clean |
| 3 | m7wais-byte/Workflow_VAPS#66 Email via Graph (bsg@visionaps.com) | `claude/optimistic-lamport-5n9r0k-graph-mail` (`39df999`) | #65 branch | migration `0007_mail_outbox` | Draft. Real delivery not tested |
| — | m7wais-byte/Workflow_VAPS#63 SharePoint pilot | `claude/intelligent-hamilton-0nvypw` (`d773a84`) | `main` | `0006_m365_pilot` (duplicate number) | **Out of this release** |

The stack is linear: #64 ⊂ #65 ⊂ #66, all from today's `main`. `main` has not moved, so there are no rebases.

**Build to deploy:** the `main` merge commit created after step 3 below. Record its SHA here once it exists: `________`.
Today's content candidate is `39df999` (the #66 head), which is identical in content to what `main` will hold after the three merges.

## 2. Merge order (after your approval only)

Use **"Create a merge commit"** (the repo's existing style). Do not squash: squashing #64 would make the #65 and #66 branches diverge from `main`.

1. Owners mark #64 and #66 ready (live tests passed). Then merge #64 → `main`.
2. Retarget #65 to `main`, then merge.
3. Retarget #66 to `main`, then merge.
4. Pull `main`, rebuild, and confirm `dist/.openai/drizzle` lists 0000–0007.

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

**Before deploying:**
1. Export the official D1 database with the hosting's export or backup tool, if one exists. Unverified: see O2.
2. Copy the `FILES` bucket, or record its object count.
3. Do not rely on Settings → **Export all records**: it reads one browser's `localStorage` and IndexedDB, not the server database (`app/data-export.ts:23`). The app has **no server-side backup or export** of D1 or R2, so step 1 is the only real backup, and it is unverified.
4. Record the current build (`/api/deployment` does not exist on current `main`, so record the hosting's deployment ID instead).

**Rollback:** redeploy the previous build. 0006 and 0007 only add tables, and the previous build ignores them, so no down-migration is needed. Restore the D1 export only if data was damaged. That loses changes made after the backup.

## 6. Checks before inviting anyone

1. `GET /api/deployment`: `build` = the SHA from §1; `DB`/`FILES` true; `appOrigin` = the official URL; `mail.provider` = null.
2. MA001 signs in at the official URL. Settings → Sign-in accounts shows MA001 as **Administrator**, and SALIM, SHEREIQI, WILFRED and BAHRI as **Super Users**. Everyone else shows as **Normal User**.
3. Employee IDs in the directory are unchanged (no renumbering).
4. Upload a sample file to a test job and download it again (exercises `FILES`).
5. A Normal User test account sees only a job assigned to them, or a job waiting for their action. A direct link to another job is refused.
6. `/api/admin/mail` shows no `sent` rows.
7. **Only after your approval:** set `MAIL_PROVIDER=graph` and `MAIL_ALLOWED_RECIPIENTS` = the first group's addresses, then send the invitations.

## 7. First onboarding group (on your approval)

Proposed group: MA001 (already active), **SALIM** and **WILFRED** (coordination Super Users), **SHEREIQI** (lab Super User) and **MOHSIN** (one Normal User, to check the narrowed view). Each one opens the one-time link (72 h), sets a password, signs in at the same dashboard address, and confirms what they can see. Widen to the remaining staff only after a clean day.

## 8. Open items

| # | Item | Owner |
|---|---|---|
| O1 | Official URL, audience (private, workspace only?) and the currently deployed build: not visible from the repo | Mohammed (Sites panel) |
| O2 | D1/R2 backup and restore on the hosting: unverified. There is no server-side export of accounts in the app | Mohammed (hosting); release review for an export tool |
| O3 | Company-approved file storage: today R2 `FILES` on the Sites host. OneDrive is a *copy* in one person's OneDrive (pilot). VAPS approval is needed for either | Mohammed / VAPS IT |
| O4 | #64 live OneDrive test, then mark it ready | OneDrive pilot chat |
| O5 | #66 real delivery test from bsg@visionaps.com, then mark it ready | BSG email chat |
| O6 | Whether the hosting applies `dist/.openai/drizzle` migrations on deploy, and how it records them | Mohammed (hosting) |
| O7 | `/api/deployment` answers without sign-in. Acceptable only if the site is private (O1). Otherwise restrict it to MA001 | PR #65 owner |

## 9. Picking up SharePoint (#63) later

- Rebase #63 onto the new `main`. 11 shared files conflict (file routing, job and file routes, schema, panel, CSS).
- Delete its `0006_m365_pilot.sql` and the 0006 snapshot, then run `npm run db:generate`. That produces **0008** with `prevId` = 0007's snapshot.
- Do not just rename the file. Its journal `when` (1795342022979) is older than 0006/0007, and timestamp-based migrators skip a migration that is older than the last one applied.
- Update `tests/migrations.test.mjs` and `tests/server-store.test.mjs`.
- Decide on one Microsoft storage target. OneDrive and SharePoint both hook the same save and upload paths and share `app/file-routing.ts`. Running both would copy each file twice.
