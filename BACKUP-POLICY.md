# Backup policy, cost and recovery procedure (item 28)

Proposal for VAPS approval, 28 Nov 2026. Prepared by Rawand (GitHub: RawandAqel).

It turns the example in item 28 into a policy for the Cloudflare deployment, using:
- the backup and restore scripts in #69 (`scripts/backup/`);
- the services VAPS already pays for.

Every Cloudflare and Microsoft fact below is from the providers' documentation, listed under "Sources".

## 1. Summary

| | Proposal |
|---|---|
| **Database** | D1 Time Travel: any minute of the last 30 days, included in Workers Paid. A nightly export is kept 30 days, and a monthly export is kept 12 months. |
| **Files** | A nightly copy of every new file into a separate VAPS backup bucket. The app never changes or deletes a stored file, so each file is copied once. |
| **OneDrive files** | These are copies of the files above, so they are covered by the file backup. OneDrive's own recycle bin and version history are a second layer. |
| **Configuration** | Code and migrations are in GitHub. Settings and secret names are in a configuration record; secret values are kept in a VAPS-owned password vault. |
| **Maximum data loss** | Database: minutes (Time Travel, within 30 days); 24 hours beyond that. Files: 24 hours, usually less, because OneDrive also holds a copy. |
| **Restore time target** | 4 working hours for a full restore. Minutes for a database rollback with Time Travel. |
| **Restore tests** | Before launch, then every 3 months. Each test is recorded. |
| **Where backups live** | Only in VAPS accounts: a separate R2 bucket in the VAPS Cloudflare account. Each quarter, one copy is also kept outside Cloudflare, in VAPS's Microsoft 365. Nothing goes to personal accounts. |
| **Extra cost** | About $0–1.50 per month in year one, on top of Workers Paid (section 6). |

## 2. What is covered

| Item | Where it lives | How it is protected |
|---|---|---|
| Database: jobs, settings, accounts, audit log, email outbox | D1 | Time Travel (30 days), nightly and monthly exports |
| Uploaded files: workbooks, G-sheets, report documents | R2 (app bucket) | Nightly copy of new files to the backup bucket |
| Job files in OneDrive | VAPS OneDrive (pilot account, later a VAPS service account) | Rebuilt from R2 if needed; OneDrive recycle bin and version history |
| Code, migrations, deploy workflow | GitHub | Git history; every deploy is a Workers version that can be rolled back |
| Worker settings and secrets | Cloudflare Worker settings | Configuration record (names and where each value is kept); values in a VAPS-owned password vault, never in a backup file |
| Microsoft app registrations and Cloudflare Access rules | Entra, Cloudflare Zero Trust | Configuration record with IDs and settings (no secrets) |

**Not covered:** browser-local data. Settings → *Export all records* reads one browser's storage, not the server database, so it is not a backup.

## 3. Schedule and retention

1. **Continuous: D1 Time Travel.** Cloudflare keeps the database history automatically. Any minute of the last 30 days can be restored.
2. **Nightly, 02:00 Oman time:** a scheduled GitHub Actions job runs `scripts/backup/backup.mjs --remote` and uploads the result to the backup bucket. The time matters: a D1 export blocks other database requests while it runs (seconds for a database this size). The backups go to R2, not to GitHub artifacts. Artifacts are limited to 90 days in public repositories and are readable by anyone who can read the repository.
   - `daily/<date>/`: the full database export and its checked manifest. **Deleted after 30 days** by a bucket lifecycle rule.
   - `monthly/<yyyy-mm>/`: the first nightly export of each month. **Deleted after 365 days.**
   - `files/<file id>`: every file not yet in the backup, copied once with its checksum. Kept while the app keeps the file.
