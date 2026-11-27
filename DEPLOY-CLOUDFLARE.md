# Private test deployment on Cloudflare

The Sites edition runs on a **VAPS-owned Cloudflare account** as a private test environment. GitHub Actions deploys it from this repository. It holds **sample data only**, and MA001 is the Administrator.

| Piece | Name | Notes |
|---|---|---|
| Worker (the app) | `vaps-workflow-test` | Address: `https://vaps-workflow-test.<account subdomain>.workers.dev`, protected by Cloudflare Access |
| D1 database | `vaps-test-db` | Jobs, settings, accounts, sessions, audit log |
| R2 bucket | `vaps-test-files` | Uploaded files (workbooks, G-sheets, report documents) |
| Deploy workflow | `.github/workflows/deploy-test.yml` | Runs on every push to the `deploy/test` branch |

The workflow never creates the database or the bucket. If either is missing it stops and names what to create, so a typo can never start an empty database.

## 1. One-time setup (VAPS Cloudflare account owner)

1. **Account.** Create the Cloudflare account with a VAPS-owned mailbox, not a personal one, and turn on two-factor authentication. Later, add a second VAPS administrator as a member.
2. **Plan, R2 and workers.dev subdomain.**
   - **Workers Paid:** go to *Workers & Pages → Plans* and choose **Workers Paid** (minimum $5 per month). The free plan allows 10 ms of CPU per request. Password checks take close to that, so sign-in could fail on the free plan.
   - **R2:** go to *R2* and complete the R2 checkout. Cloudflare requires an R2 subscription even within its free tier of 10 GB.
   - **workers.dev subdomain:** open *Workers & Pages* once and choose the account's workers.dev subdomain, for example `vaps`. Deploys fail until one exists.
3. **Database and bucket.** Create them once; leave the location automatic.
   - **D1:** *Storage & Databases → D1 → Create* → name `vaps-test-db`.
   - **R2:** *R2 → Create bucket* → name `vaps-test-files`.
   - Or, from a computer signed in with `npx wrangler login`: `npx wrangler d1 create vaps-test-db` and `npx wrangler r2 bucket create vaps-test-files`.
4. **API token for GitHub Actions.**
   - Go to *My Profile → API Tokens → Create Token → Create Custom Token*.
   - Permissions, all at **Account** level:
     - Workers Scripts · Edit
     - D1 · Edit
     - Workers R2 Storage · Edit
     - Account Settings · Read
   - Account resources: **Include → the VAPS account only**. No zone permissions are needed.
   - Set an expiry, for example 6 months, and put a renewal reminder in the calendar.
   - This permission list is our best reading of Cloudflare's documentation. If the first run fails with an authentication error, add the permission it names.
   - Add two **repository secrets** in GitHub: *RawandAqel/Workflow_VAPS → Settings → Secrets and variables → Actions → New repository secret*:
     - `CLOUDFLARE_API_TOKEN`: the token value.
     - `CLOUDFLARE_ACCOUNT_ID`: from the right-hand column of the account's *Overview* page.
   - The token belongs to VAPS and the repository to RawandAqel. Either add the VAPS owner as a collaborator so they paste it in themselves, or have them type it in during a screen share. Never send it through chat, email, a ticket or a file.
5. **Turn on GitHub Actions (repository owner, signed in as RawandAqel).** The builder's GitHub Pages workflow (`pages.yml`) must stay off in this private repository.
   - Turn Actions on, then turn `pages.yml` off straight away, with no push in between. `pages.yml` only runs on a push to `main`.
   - In GitHub: *Settings → Actions → General → Allow all actions → Save*, then *Actions → Deploy GitHub Pages → ⋯ → Disable workflow*.
   - Or from a terminal where `gh` also knows other accounts. The `GH_TOKEN=` part makes the commands act as RawandAqel:
   ```bash
   export GH_TOKEN=$(gh auth token --hostname github.com --user RawandAqel)
   gh api -X PUT repos/RawandAqel/Workflow_VAPS/actions/permissions -F enabled=true
   gh workflow disable pages.yml -R RawandAqel/Workflow_VAPS
   unset GH_TOKEN
   ```

## 2. First deploy (in this order)

1. **Deploy.** A deploy starts only from a push to `deploy/test` made *after* Actions is on. Earlier pushes are never run, and the workflow has no "Run workflow" button because it is not on `main`. Start the first deploy with an empty commit:
   ```bash
   git switch deploy/test
   git commit --allow-empty -m "Trigger first test deploy"
   git push private deploy/test
   ```
   - Each run does: type check → tests → find the database and bucket → build → apply migrations → deploy.
   - The run's summary shows the address.
2. **Protect it before anything else.**
   - Go to *Workers & Pages → vaps-workflow-test → Settings → Domains & Routes → workers.dev* and turn on **Cloudflare Access**.
   - Limit the policy to the pilot testers' email addresses.
   - Check it: open the address in a private window. It must ask for an Access sign-in first.
