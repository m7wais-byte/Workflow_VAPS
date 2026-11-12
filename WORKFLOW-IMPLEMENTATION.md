# VAPS workflow implementation

## Implemented

Settings has five dedicated, addressable categories: Company, Clients, Employees, Authorization, and Departments & Positions. Central employee and option IDs preserve relationships through edits and deactivation. Existing client codes and job numbers remain intact. Settings permissions are checked at mutation boundaries as well as in the interface.

The job workspace now separates overview, scope, sampling, sampling reports, physical handover, laboratory work, final reporting, and history. Initial requests remain recorded; additional scope has a reason and history. Validation is generated per sample using the supplied Bottomhole, Wellhead, and Separator sequences. Reservoir values must be entered rather than fabricated.

PVT and Chemical work can run in parallel. Weekly views support multi-day and cross-week assignments, individual dashboards, workbooks, corrections, and completed-work filtering. Sampling reports have named checking and approval stages with version snapshots. Physical dispatch and receipt are separate records. Final reports collect completed work, require an attached document, and retain earlier approved versions when additional work reopens a job.

## Responsibilities

Duties are assigned to employee IDs in Settings → Authorization → Responsibilities (`vaps-responsibilities-v1`). Defaults apply only at first setup or migration; a cleared duty stays empty and blocks its step. A duty never grants a permission; both must pass.

- Scope selection and sampling approval: Salim (SALIM). Job creation remains the `createJob` permission.
- PVT Supervisor: Wilfred (WILFRED) — supervisory overview of PVT work. Final report approval: Wilfred.
- PVT Team Lead: Ahmed Al Shereiqi (SHEREIQI) — assigns PVT tests, reviews workbooks. Also final report preparation.
- Chemical Team Lead: Al Yaqdhan (BAHRI) — assigns chemical tests, reviews workbooks.
- QC review: not configured by default; no QC identity is assumed.
- Drivers: Ali (ALI) and Humaid Al Habsi (HUMAID). There is no shared Driver permission profile; Humaid has job details access only, and handover actions follow the job's driver assignment.
- Assigned active employees: execution and workbook submission, subject to existing area permissions.

Older records that stored the laboratory stream under a former label are read as "PVT" without being rewritten. Samples are held in a bottle (inventory type + serial) or a glass container (`containerType`, `containerId`).

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
6. PV terminology in older records and how historical PV entries are reconciled.
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
- Personal queues show actionable sampling, handover and reporting milestones. Chemical planning goes to Al-Yaqzan independently of PVT planning. Report corrections follow the recorded preparer.
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


## Active-job numbering correction
The next annual sequence is the highest non-Trash job sequence plus one; an empty active year starts at 001. The old cached counter does not prevent reuse. Existing jobs are not renumbered. Reused display numbers receive distinct internal record keys, preserving old Trash records, shared-link identities and deep links. Restore refuses an active display-number collision without modifying records. Job creation displays its number in the top page header instead of the second form section.


## Usability pass — My work, Laboratory teams, alerts and added Validation (1 November 2026)

Business rules, duties, permissions, review stages, QC, report approvals, returns and version history are unchanged. Existing jobs, employee IDs, assignments, workbooks, reports and Settings are not migrated or rewritten.

