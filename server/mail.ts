/**
 * Outgoing email: invitations, employee workflow notifications and client notifications (server/notify.ts).
 *
 * MAIL_PROVIDER selects the sender:
 *   - "graph": Microsoft Graph sendMail as the mailbox MAIL_SENDER (e.g. bsg@visionaps.com), application permission
 *     Mail.Send restricted in Exchange Online to that one mailbox (see EMAIL-SETUP.md). Needs GRAPH_TENANT_ID,
 *     GRAPH_CLIENT_ID and the secret GRAPH_CLIENT_SECRET. Send only: the app never reads a mailbox.
 *   - "resend": the Resend HTTP API. Needs MAIL_FROM and the secret RESEND_API_KEY.
 *   - "test": nothing is sent. The message is kept in memory for automated tests and the link is shown to the
 *     administrator on screen. For local development only; never set it on a deployed site.
 *   - unset: email is off; invitations are refused ("email is not configured") and notifications are not queued.
 * Production must also set APP_ORIGIN, so links always point at the real dashboard and never at a request's Host.
 *
 * MAIL_ALLOWED_RECIPIENTS guards every message: a comma-separated list of exact addresses (test mailboxes), or "*"
 * once real recipients are approved. Unset means nobody: nothing leaves the server and the attempt is recorded as
 * "blocked". Message bodies, links and credentials are never written to logs.
 */
import { fail } from "./http";

export type Mail = { to: string; subject: string; text: string; html: string };
export type Mailer = { mode: "graph" | "resend" | "test"; send(mail: Mail): Promise<void> };

/** Messages "sent" in test mode, newest last (automated tests read them). */
export const testOutbox: Mail[] = ((globalThis as { __vapsTestOutbox?: Mail[] }).__vapsTestOutbox ??= []);

export function mailerFrom(env: Record<string, unknown>): Mailer | null {
  const provider = String(env.MAIL_PROVIDER || "");
  if (provider === "test") return { mode: "test", send: async (mail) => { testOutbox.push(mail); } };
  if (provider === "graph") {
    const c = graphConfig(env);
    return c ? { mode: "graph", send: (mail) => graphSend(c, mail) } : null;
  }
  if (provider === "resend") {
    const key = env.RESEND_API_KEY, from = env.MAIL_FROM;
    if (typeof key !== "string" || !key || typeof from !== "string" || !from) return null;
    return {
      mode: "resend",
      async send(mail) {
        let response: Response;
        try {
          response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html, ...(typeof env.MAIL_REPLY_TO === "string" && env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}) }),
          });
        } catch { throw fail(502, "The invitation email could not be sent (the mail service did not answer). No invitation was issued; please retry."); }
        if (!response.ok) { console.error("Mail provider refused a message", response.status); throw fail(502, "The invitation email could not be sent. No invitation was issued; please retry or check the mail settings."); }
      },
    };
  }
  return null;
}

/* ---------- Recipient guard ---------- */

const normal = (a: string) => a.trim().toLowerCase();
/** Whether this server may send to the address (MAIL_ALLOWED_RECIPIENTS; unset = nobody, "*" = everyone). */
export function recipientAllowed(env: Record<string, unknown>, address: string) {
  const list = String(env.MAIL_ALLOWED_RECIPIENTS || "").split(",").map(normal).filter(Boolean);
  return list.includes("*") || list.includes(normal(address));
}
export const RECIPIENT_BLOCKED = "This address is not on the server's list of allowed recipients (MAIL_ALLOWED_RECIPIENTS), so nothing was sent.";

/* ---------- Microsoft Graph (application permission, one mailbox) ---------- */