3. **Address.** Go to *Settings → Variables and Secrets* and add `APP_ORIGIN` as **Text**, set to the workers.dev address. Links in invitations and emails are built from it.
4. **Administrator setup secret.**
   - Add `ADMIN_SETUP_TOKEN` as a **Secret**, at least 32 characters. Generate it with `openssl rand -base64 48`.
   - A value shorter than 32 characters turns setup off; this is what stopped the earlier Sites pilot.
5. **Check, then create MA001.**
   - Open `<address>/api/deployment`. Expect:
     - `build`: the deployed commit.
     - `bindings`: `DB` and `FILES` both `true`.
     - `appOrigin`: the address.
   - Then open `<address>/#setup`, enter the secret and choose MA001's password.
6. **Remove `ADMIN_SETUP_TOKEN`.** Setup also closes by itself once MA001 exists.
7. **Prepare the empty database for a test job.** These were found in the local end-to-end walk.
   - **Cylinders:** every cylinder starts *Not checked*, and a job can only use *Ready* ones. A sampling employee checks at least one in *Sampling → Cylinders → Check cylinder*.
   - **QC reviewer:** set it in *Settings → Authorization → Responsibilities → QC review*. It is empty by default, and the workflow stops at QC.
   - **Workbook access:** only the PVT Team Lead holds *View / Download workbook* by default. Grant it to whoever must open attached workbooks, such as the QC reviewer, the Chemistry Team Lead and the final approver.
   - **Test accounts:** while `MAIL_PROVIDER` is unset, invitations are refused. Test mail mode is for local development only, never a deployed site. Until email is approved, create each test account with `node scripts/create-account.mjs <username> <employee-id>` and `npx wrangler d1 execute vaps-test-db --remote --file <printed path>` (AUTHENTICATION.md).
     - Each account gets a temporary password, shown once, which must be changed at first sign-in.
     - Delete the printed SQL file afterwards.

The OneDrive live test (ONEDRIVE-PILOT.md) needs some of the job flow first.
- **Quickest Sampling file:** attach a client request / scope document on the *Create job* form. It is routed to the Sampling folder.
- **G-sheet:** the test plan's Sampling file additionally needs preparation (with a Ready cylinder), the data sheet and the backup engineer's review.
- **Lab file:** additionally needs sampling report approval, the Phase 1 scope release and a test assignment.
- Allow about 30–45 minutes for the full path.

Settings and secrets entered in the dashboard **survive every deploy**: the build sets `keep_vars`. Leave `MAIL_PROVIDER` unset; email stays off until VAPS IT approves it (EMAIL-SETUP.md).

### OneDrive pilot settings (ONEDRIVE-PILOT.md, step 2)
Where that document says "Sites panel", use *Worker → Settings → Variables and Secrets*:

| Name | Type |
|---|---|
| `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_TENANT_ID`, `ONEDRIVE_ACCOUNT` | Text |
| `ONEDRIVE_PARENT_URL`, `ONEDRIVE_TOKEN_KEY` | **Secret** |

## 3. Deploying updates
- **Deploy a change:** commit or merge it into `deploy/test` and push. Only one deploy runs at a time.
- **Bring in the builder's updates:** `git fetch origin`, merge the wanted branch into `deploy/test`, then push.
- **See which build is running:** `<address>/api/deployment`.
- **Roll back:** use *Workers & Pages → vaps-workflow-test → Deployments*, or `npx wrangler rollback`.
  - A rollback restores the **code only**. Database migrations only move forward.
  - They are additive, so older code keeps working with the newer tables.

## 4. Backups (completed in the domain and rollout step)
- **Database restore:** D1 Time Travel is always on and keeps **30 days** on Workers Paid.
  - Restore with `npx wrangler d1 time-travel restore vaps-test-db --timestamp=<unix seconds>`.
  - The restore overwrites the database in place and prints a bookmark that undoes it.
- **Database export:** `npx wrangler d1 export vaps-test-db --remote --output=vaps-test-db.sql`.
  - The file contains records. Keep it private and never commit it.
- **Files:** R2 has no Time Travel. `scripts/backup/backup.mjs` copies the database and every uploaded file into one folder, with a checked manifest. Run it from a computer signed in with `npx wrangler login`, or with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set:
  ```bash
  node scripts/backup/backup.mjs --remote --db vaps-test-db --bucket vaps-test-files
  ```
  - **Restoring:** `scripts/backup/restore.mjs` writes only into a new, **empty** D1 database (create one with `npx wrangler d1 create <name>`) and a bucket. It then checks the row counts and every file.
  - **Status:** the backup/restore drill has passed locally in Docker (DOCKER.md). It has not yet been run against Cloudflare.
  - **Still to decide (VAPS):** where backups are kept, how often they run, and for how long.
- **Custom domain:** a domain such as `workflow.visionaps.com` needs the domain's DNS zone to be active on Cloudflare. That is a VAPS IT decision, because the Microsoft 365 email records live in the same zone.