- **Identity bar:** full name, configured position/department, PVT or Chemical team membership and configured duties. One selector, “Demo: view as employee”, changes only whose view is shown; work is still assigned inside a job. The Profile “Team inbox” and its second “Trial identity” selector are removed, and the retired team-handoff function now refuses any job that uses the current workflow, so it can never overwrite the assigned engineer or driver.
- **One work-item model** (`app/work-items.ts`) feeds My work, the Jobs “Needs my action” count, the Sampling queue, the Laboratory views, the weekly planning list and the navigation badges. The older `pendingActions` calculation is no longer used by the interface (it remains for existing tests; its PVT-only QC blocker no longer counts as an action for the Chemical lead or supervisor).
- **My work:** Do now (one row per task, with area tag PVT/Chemical/Sampling/QC/…, job ID, sample/container, test, status, one primary action), plus compact Coming up, Waiting on others, Blocked and My jobs views. Rows show the task’s own deadline (“Test due”) or, where a task has none, the “Job due” date, labelled. Overdue and due-today work comes first, then returned corrections and reviews; “New” only breaks ties. Tests whose planned start is later wait in Coming up (still openable, never blocked).
- **Coming up** lists real responsibilities that are not the employee’s turn yet: transport (driver), sampling review/approval, scope release, sample receipt, team-lead review, QC review, final report preparation and approval. None shows an approve/submit button before its prerequisites.
- **My jobs / company-wide lists:** My jobs contains only jobs with a responsibility of the selected employee. “All jobs”, “Active”, “Completed”, the Sampling team overview and the full sampling-report register require the existing `companyOverview` permission; job links remain openable with `jobDetails` so employees keep access to their own work.
- **Laboratory** (renamed from “PVT Lab”) has PVT and Chemical views. Each person opens on their own team (from duties, then current assignments, then team membership). Leads keep a separate queue selection per team. Inside a job, the Lab work tab opens on the viewer’s team with their assignments first, then unassigned work with a single “Assign to” control (normal schedule rules per activity, saved together), then the rest; other teams are one click away.
- **Scope and assignment alerts** (in-app) are derived from the stored scope records and activity history, so refresh never duplicates them. New/extended PVT scope goes to the configured PVT Team Lead, Chemical scope to the configured Chemical Team Lead; a “Both” sample reaches each lead once for their own linked work. Assignment alerts go to the assignee (grouped per job and team) and link to the task. Reading an alert only hides it. If the team lead is not configured, the scope is saved as Unassigned and an administrator sees a configuration blocker.
- **Add Validation** (Laboratory scope tab, configured scope selector): any job with sample records, at any stage and for any sampling type; choose samples/containers and activities from the full catalogue (Sample Transfer … Recombination). It creates additional, distinct PVT activities; completed work, submissions and approved report versions are kept, and a completed job shows “Additional work pending” with a new report revision required. The catalogue order is shown for guidance only; no activity blocks another.
- **Job workspace:** job ID at the top, “Your next action” for the selected employee and “Who is acting now” listing every parallel owner per team (replacing the single “Next action by”). The stage strip matches the tabs (Sample handover added; QC opens the QC review view). Opening a task shows it first as “Your task” with sample/container, instructions, required submission, files, test deadline and a handover line (“After you submit → … reviews your workbook”); the rest of the job is collapsed below. Back returns to the view the task was opened from, with its My work tab preserved.
- **Historical laboratory plans** are no longer in normal navigation; the administrator sees a read-only section only when pre-workflow jobs exist.
- **Demo setup:** loading the demo stores a labelled demo configuration (duties, PVT team Nasser/Ranjith, Chemical team Yaqeen, QC Ahad, receipt Ahmed Al Shereiqi, test routing) under `vaps-demo-setup-v1`, separate from Settings, with an on/off switch in the identity bar. Six demo jobs show PVT-only, Chemical-only and Both per-sample scope, new scope alerts, Validation added to a completed job, assigned work, team-lead review, a return, QC and completed work. Demo assignments always match the demo teams.

Limitations: data, alerts and read markers remain browser-local; no email is sent; physical custody/aliquot rules between PVT and Chemical are not modelled and do not block work.


## Laboratory scope per sample, Validation planning, custom and third-party tests (3 November 2026)

Sampling, approval authorities, QC, report approvals and history are unchanged. Additive fields only; existing IDs and records are not rewritten.