type GraphConfig = { tenant: string; clientId: string; secret: string; sender: string; replyTo: string };
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export function graphConfig(env: Record<string, unknown>): GraphConfig | null {
  const tenant = text(env.GRAPH_TENANT_ID), clientId = text(env.GRAPH_CLIENT_ID), secret = text(env.GRAPH_CLIENT_SECRET), sender = text(env.MAIL_SENDER).toLowerCase();
  // A tenant GUID or verified domain only: "common"/"organizations" cannot issue application tokens.
  if (!tenant || ["common", "organizations", "consumers"].includes(tenant.toLowerCase()) || !clientId || !secret || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sender)) return null;
  return { tenant, clientId, secret, sender, replyTo: text(env.MAIL_REPLY_TO) };
}
let cachedToken: { key: string; value: string; expires: number } | null = null;
async function graphToken(c: GraphConfig) {
  const key = c.tenant + "|" + c.clientId;
  if (cachedToken && cachedToken.key === key && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  let r: Response;
  try {
    r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.secret, scope: "https://graph.microsoft.com/.default" }),
    });
  } catch { throw fail(502, "Microsoft 365 sign-in did not answer, so the email was not sent. Please retry."); }
  const data = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !data.access_token) {
    console.error("Graph token refused", r.status, data.error || "");
    throw fail(502, data.error === "invalid_client" ? "Microsoft 365 refused the app's credentials (GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET, or the secret expired), so the email was not sent."
      : "Microsoft 365 sign-in for the mail sender failed (check GRAPH_TENANT_ID and the app registration), so the email was not sent.");
  }
  cachedToken = { key, value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}
async function graphSend(c: GraphConfig, mail: Mail) {
  const message = {
    subject: mail.subject, body: { contentType: "HTML", content: mail.html },
    toRecipients: [{ emailAddress: { address: mail.to } }],
    ...(c.replyTo ? { replyTo: [{ emailAddress: { address: c.replyTo } }] } : {}),
  };
  let r: Response;
  try {
    r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.sender)}/sendMail`, {
      method: "POST", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${await graphToken(c)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
  } catch (e) { if (e instanceof Error && "status" in e) throw e; throw fail(502, "Microsoft 365 did not answer, so the email was not sent. Please retry."); }
  if (r.status === 202) return;
  if (r.status === 401) cachedToken = null;
  console.error("Graph sendMail refused", r.status);
  throw fail(502, r.status === 403 ? "Microsoft 365 did not allow the app to send as " + c.sender + " (Mail.Send or the Exchange mailbox scope is not in place). Nothing was sent."
    : r.status === 404 ? "Microsoft 365 did not find the mailbox " + c.sender + " (it must be an Exchange Online mailbox). Nothing was sent."
    : r.status === 429 ? "Microsoft 365 is limiting sends right now. Nothing was sent; please retry shortly."
    : `Microsoft 365 refused the email (${r.status}). Nothing was sent.`);
}
/** Tests: forget the cached Graph token. */
export const resetGraphToken = () => { cachedToken = null; };

export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function invitationMail(input: { to: string; name: string; employeeId: string; link: string; expiresAt: string; dashboard: string }): Mail {
  const expires = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat", hour12: false }).format(new Date(input.expiresAt)) + " (Oman time)";
  const text = [
    `Hello ${input.name},`,
    "",
    "You have been invited to the VAPS PVT Lab & Sampling workspace.",
    "Open this link to set your password and activate your account:",
    input.link,
    "",
    `The link works once and expires on ${expires}.`,
    `After that, sign in at ${input.dashboard} with this email address or your employee ID (${input.employeeId}) and your password.`,
    "",
    "If you were not expecting this invitation, ignore this email. Nobody at VAPS will ask you for your password.",
  ].join("\n");
  const html = `<p>Hello ${escape(input.name)},</p><p>You have been invited to the <strong>VAPS PVT Lab &amp; Sampling</strong> workspace.</p>`
    + `<p><a href="${escape(input.link)}">Set your password and activate your account</a></p>`
    + `<p>The link works once and expires on ${escape(expires)}.</p>`
    + `<p>After that, sign in at <a href="${escape(input.dashboard)}">${escape(input.dashboard)}</a> with this email address or your employee ID (<strong>${escape(input.employeeId)}</strong>) and your password.</p>`
    + `<p style="color:#6b818c">If you were not expecting this invitation, ignore this email. Nobody at VAPS will ask you for your password.</p>`;
  return { to: input.to, subject: "Your VAPS PVT Lab & Sampling account", text, html };
}
