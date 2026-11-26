/**
 * Workflow email notifications (employees and clients) with an outbox that prevents duplicate sends.
 *
 * Events are not a second status engine. After a job change is saved:
 *  - Employees: each employee's dashboard actions (app/work-items.ts, exactly what "My work" shows) are compared before
 *    and after. An action that newly appears is emailed to that employee: kind assignment/task → "assignment",
 *    review → "review", returned → "returned". The employee who made the change is not emailed about their own step.
 *  - Clients: approved, client-facing milestones only: an approved sampling report ("sampling-report"), completed
 *    validation results / interim report ("interim"), and the approved final report when the job is complete
 *    ("final-report"). The message uses the client progress view (app/job-progress.ts, audience "client"): no staff
 *    names, comments, internal statuses or files.
 *
 * Settings (server configuration; all off unless set):
 *   NOTIFY_STAFF   comma list of assignment, review, returned
 *   NOTIFY_CLIENT  comma list of sampling-report, interim, final-report
 * plus MAIL_PROVIDER, MAIL_ALLOWED_RECIPIENTS and APP_ORIGIN (server/mail.ts).
 *
 * Duplicates: every message has a dedupe key (event, recipient, job, the job revision that produced it). The key is
 * unique in mail_outbox, so a retried request, a repeated save or a second worker cannot queue it twice, and a message
 * already sent is never sent again. A retried workflow action is refused by the revision check before anything is
 * queued. Failed sends stay in the outbox with the reason; MA001 retries them (POST /api/admin/mail or Settings →
 * Sign-in accounts → Email log). A send whose outcome is unknown ("uncertain", or "sending" left stale) is never retried
 * automatically; MA001 retries it only after confirming the sender's Sent Items were checked, and that is audited.
 * A failure to send never fails or undoes the workflow save.
 */
import type { JobRecord } from "../app/page";
import { workItems, type WorkItem } from "../app/work-items";
import { jobProgressView, clientProgress, progressStatusLabel } from "../app/job-progress";
import { operationsFor, latest, interimReport, operationComplete } from "../app/operations-model";
import { canOpenJob } from "../app/job-access";
import { actorFor, withRecords, type Context, type Who } from "./workspace";
import { fail } from "./http";
import { escape, isUncertain, mailerFrom, recipientAllowed, RECIPIENT_BLOCKED, VAPS_SENDER, type Mail } from "./mail";

export type StaffEvent = "assignment" | "review" | "returned";
export type ClientEvent = "sampling-report" | "interim" | "final-report";
export type OutboxRow = { id: string; dedupe_key: string; audience: string; event: string; job_id: string | null; employee_id: string | null; recipient: string; subject: string; text_body: string | null; html_body: string | null; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null; updated_at: string };
type Queued = { dedupeKey: string; audience: "staff" | "client" | "invite"; event: string; jobId?: string; employeeId?: string; mail: Mail; keepBody?: boolean };

const list = (v: unknown) => String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const staffEvents = (env: Record<string, unknown>) => new Set(list(env.NOTIFY_STAFF).filter((e): e is StaffEvent => ["assignment", "review", "returned"].includes(e)));
export const clientEvents = (env: Record<string, unknown>) => new Set(list(env.NOTIFY_CLIENT).filter((e): e is ClientEvent => ["sampling-report", "interim", "final-report"].includes(e)));
export const dashboardOrigin = (env: Record<string, unknown>) => String(env.APP_ORIGIN || "").split(",")[0].trim().replace(/\/$/, "");
const validEmail = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(s.trim());
const today = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(new Date(at));
const omanDate = (at?: string) => at ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Muscat" }).format(new Date(at)) : "";
const staffEventOf = (i: WorkItem): StaffEvent => i.kind === "review" ? "review" : i.kind === "returned" ? "returned" : "assignment";

/* ---------- Event detection ---------- */