- **Per-sample scope order:** 1 Fluid type (Black Oil / Gas Condensate / Other, with description and notes for Other) → 2 Responsible team (PVT / Chemical / PVT and Chemical) → 3 Validation required? Yes/No → 4 Required tests → 5 Other tests. Collapsible sample sections show sample, container and a summary (fluid, team, Validation, test count, external count, Complete / Needs …). Reservoir pressure/temperature (units kept) and general notes sit in one panel above the samples.
- **Catalogue presentation** (`app/scope-catalogue.ts`): each test is shown once per fluid type; catalogue IDs (`Black Oil — DL`, …) remain the stored identity. Validation is never a test card. For Other, tests that exist for both fluids (Recombination, Sep Test) show one card with a method choice, without classifying the fluid. Changing fluid type never deletes selections; unlisted ones are flagged for review.
- **Team routing:** Settings classification is respected (a test routed to Chemical cannot go to PVT); unclassified tests default to the sample destination and can be routed per test. Settings are not changed.
- **Validation:** releasing Yes creates one planning item (`ScopeRecord.validationRequest`) for the configured PVT Team Lead, with no steps created or assigned. The lead chooses steps from the full catalogue (Sample Transfer … Recombination), optionally third-party per step, then assigns different steps to different engineers with the existing Assign-to control. Order is guidance only. Reopening reuses existing steps; untouched unselected steps are dropped, started ones kept. A Validation Recombination step next to a separately requested Recombination test needs explicit confirmation. Validation is available for every sample, including Chemical-only samples: it adds PVT responsibility for the Validation work only (planned by the PVT Team Lead) without changing the sample's team or its Chemical scope and assignments. It is not limited by fluid or sampling type. Jobs scoped in the earlier workflow request it per sample from the scope tab (`add-validation` with no steps). The separate bottom “Add Validation” panel is removed. Unplanned requests keep the scope milestone and final reporting open.
- **Other tests:** job-specific, stable IDs (`labscope:<sample>:<stream>:custom:<id>`), normal assignment/review/QC/history; never added to the catalogue.
- **Third-party execution** (per test, per custom test, per Validation step): provider, optional internal coordinator, expected return, notes. Bulk “Outsource tests…” sets several or all tests in the job, each keeping its own record. An outsourced test needs an accountable internal coordinator: it may stay unassigned in a draft; after release the responsible team lead gets an “Assign coordinator” task (an administrator blocker if no team lead is configured), dispatch is refused until one is assigned, and the test stays tracked meanwhile. States: Awaiting coordinator → Awaiting dispatch → Sent to third party · Awaiting results → Results received → Internal review → QC → Completed, mapped onto the existing work states. Recording results never approves; the coordinator submits them into the normal team-lead review. No email, file transfer or external access.
- **My work / alerts:** Plan Validation task for the PVT Team Lead; Validation requested / planned alerts; custom and external labels in scope alerts; “External coordination assigned to you”; dispatch and submit-results actions; Waiting on <provider> with expected return; “External results submitted for review” for the lead. All derived with stable keys; reading an alert does not clear work.
- **Revisions:** released tests, Validation, custom tests and execution are locked; releasing an unchanged scope is refused, so no duplicate alerts or report resets.
- **Older records:** no fluid type is guessed (“Fluid type not recorded”); it is requested on the next release. Records without execution are internal. Older catalogue `— Validation` scope keeps its generated steps.

Decided: providers are entered manually (no provider register yet); for Other fluids the method is chosen per test where the catalogue has fluid-specific entries.


## Laboratory scope, assignments and usability — combined review (4 November 2026)

Builds on `main` after PR #7 (Restoration requires reservoir conditions at planning; release does not). Existing test IDs, job records, released scopes and assignments are not rewritten.

