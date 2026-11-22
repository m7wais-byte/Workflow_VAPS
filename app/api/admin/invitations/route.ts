import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { fail, readJson, reply } from "../../../../server/http";
import { audit, cancelInvitation, createInvitation } from "../../../../server/auth";
import { invitationMail, mailerFrom } from "../../../../server/mail";
import { administratorId } from "../../../authorization";
export const dynamic = "force-dynamic";
const ttlHours = (env: Record<string, unknown>) => { const n = Number(env.INVITE_TTL_HOURS); return Number.isFinite(n) && n >= 1 && n <= 336 ? n : 72; };
/**
 * Send invitation (Administrator only): { employeeId, email }. Creates or updates the not-yet-active account for that
 * employee and emails a one-time link to set a password. Public registration does not exist: only this route issues links.
 */
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, who }) => {
    if (who.employeeId !== administratorId) throw fail(403, "Only the Administrator can send invitations.");
    const body = await readJson<{ employeeId?: unknown; email?: unknown }>(request, 2000);
    const employee = ctx.directory?.employees.find((e) => e.id === body.employeeId && e.active);
    if (!employee) throw fail(400, "Choose an active employee from the directory.");
    const mailer = mailerFrom(env);
    if (!mailer) throw fail(503, "Email is not configured on this server, so no invitation was sent. See AUTHENTICATION.md → Email for invitations.");
    const configured = String(env.APP_ORIGIN || "").split(",")[0].trim().replace(/\/$/, "");
    if (!configured && mailer.mode !== "test") throw fail(503, "APP_ORIGIN (the dashboard address) is not configured, so no invitation was sent.");
    const dashboard = configured || new URL(request.url).origin;
    const invitation = await createInvitation(db, who, { employeeId: employee.id, employeeName: employee.name, email: body.email }, ttlHours(env));
    // The token travels only in the link's #fragment, which browsers never send to a server or in a Referer.
    const link = `${dashboard}/#invite=${invitation.token}`;
    try { await mailer.send(invitationMail({ to: invitation.email, name: employee.name, employeeId: employee.id, link, expiresAt: invitation.expiresAt, dashboard })); }
    catch (error) { await cancelInvitation(db, invitation.token); throw error; }
    await audit(db, { ...who, action: "account.invited", target: invitation.accountId, detail: { employeeId: employee.id, email: invitation.email, expiresAt: invitation.expiresAt, mail: mailer.mode } });
    return reply({ accountId: invitation.accountId, employeeId: employee.id, email: invitation.email, expiresAt: invitation.expiresAt, mail: mailer.mode, ...(mailer.mode === "test" ? { testLink: link } : {}) });
  });
}
