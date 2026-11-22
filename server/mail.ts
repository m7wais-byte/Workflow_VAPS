/**
 * Outgoing email, used only for invitations.
 *
 * MAIL_PROVIDER selects the sender:
 *   - "resend": the Resend HTTP API (works from Cloudflare Workers). Needs MAIL_FROM (an address on a domain verified
 *     with the provider) and the secret RESEND_API_KEY. Production must also set APP_ORIGIN, so invitation links always
 *     point at the real dashboard address and never at a Host header sent by a client.
 *   - "test": nothing is sent. The message is kept in memory for automated tests and the link is shown to the
 *     administrator on screen. For local development only; never set it on a deployed site.
 *   - unset: invitations are refused ("email is not configured"); nothing is sent and no link is shown.
 * Message bodies and links are never written to logs.
 */
import { fail } from "./http";

export type Mail = { to: string; subject: string; text: string; html: string };
export type Mailer = { mode: "resend" | "test"; send(mail: Mail): Promise<void> };

/** Messages "sent" in test mode, newest last (automated tests read them). */
export const testOutbox: Mail[] = ((globalThis as { __vapsTestOutbox?: Mail[] }).__vapsTestOutbox ??= []);

export function mailerFrom(env: Record<string, unknown>): Mailer | null {
  const provider = String(env.MAIL_PROVIDER || "");
  if (provider === "test") return { mode: "test", send: async (mail) => { testOutbox.push(mail); } };
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

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

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