- **Settings → Tests** (new `tests` permission, administrator by default): the full catalogue with each test's default team (Chemical, PVT, PVT and Chemical, Unassigned) and an Add test form. Added tests are stored in `vaps-test-catalogue-v1` with the same `Group — Name` IDs and appear in every sample's Scope of Work. Routing stays in `vaps-test-routing-v1`; a save writes an explicit decision per test (Unassigned included). Tests never saved use the catalogue default. Test routing was moved here from Authorization.
- **Defaults:** PVT fluid tests (Black Oil and Gas Condensate) → PVT. Water Analysis, Compositional Analysis, SARA, Pour Point, Wax Content, Asphaltene Content, WAT and the new **Sulphur Content** and **Sulphur Asphaltene** → Chemical. **EOR** keeps its ID, is shown under step 5 Other tests and has no default team. Saved routing always wins.
- **Unassigned tests** show "no default team". On a sample sent to both teams the scope owner must choose the team before release (editor check); on a single-team sample the test goes with the sample. Changing a default later never moves released work.
- **Routing to leads is unchanged:** PVT work → PVT Team Lead (Ahmed Al Shereiqi), Chemical → Chemical Team Lead (Al Yaqdhan Al Bahri), Both → each lead for their part. Team routing and individual assignment stay separate.
- **Assignment pickers** (sampling engineer and supporting team, driver, PVT/Chemical tests, bulk assign, each Validation step, reassignment, third-party internal coordinator) list the full active directory grouped by department, the responsible team first, the current user marked "(you)". The model accepts any active employee; team lists only order the picker. The assignee acts on that task through the assignment (job-details access is enough) and sees it in My work. Who may assign (the lead duty + laboratory access) and who reviews or approves (lead, QC, sampling and final approvers) keep their permission and duty checks.
- **Schedule overlap (advisory):** pickers show the employee's overlapping scheduled work across jobs: job ID, task, scheduled dates and the exact overlap (an existing task ending 12 Nov and a new one starting 11 Nov shows 11–12 November). It refreshes on employee or date change, excludes the assignment being edited, says "Availability not checked" when dates are missing, and never blocks. Laboratory tasks use their planned start/due; sampling and driver assignments have no dates of their own, so they use the job's Job Date → Due Date and are labelled "(job dates)".
- **Task screen:** one header (job, task, sample/container, status, test due, next action with the main button), **Job details** (reservoir pressure and temperature with units or "Not provided", client, field/well, sampling type, job due, scope notes), non-duplicated instructions, then the work; workbook versions and history are collapsed. When a task is open the job header shrinks to one line. The sampling data review has a "Go to your decision" button; sampling screens show the job due date; "PVT Lab" labels inside the app now read "Laboratory".
- **Restoration:** reservoir values Ahmed enters when adding Restoration become the job's conditions (shown in Job details); the released scope version keeps its own record. Saved values are prefilled.
- **Workbook access:** new **View workbook** and **Download workbook** permissions (Authorization), initially Ahmed Al Shereiqi only and not implied by administrator access. Others see "Workbook uploaded"; uploaders still submit. Final report documents are not restricted. `app/workbook-storage.ts` checks the signed-in profile against saved permissions before any file is read and creates the temporary file URL only after that check.

**Infrastructure limit (workbooks):** neither edition has an authenticated file service. GitHub Pages is static and the Sites edition's only API is the job-summary route, which never serves files. Workbooks live in the uploading browser's IndexedDB; there is no file URL to request directly. The check above is a browser-side gate: it stops access through the app, but someone with developer tools on the same browser can read its own storage. Server-enforced access needs a backend file service with real sign-in.

Not changed / to confirm: workbook restriction means Al Yaqdhan Al Bahri (Chemical lead), QC and other reviewers cannot open workbooks until granted View/Download workbook; the default team for Pour Point, Wax Content, Asphaltene Content and WAT was set to Chemical with the other chemical tests and can be changed in Settings → Tests.


## Dashboard, My work, job workflow tracker and client progress (8 November 2026)

Business rules, duties, permissions, approvals, QC, returns and stored records are unchanged. No records are migrated; every status is calculated from the existing records when shown.

