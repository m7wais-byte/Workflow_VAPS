# Temporary OneDrive for Business pilot

Workflow VAPS copies job files to a OneDrive for Business folder owned by the VAPS Microsoft account.

- **Workflow VAPS stays the system of record.** Jobs are in D1 and file bytes are in R2.
- **Job permissions are unchanged.**
- **Kept separate from this pilot:**
  - the SharePoint pilot (PR #63)
  - the Job Register
  - email

## Behaviour
| Event | OneDrive result |
|---|---|
| First successful save of a job, with OneDrive connected | Workflow VAPS creates `<parent>/<Job ID>/Sampling` and `<parent>/<Job ID>/Lab`. |
| Saving the job again, or a retry | Both folders are reused. If the tracking rows in D1 are lost, the existing folders are found and reused. |
| A job file is added | It is copied to Sampling or Lab by purpose. This uses the same routing as PR #63 (`app/file-routing.ts`). |
| Two files have the same name | Both are kept. OneDrive gives the new copy a numbered name (`G-sheet 1.csv`), and the job shows that name. |
| OneDrive is unavailable, or not connected | The save or upload still succeeds in Workflow VAPS. The job's **OneDrive copy** panel shows "Original saved in Workflow VAPS. OneDrive copy failed: …". The copy is retried on the next save, or by MA001 with **Retry OneDrive copy**. |
| The sign-in expires or is revoked | Copies wait with the message "not connected". MA001 reconnects, and copying resumes. |
| Pilot settings are not set | Workflow VAPS behaves exactly as before. |

Routing:

| Folder | Files |
|---|---|
| Sampling | Scope-of-work attachment, sampling sheet (G-sheet), approved sampling report PDF |
| Lab | Lab workbook, external lab results, final report |

## Authorization: your VAPS Microsoft account (delegated, device sign-in)
No password, token or client secret passes through chat, GitHub or the browser:
- The refresh token is stored in D1, encrypted with `ONEDRIVE_TOKEN_KEY` (AES-GCM).
- Access tokens are kept only in server memory.
- The browser only ever sees statuses, the connected account name, and the one-time sign-in code shown to MA001.

### Step 1: app registration (once; you or VAPS IT)
1. Go to **https://entra.microsoft.com** and sign in with the VAPS Microsoft account.
2. Open **Applications → App registrations → New registration**.
   - Name: `Workflow VAPS OneDrive Pilot`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: leave empty
   - Select **Register**.
3. On the app's **Overview**, note the **Application (client) ID** and the **Directory (tenant) ID**. These are identifiers, not secrets.
4. Open **Authentication**, go to **Advanced settings**, set **Allow public client flows** to **Yes**, and select **Save**.
   - Do not create a client secret. This app uses none.
5. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions** and add:
   - `Files.ReadWrite.All`, so the app can open the shared parent folder link and write into it
   - `User.Read`
   - `offline_access`
6. If your tenant does not let users consent to apps, VAPS IT must select **Grant admin consent for VAPS**.

If you cannot open App registrations, your tenant blocks it. VAPS IT does steps 2–6 and sends you the two IDs.

`Files.ReadWrite.All` is delegated. The app can act only as you, on files you can already reach. It is still broader than one folder, so for the pilot use a dedicated parent folder, and disconnect when the pilot ends (see Ending the pilot).

### Step 2: private server configuration (Sites hosting → environment)
| Name | Kind | Value |
|---|---|---|
| `ONEDRIVE_CLIENT_ID` | variable | Application (client) ID from step 1 |
| `ONEDRIVE_TENANT_ID` | variable | Directory (tenant) ID from step 1 |
| `ONEDRIVE_ACCOUNT` | variable | Your VAPS Microsoft sign-in address. Only this account is accepted when connecting. |
| `ONEDRIVE_PARENT_URL` | **secret** | The OneDrive folder link (the parent folder). Keep it out of the repo, chat and email. |
| `ONEDRIVE_TOKEN_KEY` | **secret** | At least 32 random characters, for example from `openssl rand -base64 48`. Changing it later means connecting OneDrive again. |

Apply migration `drizzle/0006_onedrive_pilot.sql`. It adds three tables and changes nothing that already exists.
The server must be able to reach `login.microsoftonline.com` and `graph.microsoft.com` over HTTPS.

### Step 3: sign in and approve (MA001 starts it; you approve)
1. Sign in to Workflow VAPS as **MA001** and open any job.
2. Open the **OneDrive copy** panel and select **Connect OneDrive**. The panel shows a short code.
3. Open **https://microsoft.com/devicelogin** and enter the code.
4. Sign in with **your VAPS Microsoft account** and approve **Workflow VAPS OneDrive Pilot**.
5. Return to Workflow VAPS. The panel shows **Connected** within a few seconds.

The code expires after about 15 minutes. If it expires, select **Get a new code**.

### Ending the pilot
- In Workflow VAPS, as MA001: the admin route's `disconnect` removes the stored token.
- In Microsoft: go to **https://myapplications.microsoft.com**, open **Workflow VAPS OneDrive Pilot** and revoke its permissions, or have IT delete the app registration.

## Real OneDrive test (sample data)
1. Create a sample job with a fictional client, field and well, then save it. Expect `<Job ID>/Sampling` and `<Job ID>/Lab` in the parent folder.
2. Add a sample G-sheet in Sampling review & report. Expect it in `Sampling`.
3. Add a sample lab workbook to a laboratory activity. Expect it in `Lab`.
4. Save the job again. Expect no new folders.
5. Upload the G-sheet again with the same name. Expect both files in `Sampling`, and the panel showing the numbered name.
6. Temporarily disconnect, or block OneDrive, then upload a file. Expect the panel to show "Original saved in Workflow VAPS. OneDrive copy failed". Reconnect, then as MA001 select **Retry OneDrive copy**. Expect the file to be copied.

Automated equivalent, which contacts no Microsoft service: `node --test tests/onedrive-pilot.test.mjs`.

## Notes for review
- PR #63 also adds a migration numbered `0006`. Whichever merges second must be renumbered to `0007`.
- The parent folder's own OneDrive sharing decides who can open the copies. Share it only with the pilot testers. OneDrive does not apply Workflow VAPS job or workbook permissions.
