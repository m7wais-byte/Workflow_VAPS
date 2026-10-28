# Settings implementation

Settings uses addressable hash views within the existing single-page workspace: `/#settings`, `/#settings/company`, `/#settings/clients`, `/#settings/employees`, `/#settings/authorization`, and `/#settings/departments`.

## Data preservation

- The central directory seeds the existing twelve employees with their original internal IDs. Departments and positions initially reflect existing role values; these are editable descriptive options, not access grants.
- `vaps-directory-v1` stores employees and stable option IDs together. Renaming a person or option does not rewrite job relationships. Deactivation retains records and blocks new assignments and trial identity access.
- Existing `vaps-authorization-v1` assignments are retained. New company, employee/options, and authorization permissions initially belong only to MA001. Existing permissions are saved before new employees are added, so new records do not acquire default access on refresh.
- Existing client storage and client codes remain intact. Codes cannot be edited, and historical job numbers are never rewritten.
- `vaps-company-v1` stores the company profile. Its logo is used by the workspace header; historical report templates remain unchanged.
- Disabled the old startup reset that could erase operational records when its version marker was absent. Invalid saved client data is retained instead of deleted.

## Verification

- Production build passed.
- Application TypeScript check passed using `tsconfig.settings-check.json`, which excludes the unrelated copied project under `tmp/`.
- 36 tests passed across Settings, authorization, team workflow, workflow status, lab work, report approval, and rendered HTML.
- Browser checks: category dashboard, employee form, refresh, direct Settings link after sign-in, browser Back, and retained administrator protection.
- Layout checks: 1366×768 and 1920×1080 desktop, 768×1024 tablet, and 390×844 mobile. No document horizontal overflow in checked views; authorization overflow is contained in its table.

## Existing infrastructure limitations

This remains a local-browser demonstration. Settings and permission checks apply to trial identities, not secure server-side accounts; there is no multi-device directory synchronization or account provisioning. Shared job-summary API authentication remains separate. New employees do not receive passwords or login accounts. Final report templates intentionally retain their existing branding. The shared-summary integration test requires WORKFLOW_TEST_URL and was not run in this pass.

