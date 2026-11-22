# Microsoft 365 pilot: SharePoint Jobs library and Job Register

This pilot copies Workflow VAPS jobs and their files to a **VAPS-owned SharePoint test site**. Workflow VAPS stays the
system of record:
- D1 holds jobs, settings and accounts.
- R2 holds file bytes.
- Job permissions do not change.

SharePoint holds a copy for designated pilot testers. It does not replace the Workflow VAPS file access rules.

## What it does

Each job has exactly two folders, `Jobs/<Job ID>/Sampling` and `Jobs/<Job ID>/Lab`.

| VAPS event | SharePoint result |
|---|---|
| Job is first saved | `<Job ID>/`, `<Job ID>/Sampling/` and `<Job ID>/Lab/` are created. Existing folders are reused, including on a retry. |
| Any job save, workflow step, Trash or restore | The one **Job Register** row for that Job ID is added or updated. |
| A job file is added | It is copied to the folder for its purpose (table below). |
| A file name already exists in the folder | Both files are kept. The new copy gets a numbered name (`G-sheet 1.csv`). The job page shows that name. Nothing is overwritten. |
| SharePoint is down or refuses access | The Workflow VAPS save or upload still succeeds. The job page shows "Original saved in Workflow VAPS" and the failure. The copy is retried on the job's next save, and MA001 can retry it from the job page. |
| Pilot variables are not set | Workflow VAPS behaves exactly as before. It makes no SharePoint calls, and the job page shows no SharePoint panel. |

### Routing: every job file and its folder
The server chooses the folder from the file's purpose (`app/file-routing.ts`). The browser cannot choose or send a folder name.

| File | Where it comes from in Workflow VAPS | Folder |
|---|---|---|
| Scope-of-work attachment | Job editor → Client request document. It is stored in the job record and copied when the job is saved. A replaced attachment is copied as a new file, and the old copy stays. | **Sampling** |
| Sampling sheet (G-sheet) | Sampling review & report → Report summary & G-sheet | **Sampling** |
| Sampling report | Report preview → **Copy PDF to SharePoint**. This appears for the approved version only, and each version is copied once. | **Sampling** |
| Lab workbook | Laboratory activity → Attach the workbook | **Lab** |
| External lab results | External work → Attach returned report / results | **Lab** |
| Final report | Final report → Final report file | **Lab** |

Not job files, and not copied: request-book imports, data import and export files, company and client logos, and the demo-data setup.

### SharePoint panel in each job
The panel sits on every job section, in the Sites edition, and only when the pilot is configured. It shows:
- the job folder
- each file, with its type, folder and copy status
- the name SharePoint used, when the file was renamed

After each upload a short notice says whether the file was saved in Workflow VAPS and whether SharePoint received it.
When something failed, MA001 sees a **Retry SharePoint copy** button. Other employees see that MA001 can retry.
The panel uses the existing job access rules: an employee who cannot open the job cannot see its SharePoint status.

## What VAPS IT needs to configure

### 1. SharePoint test site (owned by VAPS)
1. Create a site, for example `https://<tenant>.sharepoint.com/sites/VAPS-Jobs-Pilot`. VAPS IT owns it. Do not use a production site.
2. Add a **document library** named exactly **`Jobs`**.
3. Add a **list** named exactly **`Job Register`**, with these columns:

| Column (internal name, exact) | Type | Notes |
|---|---|---|
| `Title` (existing column) | Single line of text | Holds the Job ID. List settings → Title → **Enforce unique values: Yes**. |
| `JobNumber` | Single line of text | |
| `ClientName` | Single line of text | |
| `FieldArea` | Single line of text | |
| `Well` | Single line of text | |
| `Status` | Single line of text | "In Trash" while the job is in Trash |
| `CurrentStage` | Single line of text | |
| `DueDate` | Single line of text | YYYY-MM-DD |
| `FolderUrl` | Single line of text | |
| `UpdatedAt` | Single line of text | ISO time of the last VAPS change |

Create each column with exactly the name shown, with no spaces. You can rename the display name afterwards.

### 2. Restrict the pilot to designated testers (required)
SharePoint does not know Workflow VAPS job permissions. Anyone who can open the `Jobs` library can open every job's
files, including lab workbooks that need the View or Download workbook permission in Workflow VAPS. Keep direct access to
the named testers:

1. Create a security group, for example **VAPS SharePoint Pilot Testers**, with only the designated testers. Use a security group, not the site's Microsoft 365 group.
2. `Jobs` library → Library settings → **Permissions for this document library** → **Stop inheriting permissions**.
   - Remove *Members* and *Visitors*.
   - Remove "Everyone" and "Everyone except external users", wherever they appear.
   - Grant the tester group **Read**, or **Contribute** only if testers must add files directly. Pilot files are meant to come from Workflow VAPS.
   - Keep the site *Owners* (VAPS IT) only.
