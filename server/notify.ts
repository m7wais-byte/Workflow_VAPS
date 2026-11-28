/**
 * Workflow email notifications (employees and clients) with an outbox that prevents duplicate sends.
 *
 * Events are not a second status engine. After a job change is saved:
 *  - Employees: each employee's dashboard actions (app/work-items.ts, exactly what "My work" shows) are compared before
 *    and after. An action that newly appears is emailed to that employee: kind assignment/task → "assignment",
 *    review → "review", returned → "returned". The employee who made the change is not emailed about their own step.
 *  - Clients: approved, client-facing milestones only: an approved sampling report ("sampling-report"), completed
 *    validation results / interim report ("interim"), and the final report once the coordinator records that it
 *    was issued to the client ("final-report"; the internal approval alone sends nothing). The message uses the client progress view (app/job-progress.ts, audience "client"): no staff
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
import { workItems, type WorkItem, type UpcomingItem } from "../app/work-items";
import { jobProgressView, clientProgress, progressStatusLabel } from "../app/job-progress";
import { operationsFor, latest, interimReport, operationComplete, finalIssued } from "../app/operations-model";
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

/**
 * A test assigned with a planned start after today waits in "Coming up", not in the actions, so it never "newly
 * appears" as an action. Its assignment is emailed when it newly appears in Coming up (once: the action that appears on
 * the start date was already in that employee's list before and after any later save that day).
 */
