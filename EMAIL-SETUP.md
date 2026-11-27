# Email from bsg@visionaps.com (Microsoft Graph, send only)

Workflow VAPS sends three kinds of email from **bsg@visionaps.com**. The sender is fixed in the code: any other `MAIL_SENDER` turns email off. Everything is off until the server settings below are set:

| Email | Sent when | To |
|---|---|---|
| Employee invitation | MA001 presses *Send invitation* (Settings → Sign-in accounts) | The work email entered for that employee |
| Employee notification | A workflow action newly lands on an employee: **assignment** (job, sampling, test), **review** (data, report, team-lead, QC, approval), **returned** for correction | The employee's work email (the email on their sign-in account) |
| Client notification | An approved client-facing milestone: **sampling-report** approved, **interim** (validation results complete), **final-report** issued (the internally approved final report; the client’s own approval is recorded later) | The job's client focal point email (Job Setup) |

Employee notifications come from the same calculation as each employee's *My work* list, so the email always matches what the dashboard shows. Nobody is emailed about a step they did themselves.

Client emails contain only the client progress view: job number, the client's own reference, the milestone and its date, stage statuses and the confirmed expected completion date. They contain no staff names, comments, internal statuses, links into the workspace or files. The final report itself is still issued by VAPS through the agreed channel.

**Duplicates.** Every message has a unique key in the `mail_outbox` table: event, recipient, job, and the job revision or report version that produced it. A retried or repeated request cannot queue the same message twice, and a message that was sent is never sent again. A failed send never undoes the workflow step.

**Nothing is retried automatically.** Each message ends in one of these states, shown in **Settings → Sign-in accounts → Email log** (MA001 only; also `GET /api/admin/mail`):

| Status | Meaning | What MA001 can do |
|---|---|---|
| Sent | Microsoft 365 accepted it (202) | Nothing |
| Blocked | Recipient not on `MAIL_ALLOWED_RECIPIENTS`; nothing left the server | Nothing |
| Queued | Written to the outbox when the workflow step was saved; sending follows within seconds. A row still queued after that (the server stopped before sending) was never attempted | **Send now** |
| Failed | Refused before sending (sign-in failed, 401, 403, 404, 429). Nothing was sent | **Retry** |
| Outcome unknown | No answer, a timeout, or any 5xx (500/502/503/504) from Microsoft. It may already have been delivered | **Check Sent Items…** |
| Sending | In progress. After 10 minutes with no result, it is treated like *Outcome unknown* | **Check Sent Items…** once stale |

Every notification ends with a short **Reference** (also shown in the Email log). *Check Sent Items…* shows the subject, recipient, reference and the time of the last attempt to look for in bsg@visionaps.com's **Sent Items**. Retry is enabled only after MA001 ticks *"I checked the Sent Items … and this email is not there"*. The server refuses that retry without the confirmation (409). It records `mail.sent_items_confirmed` in the audit log before sending, then `mail.retried` with the result. API: `POST /api/admin/mail { action: "retry", id, sentItemsChecked: true }`.

Invitations are never retried from the log. If an invitation fails or its outcome is unknown, the invitation is cancelled at once, so a link that arrives late does not work. MA001 sends a new invitation instead. The email body and one-time link are never stored.

## 1. What the VAPS Microsoft 365 administrator configures

Microsoft's tenant check reports visionaps.com as a managed Microsoft Entra tenant (brand "VAPS"). Whether bsg@visionaps.com is an Exchange Online **mailbox** (user or shared) and not just an account or alias is for the Microsoft 365 administrator to confirm in step 1a.

Approval needed from: a **Global Administrator**, or an **Exchange Administrator** together with an **Application Administrator** or **Privileged Role Administrator**, of the VAPS tenant.

a. **Confirm the mailbox.** In Exchange admin center → Recipients → Mailboxes, bsg@visionaps.com should be listed as a user or shared mailbox. Or run `Get-EXOMailbox bsg@visionaps.com | fl RecipientTypeDetails`.
   Also confirm that the mailbox's sign-in name is exactly `bsg@visionaps.com`: `Get-EXOMailbox bsg@visionaps.com | fl UserPrincipalName,PrimarySmtpAddress` must show the same address for both. Graph addresses the mailbox by its sign-in name, and the sender is fixed in the code.

b. **Register the app** (Entra admin center → App registrations → New registration). Use a name such as *Workflow VAPS mail sender*, single tenant, no redirect URI. Note the **Application (client) ID**, the **Directory (tenant) ID**, and the **Object ID of its Enterprise Application (service principal)**.

c. **Create a client secret** (Certificates & secrets). Give it a description and an expiry, for example 12 months, and put a renewal reminder in the calendar. The secret value is shown once. The person who creates it enters it directly as the secret `GRAPH_CLIENT_SECRET` in the Sites panel (step 2), or types it in there during a call with the site owner. Never send it by email, chat, Teams, a ticket or GitHub, and never paste it into a document.

