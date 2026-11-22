import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { filesBucket, readFile } from "../../../../server/files";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
/** ?mode=view|download — the server decides whether the file is a restricted laboratory workbook. */
export function GET(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, actor, who }) => {
    const { id } = await route.params, url = new URL(request.url);
    return readFile(db, filesBucket(env), ctx, actor, who, id, url.searchParams.get("mode") === "download" ? "download" : "view");
  });
}