/** New dashboard actions per employee between two versions of one job. */
export function newStaffActions(ctx: Context, before: JobRecord | undefined, after: JobRecord, allJobs: JobRecord[], at: string) {
  const out: { employeeId: string; item: WorkItem }[] = [];
  if (!ctx.directory) return out;
  const day = today(at), others = allJobs.filter((j) => j.id !== after.id);
  for (const employee of ctx.directory.employees.filter((e) => e.active)) {
    let actorAfter;
    try { actorAfter = actorFor(ctx, employee.id, [...others, after]); } catch { continue; }
    const now = withRecords(ctx.values, () => canOpenJob(after, actorAfter) ? workItems([after], actorAfter, day).actions : []);
    if (!now.length) continue;
    const was = before ? withRecords(ctx.values, () => { const a = actorFor(ctx, employee.id, [...others, before]); return canOpenJob(before, a) ? workItems([before], a, day).actions : []; }) : [];
    const had = new Set(was.map((i) => i.key + "|" + i.kind));
    for (const item of now) if (!had.has(item.key + "|" + item.kind)) out.push({ employeeId: employee.id, item });
  }
  return out;
}

/** Approved client-facing milestones reached by this change. */
export function clientMilestones(before: JobRecord | undefined, after: JobRecord): { event: ClientEvent; version: string; at?: string }[] {
  const out: { event: ClientEvent; version: string; at?: string }[] = [];
  const o = operationsFor(after), b = before ? operationsFor(before) : undefined;
  const s = latest(o.samplingReports), sb = b ? latest(b.samplingReports) : undefined;
  if (s?.status === "Approved" && s.approvedAt && !(sb?.status === "Approved" && sb.version === s.version)) out.push({ event: "sampling-report", version: "v" + s.version, at: s.approvedAt });
  const i = interimReport(after), ib = before ? interimReport(before) : { state: "none" };
  if (i.state === "completed" && ib.state !== "completed") out.push({ event: "interim", version: "1", at: i.at });
  const f = latest(o.finalReports);
  if (f?.status === "Approved" && f.approvedAt && operationComplete(after) && !(before && operationComplete(before) && latest(b!.finalReports)?.version === f.version)) out.push({ event: "final-report", version: "v" + f.version, at: f.approvedAt });
  return out;
}

/* ---------- Messages ---------- */

const button = (href: string, label: string) => `<p><a href="${escape(href)}" style="display:inline-block;background:#0f5c7a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escape(label)}</a></p>`;
const foot = `<p style="color:#6b818c;font-size:12px">Sent by the VAPS PVT Lab &amp; Sampling workspace. Please do not share this email outside VAPS.</p>`;

export function staffMail(input: { to: string; name: string; job: JobRecord; item: WorkItem; event: StaffEvent; link: string }): Mail {
  const { job, item } = input;
  const heading = input.event === "review" ? "Awaiting your review" : input.event === "returned" ? "Returned to you for correction" : "Assigned to you";
  const detail = [item.test && `Test: ${item.test}`, item.sample && `Sample: ${item.sample}`, item.due && `Due: ${omanDate(item.due + "T12:00:00Z")}`].filter(Boolean) as string[];
  const subject = `[${job.jobNumber || job.id}] ${heading}: ${item.action}`;
  const text = [`Hello ${input.name},`, "", `${heading} in the VAPS workspace:`, "", `Job ID: ${job.jobNumber || job.id}`, `Client: ${job.clientName || "—"}`, `Action: ${item.action}`, `Your role: ${item.role || item.area}`, ...detail, "", `Open the job: ${input.link}`, "", "Sign in with your work email or employee ID."].join("\n");
  const html = `<p>Hello ${escape(input.name)},</p><p><strong>${escape(heading)}</strong> in the VAPS workspace:</p>`
    + `<table cellpadding="4" style="border-collapse:collapse"><tr><td>Job ID</td><td><strong>${escape(job.jobNumber || job.id)}</strong></td></tr><tr><td>Client</td><td>${escape(job.clientName || "—")}</td></tr><tr><td>Action</td><td><strong>${escape(item.action)}</strong></td></tr><tr><td>Your role</td><td>${escape(item.role || item.area)}</td></tr>`
    + detail.map((d) => { const [k, ...v] = d.split(": "); return `<tr><td>${escape(k)}</td><td>${escape(v.join(": "))}</td></tr>`; }).join("") + `</table>`
    + button(input.link, "Open the job in Workflow VAPS") + `<p>Sign in with your work email or employee ID.</p>` + foot;
  return { to: input.to, subject, text, html };
}

