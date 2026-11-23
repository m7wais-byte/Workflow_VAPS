import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { audit } from "../../../../server/auth";
import { fail, readJson, reply } from "../../../../server/http";
import { mailerFrom, graphConfig } from "../../../../server/mail";
import { clientEvents, dashboardOrigin, outbox, retry, staffEvents } from "../../../../server/notify";
import { administratorId } from "../../../authorization";
export const dynamic = "force-dynamic";
/**
 * Email send log, Administrator (MA001) only. GET: configuration summary (no secrets) and the latest messages with
 * their outcome. POST { action: "retry", id, sentItemsChecked? }: re-send one failed notification (never one already sent). A message
 * whose outcome is unknown ("uncertain", or interrupted while "sending") also needs sentItemsChecked: true, after MA001
 * has checked the sender's Sent Items; that confirmation is audited (mail.sent_items_confirmed). UI: Settings → Sign-in accounts.
 */
export function GET(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, actor }) => {
    if (actor.id !== administratorId) throw fail(403, "Only the Administrator can view the email log.");
    const mailer = mailerFrom(env), g = graphConfig(env);
    const allowed = String(env.MAIL_ALLOWED_RECIPIENTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    return reply({
      config: { provider: mailer?.mode || null, sender: g?.sender || null, dashboard: dashboardOrigin(env) || null, allowedRecipients: allowed.includes("*") ? "everyone" : allowed, staffEvents: [...staffEvents(env)], clientEvents: [...clientEvents(env)] },
      messages: await outbox(db),
    });
  });
}
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, actor, who }) => {
    if (actor.id !== administratorId) throw fail(403, "Only the Administrator can retry emails.");
    const body = await readJson<{ action?: unknown; id?: unknown; sentItemsChecked?: unknown }>(request, 1000);
    if (body.action !== "retry" || typeof body.id !== "string") throw fail(400, "Unknown action.");
    let confirmed = false;
    // The Sent Items confirmation is audited before the send is attempted, so it is on record even if the send fails.
    const row = await retry(env, db, body.id, undefined, body.sentItemsChecked === true, async (r) => {
      confirmed = true;
      await audit(db, { ...who, action: "mail.sent_items_confirmed", target: r.id, detail: { recipient: r.recipient, subject: r.subject, previousStatus: r.status, attempts: r.attempts } });
    });
    if (!row) throw fail(404, "This message is not in the email log.");
    await audit(db, { ...who, action: "mail.retried", target: row.id, detail: { status: row.status, attempts: row.attempts, ...(confirmed ? { sentItemsChecked: true } : {}) } });
    const { text_body: _t, html_body: _h, ...safe } = row; void _t; void _h;
    return reply(safe);
  });
}
