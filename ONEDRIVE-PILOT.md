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
   - `Files.ReadWrite`, which covers only files in the signed-in account's **own** OneDrive
   - `User.Read`, used to confirm which account approved
   - `offline_access`, so copies keep working without signing in again
   Do **not** add `Files.ReadWrite.All`.
6. These permissions normally need no admin consent. If your tenant blocks user consent, VAPS IT must select **Grant admin consent for VAPS**.

If you cannot open App registrations, your tenant blocks it. VAPS IT does steps 2–6 and sends you the two IDs.

### Why `Files.ReadWrite` and not narrower or broader
| Permission | Result |
|---|---|
| `Files.ReadWrite.All` | **Not used.** It reaches every file the account can open, including files other people shared with it. It is only needed when the parent folder is in someone else's OneDrive, which this pilot does not support. |
| **`Files.ReadWrite`** (chosen) | Microsoft lists it as the least-privileged delegated permission for opening a sharing link (`/shares`), creating folders and uploading. It reaches only the connected account's own OneDrive. **The parent folder must therefore be in your own OneDrive.** |
| `Files.ReadWrite.AppFolder` | Would limit the app to one `Apps/<app>` folder, but Microsoft documents it as personal-accounts only. It is not supported for OneDrive for Business. |
| `Files.SelectedOperations.Selected` | Per-item grants. It needs admin consent and an admin assignment for each item, and Microsoft's docs are unclear on folder-level grants. Too heavy for a temporary pilot. |

`Files.ReadWrite` still covers your whole OneDrive, not just one folder. For the pilot, use a dedicated parent folder and disconnect when the pilot ends (see Ending the pilot).

### Step 2: private server configuration (Sites panel)
Enter these in the **Sites panel** of the Workflow VAPS site, the same place `ADMIN_SETUP_TOKEN` was added during
Administrator setup (AUTHENTICATION.md). Add the two **secrets** as secrets, not as plain variables, so the link and
the key are encrypted and never shown again. Do not paste the link into chat, GitHub, email or the repository.
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

## Live OneDrive test (sample data)
Run this after step 3, in the deployed review build. Keep your OneDrive parent folder open in a second browser tab.

1. **Save one sample job.** As SALIM (the default job creator), create a job with a fictional client, field and well, and save it.
   - Refresh the OneDrive tab. Expect `<Job ID>` with `Sampling` and `Lab` inside it.
   - In Workflow VAPS, the job's **OneDrive copy** panel shows **Synced** and an **Open folder** link.
2. **One upload to Sampling.** Open Sampling review & report and attach a sample G-sheet (any small `.csv`).
   - Expect it in `<Job ID>/Sampling`, and the panel says "copied to OneDrive (Sampling)".
3. **One upload to Lab.** On a laboratory activity, attach a sample workbook.
   - Expect it in `<Job ID>/Lab`, and the panel says "copied to OneDrive (Lab)".
4. **Save again.** Edit the description and save.
   - Expect no new folders, and no second `<Job ID>` or `<Job ID> 1`.
   - Expect no duplicate files: the G-sheet and the workbook each appear once.
5. **Optional extra checks:**
   - Upload the same G-sheet name again: both files are kept, and the panel shows the numbered name.
   - Disconnect, then upload: the panel shows "Original saved in Workflow VAPS. OneDrive copy failed". Reconnect, then select **Retry OneDrive copy**.

Automated equivalent, which contacts no Microsoft service: `node --test tests/onedrive-pilot.test.mjs`.

## Notes for review
- PR #63 also adds a migration numbered `0006`. Whichever merges second must be renumbered to `0007`.
- The parent folder's own OneDrive sharing decides who can open the copies. Share it only with the pilot testers. OneDrive does not apply Workflow VAPS job or workbook permissions.