/** Wording follows the job's own status: VAPS approves the sampling report; an approved final report is *issued* to the client,
 *  and "approved" for the final report means the client's own approval, recorded later (Client approval stage). */
const clientHeading: Record<ClientEvent, string> = { "sampling-report": "Sampling report approved", interim: "Validation results completed", "final-report": "Final report issued" };
/** Client email: only fields of the client progress view and the client's own job identifiers. */
export function clientMail(input: { to: string; job: JobRecord; event: ClientEvent; at?: string; nowIso: string }): Mail {
  const { job } = input;
  const view = clientProgress(jobProgressView(job, { today: today(input.nowIso), audience: "client" }));
  const ref = job.jobNumber || job.id, theirs = job.clientReference ? ` (your reference ${job.clientReference})` : "";
  const expected = view.expected.date && (view.expected.kind === "actual" || view.expected.kind === "confirmed") ? omanDate(view.expected.date + "T12:00:00Z") : "";
  const stages = view.stages.filter((s) => !s.planned || s.status !== "not-started").map((s) => ({ label: s.label, status: progressStatusLabel[s.status] }));
  const lead = input.event === "final-report" ? "The final report for this job has been issued. VAPS sends the report itself through the agreed channel."
    : input.event === "sampling-report" ? "The sampling report for this job has been approved by VAPS." : "The validation results for this job's samples are complete.";
  const subject = `VAPS job ${ref}: ${clientHeading[input.event]}`;
  const text = [`Dear ${job.clientFocalPoint || "client"},`, "", `${lead}`, "", `Job: ${ref}${theirs}`, `Update: ${clientHeading[input.event]}${input.at ? " on " + omanDate(input.at) : ""}`, view.sentence ? `Status: ${view.sentence}` : "", expected ? `Expected completion: ${expected}` : "", "", ...stages.map((s) => `- ${s.label}: ${s.status}`), "", "Regards,", "VAPS PVT Laboratory"].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
  const html = `<p>Dear ${escape(job.clientFocalPoint || "client")},</p><p>${escape(lead)}</p>`
    + `<table cellpadding="4" style="border-collapse:collapse"><tr><td>Job</td><td><strong>${escape(ref)}</strong>${escape(theirs)}</td></tr><tr><td>Update</td><td>${escape(clientHeading[input.event])}${input.at ? " on " + escape(omanDate(input.at)) : ""}</td></tr>${view.sentence ? `<tr><td>Status</td><td>${escape(view.sentence)}</td></tr>` : ""}${expected ? `<tr><td>Expected completion</td><td>${escape(expected)}</td></tr>` : ""}</table>`
    + (stages.length ? `<ul>${stages.map((s) => `<li>${escape(s.label)}: ${escape(s.status)}</li>`).join("")}</ul>` : "")
    + `<p>Regards,<br>VAPS PVT Laboratory</p>`;
  return { to: input.to, subject, text, html };
}

/* ---------- Outbox ---------- */

