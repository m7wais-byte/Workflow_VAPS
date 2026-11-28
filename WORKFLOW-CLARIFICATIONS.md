# The 12 "Needs clarification" items (item 30)

Prepared by Rawand (GitHub: RawandAqel), 28 Nov 2026, for VAPS approval.

The list is the "Remaining red clarification items" section of `WORKFLOW-IMPLEMENTATION.md`. For each item:
- what the code does today, checked in the code of #68 plus our PRs, with file references (line numbers are with #70 and #72 applied);
- our recommendation;
- whether it blocks the pilot, security or the production launch.

As you asked, nothing non-critical holds up the safe pilot.

## Summary

| # | Item | Blocks pilot | Blocks security | Blocks launch |
|---|---|---|---|---|
| 1 | Initial request sign-off | No | No | No |
| 2 | Sampling preparer / checker independence | No (setup rule) | No | **Yes**: add the independence check |
| 3 | Lab work vs sampling approval and receipt | No | No | **Yes**: close two gaps |
| 4 | Mandatory Validation steps | No | No | Only if VAPS names mandatory steps |
| 5 | Validation for other sampling types | No | No | No (sequences to be supplied) |
| 6 | PV terminology in older records | No | No | No (clean database) |
| 7 | Workbook review and QC | **Setup:** assign a QC reviewer and give the reviewers workbook access | No | **Yes**: add the independence check |
| 8 | Independent final report review | No (setup rule) | No | **Yes**: add the independence check |
| 9 | Authority for additional scope | No | No | No (confirm the rule) |
| 10 | Partial shipment and receipt | No | No | No: already closed in the code |
| 11 | Shared execution | No | No | No |
| 12 | Missing evidence in older records | No | No | No (clean database) |

**For the pilot, nothing needs new code.** It needs these setup rules, made in Settings before staff start:
- **QC:** assign the QC reviewer duty to someone who is not a team lead. Without it, every test stops at QC.
- **Backups on every job:** give each job a backup sampling employee, so the data review is not done by the person who entered the data.
- **Different people:** the sampling approver and the final approver must not also prepare reports.
- **Client approval:** give the Client approval duty to someone who also holds *Create job* (see "Also found").
- **Workbook access:** grant *View workbook* and *Download workbook* to both team leads and the QC reviewer (Settings → Authorization). By default only one team lead has them, so the reviewers would be refused the workbooks they must approve.

**None of the 12 is a security issue.** They are workflow and quality rules. Sign-in and permissions are enforced on the server either way.

**Before launch**, we will add the independence checks in 2, 7 and 8 and close the gaps in 3, in one PR, once VAPS confirms the recommendations.

## The items

### 1. Who selects and signs off the initial request before sampling
- **Today:**
  - The job coordinator (*Create job* permission) creates the job and sends it to Sampling, which records the name and time.
  - There is no separate sign-off; the send screen says no approval is needed.
  - Tests requested at creation are kept as a reference only and cannot be edited once work starts.
  - The real laboratory scope is set later by the scope selector (`app/operations-model.ts:353-368`).
- **Recommendation:** keep it. The recorded dispatch is the sign-off. VAPS confirms who holds *Create job*; by default that is one coordinator.
- **Blocks:** nothing.

### 2. Sampling preparer and checker: eligibility and independence
- **Today:**
  - Only the accountable sampling employee enters the data and prepares the report.
  - A backup sampling employee on the job confirms the data review. **If the job has no backup, the accountable employee confirms their own data** (`dataReviewers`, `app/operations-model.ts:113`).
  - The report then goes to the sampling approver.
  - Nothing prevents the approver from being the person who prepared it.
- **Recommendation:**
  - For the pilot, make it a setup rule: every job has a backup, and the sampling approver is never the accountable employee.
  - Before launch, enforce it: the data review needs someone other than the preparer, and an approver cannot approve a report they prepared.
- **Blocks:** launch.

### 3. Must laboratory work wait for sampling approval and/or physical receipt?
- **Today:**
  - The laboratory scope can only be released after the sampling report is approved (`app/operations-model.ts:513`), and the screen locks the scope until then.
  - There is no physical-receipt step: the handover step was removed (commit `9f0e2bf`).
  - **Two gaps:**
    - The older *add Validation* and *scope* commands create laboratory work without that check through the API, although the screens offer them only on older jobs (`app/operations-model.ts:427-462, 569-594`).
    - An approved sampling report can be revised after the scope is released. That withdraws its approval while laboratory work continues.
- **Recommendation:**
  - Keep the rule "an approved sampling report before laboratory scope", with no receipt gate.
  - Before launch, apply the same check to the two older commands.
  - Require the scope selector's agreement before an approved sampling report is revised after release, or block that revision.
- **Blocks:** launch.

### 4. Which Validation steps are mandatory; can steps be left out?
- **Today:**
  - The scope selector chooses Validation yes or no per sample.
  - Yes pre-fills the standard sequence, and steps can be unticked. At least one step is required.
  - The PVT team lead can add steps, or remove steps that have not started.
  - Restoration needs the reservoir pressure and temperature. Nothing is mandatory.
