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
