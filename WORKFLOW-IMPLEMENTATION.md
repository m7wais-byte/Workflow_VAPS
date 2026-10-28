# VAPS workflow implementation

## Implemented

Settings has five dedicated, addressable categories: Company, Clients, Employees, Authorization, and Departments & Positions. Central employee and option IDs preserve relationships through edits and deactivation. Existing client codes and job numbers remain intact. Settings permissions are checked at mutation boundaries as well as in the interface.

The job workspace now separates overview, scope, sampling, sampling reports, physical handover, laboratory work, final reporting, and history. Initial requests remain recorded; additional scope has a reason and history. Validation is generated per sample using the supplied Bottomhole, Wellhead, and Separator sequences. Reservoir values must be entered rather than fabricated.

BVT and Chemical work can run in parallel. Weekly views support multi-day and cross-week assignments, individual dashboards, workbooks, corrections, and completed-work filtering. Sampling reports have named checking and approval stages with version snapshots. Physical dispatch and receipt are separate records. Final reports collect completed work, require an attached document, and retain earlier approved versions when additional work reopens a job.

## Responsibilities

Duties are assigned to employee IDs in Settings → Authorization → Responsibilities (`vaps-responsibilities-v1`). Defaults apply only at first setup or migration; a cleared duty stays empty and blocks its step. A duty never grants a permission; both must pass.

- Scope selection and sampling approval: Salim (SALIM). Job creation remains the `createJob` permission.
- PVT Supervisor: Wilfred (WILFRED) — supervisory overview of PVT work. Final report approval: Wilfred.
- PVT Team Lead: Ahmed Al Shereiqi (SHEREIQI) — assigns PVT tests, reviews workbooks. Also final report preparation.
- Chemical Team Lead: Al Yaqdhan (BAHRI) — assigns chemical tests, reviews workbooks.
- QC review: not configured by default; no QC identity is assumed.
- Drivers: Ali (ALI) and Humaid Al Habsi (HUMAID). There is no shared Driver permission profile; Humaid has job details access only, and handover actions follow the job's driver assignment.
- Assigned active employees: execution and workbook submission, subject to existing area permissions.

The laboratory stream formerly stored as "BVT" is read as "PVT". Samples are held in a bottle (inventory type + serial) or a glass container (`containerType`, `containerId`).

## Data preservation and storage

The operations structure is additive to existing jobs. Existing IDs, assignments, requested tests, historical lab plans and report records are retained. Opening an old job does not fabricate approval, checking or physical receipt evidence. Earlier report versions and submitted workbook metadata are retained. A stale revision is rejected rather than overwriting newer work.

Settings and job metadata use the existing browser persistence patterns. Workbook bytes use IndexedDB with versioned metadata, a 20 MB per-file limit, and format validation. Saving metadata does not imply that files are synchronized to another browser. Clearing browser data removes locally stored records/files; this is not a cloud backup system.

## Earlier implementation verification

- Production build passed (with a bundle-size warning).
- Application TypeScript check passed with tsconfig.settings-check.json; the unrelated copied project in tmp is excluded.
- 43 automated tests passed; one environment-dependent integration test was skipped, including settings, permissions, workflow transitions, validation sequences, report versions, stale evidence, added scope and historical evidence safeguards.
- Model tests exercise the complete multi-sample, parallel-stream path through final approval and reopening for additional work.
- Browser checks exercised workbook upload, persistence after refresh, download and completion propagation to the employee dashboard. The disposable QA job and its stored file were removed afterward; original jobs were retained.
- Browser layout checks at 1366x768, 1920x1080, 768x1024 and 390x844 found no document-wide horizontal overflow in the checked activity view. Earlier Settings checks covered the category dashboard and contained authorization-table scrolling.
- Settings direct links, refresh and Back were checked. Workflow deep links restore the selected job/activity.
- PDF export is implemented; the final manual browser pass did not validate every exported PDF layout.

## Remaining red clarification items

These are explicitly displayed as Needs clarification in the application, rather than represented as approved policy:

