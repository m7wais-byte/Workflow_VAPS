# Microsoft 365 pilot: SharePoint Jobs library and Job Register

A small pilot that copies VAPS jobs and their files to a **VAPS-owned SharePoint test site**. D1 (jobs, settings,
accounts) and R2 (file bytes) stay the system of record. Job permissions are unchanged. SharePoint holds a copy.

## What it does

| VAPS event | SharePoint result |
|---|---|
| Job is first saved | `Jobs/<Job ID>/`, `Jobs/<Job ID>/Sampling/` and `Jobs/<Job ID>/Lab/` are created. If they already exist, they are reused. |
| Any job save, workflow step, Trash or restore | The one **Job Register** row for that Job ID is added or updated. |
| Sampling G-sheet upload | → `<Job ID>/Sampling/` |
| Lab workbook, external lab results, final report file | → `<Job ID>/Lab/` |
| Upload whose name already exists in the folder | Both files are kept. The new copy gets a numbered name (`G-sheet 1.csv`), which VAPS records. Nothing is overwritten. |
| SharePoint down, or access refused | The VAPS save or upload still succeeds. The failure is recorded and retried on the job's next save. The Administrator can also retry it. |
| Pilot variables not set | VAPS behaves exactly as before and makes no SharePoint calls. |

**Assumption to confirm:** the final report file goes to `Lab`, because only the Sampling and Lab folders were asked for.
To change this, edit the `section` mapping in `app/operations-workspace.tsx` (ReportWorkspace).

**Not routed:** the scope-of-work attachment in the job editor. It is stored inside the job record, not uploaded as a
file. Uploads that are not tied to a job (demo-data setup) stay in VAPS only.

## What VAPS IT needs to configure

### 1. SharePoint test site (owned by VAPS)
1. Create a SharePoint site, for example `https://<tenant>.sharepoint.com/sites/VAPS-Jobs-Pilot`. Make VAPS IT the owner. Use a test site, not a production site.
2. Add a **document library** named exactly **`Jobs`**.
3. Add a **list** named exactly **`Job Register`**, with these columns:

| Column (internal name, exact) | Type | Notes |
|---|---|---|
| `Title` (existing column) | Single line of text | Holds the Job ID. List settings → Title → **Enforce unique values: Yes**. This also indexes the column. |
| `JobNumber` | Single line of text | |
| `ClientName` | Single line of text | |
| `FieldArea` | Single line of text | |
| `Well` | Single line of text | |
| `Status` | Single line of text | Set to "In Trash" while the job is in Trash. |
| `CurrentStage` | Single line of text | |
| `DueDate` | Single line of text | YYYY-MM-DD, stored as text so it does not shift between time zones. |
| `FolderUrl` | Single line of text | Link to the job's folder. |
| `UpdatedAt` | Single line of text | ISO time of the last VAPS change. |

Create each column with the name shown, with no spaces, so the internal name matches. You can rename the display
name afterwards if you want.

### 2. Entra ID app registration (backend only)
1. Entra admin center → App registrations → **New registration**, for example `VAPS Workflow SharePoint Pilot`. Single tenant. No redirect URI.
2. API permissions → Microsoft Graph → **Application** permission → **`Sites.Selected`**. Then **Grant admin consent**.
   Do not grant `Sites.ReadWrite.All`. `Sites.Selected` limits the app to the sites you grant in step 3.
3. Grant the app **write** access to the pilot site only. A Global or SharePoint admin does this once, for example with Graph Explorer or PowerShell:
   ```
   POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
   { "roles": ["write"],
     "grantedToIdentities": [{ "application": { "id": "<app client ID>", "displayName": "VAPS Workflow SharePoint Pilot" } }] }
   ```
   To find `{site-id}`, run `GET https://graph.microsoft.com/v1.0/sites/<tenant>.sharepoint.com:/sites/VAPS-Jobs-Pilot`.
4. Certificates & secrets → **New client secret**. Use a short expiry (for example 6 months) for the pilot, and record the renewal date.

### 3. Worker settings (Sites hosting → environment)
| Name | Kind | Value |
|---|---|---|
| `MS_TENANT_ID` | variable | Directory (tenant) ID |
| `MS_CLIENT_ID` | variable | Application (client) ID |
| `MS_CLIENT_SECRET` | **secret** | The client secret value. Store it as an encrypted secret only. Never put it in the repo, a chat or an email. |
| `SHAREPOINT_SITE_URL` | variable | `https://<tenant>.sharepoint.com/sites/VAPS-Jobs-Pilot` |
| `SHAREPOINT_LIBRARY` | variable (optional) | Default `Jobs` |
| `SHAREPOINT_REGISTER_LIST` | variable (optional) | Default `Job Register` |

Apply database migration `drizzle/0006_m365_pilot.sql`. It adds two tracking tables and changes nothing that already exists.

### 4. Network
The Worker must be able to reach `login.microsoftonline.com` and `graph.microsoft.com` over HTTPS.

## Security notes
- The browser never receives the credentials or a Graph token. It only sends the file to VAPS, along with the job and the section.
- Before anything is stored, the server checks that the employee can open the job. This is the same job-access rule VAPS already uses.
- Files in SharePoint are protected by **SharePoint permissions**, not by VAPS job access or the View/Download workbook permissions. Limit the pilot site's members to the pilot group.
- Errors shown to employees never include tokens, IDs or Graph responses. Failures are written to the audit log (`sharepoint.failed`), and each copied file is logged too (`sharepoint.file.copied`).

## Administrator tools (MA001 only)
- `GET /api/admin/sharepoint` shows whether the pilot is configured, and lists jobs and files not yet copied, with the last error.
- `POST /api/admin/sharepoint` with `{ "jobId": "<Job ID>" }` retries one job: folders, register row and pending files.

## Pilot test
`node --test tests/m365-pilot.test.mjs` runs one sample job (`OM-P-26-901`, sample data) through the real API routes.
It uses a local D1 and R2, and an in-memory Microsoft Graph that applies Graph's folder, conflict and list rules. It checks:
folder creation and reuse, one register row per Job ID, routing by section, no overwrite on a duplicate name, job-access
checks, retry after an outage, recovery when the tracking rows are lost, no credentials in replies or the audit log, and
that VAPS is unchanged with the pilot off. **It does not contact a real tenant.** After IT finishes the setup above, run
the acceptance check on the test site: create one sample job, upload one Sampling and one Lab file, upload the same
name again, then confirm the folders, the files and the single register row.