- **Navigation:** *Dashboard* (`#dashboard`) and *My work* (`#my-work`) are separate. The app opens on My work. Old `#dashboard` links now open the Dashboard; a saved "return to" of `dashboard` is read as My work.
- **Dashboard (read-only):** every active job (drafts and completed jobs excluded; "Include completed" adds completed jobs) with Job ID, client, field/well, current stage, status, a compact three-stage tracker, the team or role responsible now, due date and overdue/attention flags. Filters: search, client, stage, status. Three counts only (active, need attention, overdue). Rows, IDs and steps are not links or buttons, for every user. Visible to everyone with *Access job details*; it shows team/role labels, not names. The former "Overview & activity" page is now the *Activity log*, linked from the Dashboard for company-overview holders.
- **My work:** tabs reduced to *Act now*, *Coming up*, *Waiting* (now includes work blocked by a missing setting) and *My jobs*. Rows are tagged Ready / Not yet / Waiting / Blocked, keep the specific action buttons (e.g. "Review workbook", "Plan Validation"), and My jobs shows the job's status and compact tracker.
- **Job access (`app/job-access.ts`):** a job opens, and job commands run, only for the administrator, company-overview holders, the job's creator/dispatcher (drafts for job creators), the sampling team and driver, laboratory assignees, the duty holders relevant to that job (sampling approval and scope selection on dispatched jobs; PVT Supervisor/PVT Team Lead on PVT work; Chemical Team Lead on Chemical work; final report preparation/approval once laboratory scope exists; QC on jobs with laboratory work; laboratory receipt once samples can be sent), people named on pre-workflow jobs, and anyone with a work item on the job. The rule is applied to `#workflow/…` and `#new-job/…` routes, to the sampling editor save and to every workflow command (`applyJobOperation`). Each command's existing permission and duty checks still run.
- **Workflow status (`app/job-flow.ts`):** one calculation used by the Dashboard, job page, Jobs register, My work and client view. Sections *Sampling* (or *Sample transfer*) → *Laboratory* → *Final report*, built from saved records only:
  - Sampling: assigned to sampling team → preparation → field sampling & data sheets → data review & approval (only where data review applies) → sampling report preparation → sampling report approval.
  - Laboratory: samples received → laboratory scope released → additional work confirmed (when requested) → per stream (PVT, Chemical, side by side): assign & schedule, Validation steps (only the chosen steps), selected tests. Third-party and additional work are labelled. Before scope release the section says tests are confirmed after sampling-report approval; no reference-only request is shown as a test.
  - Final report: preparation (or revision after additional work) → check (only if a checker is used) → final approval. No "release" step exists in the workflow, so none is shown.
  - States: green Completed, amber In progress, gray Not started, red Blocked (missing setting) or Correction needed (returned). A test is complete only when QC approved; an uploaded file or submitted report is never counted as approved. A report reopened by the workflow for additional work reads "Revision required", not a correction. Overdue is a separate schedule warning. Progress is "N of M required steps completed" — no percentages.
- **Job page:** Job ID and context (client, field/well, sampling, samples, reservoir P/T, due date) → workflow tracker (select a section to see its steps in a full-width panel; current stage, happening now with every active team, what happens next) → your next action → sections grouped as Sampling (Samples & data, Review & report), Laboratory (Sample receipt, Scope, Lab work), Final report, Client progress, History.
- **Client progress:** a *Client progress* tab shows exactly what a client sees (scope summary, stage progress, completed dates, next step, last update) with *Print or save as PDF*. The shared `/track/…` page uses the same component for new summaries (summary version 2); older shared summaries still display. Names, comments, workbooks, returns, QC/team-lead review, providers and controls are excluded; returned or blocked items read "In progress".
- **Client links (currently switched off):** external client sharing is disabled in both editions by `clientSharingEnabled = false` in `app/deployment.ts` until production sign-in, server-side authorization and shared storage exist (blockers 1–4 below). The Client progress tab still shows the client view and Print / Save as PDF; a link created earlier can only be stopped. When sharing is switched back on: new links require sign-in. The "anyone with the link" option is no longer offered; an existing link of that type is flagged with a prompt to switch it. Creating or changing a link needs *Create jobs* or *Company overview*.
- **Design system:** status tokens (green/amber/gray/red with icon + label), standard buttons, focus ring, page header, badges, tables that become cards below 900 px, stacked tracker on tablet/phone.