export function newLaterAssignments(ctx: Context, before: JobRecord | undefined, after: JobRecord, allJobs: JobRecord[], at: string) {
  const out: { employeeId: string; item: WorkItem }[] = [];
  if (!ctx.directory) return out;
  const day = today(at), others = allJobs.filter((j) => j.id !== after.id);
  const later = (job: JobRecord, id: string, jobs: JobRecord[]) => withRecords(ctx.values, () => { const a = actorFor(ctx, id, jobs); return canOpenJob(job, a) ? workItems([job], a, day).upcoming.filter((u: UpcomingItem) => u.key.startsWith("soon-test:")) : []; });
  for (const employee of ctx.directory.employees.filter((e) => e.active)) {
    let now: UpcomingItem[];
    try { now = later(after, employee.id, [...others, after]); } catch { continue; }
    if (!now.length) continue;
    const had = new Set(before ? later(before, employee.id, [...others, before]).map((u) => u.key) : []);
    for (const u of now) {
      if (had.has(u.key)) continue;
      const start = /(\d{4}-\d{2}-\d{2})/.exec(u.after)?.[1];
      out.push({ employeeId: employee.id, item: { key: u.key.replace(/^soon-test:/, "test:"), kind: "assignment", action: `Start test${start ? " on " + omanDate(start + "T12:00:00Z") : ""}`, jobId: u.jobId, jobNumber: u.jobNumber, client: u.client, area: u.area, role: u.role, test: u.test, sample: u.sample, due: u.due, dueKind: u.dueKind, open: u.open } as unknown as WorkItem });
    }
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
  // The final report is client news when the coordinator records it as issued, not at the internal approval.
  const f = finalIssued(after), fb = before ? finalIssued(before) : undefined;
  if (f?.issuedAt && operationComplete(after) && fb?.version !== f.version) out.push({ event: "final-report", version: "v" + f.version, at: f.issuedAt });
  return out;
}

/* ---------- Messages ---------- */

const button = (href: string, label: string) => `<p><a href="${escape(href)}" style="display:inline-block;background:#0f5c7a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escape(label)}</a></p>`;
const foot = `<p style="color:#6b818c;font-size:12px">Sent by the VAPS PVT Lab &amp; Sampling workspace. Please do not share this email outside VAPS.</p>`;
const reference = (ref?: string) => (ref ? `<p style="color:#6b818c;font-size:12px">Reference: ${escape(ref)}</p>` : "");

export function staffMail(input: { to: string; name: string; job: JobRecord; item: WorkItem; event: StaffEvent; link: string; ref?: string }): Mail {
  const { job, item } = input;
  const heading = input.event === "review" ? "Awaiting your review" : input.event === "returned" ? "Returned to you for correction" : "Assigned to you";
  const detail = [item.test && `Test: ${item.test}`, item.sample && `Sample: ${item.sample}`, item.due && `Due: ${omanDate(item.due + "T12:00:00Z")}`].filter(Boolean) as string[];
  const subject = `[${job.jobNumber || job.id}] ${heading}: ${item.action}`;
  const text = [`Hello ${input.name},`, "", `${heading} in the VAPS workspace:`, "", `Job ID: ${job.jobNumber || job.id}`, `Client: ${job.clientName || "—"}`, `Action: ${item.action}`, `Your role: ${item.role || item.area}`, ...detail, "", `Open the job: ${input.link}`, "", "Sign in with your work email or employee ID.", ...(input.ref ? ["", `Reference: ${input.ref}`] : [])].join("\n");
  const html = `<p>Hello ${escape(input.name)},</p><p><strong>${escape(heading)}</strong> in the VAPS workspace:</p>`
    + `<table cellpadding="4" style="border-collapse:collapse"><tr><td>Job ID</td><td><strong>${escape(job.jobNumber || job.id)}</strong></td></tr><tr><td>Client</td><td>${escape(job.clientName || "—")}</td></tr><tr><td>Action</td><td><strong>${escape(item.action)}</strong></td></tr><tr><td>Your role</td><td>${escape(item.role || item.area)}</td></tr>`
    + detail.map((d) => { const [k, ...v] = d.split(": "); return `<tr><td>${escape(k)}</td><td>${escape(v.join(": "))}</td></tr>`; }).join("") + `</table>`
    + button(input.link, "Open the job in Workflow VAPS") + `<p>Sign in with your work email or employee ID.</p>` + foot + reference(input.ref);
  return { to: input.to, subject, text, html };
}

/** Wording follows the job's own status: VAPS approves the sampling report; an approved final report is *issued* to the client,
 *  and "approved" for the final report means the client's own approval, recorded later (Client approval stage). */
const clientHeading: Record<ClientEvent, string> = { "sampling-report": "Sampling report approved", interim: "Validation results completed", "final-report": "Final report issued" };
/** Client email: only fields of the client progress view and the client's own job identifiers. */
export function clientMail(input: { to: string; job: JobRecord; event: ClientEvent; at?: string; nowIso: string; ref?: string }): Mail {
  const { job } = input;
  const view = clientProgress(jobProgressView(job, { today: today(input.nowIso), audience: "client" }));
  const ref = job.jobNumber || job.id, theirs = job.clientReference ? ` (your reference ${job.clientReference})` : "";
  const expected = view.expected.date && (view.expected.kind === "actual" || view.expected.kind === "confirmed") ? omanDate(view.expected.date + "T12:00:00Z") : "";
  const stages = view.stages.filter((s) => !s.planned || s.status !== "not-started").map((s) => ({ label: s.label, status: progressStatusLabel[s.status] }));
  const lead = input.event === "final-report" ? "VAPS has issued the final report for this job. The report itself reaches you through the agreed channel (for example email or transmittal)."
    : input.event === "sampling-report" ? "The sampling report for this job has been approved by VAPS." : "The validation results for this job's samples are complete.";
  const subject = `VAPS job ${ref}: ${clientHeading[input.event]}`;
  const text = [`Dear ${job.clientFocalPoint || "client"},`, "", `${lead}`, "", `Job: ${ref}${theirs}`, `Update: ${clientHeading[input.event]}${input.at ? " on " + omanDate(input.at) : ""}`, view.sentence ? `Status: ${view.sentence}` : "", expected ? `Expected completion: ${expected}` : "", "", ...stages.map((s) => `- ${s.label}: ${s.status}`), "", "Regards,", "VAPS PVT Laboratory", ...(input.ref ? ["", `Reference: ${input.ref}`] : [])].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
  const html = `<p>Dear ${escape(job.clientFocalPoint || "client")},</p><p>${escape(lead)}</p>`
    + `<table cellpadding="4" style="border-collapse:collapse"><tr><td>Job</td><td><strong>${escape(ref)}</strong>${escape(theirs)}</td></tr><tr><td>Update</td><td>${escape(clientHeading[input.event])}${input.at ? " on " + escape(omanDate(input.at)) : ""}</td></tr>${view.sentence ? `<tr><td>Status</td><td>${escape(view.sentence)}</td></tr>` : ""}${expected ? `<tr><td>Expected completion</td><td>${escape(expected)}</td></tr>` : ""}</table>`
    + (stages.length ? `<ul>${stages.map((s) => `<li>${escape(s.label)}: ${escape(s.status)}</li>`).join("")}</ul>` : "")
    + `<p>Regards,<br>VAPS PVT Laboratory</p>` + reference(input.ref);
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

/* ---------- After a job change: queue first, send afterwards ---------- */

/** The short reference printed in a message and shown in the email log (to find it in the sender's Sent Items). */
export const mailReference = (id: string) => id.slice(0, 8).toUpperCase();
type Prepared = { row: OutboxRow; mail: Mail };
type Draft = Queued & { id: string; status: "queued" | "blocked"; error: string | null };

/**
 * Works out this change's notifications and writes them all to the outbox in one batch: "queued" when they may be
 * sent, "blocked" (with the reason) when the address is not allowed or not usable. Quick, so it runs inside the
 * request: a request cancelled afterwards leaves queued rows that MA001 can send from the email log, never lost ones.
 * Returns the rows this call created that are waiting to be sent.
 */
export async function queueJobNotifications(env: Record<string, unknown>, db: D1Database, ctx: Context, who: Who, change: { before?: JobRecord; after: JobRecord; revision: number; allJobs: JobRecord[] }, at = new Date().toISOString()): Promise<Prepared[]> {
  const staff = staffEvents(env), client = clientEvents(env);
  if ((!staff.size && !client.size) || !mailerFrom(env)) return [];
  const origin = dashboardOrigin(env), job = change.after, drafts: Draft[] = [];
  const draft = (q: Queued & { id: string }, unusable?: string) => {
    const allowed = !unusable && recipientAllowed(env, q.mail.to);
    drafts.push({ ...q, status: allowed ? "queued" : "blocked", error: unusable || (allowed ? null : RECIPIENT_BLOCKED) });
  };
  try {
    if (staff.size && origin) {
      const emails = new Map(((await db.prepare("SELECT employee_id, email FROM accounts WHERE active = 1 AND email IS NOT NULL").all<{ employee_id: string; email: string }>()).results).map((r) => [r.employee_id, r.email]));
      const found = [...newStaffActions(ctx, change.before, job, change.allJobs, at), ...newLaterAssignments(ctx, change.before, job, change.allJobs, at)];
      for (const { employeeId, item } of found) {
        try {
          const event = staffEventOf(item), to = emails.get(employeeId);
          // No sign-in account or email (e.g. drivers without a work email): nothing to send, nothing to record.
          if (!staff.has(event) || employeeId === who.employeeId || !validEmail(to)) continue;
          const name = ctx.directory?.employees.find((e) => e.id === employeeId)?.name || employeeId;
          const link = `${origin}/#workflow/${encodeURIComponent(job.id)}/overview`, id = crypto.randomUUID();
          draft({ id, dedupeKey: `staff:${event}:${employeeId}:${item.key}:${job.id}:r${change.revision}`, audience: "staff", event, jobId: job.id, employeeId, mail: staffMail({ to, name, job, item, event, link, ref: mailReference(id) }) });
        } catch (e) { console.error("Notification for one employee failed", e instanceof Error ? e.name : "unknown"); }
      }
    }
    if (client.size) {
      const raw = String(job.clientFocalPointEmail || "").trim();
      for (const m of withRecords(ctx.values, () => clientMilestones(change.before, job))) {
        if (!client.has(m.event) || !raw) continue; // no focal-point email: nothing is sent to the client
        try {
          const id = crypto.randomUUID(), to = raw.slice(0, 254), usable = validEmail(to);
          const mail = usable ? withRecords(ctx.values, () => clientMail({ to, job, event: m.event, at: m.at, nowIso: at, ref: mailReference(id) })) : { to, subject: `VAPS job ${job.jobNumber || job.id}: ${m.event}`, text: "", html: "" };
          draft({ id, dedupeKey: `client:${m.event}:${job.id}:${m.version}:${to.toLowerCase()}`, audience: "client", event: m.event, jobId: job.id, mail },
            usable ? undefined : "The job's client focal-point email is not one valid address (check Job Setup), so nothing was sent.");
        } catch (e) { console.error("Client notification failed", e instanceof Error ? e.name : "unknown"); }
      }
    }
    if (!drafts.length) return [];
    await db.batch(drafts.map((d) => db.prepare(`INSERT INTO mail_outbox (id, dedupe_key, audience, event, job_id, employee_id, recipient, subject, text_body, html_body, status, attempts, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING`)
      .bind(d.id, d.dedupeKey, d.audience, d.event, d.jobId ?? null, d.employeeId ?? null, d.mail.to.trim().toLowerCase(), d.mail.subject, d.mail.text || null, d.mail.html || null, d.status, d.error, at, at)));
    const prepared: Prepared[] = [];
    for (const d of drafts.filter((x) => x.status === "queued")) {
      const row = await db.prepare("SELECT * FROM mail_outbox WHERE id = ?").bind(d.id).first<OutboxRow>();
      if (row && row.status === "queued") prepared.push({ row, mail: d.mail }); // a dedupe-key conflict keeps the earlier row: never sent twice
    }
    return prepared;
  } catch (e) { console.error("Notification step failed", e instanceof Error ? e.name : "unknown"); return []; }
}

/** Sends rows written by queueJobNotifications, one by one, within a time budget. Rows not reached stay "queued". */
export async function sendQueued(env: Record<string, unknown>, db: D1Database, prepared: Prepared[], budgetMs = 20_000) {
  const result = { queued: prepared.length, sent: 0, failed: 0, blocked: 0, waiting: 0 }, started = Date.now();
  for (const { row, mail } of prepared) {
    if (Date.now() - started > budgetMs) { result.waiting++; continue; }
    try {
      const r = await attempt(env, db, row, mail, new Date().toISOString());
      if (r.status === "sent") result.sent++; else if (r.status === "blocked") result.blocked++; else if (r.status === "failed" || r.status === "uncertain") result.failed++;
    } catch (e) { result.failed++; console.error("Sending one notification failed", e instanceof Error ? e.name : "unknown"); }
  }
  return result;
}

/**
 * Called after a job write succeeded. Works out the notifications for this change and sends them.
 * Returns a short summary for the response; problems are recorded, never thrown.
 */
export async function notifyJobChange(env: Record<string, unknown>, db: D1Database, ctx: Context, who: Who, change: { before?: JobRecord; after: JobRecord; revision: number; allJobs: JobRecord[] }, at = new Date().toISOString()) {
  const prepared = await queueJobNotifications(env, db, ctx, who, change, at);
  const sent = await sendQueued(env, db, prepared);
  return { queued: sent.queued, sent: sent.sent, failed: sent.failed, blocked: sent.blocked };
}