- **Recommendation:**
  - Keep this for the pilot.
  - The VAPS laboratory manager confirms whether any step must always be done (for example Opening Pressure). If so, we add the rule before launch.
- **Blocks:** launch only if VAPS names mandatory steps.

### 5. Validation sequences for other sampling types
- **Today:**
  - Standard sequences exist for Bottomhole, Wellhead and Separator.
  - For Open Hole (field or transfer), Station and Other, nothing is pre-filled, and the scope selector ticks the steps. This is allowed.
- **Recommendation:** VAPS supplies the standard sequence for each type, and we add them. Until then, ticking steps by hand is fine.
- **Blocks:** nothing.

### 6. PV terminology in older records
- **Today:**
  - The app uses "PV".
  - Older records with the stream name "BVT" are read as PVT and saved back as PVT the next time they are saved.
  - `WORKFLOW-IMPLEMENTATION.md` says older records are not rewritten, which is not accurate.
- **Recommendation:**
  - Close the item. The new deployment starts with a clean database, so there are no older records.
  - If VAPS imports old records later, decide then.
  - We will correct the document sentence.
- **Blocks:** nothing.

### 7. Workbook review ownership; is independent QC required?
- **Today:**
  - The stream's team lead reviews the workbook, then the QC reviewer. Only QC approval completes a test, so QC is in effect mandatory.
  - If no QC reviewer is assigned, every test stops at QC (`app/operations-model.ts:218, 723-734`).
  - **No independence check:** a team lead can assign a test to themselves and review it, and the QC reviewer could be the same person as the lead.
- **Recommendation:**
  - Keep QC mandatory, and assign a QC reviewer who is not a team lead before the pilot.
  - Before launch, add checks that nobody reviews or QC-approves a workbook they produced, and that the QC reviewer is not the lead who approved it.
  - For the pilot, grant *View workbook* and *Download workbook* to both team leads and the QC reviewer. Today only one team lead has them by default, so the others are refused workbooks they review (finding 7 of the end-to-end walk in #69). Before launch, make that the default.
- **Blocks:** the pilot setup (a QC reviewer, and workbook access for the reviewers), and launch.

### 8. Does final reporting need an independent reviewer?
- **Today:**
  - The reporting duty holder prepares the final report and is automatically its checker.
  - The final approver approves it. Nothing prevents one person from holding both duties (`app/operations-model.ts:745-776`).
- **Recommendation:**
  - Two different people (preparer and approver) is the rule. A third reviewer is not needed unless the VAPS quality system requires one.
  - Before launch, add a check that the approver cannot approve a report they prepared, and a warning in Settings when one person holds both duties.
- **Blocks:** launch.

### 9. Authority for additional scope
- **Today:**
  - Additional work is a revised laboratory scope released by the scope selector. It needs a reason, can only add work, is labelled "Additional work", and reopens an approved final report as a new version.
  - The PVT team lead can also add Validation steps through the Validation plan.
  - The older "request addition" route is no longer on any screen.
- **Recommendation:**
  - Confirm the scope selector as the authority for additional work, and confirm that the PVT team lead may add Validation steps (they are recorded).
  - Put the client's request reference in the reason.
- **Blocks:** nothing.

### 10. Partial shipment and receipt rules
- **Today:**
  - The handover step was removed (commit `9f0e2bf`), so no shipment or receipt is recorded.
  - This item is no longer shown in the app.
- **Recommendation:** close it. If VAPS later wants per-sample receipt tracking, that is a new feature.
- **Blocks:** nothing.

### 11. Shared execution
- **Today:**
  - Each activity has one accountable owner; only the owner records progress, and reassignment is logged.
  - The Validation steps of one sample can go to different engineers.
  - In sampling, backups view only, unless they are given edit access.
- **Recommendation:** keep one accountable owner, which keeps responsibility clear. Helpers are named in the notes. Revisit after pilot feedback.
- **Blocks:** nothing.

### 12. Missing evidence in older records
- **Today:**
  - Nothing is made up. Missing steps show as "not recorded (legacy)", and work done before QC existed shows as historical.
  - One exception: saving an older job tidies its laboratory progress and renames BVT (`app/job-save.ts:21-29`).
- **Recommendation:**
  - Close it for the pilot and launch, which start with a clean database.
  - If older records are imported later, import them read-only, without the save-time tidy-up.
- **Blocks:** nothing.

## Also found while checking

- **The list itself.** The code holds 11 items (`app/operations-model.ts:55-67`); item 10 left with the handover step. `WORKFLOW-IMPLEMENTATION.md` says 12 in the list and 13 further down. Several in-app texts no longer match the code (items 2, 3, 4 and 6), and the full list is visible only to MA001, through a hard-coded ID. Once VAPS decides, we will update the texts and the document.
- **Client approval duty.** The duty only decides who sees the task in *My work*. The commands themselves need *Create job* or the original dispatcher. If the duty is given to someone without *Create job*, nobody gets the task. So, for the pilot, give it to a coordinator; before launch, let the duty holder record it directly.
- **G-sheet.** It is optional in the code, while `WORKFLOW-IMPLEMENTATION.md` calls it mandatory. VAPS confirms which, and we align the other.
