import { apiEnv } from "../../../../server/env";
import { signedIn } from "../../../../server/api";
import { readJson, reply } from "../../../../server/http";
import { saveJob } from "../../../../server/workspace";
import { queueJobNotifications, sendQueued } from "../../../../server/notify";
import { backgroundResult } from "../../../../server/background";
import { syncJob } from "../../../../server/onedrive";
export const dynamic = "force-dynamic";
const QUEUED = { status: "queued" as const, message: "OneDrive is answering slowly; the copy continues in the background. The job's OneDrive panel shows when it is done." };
type Context = { params: Promise<{ id: string }> };
/** Creates or saves a job from the job editor ({ job, revision, commands? }). */
export function PUT(request: Request, route: Context) {
  return signedIn(apiEnv(), request, async ({ db, env, ctx, who }) => {
    const { id } = await route.params;
    const { change, ...saved } = await saveJob(db, ctx, who, decodeURIComponent(id), await readJson(request));
    // Email notifications (off unless configured): written to the outbox now, sent after the reply.
    const prepared = change ? await queueJobNotifications(env, db, ctx, who, change) : [];
    // OneDrive pilot (job folders on the first save, pending copies on every save) and the sends run after the reply:
    // the save waits at most 2 seconds for them and never fails or is undone by them.
    const [copy, mail] = await Promise.all([
      backgroundResult("onedrive", () => syncJob(env, db, env.FILES, saved.job, who), 2000),
      prepared.length ? backgroundResult("mail", () => sendQueued(env, db, prepared), 2000) : undefined,
    ]);
    return reply({ ...saved, copy: copy ?? QUEUED, ...(prepared.length ? { mail: mail ?? { queued: prepared.length, sending: true } } : {}) });
  });
}
