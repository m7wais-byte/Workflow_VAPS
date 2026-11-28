# Deploy day: first test deployment on Cloudflare

Prepared by Rawand (GitHub: RawandAqel), 28 Nov 2026. Target: before 1 December 2026.

This is the order of work for the first test deployment and the live OneDrive test, in one working session of about 3 hours. For each step it says:
- who does it;
- how long it takes;
- how we know it passed.

The detailed how-to is in:
- `DEPLOY-CLOUDFLARE.md` (#69);
- `ONEDRIVE-PILOT.md`;
- `EMAIL-SETUP.md`.

The site holds **sample data only** until the pilot is approved.

## 1. Go / no-go check (the day before)

We start only when every line is ready. If a line is missing, the day moves; nothing is done halfway.

| # | Needed | From | How we confirm it |
|---|---|---|---|
| 1 | Collaborator access for `RawandAqel` | Owner | We can push a branch to the repository |
| 2 | The code to deploy, agreed | Owner | Either #69–#72 are merged into #68's branch, or the owner approves deploying the combined branch. We checked that combination: no conflicts, 334 tests pass |
| 3 | Cloudflare account with Workers Paid, R2 and a workers.dev subdomain, two-factor sign-in on | VAPS | Our member invite is accepted, and the plan page shows Workers Paid |
| 4 | D1 database `vaps-test-db` and R2 bucket `vaps-test-files` | VAPS, or us as a member | Both visible in the dashboard |
| 5 | The two GitHub secrets, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` | Owner / VAPS | Both names listed under *Settings → Secrets and variables → Actions* (values are never shown) |
| 6 | GitHub Actions allowed in the repository | Owner | The *Actions* tab is on |
| 7 | Email addresses of the pilot testers, for Cloudflare Access | VAPS | A written list |
| 8 | OneDrive: app registration checked, parent folder inside the pilot account's own OneDrive | VAPS IT / owner | Their confirmation; the link itself is never sent to us |
| 9 | People for about 3 hours: us, plus whoever signs in as the pilot OneDrive account and types in the secret folder link | VAPS / owner | Calendar slot agreed |

**If lines 1–6 are not ready by 30 November, the 1 December target slips.** We keep the Docker copy for demonstrations in the meantime.

## 2. The session, step by step

| Step | Time | Who | What | Passes when |
|---|---|---|---|---|
| 1. Deploy | 20 min | Us | Push the agreed code to `deploy/test` and watch the run: type check → tests → find the database and bucket → build → migrations → deploy | The run is green and its summary shows the address |
| 2. Lock it | 10 min | Us (as member) | Turn on **Cloudflare Access** for the workers.dev address, limited to the pilot testers' emails | A private browser window is asked for an Access sign-in first |
| 3. Settings | 10 min | Us + VAPS | Add `APP_ORIGIN` (the address). The authorised person generates `ADMIN_SETUP_TOKEN` (`openssl rand -base64 48`) and types it in as a **Secret** | `<address>/api/deployment` shows the deployed commit, `DB` and `FILES` true, and the address |
| 4. Administrator | 10 min | VAPS administrator | Open `<address>/#setup`, enter the token, choose MA001's password, and keep it in the VAPS vault. Then remove `ADMIN_SETUP_TOKEN` | MA001 signs in; setup shows as closed |
| 5. Pilot settings | 20 min | MA001, with us | Apply the five setup rules (below). Mark one cylinder **Ready**. Create the test accounts with `scripts/create-account.mjs` while email is off | Every test account signs in and changes its temporary password |
| 6. Smoke test | 45 min | Us, with the test accounts | One sample job from creation to "Final report issued to the client" (#72), through sampling, the data review, the sampling report, the scope release, a test, team-lead review, QC and final approval | Every step confirms; files download; wrong-person actions are refused; no errors in the browser console |
| 7. OneDrive live test | 40 min | Us + the pilot account holder | The authorised person types in the OneDrive settings and secrets. MA001 selects **Connect OneDrive**, and the pilot account approves with the short code. Then run the test in `ONEDRIVE-PILOT.md` and the extra checks (below) | The job folder holds `Sampling` and `Lab`; each file is copied once; there is no second job folder; saves still answer within a few seconds |
| 8. Backup check | 20 min | Us | Run `scripts/backup/backup.mjs --remote`. Restore into a **new, empty** D1 database and bucket with `restore.mjs`. Delete the restore copy afterwards | Every row count and checksum matches (the first run against Cloudflare) |
| 9. Report | 15 min | Us | Send the owner a short results table: passed, failed, open issues | Owner has the result the same day |

### The five setup rules (step 5)

From `WORKFLOW-CLARIFICATIONS.md` (#74). Without them the pilot stalls or loses its checks:
1. Assign the QC reviewer duty to someone who is not a team lead. Otherwise every test stops at QC.
2. Grant *View workbook* and *Download workbook* to both team leads and the QC reviewer.
3. Give each test job a backup sampling employee, so the data review is not done by the person who entered the data.
4. The sampling approver and the final approver do not also prepare reports.
5. Give the Client approval duty to a coordinator who holds *Create job*.

### Extra OneDrive checks (step 7)

These come from review finding O10 and fix #70. Our test stand-ins could not prove them:
- **Same file name twice:** upload a G-sheet with the same name again. Both files must be kept, with the second numbered, never overwritten.
- **Disconnect and retry:** disconnect, then upload. The panel says the original is saved and the OneDrive copy failed. Reconnect and select **Retry OneDrive copy**: one copy, no duplicate.
  - There is no Disconnect button yet. As MA001, run this in the browser console: `fetch('/api/admin/onedrive', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-VAPS-Request': '1'}, body: JSON.stringify({action: 'disconnect'})})`. A Disconnect button is a small follow-up.
- **Slow Microsoft:** while copies run, a save still answers within a few seconds, and the panel shows "copying" and then "Synced".
- **Settings check:** `<address>/api/deployment` shows OneDrive as configured, with the account and tenant set.

## 3. If something goes wrong

| Problem | What we do |
|---|---|
| The deploy run fails | Read the failed step. Common causes: a token permission missing (add the one Cloudflare names), no workers.dev subdomain yet, a different database or bucket name (the run stops and names it). Nothing is deployed until every step passes |
| The site works badly after deploying | Roll back in *Workers & Pages → Deployments* or with `npx wrangler rollback`. Data is not touched |
| The site opens without an Access sign-in | Turn off the workers.dev address at once (*Settings → Domains & Routes*) until Access is fixed. Only sample data exists |
| OneDrive fails | Delete the `ONEDRIVE_CLIENT_ID` setting in Cloudflare, which switches OneDrive copying off. It is not secret, so it is easy to enter again. Files stay saved in the app, and the app works without OneDrive |
| Sample data gets damaged | Restore with D1 Time Travel, or start again with a new empty database |
| A secret is pasted somewhere it should not be | Replace it at once: create a new token or key and delete the old one |

## 4. Rules for the day

- **Secrets are typed in, never sent.** The authorised person types each secret directly into Cloudflare or GitHub: the API token, `ADMIN_SETUP_TOKEN`, `ONEDRIVE_TOKEN_KEY`, `ONEDRIVE_PARENT_URL` and MA001's password. They never go into chat, email, a ticket or a file.
- **Sample data only:** fictional clients, fields and wells.
- **Access stays limited to the named pilot testers' emails.**
- **One-time items are removed after use:** the setup token, and the SQL files printed by `create-account.mjs`.
- **Email stays off.** `MAIL_PROVIDER` stays unset until the Microsoft 365 setup is done.

## 5. After the day

1. **Email test (separate session, after the Microsoft 365 setup):** `EMAIL-SETUP.md` section 3, with only the approved test inboxes allowed. We also check that:
   - each email shows its reference;
   - the email log moves from *Queued* to *Sent* once, with no duplicates.
2. **Staff pilot (early December):** the five setup rules applied, client notifications off.
3. **Our next PRs:**
   - the nightly backup job (`BACKUP-POLICY.md` section 7, #74);
   - the pre-launch independence checks (`WORKFLOW-CLARIFICATIONS.md`, #74), once VAPS approves them.