Verification: TypeScript and lint (0 errors) passed. 174 automated tests passed, 2 environment-dependent tests skipped, including 12 new tests for workflow status (draft, sampling, mixed PVT/Chemical with Validation and a return, Chemical-only, PVT-only, additional work, transfer, client privacy and server validation) and job access (assignees, duties, supervisory permissions, drafts/Trash, command refusal). Sites build (`npm test`) and Pages build passed. Browser checks on the demo data: the Dashboard has no interactive job elements, filters and the no-match state work; a team lead opened a task from My work and approved it; a Chemical employee was refused `#workflow/…` and `#new-job/…` links to a PVT-only job; Dashboard, My work, job workflow, Jobs register and client progress were captured at 1440, 820 and 390 px with no page-wide horizontal overflow and no console errors.

### Remaining production blockers
1. **Authentication:** the employee ID/password and "Demo: view as employee" selector are a browser-local demonstration, not secure sign-in. Anyone with the browser can choose any profile.
2. **Authorization:** all job-access and permission checks run in the browser over browser storage. They stop access through the app but not someone using developer tools. Server-side enforcement needs real accounts and a backend that owns the job records.
3. **Shared storage:** jobs, settings and workbooks live in one browser (localStorage/IndexedDB); there is no multi-user or multi-device synchronization or backup.
4. **Client sharing:** links require sign-in, but sign-in proves identity only, not that the person belongs to the client. A per-job allow-list of client emails (checked against the signed-in email on the server) is needed before sharing externally. Sharing is off in the GitHub Pages edition.
5. **Deployment:** the shared-summary API test needs `WORKFLOW_TEST_URL` and was not run; the Sites deployment and D1 binding were not exercised here.

## Overall job progress and client progress view (8 November 2026)

Builds on the existing job workflow (`job-flow.ts`) and client progress tab. No records are migrated; one additive field (`operations.progressPlan`) and one command (`estimate`) were added.

- **Overall job progress** (`app/job-progress.ts`, `app/job-progress-ui.tsx`) sits under the job header on every job page. Stages adapt to the job: Job created → Sampling (field sampling) or Sample receipt (delivered/transfer jobs) → Laboratory testing → Final report. An undecided sampling type shows “Sampling type to be confirmed”. Before the laboratory scope is released the stage reads “Laboratory scope awaiting confirmation” and no tests are listed.
- **Activity table**: sampling (saved sampling-type label, field/well), sample receipt, one row per selected test per team (PVT / Chemical, marked as running in parallel), Validation as one summary row per batch, and the final report. Multiple samples are summarised (“Validation — 2 samples”, “1 of 2 samples completed”). Work added later gets its own row marked Additional work, so completed rows and their dates are preserved. Third-party work is labelled “Third-party laboratory” with no supplier name. Desktop: one table; phones: stacked cards.
- **Status language** (same mapping everywhere): Unassigned/Scheduled → Not started; In Progress and internally returned work → In progress; Workbook Submitted / Awaiting QC / QC Returned → Under review; QC approved → Completed. Status comes only from workflow records; there is no manual completion toggle. Overdue is a separate red flag. The internal view also shows “Action required” (red) for returns or missing settings; the client view never does.
- **Schedule estimates**: planned start, expected duration and expected completion per row, entered by the job coordinator (`createJob`), the scope selector, the PVT Supervisor, the stream’s team lead (own stream) or report preparation (final report). Convention: calendar days counting the start day (no earlier project convention existed). Any two values give the third; inconsistent, negative or zero durations are refused. No default durations; missing values show “To be confirmed”. Each estimate is internal unless “Show in the client progress view” is ticked. The team lead’s assignment dates appear internally as “Team plan · internal” and are never shown to the client. Estimates never change statuses, assignments or actual completion dates, and are recorded in job history. No cascade rescheduling.
- **Overall expected finish** = the final report’s expected completion. It is “confirmed” only when the scope is released and every open activity has an expected completion on or before it; otherwise it is labelled provisional with the reason, or “To be confirmed”. Parallel durations are never added.
- **Summary**: current stage, happening now, planned next, expected report delivery, last progress update (estimate edits do not count as progress), “N of M activities completed”, and a generated sentence such as “Sampling is completed. PVT and Chemical testing are in progress. Expected report delivery: 24 Nov 2026.”
- **Client progress tab** renders the same calculation with client-visible estimates only; names, assignments, workbooks, comments, approvals, correction reasons and supplier names are excluded. Print / Save as PDF is kept. The detailed internal workflow tracker (steps, owners) remains available under “Internal workflow steps & responsibilities”.
- **Sharing**: `clientSharingEnabled` stays `false`. The shared summary payload now carries the client progress block and the server sanitiser (`sanitizeProgress`) accepts only client fields, dropping internal flags and team dates. External links still need production sign-in, server-side authorization tied to the client and job, and shared storage of job records; the current tab is an internal preview only.