1. Who selects and signs off the initial request before sampling.
2. Sampling preparer/checker eligibility and independence rules.
3. Whether lab execution must wait for sampling approval and/or physical receipt.
4. Which validation steps are mandatory and whether steps may be omitted.
5. Validation sequences for sampling methods other than Bottomhole, Wellhead and Separator.
6. BV meaning and its relationship to historical PV entries.
7. Workbook reviewer ownership and whether independent QC is required.
8. Whether final reporting needs an independent reviewer in addition to Ahmed and Wilfred.
9. Authority for additional scope; currently requests are recorded and Salem confirms lab scope.
10. Partial shipment and receipt rules; current handover records all job bottles together.
11. Shared execution rules; each activity currently has one accountable employee.
12. How to reconcile missing evidence in legacy records without inventing history.

## Infrastructure limits

The role selector is explicitly a demonstration identity selector, not secure authentication. Client-side checks cannot protect data against someone who controls the browser. Secure accounts, server-side authorization for operational data, multi-device synchronization and durable shared file storage require backend infrastructure. The existing shared-summary API is separate; its environment-dependent integration test was not run. No new independent QC gate or unsupported business rule is claimed.


## Review completed on 28 October 2026

The existing workflow implementation was reviewed and retained. This pass fixed evidence and queue inconsistencies rather than replacing the project or migrating user records:

- A checker cannot forward sampling evidence changed since submission; a new draft/review is required. Final drafts similarly cannot silently substitute changed evidence.
- Repeated Validation requested as additional work gets distinct activity IDs, preserving every original step and workbook.
- Re-dispatch cannot overwrite the original dispatch record. The obsolete, disabled startup reset branch was removed entirely.
- Original scope cannot be changed through the older job editor after operations have begun; changes are directed to the reasoned additional-work process.
- Personal queues show actionable sampling, handover and reporting milestones. Chemical planning goes to Al-Yaqzan independently of BVT planning. Report corrections follow the recorded preparer.
- The job overview highlights the active stage, uses a horizontal eight-stage layout on wide desktops and collapses on smaller screens. Unknown ownership is displayed as unrecorded, not as completed work.
- The reporting collection explicitly explains browser-local file retention and lack of cross-device synchronization. Scope request reasons now participate in unsaved-edit protection.

No persisted jobs, bottles, reports, employees, or assignments were edited or migrated during this pass. Existing additive operations records remain compatible. Existing local records were opened read-only in the browser.

Current verification: TypeScript passed; 47 automated tests passed and one environment-dependent shared-summary API test was skipped. Added regression coverage exercises stale checked evidence, repeated Validation, role-specific actionable queues, duplicate dispatch rejection, and the full additional-work cycle through a new Wilfred-approved report while retaining the original approved revision. The production build passes with the existing large-bundle warning.

Browser checks covered the existing job overview at 1366×768, 1920×1080, 768×1024 and 390×844, including responsive milestone layout and contained navigation scrolling. No document-wide horizontal overflow was observed. The same job and deep link survived refresh. This pass did not repeat every workflow transition or file upload through the browser; those transitions were exercised by model tests. The earlier browser/file checks above are historical verification, not claims of a new full browser run. PDF output and the external shared-summary integration were not reverified.

The 13 clarification items listed above remain visible in context and in the administrator review list. Browser-local permissions are functional workflow restrictions, not secure server authorization. Durable shared storage and authenticated multi-user enforcement remain infrastructure limitations.


## Prompt 1 — Jobs (28 October 2026)

Builds on Step 0. Existing records are not migrated; new fields are additive (`samplingInstructions`, `samplingTeamIds`, `operations.labScopes`).

