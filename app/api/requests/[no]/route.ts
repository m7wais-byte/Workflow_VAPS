import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { fail, readJson, reply } from "../../../../server/http";
import { can } from "../../../../server/workspace";
import { replaceRequest } from "../../../../server/requests";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ no: string }> };
export function PUT(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, ctx, actor, who }) => {
    if (!can(ctx, actor, "requests")) throw fail(403, "You do not have permission to add or edit requests.");
    const { no } = await route.params;
    const body = await readJson<{ record?: { no?: string } }>(request);
    if (body.record?.no !== decodeURIComponent(no)) throw fail(400, "The request could not be read.");
    const name = ctx.directory?.employees.find((e) => e.id === who.employeeId)?.name || who.employeeId;
    return reply({ record: await replaceRequest(db, who, name, body.record) });
  });
}
