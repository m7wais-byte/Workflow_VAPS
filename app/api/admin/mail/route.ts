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
 * their outcome. POST { action: "retry", id }: re-send one failed notification (never one already sent).
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
    const body = await readJson<{ action?: unknown; id?: unknown }>(request, 1000);
    if (body.action !== "retry" || typeof body.id !== "string") throw fail(400, "Unknown action.");
    const row = await retry(env, db, body.id);
    if (!row) throw fail(404, "This message is not in the email log.");
    await audit(db, { ...who, action: "mail.retried", target: row.id, detail: { status: row.status } });
    const { text_body: _t, html_body: _h, ...safe } = row; void _t; void _h;
    return reply(safe);
  });
}
