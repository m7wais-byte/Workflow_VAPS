# Workflow VAPS: status report, 28 Nov 2026

Prepared by Rawand (GitHub: RawandAqel) for the repository owner. It follows your answers A–I. It covers:

- what we have done;
- what we need from you and VAPS before the 1 December test deployment;
- what comes next.

## Summary

Our side of the 1 December test deployment is ready. That covers:

- the Cloudflare deploy pipeline;
- a local Docker run and tested backups;
- a review of #68 and the fixes it called for;
- the identity clean-up;
- item 29.

All of it is in pull requests (section 1).

The test deployment itself cannot run until three things are in place:

- the VAPS Cloudflare account;
- the two GitHub secrets;
- the OneDrive folder and app registration checks (section 3).

## 1. Pull requests to review, in this order

| Order | PR | What it does | Own commits |
|---|---|---|---|
| 1 | #69 | Cloudflare test deploy from GitHub Actions; Docker local run; backup and restore scripts with a tested restore; review of #68; end-to-end walk | 7 |
| 2 | #70 | Reliability fixes from the review: OneDrive copies once, saves never wait for Microsoft 365, safer email retries | 2 |
| 3 | #72 | Item 29: "Final report approved internally" vs "Final report issued to the client" | 1 |
| any time after #69 | #71 | Identity clean-up (A6), the #58 tracking-bar fix, the release checklist | 3 |
| any time | this PR | This report (one file) | 1 |
| any time | #74 | Items 27, 28 and 30: domain options, backup policy, the 12 clarification items (three documents) | 2 |
| any time | #75 | Deploy day plan: the first test deployment and live OneDrive test, step by step | 1 |

- **Target branch.** All PRs target #68's branch (`claude/determined-carson-64dvid`), so #68 becomes the complete release candidate. Nothing goes to `main` until the live tests pass.
- **Why the PRs list extra commits.** They come from our fork, and GitHub only accepts a base branch from this repository. So each PR also lists the commits of the PRs under it. After the earlier PR is merged, GitHub shows only the PR's own commits.
- **Checked together.** #70, #71 and #72 merge together without conflicts. The full test suite passes on the combined result (334 pass, 0 fail, 2 skipped), and the build succeeds.

## 2. What we have done

### Your plan, steps 2–5