/** Queues a message once (by dedupe key) and sends it. Returns the stored row; never throws for send failures. */
export async function deliver(env: Record<string, unknown>, db: D1Database, q: Queued, at = new Date().toISOString()): Promise<OutboxRow> {
  const id = crypto.randomUUID(), allowed = recipientAllowed(env, q.mail.to);
  const keep = q.keepBody !== false;
  await db.prepare(`INSERT INTO mail_outbox (id, dedupe_key, audience, event, job_id, employee_id, recipient, subject, text_body, html_body, status, attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING`)
    .bind(id, q.dedupeKey, q.audience, q.event, q.jobId ?? null, q.employeeId ?? null, q.mail.to.trim().toLowerCase(), q.mail.subject, keep ? q.mail.text : null, keep ? q.mail.html : null, allowed ? "queued" : "blocked", at, at).run();
  const row = (await db.prepare("SELECT * FROM mail_outbox WHERE dedupe_key = ?").bind(q.dedupeKey).first<OutboxRow>())!;
  if (row.id !== id) return row; // already queued earlier: never send twice
  if (!allowed) { await db.prepare("UPDATE mail_outbox SET last_error = ? WHERE id = ?").bind(RECIPIENT_BLOCKED, id).run(); return { ...row, last_error: RECIPIENT_BLOCKED }; }
  return attempt(env, db, row, q.mail, at);
}

/** A row left in "sending" longer than this (the worker stopped mid-send) can be retried by MA001. */
export const STALE_SENDING_MS = 10 * 60_000;
const staleBefore = (at: string) => new Date(new Date(at).getTime() - STALE_SENDING_MS).toISOString();

/** One send attempt for a row the caller has checked (deliver: new "queued"; retry: nextStep). A row is claimed first, so two retries cannot both send it. */
async function attempt(env: Record<string, unknown>, db: D1Database, row: OutboxRow, mail: Mail, at: string): Promise<OutboxRow> {
  // Claimed only from the exact state the caller checked (status and updated_at), so a row that changed meanwhile, for
  // example to "uncertain" by a parallel attempt, is never sent without its own check.
  const claim = await db.prepare("UPDATE mail_outbox SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = ? AND updated_at = ? AND status IN ('queued', 'failed', 'uncertain', 'sending')").bind(at, row.id, row.status, row.updated_at).run();
  if (claim.meta.changes !== 1) return (await db.prepare("SELECT * FROM mail_outbox WHERE id = ?").bind(row.id).first<OutboxRow>())!;
  const mailer = mailerFrom(env);
  let status = "sent", error: string | null = null;
  if (!mailer) { status = "failed"; error = "Email is not configured on this server."; }
  else if (!recipientAllowed(env, mail.to)) { status = "blocked"; error = RECIPIENT_BLOCKED; }
  else { try { await mailer.send(mail); } catch (e) { status = isUncertain(e) ? "uncertain" : "failed"; error = e instanceof Error ? e.message : "The email could not be sent."; } }
  await db.prepare("UPDATE mail_outbox SET status = ?, last_error = ?, sent_at = ?, updated_at = ? WHERE id = ?").bind(status, error, status === "sent" ? at : null, at, row.id).run();
  return (await db.prepare("SELECT * FROM mail_outbox WHERE id = ?").bind(row.id).first<OutboxRow>())!;
}

const mailerSender = (env: Record<string, unknown>) => String(env.MAIL_SENDER || "").trim().toLowerCase() || VAPS_SENDER;

/** What MA001 may do with a row: "retry", "check-sent-items" (outcome unknown: confirm Sent Items first) or nothing. */
export function nextStep(row: Pick<OutboxRow, "audience" | "status" | "updated_at">, at = new Date().toISOString()): "retry" | "check-sent-items" | null {
  if (row.audience === "invite") return null;
  if (row.status === "failed" || row.status === "queued") return "retry";
  if (row.status === "uncertain" || (row.status === "sending" && row.updated_at < staleBefore(at))) return "check-sent-items";
  return null;
}

/**
 * MA001: retry one failed or still queued notification. One whose outcome is unknown ("uncertain", or "sending" left
 * stale) needs sentItemsChecked; onConfirmed runs (to audit the confirmation) before that send is attempted.
 * Invitations are re-sent from Sign-in accounts instead.
 */
