import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { fail, readJson, reply } from "../../../../server/http";
import { administratorId } from "../../../authorization";
import { applyImport, planImport, planReport } from "../../../../server/import";
export const dynamic = "force-dynamic";
/**
 * Administrator import of a browser export: { action: "plan" | "apply", exportText, includeDemo? }.
 * "apply" re-plans from the same file on the server (a plan from the browser is never trusted) and writes only new
 * records; existing rows are never overwritten. Files go to R2 when the FILES binding exists.
 */
export function POST(request: Request) {
  return signedIn(apiEnv(), request, async ({ db, env, who }) => {
    if (who.employeeId !== administratorId) throw fail(403, "Only the administrator can import records.");
    const body = await readJson<{ action?: unknown; exportText?: unknown; includeDemo?: unknown }>(request, 95_000_000);
    if (typeof body.exportText !== "string" || !["plan", "apply"].includes(body.action as string)) throw fail(400, "Choose an export file.");
    const plan = await planImport(db, body.exportText, { includeDemo: body.includeDemo === true });
    if (body.action === "plan") return reply({ report: planReport(plan), problems: plan.problems.length, fileStorage: !!env.FILES });
    const result = await applyImport(db, plan, who.employeeId, new Date().toISOString(), { bucket: env.FILES });
    return reply({ ...result, report: planReport(plan) });
  });
}