| Step | Status |
|---|---|
| 2. Private test deployment on Cloudflare from GitHub Actions | **Ready (#69).** `deploy-test.yml` deploys the Worker, the D1 database and the R2 bucket on every push to `deploy/test`. It also applies the migrations. Waiting for the Cloudflare account and the secrets. |
| 3. Real OneDrive job | **Code ready (#70).** Fixed: duplicate copies after a retry, an error status that never cleared, and saves that waited for OneDrive. Waiting for the test site and the folder. |
| 4. Email from bsg@visionaps.com | **Code ready (#70).** Fixed: two ways a message could be sent twice, missing assignment emails for tests that start later, and one failed recipient stopping the rest. `EMAIL-SETUP.md` is updated. Waiting for the Microsoft 365 setup. |
| 5. Domain and backups | **Backups ready (#69):** scripts for the database and files, and a restore drill whose restored copy matched the original. **Domain:** after the pilot; options to follow (section 4). |

### Review of #68

- `REVIEW-PR68-2026-11-27.md` (in #69) lists 22 findings. Each one was checked against the code.
- **Fixed in #70, each with a test:**
  - OneDrive: O1, O2, O3, O4, O6, O7, O9, and part of O8.
  - Email: E3, E4, E5, E6, E8, E9.
  - Documentation: E1 and E2.
- **Still open:**
  - O5 and D1: decisions, see section 3.
  - O10: checks that only the real Microsoft services can prove; we will run them during the live test.
  - E7 and E10: low priority.
- **End-to-end walk** (`E2E-WALK-2026-11-27.md`, in #69): one job through its whole life, with 7 findings. They are small and not fixed yet; finding 7 needs a decision (section 3).

### Your answers A–I

- **#64–#67.** Every commit is inside #68 at `766bc65`; we checked commit by commit. They can be closed as superseded.
- **#63.** Close as cancelled (SharePoint is no longer planned).
- **#58.** Not in #68. It is carried into #71; close #58 when #71 is merged.
- **Branches.**
  - `claude/happy-turing-aylxbq`: its `RELEASE-CHECKLIST.md` is carried into #71, with 28 Nov updates. Its upgrade-test files are already in #68.
  - `claude/dreamy-noether-5f2x8z`: exhibition posters, no app code. It is not part of the release and may contain personal names; please move or delete it.
  - `claude/relaxed-volta-nq379r` and `claude/festive-mendel-8ju3oi`: directions not taken; not part of the release.
- **A6, no personal identity.** Done in #71:
  - the administrator record now shows as "VAPS Administrator";
  - access messages and docs use role names;
  - the GitHub Pages address is no longer hard-coded;
  - a screenshot showing a personal name is removed.
- **A6, git history.** 79 commits are authored with a personal email address. We have not rewritten history: that needs your approval and force pushes. Making the repository private limits who can see it.
- **Item 16, R2 and OneDrive.** R2 stays technically required. It is the app's own copy of every file, used for:
  - permission-checked downloads;
  - the source of each OneDrive copy, so a failed copy can be retried;
  - keeping the app working when Microsoft 365 is down;
  - backups.

  OneDrive can be the official business location, with R2 as the working copy. For production we recommend a dedicated VAPS service account as the connected OneDrive account, not a person's account. If a person's account is removed, the files and the connection go with it. The pilot can use the pilot account.
- **Item 29.** Done in #72:
  - Approval is internal.
  - The coordinator then records the day the report reached the client.
  - Only then does the client view say "issued", and only then is the client email sent.
  - The client's approval can only be recorded after that.
- **Items 19–20, client access.** New work, after the pilot starts. The pilot runs with client notifications off.
- **Item 24, administrator transfer.** Needs a code change, because MA001 is fixed in the code today. Planned after the pilot starts.
- **Items 27, 28, 30.** Done in #74: domain options, backup policy, and the 12 clarification items.

## 3. What we need from you and VAPS

### Blocking the 1 December test deployment

1. **Collaborator access for `RawandAqel`** (write access). We will then:
   - open #69–#72 again from branches in this repository;
   - close the fork PRs.
2. **Cloudflare account (VAPS).**
   - The account is on bsg@visionaps.com, with the company payment method.
   - Turn on Workers Paid (from $5 per month) and R2.
   - Invite a member from our side instead of sharing the password; we will send the address to you separately.
   - The token steps are in `DEPLOY-CLOUDFLARE.md` (#69).
3. **The two GitHub Actions secrets**, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - On a personal-account repository, collaborators cannot open the repository settings. So either you add them, or the authorised person types them in on your account.
   - The alternative is moving the repository to a VAPS GitHub organisation, which also puts final ownership with VAPS.
   - Please tell us which you prefer.
4. **OneDrive parent folder.**
   - It must be a folder in the pilot account's **own** OneDrive. The app uses the delegated permission `Files.ReadWrite`, which reaches only the signed-in account's own files, not a folder shared by someone else.
   - Please enter the link yourself. It must not appear in GitHub, documents or chat.
5. **App registration "Workflow VAPS OneDrive Pilot".** In Entra, please confirm:
   - "Allow public client flows" is Yes.
   - Delegated Microsoft Graph permissions are only `Files.ReadWrite`, `User.Read` and `offline_access`: not `Files.ReadWrite.All`, and no client secret.
   - User consent is allowed for the pilot account, or an admin has granted consent.
6. **Cloudflare Access on the test site** (item 23). Only the pilot accounts may sign in.
7. **Delete the old ChatGPT Sites deployment.** That means the site, its records, its settings and its `ADMIN_SETUP_TOKEN` secret. We have no access to it. The new site starts with a clean database.

### Needed for the email test (likely after 1 December; does not block the pilot)

8. **Microsoft 365 admin.**
   - Follow `EMAIL-SETUP.md` section 1: the mail app registration and a send-only scope for bsg@.
   - After the scope is granted, wait up to 2 hours for Microsoft to apply it.
   - Confirm that bsg@'s sign-in name is exactly bsg@visionaps.com.

   Staff notifications stay off until this test passes.

### Before making the repository private: please keep this order

1. You add `RawandAqel` as a collaborator.
2. We open the PRs again from branches in this repository.
3. We close the fork PRs and remove our fork.
4. You make the repository private.

The order matters for two reasons:

- GitHub keeps public forks public when the original goes private. Ours is the only fork.
- On GitHub Free, Pages only works on public repositories. Going private switches off the public demo unless the account is on GitHub Pro.

### Decisions for VAPS

| Item | Question | Our recommendation |
|---|---|---|
| O5 | When the OneDrive copy is switched on, should files uploaded earlier be copied too? | Decide before real files are uploaded. With the new, empty database it does not affect the pilot. |
| D1 | The deployment check (`/api/deployment`) needs no sign-in. | Fine behind Cloudflare Access on the test site. On the live site, require MA001 or remove it. |
| Walk finding 7 | By default only one team lead can view and download lab workbooks. So the QC reviewer and the Chemistry team lead are refused workbooks they review. | Give view and download to the team leads and the QC reviewer by default. |
| #72 | Additional work can still be added after the client's approval is recorded. If so, the revised report counts as issued on its approval day, with no issue step and no client email. | Rare. Either accept it, or refuse additional work after the client's approval. |
| Production OneDrive account | Should official files live in a person's OneDrive? | No. Use a dedicated VAPS service account for production. |

## 4. Next steps

| When | Who | What |
|---|---|---|
| Now | Owner / VAPS | Section 3, items 1–7 |
| Done (#74) | Us | Write-ups: domain options (item 27), backup policy with cost and recovery procedure (item 28), and the 12 clarification items (item 30), each with a recommendation and whether it blocks the pilot, security or launch |
| When access is given | Us | Move #69–#72 into this repository; you review and merge in the order in section 1 |
| When Cloudflare and the secrets are in place | Us | First deployment to `deploy/test`; one-time administrator setup; basic checks on the test site. Step by step in #75 |
| Then | Us, with the pilot account | Live OneDrive test, including the O10 checks |
| After the Microsoft 365 email setup | Us | Live email test; then staff notifications are switched on |
| Early December | VAPS | Controlled staff pilot, with client notifications off |
| After the pilot starts | Us | Client access (items 19–20), administrator transfer (item 24), domain (item 27) |

**Main risk.** If the Cloudflare account and the secrets are not ready by about 30 November, the 1 December test deployment slips. Email from bsg@ will probably finish after 1 December. That does not block the pilot, because notifications stay off until it passes.