- **Job register**: Job ID, client · field/well, current stage, next-action owner, status · due date, and a specific action button (e.g. Send to Sampling, Release lab scope, Continue draft). Filters: Needs my action, Active, Drafts, Completed, All, plus stage and search. Create Job appears only with `createJob`; other users see no creation instructions.
- **Job creation** in five groups: client & location; job ID & dates; sampling type & sampling scope; sampling assignment; sampling instructions. Laboratory test checkboxes were removed from creation; earlier requests stay visible as “Initial laboratory request (reference only)”. Employees are listed with their position, so Ahmed Al Husseini (sampling) and Ahmed Al Shereiqi (PVT Team Lead) are distinct. One accountable sampling employee plus optional supporting employees; nobody is assigned automatically.
- **Save Draft / Send to Sampling**: a draft needs only a client and reserves the job ID. Sending validates the required fields, then shows a review (job, instructions, recipients, driver, sign-off note) before confirmation. The dispatch command itself enforces `createJob`, instructions, active assignees with sampling access and an active driver, using settings re-read at the moment of confirmation. No email is sent.
- **Job numbering**: the next sequence never falls behind an ID already recorded this year (`app/job-numbering.ts`); a save is refused if the ID already exists in storage.
- **Draft access**: drafts are visible only to `createJob` holders, their author and the administrator, in lists and direct links (`#workflow/…`, `#new-job/…`).
- **Job detail page**: a current-step card and a seven-stage summary — Job creation → Sampling → Sampling review & report approval → Laboratory scope → Laboratory work → QC → Final reporting. Sections: Overview (job information, sampling instructions & assignment), Samples & containers, Sampling report, Laboratory scope, Sample handover, Lab work, Final report, History.
- **Laboratory scope per sample** (after sampling-report approval, scope selector only): destination PVT / Chemical / Both per sample, checklists from the configurable test routing, explicit destinations for unclassified tests, per-sample notes, explicit exclusion with a reason. Release creates linked PVT and Chemical work items routed to the configured PVT and Chemical Team Leads. Revisions are add-only and flagged when released work is removed; earlier versions are kept unchanged.
- **Test routing** (Settings → Authorization): each catalog test is PVT, Chemical, Both, or Unclassified (the default for every test). Each released version stores the routing in force; later settings changes do not reroute released work.
- **Scope PDF**: generated from the stored version only. Drafts are marked DRAFT and show no approval; released versions show the actual release by name and time.
- **QC gate**: for jobs scoped per sample, final submission and approval are blocked because QC is required and not implemented yet. Jobs scoped in the earlier workflow keep their recorded path and completed history.

Unchanged by this step: Sampling, PVT Lab and Dashboard layouts; legacy sampling-report approval; physical receipt ownership; QC implementation; email.

Verification: TypeScript and lint passed; 73 automated tests passed and one environment-dependent shared-summary API test was skipped (including 10 new Jobs tests). The production build passed. A Playwright browser run on the development server covered draft save/reopen, send validation and review, assignment visibility for both sampling employees, blocked draft links, scope gating, a PVT/Both/unclassified release, draft and approved PDF downloads, revision blocking, the QC gate, team-lead queues, and no horizontal overflow at 390 px on the overview, register and form.

Limitations: the earlier `scope` command remains in the model for additional-work confirmation and existing records; the new interface no longer offers original-request confirmation. Supporting sampling employees can view and enter sampling data, but handover and report ownership stay with the accountable employee. All data remains browser-local.

## Prompt 2 — Sampling (29 October 2026)

Builds on Step 0 and Jobs (`c51e6b9`). New records are additive (`operations.samplingData`). Older records are not migrated.

- **Sequence:** the accountable sampling employee submits the sampling data. The configured sampling approver (`samplingApproval`, Salim by default) approves it or returns it with comments. The accountable employee then generates the sampling report from the approved data and sends it directly to the approver, with no checker step. The approver approves the report separately. Only report approval (`samplingApproved`) unlocks laboratory scope and handover. Data approval alone unlocks nothing.
- **Responsibilities:** only the accountable employee (`assignedEngineerId`) can submit data, prepare the report and resubmit. Supporting employees can view, enter and save data. Drivers keep transport-only access. Every review and approval checks the configured duty plus the `sampling` permission at action time.
- **Sampling queue** (Sampling → My sampling work): jobs assigned to me and reviews waiting for me. Each row shows the job, client, field/well, sampling type, accountable and supporting employees, sent and due dates, status, next action and a direct action button. "New assignment", "Returned" and "New for review" indicators come from the shared records and are marked as seen per employee in this browser, so each event is flagged once. The Sampling menu item shows a count. A read-only team overview is available to authorised users. Drafts never appear.
- **Guided workspace:** four steps — Preparation, Sample records & data, Review & submit, Review status & report — labelled for transfer types where relevant. Each step shows what is required, its status and the next action. Salim's instructions are shown on every step. Lab test lists, including reference requests, are kept out of sampling screens.
- **Submission checks:** submission requires completed preparation, a container for every sample (`containerComplete`; glass containers need only their ID) and every data sheet marked complete. The same checks run in the model.
- **Consolidated review** (job page → Sampling review & report): built from the submitted snapshot. It shows a status timeline, missing information, job details, instructions, assignments, preparation and coordination, samples and containers, sampling data per sample, events, attachments, handover, the submission note and the submission history.
- **Return for correction:** the approver must add at least one comment naming a section or sample, plus a correction explanation. The accountable employee sees the comments with links to the right section. Supporting employees can help correct. Earlier submissions and comments are kept.
- **Corrections after approval:** approved data is read-only. Correcting it requires an explicit reopen with a reason, by the accountable employee or the approver. A reopen invalidates any pending report. If the report was already approved, a new report version is required and the approved version is kept. A reopen is refused after handover or scope release (needs clarification).
- **Legacy approval checks:** every hardcoded `"SALIM"` check in `page.tsx` now uses the configured approver plus the `sampling` permission. A recorded approval displays its actual signer and timestamp. Changing the configured approver moves pending work only and never rewrites a past signature.
- **Older reports:** reports already in checking keep their recorded preparer → checker → approver path.
- **Confirmations:** each submission or approval shows one message: what happened, who acts next and the new status. The duplicate notice in the job editor (the same cause as the job-form duplicate) was removed.

