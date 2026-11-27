# Running Workflow VAPS locally with Docker

This runs the Sites edition, the same code that deploys to Cloudflare: sign-in, shared database (D1) and file storage (R2), simulated locally. The same files work on any computer with Docker Desktop, on macOS, Windows or Linux, and on Intel or Apple silicon. **Local test data only.**

## Start
```bash
docker compose up -d --build
```
Open **http://localhost:3000**.
- Each computer builds its own image; don't copy images between machines.
- Every start applies any new database migrations before the app starts. After pulling new code, run the same command again.

| Command | What it does |
|---|---|
| `docker compose logs -f app` | Follow the server log |
| `docker compose stop` / `docker compose start` | Stop and start, keeping all data |
| `docker compose down` | Remove the container, keeping all data |
| `docker compose down -v` | **Delete** all local data: database, files, setup secret, test logins |
| `VAPS_PORT=3001 docker compose up -d` | Use another port on this computer |

All local data lives in the Docker volume `vaps_vaps-data`, never in the image or the repository.

## First Administrator (once per computer)
1. Show this computer's setup secret: `docker compose exec app cat /app/.wrangler/setup-secret`
2. Open `http://localhost:3000/#setup`, enter the secret, and choose MA001's password.

Email runs in **test mode**: nothing is sent. When MA001 invites someone (Settings → Sign-in accounts), the one-time link appears on screen. Open it in a private window to set that person's password. Use test addresses such as `name@vaps.example.test`, never real staff emails.

## Before the first job on a fresh database
- **QC reviewer:** Settings → Authorization → Responsibilities → QC review is empty by default, and the workflow stops at QC until someone is assigned.
- **Workbook access:** only the PVT Team Lead can view or download attached lab workbooks by default. If QC, the Chemistry Team Lead or the final approver need to open attached files, grant *View / Download workbook* in Settings → Authorization.
- **Cylinders:** every cylinder starts *Not checked*, and a job can only use *Ready* cylinders. The sampling team checks them in Sampling → Cylinders → Check cylinder.

## Backup and restore
Backups contain records. They are written to `./backups/`, which is gitignored: keep them private and never commit them.

**Back up.** Stop the app first so the copy is consistent:
```bash
docker compose stop app
docker compose run --rm --no-deps --entrypoint node app scripts/backup/backup.mjs --local --out backups/<name>
docker compose start app
```
The folder holds:
- `database.sql`: the full database.
- `files/<file id>`: every uploaded file, found through the database's `files` table.
- `manifest.json`: row counts per table and a SHA-256 checksum for every file.

**Restore.** The restore only writes into an empty database, so it can never overwrite live records. Restore into a separate copy, here a second project on port 3001:
```bash
VAPS_PORT=3001 docker compose -p vapsrestore run --rm --no-deps --entrypoint node app scripts/backup/restore.mjs --local --in backups/<name>
VAPS_PORT=3001 docker compose -p vapsrestore up -d          # open http://localhost:3001
VAPS_PORT=3001 docker compose -p vapsrestore down -v        # remove the copy when done
```
- **Before writing:** the restore checks every checksum in the backup.
- **After writing:** it checks the row count of every table, and reads each file back from storage to compare it byte for byte.

Restore drill on 27 Nov 2026, with sample data:
- **Backup:** 17 tables, 183 rows and 2 files.
- **Restore:** into a fresh volume; all row counts matched and both files matched byte for byte.
- **Restored copy on port 3001:** started with "No migrations to apply" and matched the original. Checks included sign-ins, job revision 44 with its 29 history entries, file downloads with the same checksums, and the same permission refusals.

For Cloudflare, the same scripts take `--remote --db <D1 name> --bucket <R2 bucket>`. See DEPLOY-CLOUDFLARE.md.