Verification: TypeScript and lint passed (existing warnings only); 191 tests passed, 1 skipped (environment-dependent API test), including 15 new progress tests; production build and GitHub Pages build passed. A Playwright run on the Pages build signed in, loaded demo data, entered estimates through the UI as the coordinator (an inconsistent entry was refused inline), and checked the mixed PVT/Chemical job and client tab at 1440 px and 390 px: no horizontal overflow and no employee names or internal terms in the client view.

## Job creation – round 1 edits (November 2026)

- **Job details** (section 01) holds client, focal point, country, field, well, Job Date, Due Date and the Job / request description. No client is pre-selected; the Job ID badge in the section header appears once a client is clicked and is reserved on save or send.
- **Sampling type & scope** (section 02) is multi-select. Each type has its own quantity row (`samplingPlan` on the job, `app/sampling-plan.ts`). Separator Sampling is counted in sets (1 set = 1 oil + 1 gas cylinder) with editable oil and gas cylinder counts; each cylinder is its own record. Records are numbered in one sequence across all types (1.01, 1.02 …) and each record keeps its `samplingSource`, and for separator cylinders its `set` and `phase`. The first type is the primary one: sampling preparation and data entry still follow that type for now and will be adapted step by step. Older single-type jobs are read as a one-row plan.
- **Sampling assignment & instructions** (section 03) is one panel: accountable sampler, driver, backup / support crew (labelled Backup) and sampling instructions.
- **Send to Sampling**: the review lists every field and who is told. The send and the first draft save are recorded automatically in the Sequence of Events (`auto: true`). Lab team leads and lab receipt (and the scope selector, unless they sent the job) get a "Job in sampling" heads-up alert with general job details only; no laboratory scope exists yet.
- **UK dates**: every date and time shows as dd/mm/yyyy and 24-hour HH:MM (`app/uk-format.ts`, `DateInput` / `TimeInput` in `app/uk-date.tsx`); stored values stay ISO.
- **Chemistry**: team, work and role labels read "Chemistry" (`teamName` in `app/team-name.ts`). The stored stream value stays `'Chemical'` so saved records keep working; test names are unchanged.
- **Later**: OneDrive job folders (`<Job ID>/01 Sampling`, `<Job ID>/02 Lab/PVT`, `<Job ID>/02 Lab/Chemistry`) need Microsoft 365 sign-in and an app registration, and are not part of this round.

## Laboratory scope in two phases (Nov 2026)

- **Phase 1 · Validation** (Scope tab, scope selector): every sample is shown with its count at the top. Per sample: fluid type (Black Oil, Gas Condensate, Water, Chemistry, STO, OBM, Other) → responsible team → Validation required Yes/No. Yes opens the step panel (pre-filled with the standard sequence for the sampling type; untick what is not needed). No sends the sample straight to Phase 2. Reservoir pressure and temperature are required when any sample has Validation. Release creates the chosen steps as Unassigned PVT work for the PVT Team Lead to assign; the lead may still add or remove unstarted steps.
- **Phase 2 · Detailed tests**: a sample opens when it needs no Validation or all its Validation stages are completed. The scope selector gets a My work task to confirm with the client focal point, then marks each sample Selected / Not selected for further study and selects the tests (existing test cards, custom tests and third-party execution). The job cannot finish until every sample in scope has a Phase 2 decision.
- Request additional work is no longer shown on the Scope tab; older requests stay listed read-only. Older fluid type "Chemical" reads as Chemistry. Jobs scoped in one step before phases keep their single-phase view.
- Pending (next steps): Ahmed's assignment table with time needed, "Finished" per stage with one shared job workbook, workbook review/QC, and the interim report.