export async function retry(env: Record<string, unknown>, db: D1Database, id: string, at = new Date().toISOString(), sentItemsChecked = false, onConfirmed?: (row: OutboxRow) => Promise<void>) {
  const row = await db.prepare("SELECT * FROM mail_outbox WHERE id = ?").bind(id).first<OutboxRow>();
  if (!row) return null;
  if (row.audience === "invite" || !row.html_body || !row.text_body) return { ...row, last_error: "Invitations are not stored; send a new invitation from Settings → Sign-in accounts." };
  // Outcome unknown: Microsoft may already have accepted it, so MA001 must first check the sender's Sent Items and
  // confirm it is not there (sentItemsChecked). A fresh "sending" row is still in progress and is left alone.
  const step = nextStep(row, at);
  if (!step) return row;
  if (step === "check-sent-items") {
    if (!sentItemsChecked) throw fail(409, `It is not known whether this email was sent: Microsoft may already have accepted it. Check the Sent Items of ${mailerSender(env)} for "${row.subject}" to ${row.recipient}. Retry only if it is not there, and confirm that you checked.`);
    await onConfirmed?.(row);
  }
  return attempt(env, db, row, { to: row.recipient, subject: row.subject, text: row.text_body, html: row.html_body }, at);
}

export async function outbox(db: D1Database, limit = 100, at = new Date().toISOString()) {
  const rows = (await db.prepare("SELECT id, audience, event, job_id, employee_id, recipient, subject, status, attempts, last_error, created_at, sent_at, updated_at FROM mail_outbox ORDER BY created_at DESC LIMIT ?").bind(limit).all<Omit<OutboxRow, "dedupe_key" | "text_body" | "html_body">>()).results;
  return rows.map((r) => ({ ...r, next: nextStep(r, at) }));
}

/* ---------- After a job change ---------- */

/**
 * Called after a job write succeeded. Works out the notifications for this change and sends them.
 * Returns a short summary for the response; problems are recorded, never thrown.
 */
export async function notifyJobChange(env: Record<string, unknown>, db: D1Database, ctx: Context, who: Who, change: { before?: JobRecord; after: JobRecord; revision: number; allJobs: JobRecord[] }, at = new Date().toISOString()) {
  const result = { queued: 0, sent: 0, failed: 0, blocked: 0 };
  const staff = staffEvents(env), client = clientEvents(env);
  if ((!staff.size && !client.size) || !mailerFrom(env)) return result;
  const origin = dashboardOrigin(env);
  const tally = (r: OutboxRow) => { result.queued++; if (r.status === "sent") result.sent++; else if (r.status === "blocked") result.blocked++; else if (r.status === "failed") result.failed++; };
  try {
    const job = change.after;
    if (staff.size && origin) {
      const emails = new Map(((await db.prepare("SELECT employee_id, email FROM accounts WHERE active = 1 AND email IS NOT NULL").all<{ employee_id: string; email: string }>()).results).map((r) => [r.employee_id, r.email]));
      for (const { employeeId, item } of newStaffActions(ctx, change.before, job, change.allJobs, at)) {
        const event = staffEventOf(item), to = emails.get(employeeId);
        if (!staff.has(event) || employeeId === who.employeeId || !validEmail(to)) continue;
        const name = ctx.directory?.employees.find((e) => e.id === employeeId)?.name || employeeId;
        const link = `${origin}/#workflow/${encodeURIComponent(job.id)}/overview`;
        tally(await deliver(env, db, { dedupeKey: `staff:${event}:${employeeId}:${item.key}:${job.id}:r${change.revision}`, audience: "staff", event, jobId: job.id, employeeId, mail: staffMail({ to, name, job, item, event, link }) }, at));
      }
    }
    if (client.size) {
      const to = job.clientFocalPointEmail?.trim();
      for (const m of withRecords(ctx.values, () => clientMilestones(change.before, job))) {
        if (!client.has(m.event) || !validEmail(to)) continue;
        tally(await deliver(env, db, { dedupeKey: `client:${m.event}:${job.id}:${m.version}:${to.toLowerCase()}`, audience: "client", event: m.event, jobId: job.id, mail: withRecords(ctx.values, () => clientMail({ to, job, event: m.event, at: m.at, nowIso: at })) }, at));
      }
    }
  } catch (e) { console.error("Notification step failed", e instanceof Error ? e.name : "unknown"); }
  return result;
}
