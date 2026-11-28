import { apiEnv } from "../../../../../server/env";
import { signedIn } from "../../../../../server/api";
import { readJson, reply } from "../../../../../server/http";
import { runJobOperations } from "../../../../../server/workspace";
import { queueJobNotifications, sendQueued } from "../../../../../server/notify";
import { backgroundResult } from "../../../../../server/background";
import { syncJob } from "../../../../../server/onedrive";
export const dynamic = "force-dynamic";
const QUEUED = { status: "queued" as const, message: "OneDrive is answering slowly; the copy continues in the background. The job's OneDrive panel shows when it is done." };
type Context = { params: Promise<{ id: string }> };
/** Workflow commands ({ commands, revision }), applied with the session's employee as the actor. */
export function POST(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, who }) => {
    const { id } = await route.params;
    const { change, ...saved } = await runJobOperations(db, ctx, who, decodeURIComponent(id), await readJson(request));
    // Notifications are written to the outbox now; OneDrive copies and sends run after the reply (at most 2 s waited for).
    const prepared = change ? await queueJobNotifications(env, db, ctx, who, change) : [];
    const [copy, mail] = await Promise.all([
      backgroundResult("onedrive", () => syncJob(env, db, env.FILES, saved.job, who), 2000),
      prepared.length ? backgroundResult("mail", () => sendQueued(env, db, prepared), 2000) : undefined,
    ]);
    return reply({ ...saved, copy: copy ?? QUEUED, ...(prepared.length ? { mail: mail ?? { queued: prepared.length, sending: true } } : {}) });
  });
}