d. **Grant send-only permission for this one mailbox, with Exchange Online RBAC for Applications.** Do **not** add or consent to *Mail.Send* in the app's Entra API permissions. An Entra grant applies to every mailbox in the tenant.
```powershell
Connect-ExchangeOnline
New-ServicePrincipal -AppId <Application (client) ID> -ObjectId <Enterprise app Object ID> -DisplayName "Workflow VAPS mail sender"
New-ManagementScope -Name "Workflow VAPS sender" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'bsg@visionaps.com'"
New-ManagementRoleAssignment -App <Application (client) ID> -Role "Application Mail.Send" -CustomResourceScope "Workflow VAPS sender"
```
Check it. The first command should say *InScope: True*, the second *False*:
```powershell
Test-ServicePrincipalAuthorization -Identity <Application (client) ID> -Resource bsg@visionaps.com
Test-ServicePrincipalAuthorization -Identity <Application (client) ID> -Resource <another mailbox>
```
That is the whole grant: **Application Mail.Send**, scoped to bsg@visionaps.com. No Mail.Read, Mail.ReadWrite or mailbox access, and no tenant-wide Mail.Send. Changes can take **up to 2 hours** to apply (Microsoft: "between 30 minutes and 2 hours", and the test command "bypasses this cache", so *InScope: True* can show before sending works). Wait 2 hours after the grant before the pilot email test.

e. **Mail flow.** Messages are sent by Exchange Online itself, so the existing SPF, DKIM and DMARC for visionaps.com apply and no DNS change is needed. Check that outbound policies allow bsg@visionaps.com to send to external recipients for client notifications. Copies are kept in the mailbox's Sent Items.

## 2. Server settings (Sites panel of the site, then redeploy)

| Setting | Type | Value |
|---|---|---|
| `MAIL_PROVIDER` | variable | `graph` |
| `MAIL_SENDER` | variable, optional | `bsg@visionaps.com` (the default). Any other value turns email off |
| `GRAPH_TENANT_ID` | variable | Directory (tenant) ID from 1b |
| `GRAPH_CLIENT_ID` | variable | Application (client) ID from 1b |
| `GRAPH_CLIENT_SECRET` | **secret** | The client secret value from 1c |
| `APP_ORIGIN` | variable | `https://vaps-pvt-workflow.m7wais.chatgpt.site` (links in every email are built from it) |
| `MAIL_ALLOWED_RECIPIENTS` | variable | **Test:** comma-separated test mailboxes only. Unset means nothing is sent to anyone. `*` only after the rollout is approved |
| `NOTIFY_STAFF` | variable | e.g. `assignment,review,returned`. Unset means off |
| `NOTIFY_CLIENT` | variable | e.g. `sampling-report,interim,final-report`. Unset means off. Enable separately, after the staff rollout |
| `MAIL_REPLY_TO` | variable, optional | Where replies go, if not bsg@visionaps.com |

A recipient not on `MAIL_ALLOWED_RECIPIENTS` is never contacted. An invitation to that address is refused, and a notification is logged as *blocked*.

## 3. Pilot email test (before any real recipient)

Run this only after the OneDrive pilot has passed, the mailbox grant in 1d is verified, and the site owner has approved the test inboxes. The full checklist is in the PR description.

1. Set `MAIL_ALLOWED_RECIPIENTS` to the approved test inboxes only (one staff test inbox, one client test inbox). Set `NOTIFY_STAFF=assignment` and `NOTIFY_CLIENT=sampling-report`. Redeploy.
2. **Invitation:** invite a test employee record with the staff test inbox. Check that the email comes from bsg@visionaps.com, that the link opens the official dashboard, that a password can be set once, and that a second use is refused.
3. **Employee notification:** dispatch a sample job with that test employee as the accountable engineer. The email should show the Job ID, the assigned action and a dashboard link to the job.
4. **Client notification:** give the sample job the client test inbox as client focal point email. Approve its sampling report, then check that the email has only the job number and reference, the milestone and the stage statuses.
5. In **Settings → Sign-in accounts → Email log**, the three test messages should show *Sent*, exactly once each, with nothing *Failed* or *Outcome unknown*. Rows for other staff on the test job show *Blocked*: that is expected and proves the allow-list works. Each test message should appear once in bsg@visionaps.com's Sent Items and once in its test inbox.
6. Clean-up: cancel or deactivate the test account, and clear the test inbox from the sample job.

Rollout after approval: set `MAIL_ALLOWED_RECIPIENTS=*`. Invite the four Super Users first, then Normal Users. Enable `NOTIFY_CLIENT` last.