3. Do the same on the `Job Register` list: tester group **Read**, Owners only.
4. Site → Settings → Site permissions → **Sharing**: allow "Only people in your organization" or less, and turn off "Site members can share files and folders".
   SharePoint admin center → Sites → this site → **External sharing: Only people in your organization**, or "No sharing".
5. Do not create anyone-links or company-wide links to pilot folders. The "Open folder" link in Workflow VAPS works only for people the library allows.
6. Use **sample data only** while the pilot runs.

### 3. Entra ID app registration (backend only)
1. Entra admin center → App registrations → **New registration**, for example `VAPS Workflow SharePoint Pilot`. Single tenant, no redirect URI.
2. API permissions → Microsoft Graph → **Application** → **`Sites.Selected`** → **Grant admin consent**.
   Do not use `Sites.ReadWrite.All`.
3. Grant the app **write** access to the pilot site only. A Global or SharePoint admin does this once:
   ```
   POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
   { "roles": ["write"],
     "grantedToIdentities": [{ "application": { "id": "<app client ID>", "displayName": "VAPS Workflow SharePoint Pilot" } }] }
   ```
   To find `{site-id}`, run `GET https://graph.microsoft.com/v1.0/sites/<tenant>.sharepoint.com:/sites/VAPS-Jobs-Pilot`.
4. Certificates & secrets → **New client secret**, with a short expiry (for example 6 months). Record the renewal date.

### 4. Worker settings (Sites hosting → environment)
| Name | Kind | Value |
|---|---|---|
| `MS_TENANT_ID` | variable | Directory (tenant) ID |
| `MS_CLIENT_ID` | variable | Application (client) ID |
| `MS_CLIENT_SECRET` | **secret** | The client secret value. Store it as an encrypted secret only. Never put it in the repo, a chat or an email. |
| `SHAREPOINT_SITE_URL` | variable | `https://<tenant>.sharepoint.com/sites/VAPS-Jobs-Pilot` |
| `SHAREPOINT_LIBRARY` | variable (optional) | Default `Jobs` |
| `SHAREPOINT_REGISTER_LIST` | variable (optional) | Default `Job Register` |

Apply migration `drizzle/0006_m365_pilot.sql`. It adds two tracking tables and changes nothing that already exists.

### 5. Network
The Worker must be able to reach `login.microsoftonline.com` and `graph.microsoft.com` over HTTPS.

## Acceptance: one real SharePoint test job (sample data)
Run this after steps 1–5. All of it must pass before the email phase starts.

1. As the default job creator, create one sample job (fictional client, field and well). Attach a sample scope-of-work file, then save.
   - **Expected:** `Jobs/<Job ID>/Sampling` and `/Lab` exist, `Sampling` holds the scope file, and the register has **one** row for the Job ID.
2. Save the job again.
   - **Expected:** still one register row, no new folders, and `UpdatedAt` changes.
3. Add a sample G-sheet. Then approve a sample sampling report and press **Copy PDF to SharePoint**.
   - **Expected:** both are in `Sampling`.
4. Add a lab workbook, external results and a final report file.
   - **Expected:** all three are in `Lab`.
5. Upload a G-sheet with the same name again.
   - **Expected:** the job panel shows the numbered SharePoint name, and the first file is unchanged.
6. As a pilot tester, open the folder link.
   - **Expected:** it opens.
7. As an employee who is **not** in the tester group, open the folder link.
   - **Expected:** SharePoint refuses access.
8. Temporarily make the client secret invalid, for example by setting a wrong value in a test environment, then upload a file.
   - **Expected:** the job shows "Original saved in Workflow VAPS" and the failure.
9. Restore the secret. As MA001, press **Retry SharePoint copy**.
   - **Expected:** the file is copied, the panel shows **Synced**, and MA001 is still the Administrator.

Automated equivalent (no tenant): `node --test tests/m365-pilot.test.mjs`. It runs the same sample job against an
in-memory stand-in for Microsoft Graph.

## Security notes
- Credentials and Graph tokens stay on the server. The browser sends only the file, the Job ID and the file's purpose.
- The server checks job access before it stores anything. Errors shown to employees never contain tokens, IDs or Graph responses.
- The audit log records `sharepoint.file.copied` and `sharepoint.failed`.

## Next phase, not started: email from bsg@visionaps.com
This phase starts only after the real SharePoint test job above passes. Messages to staff and clients stay off until it passes.

1. **Invitation:** this exists today and is sent through Resend (`MAIL_PROVIDER=resend`, `MAIL_FROM`). Sending from `bsg@visionaps.com` needs one of these:
   - verify `visionaps.com` with the mail provider, or
   - add a Microsoft Graph `sendMail` sender, with the app's `Mail.Send` limited to that one mailbox (Exchange RBAC for Applications, or an application access policy).
2. **Employee workflow notification:** not built yet. Workflow alerts are in-app only today.
3. **Client notification:** not built yet. Client sharing is switched off (`app/deployment.ts`).

The test plan is one invitation, one workflow notification and one client notification, each sent only to mailboxes VAPS
controls, with an allow-list that blocks every other recipient until it is approved.