Verification: TypeScript and lint passed. 80 automated tests passed and 1 environment-dependent test was skipped; 7 of them are new sampling tests. Existing fixtures were updated to the new sequence; two tests keep an explicit "in-flight older report" fixture for the checker path. Production build passed. A Playwright run on the development server covered:
- Salim sending a job; Mohsin and Ahmed Al Husseini seeing it with indicators.
- A supporting employee's draft surviving reload, and that employee being unable to submit.
- Submission blocked while a data sheet was incomplete; one confirmation per action.
- Ali and Humaid unable to review.
- Salim's consolidated review, a targeted return, the comment links and the resubmission.
- Data approval leaving laboratory scope locked; report generation, the DRAFT preview, report submission and approval unlocking laboratory scope.
- Demo jobs opening cleanly; moving the approver to Wilfred moving pending review without changing recorded approvals.
- No horizontal overflow at 390 px.

Not verified in the browser: preparation checklists and full data sheets were seeded into storage rather than typed field by field; those forms are unchanged existing code. Exported PDF layouts were not re-checked.

## Prompt 3 — PVT Lab (30 October 2026)

Builds on Step 0, Jobs (`c51e6b9`) and Sampling (`3d5db3c`). New fields are additive: activity `history` and `progressNotes`, file-version review stamps, the `labReceipt` duty and the `vaps-lab-teams-v1` setting.

- **Per-test sequence:** the assigned employee submits a workbook attachment. The stream's team lead (Ahmed Al Shereiqi for PVT, Al Yaqdhan Al Bahri for Chemical, by configured duty) approves it into QC or returns it with a target (sheet, section or attachment reference) and a specific comment. The configured QC reviewer then approves the exact version or returns it to the team lead. The team lead returns it to the employee, and the corrected version passes team-lead review again. Employees can no longer mark their own work complete: "Completed" now means QC approved.
- **QC gate:** only workbooks the team lead has approved can be QC reviewed. If the QC duty is unassigned, inactive or lacks the laboratory permission, approval is refused and a configuration message is shown. The work keeps waiting and final reporting stays blocked. QC approval records the reviewer, the time and the version. Team-lead approval, QC approval and final approval are separate records.
- **Teams:** PVT and Chemical team lists live in Settings → Authorization and start empty. A team lead can assign only active members of their own team who also have laboratory permission; membership grants no permission. Reassignment is logged with the previous owner and keeps progress and files. Assignments that no longer match the team lists are flagged, never changed.
- **Laboratory receipt:** a new configurable duty, initially unassigned. Only its active holder with laboratory permission can confirm "samples/containers received", and the recipient and time are recorded. While it is unassigned, receipt is blocked with an explanation. Historical receipts are unchanged. Only the job's assigned engineer or driver can record samples as sent.
- **PVT Lab page:**
  - My tests, with New assignment and Returned indicators (one per event), linking directly to the test.
  - Team-lead queues for the lead's own section: Awaiting assignment, Assigned / in progress, Awaiting workbook review, Returned for correction, Awaiting QC, Approved / completed. The view opens on the most urgent queue and shows job progress.
  - QC queue for the QC reviewer.
  - Read-only supervisory overview for Wilfred, the scope selector and the administrator, with no team-lead actions.
  - The PVT Lab menu item shows a count.