3. **Bucket lock:** objects under `daily/` and `monthly/` cannot be deleted or overwritten for 29 and 364 days, even with a valid token. This protects against mistakes and a stolen token. A lock overrides the lifecycle rule, so each lock is set one day shorter than its deletion age; otherwise the lifecycle rule could never delete anything.
4. **Quarterly, as part of the restore test:** the latest monthly backup is copied into a VAPS-owned Microsoft 365 location (a service account's OneDrive or a SharePoint library). That leaves one copy outside Cloudflare if the Cloudflare account itself is lost.
5. **Failure alert:** GitHub emails a failed scheduled run to the person who last edited the schedule line in the workflow. That must be the contact VAPS names in section 7, or the job gets an extra email step. Two failed nights in a row are treated as an incident.
6. **Schedule on a private repository.** GitHub switches off scheduled workflows in a public repository after 60 days with no activity. That is one more reason to finish making the repository private before the backup job goes live.

The backup job uses its own Cloudflare API token, with only these permissions:
- read D1;
- read the app bucket;
- write the backup bucket.

It cannot change the live app or its data.

## 4. Recovery procedures

Each procedure is written for the person on duty. Every restore is recorded with the date, the cause, the restore point and the result.

### A. A wrong change in the database (within the last 30 days)
1. Find the last good time (the audit log and the job's Sequence of Events help).
2. Tell staff to stop saving. Changes after the restore point will be lost.
3. Run `npx wrangler d1 time-travel restore <D1 name> --timestamp=<unix seconds>`. This replaces the database in place and cancels requests that are running at that moment. **Write down the bookmark it prints:** restoring to that bookmark undoes the restore. Use `npx wrangler d1 time-travel info <D1 name> --timestamp=<...>` first to see the bookmark for a time.
4. Check the affected job, sign-in and the email log. Then tell staff what to re-enter.

### B. The database is lost or damaged beyond 30 days
A deleted D1 database can be undeleted through the Cloudflare API within 7 days of deletion. Use that first if it applies. Otherwise:
1. Create a new, empty D1 database: `npx wrangler d1 create <new name>`.
2. Restore the chosen backup into it with `node scripts/backup/restore.mjs --remote --db <new name> --bucket <bucket> --in <backup folder>`. The restore refuses a database that is not empty. It checks every checksum before writing, then every row count and file after.
3. Point the Worker at the new database (deploy settings `VAPS_DEPLOY_D1_NAME` / `VAPS_DEPLOY_D1_ID`) and deploy.
4. Check sign-in, a recent job, a file download and the email log.

### C. A stored file is missing or damaged
1. Find the file ID: the job's file list, or the `files` table.
2. Copy `files/<file id>` from the backup bucket back into the app bucket with `npx wrangler r2 object get <backup bucket>/files/<id> --remote --file <id>`, then `npx wrangler r2 object put <app bucket>/<id> --remote --file <id>`. Check its size and checksum against the backup manifest. **Always pass `--remote`:** since Wrangler 4, these commands otherwise act on an empty local copy. Our scripts already pass it.
3. If the file is newer than the last nightly backup, take it from the job's OneDrive folder.

### D. A bad deployment
- Roll back the code from *Workers & Pages → Deployments*, or with `npx wrangler rollback`. Cloudflare keeps the 100 most recent versions; versions older than 30 days may be removed.
- A rollback restores code only; database migrations only move forward.
- Restore data (procedure A) only if the deployment damaged it.

### E. The Cloudflare account is lost
1. Create a new VAPS Cloudflare account, D1 database and R2 bucket.
2. Deploy from GitHub.
3. Restore the latest monthly backup from the Microsoft 365 copy (procedure B).
4. Re-enter the settings and secrets from the configuration record and the vault. Cloudflare never shows a secret's value again after it is saved, so the vault is the only copy.
5. Data since that backup is lost, except job files that were copied to OneDrive.

## 5. Restore tests

- **When:** before launch, then every 3 months, and after any change to the backup job.
- **How:**
  1. Restore the latest nightly backup into a new, empty D1 database and bucket with `restore.mjs`, which checks row counts and checksums.
  2. Open one job and one file from the restored copy.
  3. Delete the test copy.
  4. On the test site, also run one Time Travel restore and undo it with the bookmark.
- **Record:** date, backup used, table and file counts, time taken, result, and who ran it.
- **Status today:** the full drill passed locally in Docker on 27 Nov 2026 (`DOCKER.md` in #69). It has not run against Cloudflare yet; it is the first check after the test deployment.

## 6. Expected cost

Workers Paid ($5 per month minimum per account) is needed anyway for the app and for 30 days of Time Travel. Time Travel history and restores cost nothing extra.

The backups add R2 storage. The backup set is 30 daily and 12 monthly database exports, plus one copy of each file. Prices are R2 Standard: $0.015 per GB-month after a free 10 GB-month per account, Class A operations at $4.50 per million after 1 million free, and no egress fees.

| Year-one size (assumption) | Backup data stored | Extra cost per month |
|---|---|---|
| Database 100 MB, files 5 GB | about 9 GB | $0 – $0.15 |
| Database 500 MB, files 20 GB | about 41 GB | about $0.60 |
| Database 1 GB, files 50 GB | about 92 GB | about $1.40 |

- Compressing the nightly database export (gzip) makes the database part several times smaller.
- The free 10 GB is shared with the app's own files, so the table assumes it is already used.
- The nightly job makes a few hundred to a few thousand write operations a month, well inside the free million.
- The GitHub Actions run takes a few minutes a night. That is inside the compute GitHub Free includes ($12 per month), and costs nothing if the repository is public.
- The quarterly Microsoft 365 copy uses existing VAPS storage.

**Expected total: about $0–1.50 per month on top of Workers Paid.** These are list prices as of 28 Nov 2026.

## 7. What needs to be built or decided

**We build** after the test deployment, as a small PR:
- the nightly GitHub Actions workflow;
- the backup bucket with its lifecycle rules and bucket lock;
- a `--new-files-only` option for the file copy;
- the restore-test record.

**VAPS decides:**
1. Approve the retention: 30 daily, 12 monthly, and one quarterly copy outside Cloudflare.
2. Approve the 4-working-hour restore target.
3. Name the person who receives failure alerts and signs off restore tests.
4. Choose the Microsoft 365 location for the quarterly copy. It must be a service account or SharePoint library, not a person's OneDrive.
5. Choose the password vault for secret values.

## 8. Why a VAPS service account matters for OneDrive

Microsoft's rules for a person's OneDrive make it a weak home for official files:
- After the account is deleted, the files are kept 30 days by default. An admin can set 30–3650 days.
- An unlicensed account becomes read-only after 60 days and is archived after 93 days.

OneDrive itself offers:
- a 93-day recycle bin for work accounts;
- version history (500 versions by default);
- whole-drive "Restore your OneDrive" to any point in the last 30 days.

These are a useful second layer, but not the backup.

**Recommendation:** for production, connect the app to a dedicated VAPS service account, and check the job folder's version settings.

## 9. Sources (checked 28 Nov 2026)

- D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 import and export (an export blocks other requests): https://developers.cloudflare.com/d1/best-practices/import-export-data/
- D1 undelete within 7 days: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/undelete/
- Workers pricing ($5 minimum): https://developers.cloudflare.com/workers/platform/pricing/
- R2 pricing and free tier: https://developers.cloudflare.com/r2/pricing/
- R2 bucket locks: https://developers.cloudflare.com/r2/buckets/bucket-locks/
- R2 lifecycle rules: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- R2 S3 API (no object versioning): https://developers.cloudflare.com/r2/api/s3/api/
- Wrangler 4 runs commands locally by default: https://developers.cloudflare.com/workers/wrangler/migration/update-v3-to-v4/
- Workers rollbacks (100 versions): https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/
- Workers secrets are not shown again: https://developers.cloudflare.com/workers/configuration/secrets/
- GitHub Actions scheduled workflows (60-day rule, notifications): https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- GitHub Actions billing and artifact quotas: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- OneDrive recycle bin (93 days): https://support.microsoft.com/en-us/office/restore-deleted-files-or-folders-in-onedrive-949ada80-0026-4db3-a953-c99083e6a84f
- Restore your OneDrive (30 days): https://support.microsoft.com/en-us/office/restore-your-onedrive-fa231298-759d-41cf-bcd0-25ac53eb8a15
- OneDrive version history defaults: https://learn.microsoft.com/en-us/sharepoint/set-default-org-version-limits
- OneDrive retention after account deletion: https://learn.microsoft.com/en-us/sharepoint/retention-and-deletion
- Unlicensed OneDrive accounts: https://learn.microsoft.com/en-us/sharepoint/unlicensed-onedrive-accounts
