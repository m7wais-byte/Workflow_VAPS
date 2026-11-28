/**
 * Work that must not hold up the reply to the employee: OneDrive copies and notification emails.
 *
 * On Cloudflare the task is handed to the request's `ctx.waitUntil`, so the reply goes out first and the Worker keeps
 * running until the task ends (Cloudflare allows about 30 seconds after the response; callers keep their own work
 * within a time budget and leave the rest for the next save or Retry). Where there is no request context (Node tests,
 * scripts) the task simply runs. A failed task is logged by name only and never reaches the employee.
 */
import { getRequestExecutionContext } from "vinext/shims/request-context";

/** Seconds a background task may spend before it stops starting new work (Cloudflare's limit is about 30 s). */
export const BACKGROUND_BUDGET_MS = 20_000;

const pending = new Set<Promise<void>>();

export function background(label: string, task: () => Promise<unknown>): Promise<void> {
  const run: Promise<void> = Promise.resolve().then(task).then(() => undefined, (e: unknown) => {
    console.error("Background task failed", label, e instanceof Error ? e.name : "unknown");
  });
  pending.add(run);
  void run.finally(() => pending.delete(run));
  try { getRequestExecutionContext()?.waitUntil(run); } catch { /* no request context: the task just runs */ }
  return run;
}

/**
 * Starts `task` in the background and waits at most `waitMs` for it. Returns its result when it finished in time,
 * otherwise `undefined` (the task keeps running after the reply). Normal saves still report the real outcome; a slow
 * Microsoft service no longer holds the employee's save.
 */
export async function backgroundResult<T>(label: string, task: () => Promise<T>, waitMs: number): Promise<T | undefined> {
  let value: T | undefined, finished = false;
  const run = background(label, async () => { value = await task(); finished = true; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([run, new Promise<void>((ok) => { timer = setTimeout(ok, waitMs); })]);
  if (timer) clearTimeout(timer);
  return finished ? value : undefined;
}

/** Waits until every background task started so far (and any they start) has finished. For tests and scripts. */
export async function settleBackground(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}