- **Test workspace:** shows the test, sample and container (bottle or glass), released scope version, scope notes, team-lead instructions, planned dates, what to submit (the workbook attachment; no criteria are invented), status and next action, versions with review stamps, and the full review history. Progress notes are kept separate from the team lead's instructions.
- **Final reporting:** required tests are shown in six states (Not assigned, In progress, Under team-lead review, Returned, Awaiting QC, QC approved), each with its QC-approved version. Submission and approval of the final laboratory report stay blocked until every required test is QC approved. Ahmed prepares the report (reporting duty) and Wilfred approves it (finalApproval duty).
- **Historical work:** work completed before QC existed is shown as "QC approved / completed before QC existed" and is never asked for new approvals.
- **Sampling reopen:** reopening sampling data after handover or scope release stays blocked, with the existing explanation.
- **Demo data:** uses a fictional demo-only configuration (QC reviewer Ahad, laboratory receipt Ahmed Al Shereiqi, PVT team Nasser/Ahad/Ranjith, Chemical team Yaqeen). It is passed to the model and never saved to Settings, so real QC, receipt and team settings stay unassigned.

Verification: TypeScript and lint passed. 86 automated tests passed and 1 environment-dependent test was skipped; 6 of them are new laboratory tests. The production build passed. A Playwright run on the development server, using the real interface, covered:
- The administrator setting teams, laboratory receipt, test routing and (later) QC in Settings.
- Salim releasing a scope with PVT, Chemical and Both, including a glass container.
- Each team lead seeing only their own section.
- Assignments, Nasser's New badge, progress saved and reopened, and real file uploads.
- Return with a target and comment, then resubmission.
- Team-lead approval to QC, QC blocked while unassigned, then QC approval of version 2.
- A QC return going to the team lead, then back to the employee, then resubmission.
- Receipt blocked for Salim and confirmed by the configured holder.
- Final reporting blocked and then completed by Ahmed, with Wilfred's separate approval.
- Wilfred's overview showing no lead actions; the demo jobs; no horizontal overflow at 390 px.

Setup done directly in storage: the sampling preparation checklist and data sheets were seeded before submission, as in the Sampling step. Everything from submission onward used the interface. Not checked: exported PDF layouts and phone-width screenshots of every lab panel; only overflow was measured.

## Prompt 4 — Dashboard (30 October 2026)

The Dashboard is the starting point for every employee. It is built from the same workflow states as Jobs, Sampling and PVT Lab: `app/work-items.ts` derives items from `samplingStatus`, `labStatus` and the handover and report records. There is no separate status engine.

- **Order:** My actions → Waiting on others → Blocked by missing settings → Laboratory progress (read-only, leads and supervisor) → My upcoming work / weekly plan (optional) → Administrator clarifications → Team and company overview (optional).
- **Action cards** show a plain-language action, job and client, sample and container, test, status, due date (marked overdue in text), who assigned, returned, submitted or approved it, the correction comment, and one button that opens the exact page, step, sample or test. Order: returned work, then overdue, reviews, new assignments, other tasks.
- **Counts:** the count buttons (All, Returned, Overdue, Reviews, New, Tasks) filter the same list, so counts and visible cards always agree. There is also a search box.
- **Separation:** submitted work moves to "Waiting on others" (with the person it waits on and since when) and never appears as an action. Each duty a person holds adds its own items, with duplicates removed by a stable key.
- **Role coverage:**
  - Job drafts appear for job creators only.
  - Sampling: preparation and data for the team; supporting employees are labelled and cannot submit; returned data shows the comments.
  - Salim: data review, report preparation and approval, scope release, additional-work confirmation.
  - Driver: handover. Laboratory receipt holder: receipt.
  - Team leads: assignment per section, workbook review, QC returns. Employees: tests and returned workbooks. QC reviewer: exact versions.
  - Final reports: preparation (reporting duty) and approval (finalApproval duty). Wilfred gets no team-lead actions.
- **Notifications:** New markers reuse the Sampling and PVT Lab event keys, so the same marker is shared and never duplicated. Opening a task clears only its New marker; the task stays until it is actually done.
- **Missing settings:** unconfigured teams, laboratory receipt, QC review or sampling approval appear as blocked work. Administrators get "Open the setting" links to the exact Settings → Authorization panel; other employees are told an administrator must configure it. Empty states distinguish: no work, waiting on review, no filter matches, and blocked by settings.
- **Shared code:** the Sampling and PVT Lab pages now use the same event and step helpers from `work-items.ts`. The weekly plan no longer shows a second action list.
- **Labelling:** the trial is labelled as browser-local, with no secure sign-in and no cross-device synchronization.
- **Printable documents:** fixed unreadable header cells, words split mid-word, headings overlapping tables, raw timestamps and IDs, and separate unit rows. Direct-to-approver sampling reports now say "Checked by: not applicable" instead of "Pending". Recorded values and sign-off rules are unchanged.