## Sample handover step removed

Decision (Mohammed Al Awaisi): there is no recorded sample handover between Sampling and the Laboratory. Earlier sections that describe physical handover, driver handover actions, the `labReceipt` duty or receipt gating are superseded by this section.

- Sampling's part ends when the sampling report is approved and the scope selector releases the laboratory scope. A final sampling-team step will be defined later.
- Removed: the "Sample receipt" job section, the `handover-send` / `handover-receive` commands, the driver "Hand over samples" and "Confirm receipt" work items, the "Samples received at laboratory" tracker/progress row, the "Sample handover" milestone and the Laboratory receipt duty in Settings.
- The final report no longer waits for physical receipt: it needs all required laboratory work completed and the sampling report approved.
- Driver assignment at dispatch is unchanged, but the driver has no workflow action.
- Saved `operations.handover` records on existing jobs are kept in the data and no longer read. Old `#workflow/<job>/handover` links open the job overview.



## Validation assignment table (11 November 2026)

Model rules, permissions and stored records are unchanged; only the PVT Team Lead's Validation panel on the Lab work tab (`app/lab-planning.tsx`) is redesigned.

- **One table per sample** replaces the read-only step list and the separate "Edit plan" form: each row is a Validation step with Engineer, Due date and Note, saved together with one **Save changes** button (`validation-plan` when the step list changed, then one `schedule` per changed assignment).
- **Remove / add:** an untouched step has a remove button; a step already assigned or started shows a lock and is kept. Catalogue steps not in the plan are offered as "Add a step" chips. Restoration still requires reservoir pressure/temperature when added, and a Validation Recombination next to a separately requested Recombination test still needs confirmation.
- **Start date and due date per step:** choosing an engineer proposes today as the start; the lead moves it later when the engineer is busy until then. The due date cannot be before the start. Dates and note are enabled once an engineer is chosen. The advisory schedule-overlap notice checks the start–due range on changed rows.
- **Third-party** execution is a per-row link ("Send to third-party lab") with provider and expected return; the engineer is then the internal coordinator.
- Other viewers see the same table read-only with status. The "Awaiting your assignment" list below is unchanged.

## Finish without upload (Nov 2026)

- **Employee:** an internal test is no longer submitted by uploading a workbook. The assigned employee opens the task, sees the job details and the team lead's instructions, does the work and presses **Mark as finished** (with a confirmation). Progress notes are optional.
- **Team lead:** gets the review action and alert in My work ("Review workbook"). The lead checks the workbook outside this system, then **Approve** or **Return with a note**. The note is required; the sheet/section reference is now optional for the team lead (still required for QC returns).
- **Returned:** the test goes back to the employee with the note; they correct it and mark it finished again (each submission is kept in the history).
- **Approved:** the team lead's approval completes the test (see *QC step removed* below).
- **Data:** each submission is still a version record on the test, with an empty file reference. Workbooks uploaded earlier stay viewable. Third-party tests still attach the provider's returned results.

## QC step removed (Nov 2026)

Supersedes the QC descriptions earlier in this document.

- **Flow:** assigned employee marks the test finished → team lead approves (test **Completed**) or returns a note. There is no QC review, QC queue, QC return or QC reviewer duty. Third-party tests follow the same rule after the coordinator submits the returned results.
- **Final report:** opens when every required test is approved by its team lead (previously: QC approved). Preparation and final approval are unchanged.
- **Statuses:** Not assigned, In progress, Under team-lead review, Returned, Approved.
- **Settings:** the *QC review* duty is no longer shown in Authorization; a value saved earlier is ignored, not deleted.
- **Existing records:** a test that was waiting for QC (already team-lead approved) reads as Completed; a test QC had returned goes back to the team lead for review. Earlier QC approvals stay in each test's history.
