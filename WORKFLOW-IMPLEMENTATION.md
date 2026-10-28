# VAPS workflow implementation

## Implemented

Settings has five dedicated, addressable categories: Company, Clients, Employees, Authorization, and Departments & Positions. Central employee and option IDs preserve relationships through edits and deactivation. Existing client codes and job numbers remain intact. Settings permissions are checked at mutation boundaries as well as in the interface.

The job workspace now separates overview, scope, sampling, sampling reports, physical handover, laboratory work, final reporting, and history. Initial requests remain recorded; additional scope has a reason and history. Validation is generated per sample using the supplied Bottomhole, Wellhead, and Separator sequences. Reservoir values must be entered rather than fabricated.

BVT and Chemical work can run in parallel. Weekly views support multi-day and cross-week assignments, individual dashboards, workbooks, corrections, and completed-work filtering. Sampling reports have named checking and approval stages with version snapshots. Physical dispatch and receipt are separate records. Final reports collect completed work, require an attached document, and retain earlier approved versions when additional work reopens a job.

## Responsibilities

- Salem (existing ID SALIM): BVT scope/planning and sampling approval.
- Al-Yaqzan (BAHRI): Chemical planning.
- Ahmed (SHEREIQI): final report preparation/review.
- Wilfred (WILFRED): final approval.
- Assigned active employees: execution and workbook submission, subject to existing area permissions.

Positions and departments do not grant permissions. Creating an employee does not create an account.

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
4. Whether PVT Lab should be renamed BVT Lab.
5. Which validation steps are mandatory and whether steps may be omitted.
6. Validation sequences for sampling methods other than Bottomhole, Wellhead and Separator.
7. BV meaning and its relationship to historical PV entries.
8. Workbook reviewer ownership and whether independent QC is required.
9. Whether final reporting needs an independent reviewer in addition to Ahmed and Wilfred.
10. Authority for additional scope; currently requests are recorded and Salem confirms lab scope.
11. Partial shipment and receipt rules; current handover records all job bottles together.
12. Shared execution rules; each activity currently has one accountable employee.
13. How to reconcile missing evidence in legacy records without inventing history.

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