Verification: TypeScript and lint passed. 88 automated tests passed and 1 environment-dependent test was skipped; 2 of them are new Dashboard journey tests covering every handoff, returns, QC routing, multi-duty users and ordering. The production build passed. A Playwright run used Dashboard buttons for every step from job creation to Wilfred's final approval:
- Draft visibility.
- New badge cleared on opening while the task stayed.
- A supporting employee's label.
- Waiting versus actionable work.
- A sampling return with its comment and the link back to the data step.
- Driver handover and configured receipt.
- PVT and Chemical assignment, workbook review and QC.
- The blocked-QC message for staff, and the settings link for the administrator.
- Empty dashboards after completion.

Desktop and phone screenshots were inspected visually. Sampling-sheet completion was seeded into storage as in earlier steps; not every sampling input field was filled through the interface.

Remaining limitations: all data, files and seen markers are browser-local; there is no secure authentication, no server-side authorization and no multi-device synchronization. Before operational use an administrator must configure PVT and Chemical teams, laboratory receipt and QC review, and confirm test routing.

### Email integration handoff (not implemented)
- **Confirmed trigger:** a job is sent to Sampling (the `dispatch` command succeeds).
- **Recipients:** the accountable and supporting sampling employees on the job. CC: laboratory leaders; exact membership is still to be confirmed (for example the PVT and Chemical Team Leads and/or the PVT Supervisor).
- **Missing before build:** employee email addresses (the directory field is mostly empty), the sender identity and address, and delivery infrastructure (a server-side mail service or API, since the app is browser-only today).
- **Duplicates and failures:** send once per dispatch event, keyed by job ID plus `dispatchedAt` (a retry must not resend). Record a delivery status (queued, sent, failed) on the job history. Retry failures with back-off and show failed deliveries to the job creator. Sending never blocks or rolls back the dispatch.
- **Proposals only (need confirmation):** sampling data returned; sampling report awaiting approval; laboratory scope released (to team leads); test assigned; workbook returned; QC return to a team lead; final report awaiting approval.

## Review build: sampling forms verified through the interface (28 October 2026)

The preparation checklist and sample data sheets, previously seeded in storage for tests, were exercised field by field through the real interface (Playwright on the development server, fresh browser storage):
- **Preparation (Wellhead, 2 samples):** empty sampling point type, sample kit and cylinders each showed their validation message. Contact notes, tools required/availability, sampling point type and size, and the sample kit were entered. Completing preparation with one task open was refused with both reasons.
  - Sample 1.01: bottle from inventory (PDS + serial).
  - Sample 1.02: glass container with only its ID; the screen explains no bottle type or serial is needed.
  - Save Draft and a page reload kept the tasks, notes, bottle serial and glass ID. Completing preparation moved to step 2.
- **Data sheets:** marking an empty sheet complete listed the identification, shipping, matched/transfer and production gaps. The glass sample was never asked for bottle fields. Identification fields, WHP/WHT with units, choke size, remarks and "Set blank condition fields to N/A" were entered; Save Draft and a reload kept them all.
  - Ahmed Al Husseini (supporting) entered and saved sample 1.02, could not submit, and Mohsin saw his entries.
  - Humaid could not open the sampling editor.
  - Both samples were marked complete, the Review & submit checklist was all ✓, and the submission succeeded. Salim's consolidated review showed the typed values, both containers and the coordination details.

Defects found and fixed:
- After submission, Save Draft showed "draft saved" although the lock had refused the save. `updateCurrentJob` now reports whether it saved, and draft messages appear only after a real save.
- Submitted or approved sampling data stayed editable in the form. Steps 1–2 are now read-only (disabled fields and buttons) with an explanation.
- Adding or removing a sequence-of-events entry on locked data showed an unsaved change on screen. It now reverts and keeps the typed text.
- The non-cased-hole data-sheet error list now has `role="alert"` for screen readers.

The empty-looking "Samples: 2" area seen in earlier full-page screenshots is not a defect: it holds the "Source preparation and logistics" note above the sticky tracking bar.

The review walkthrough used browser-local settings (teams, QC, receipt) set through the Settings interface in a disposable browser profile. Nothing was written to repository defaults, and the demo's fictional configuration was not saved.
