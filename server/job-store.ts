/**
 * Jobs in D1. Every change goes through the existing workflow model (applyJobOperation, trashJob, restoreJob) with
 * an Actor built on the server, then the same save rules as the browser (app/job-save.ts). The acting employee and
 * the time are set here, never taken from the request body. A stale revision is refused, and the job row and its
 * audit entry are written together or not at all.
 *
 * Not exposed over HTTP yet: the API routes come with employee sign-in (Phase A), because every route needs the
 * signed-in employee's ID from a server session.
 */
import type { JobRecord } from '../app/page';
import { applyJobOperation } from '../app/job-access';
import { restoreJob, trashJob, type Command } from '../app/operations-model';
import { assertActiveAssignments, prepareJobForSave } from '../app/job-save';
import { assertJobNumberAvailable } from '../app/job-numbering';
import { buildActor } from './settings-store';
import { auditAfterChange, StoreError, type D1Like } from './d1';

export type StoredJob = { job: JobRecord; revision: number };
type Row = { payload: string; revision: number };

export async function getJob(db: D1Like, id: string): Promise<StoredJob | null> {
  const row = await db.prepare("SELECT payload, revision FROM jobs WHERE id = ?").bind(id).first<Row>();
  return row ? { job: JSON.parse(row.payload) as JobRecord, revision: row.revision } : null;
}

/** Every stored job, Trash included (numbering and restoration need them); callers filter by access. */
export async function listJobs(db: D1Like): Promise<StoredJob[]> {
  const { results } = await db.prepare("SELECT payload, revision FROM jobs ORDER BY id").all<Row>();
  return results.map(r => ({ job: JSON.parse(r.payload) as JobRecord, revision: r.revision }));
}

type Change = { jobId: string; expectedRevision: number; actorId: string; now?: string };

/** Loads the job, checks the revision, applies `change` as the server-side actor and saves with an audit entry. */
async function update(db: D1Like, c: Change, action: string, detail: Record<string, unknown>, change: (job: JobRecord, actor: Awaited<ReturnType<typeof buildActor>>, now: string) => JobRecord | Promise<JobRecord>): Promise<StoredJob> {
  const now = c.now || new Date().toISOString();
  const actor = await buildActor(db, c.actorId);
  const stored = await getJob(db, c.jobId);
  if (!stored) throw new StoreError('Job no longer exists.', 404);
  if (stored.revision !== c.expectedRevision) throw new StoreError('This job changed since you opened it. Refresh before saving; your edits have been retained.', 409);
  let next: JobRecord;
  try {
    next = await change(stored.job, actor, now);
    assertActiveAssignments(next, stored.job, id => actor.employees.some(e => e.id === id && e.active));
    next = prepareJobForSave(next, stored.job);
  } catch (error) {
    if (error instanceof StoreError) throw error;
    // Workflow refusals (permission, duty, missing data) keep the model's own message.
    throw new StoreError(error instanceof Error ? error.message : 'The action was refused.', 422);
  }
  const revision = c.expectedRevision + 1;
  const audit = JSON.stringify({ fromRevision: c.expectedRevision, toRevision: revision, operationsRevision: next.operations?.revision, ...detail });
  const [result] = await db.batch([
    db.prepare("UPDATE jobs SET payload = ?, job_number = ?, trashed = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ? AND revision = ?")
      .bind(JSON.stringify(next), next.jobNumber || next.id, next.trash ? 1 : 0, c.actorId, now, c.jobId, c.expectedRevision),
    db.prepare(auditAfterChange).bind(now, c.actorId, action, 'job', c.jobId, audit),
  ]);
  if (result.meta.changes !== 1) throw new StoreError('This job changed since you opened it. Refresh before saving; your edits have been retained.', 409);
  return { job: next, revision };
}

/** Runs one workflow command or a batch (applied in order; any refusal saves nothing), as `runOperation` does in the browser. */
export function runJobCommands(db: D1Like, c: Change & { commands: Command | Command[] }): Promise<StoredJob> {
  const list = Array.isArray(c.commands) ? c.commands : [c.commands];
  if (!list.length) return Promise.reject(new StoreError('No command was given.', 400));
  return update(db, c, 'job-command', { commands: list.map(x => x.type) }, (job, actor, now) => list.reduce((j, command) => applyJobOperation(j, command, actor, now), job));
}

export function moveJobToTrash(db: D1Like, c: Change): Promise<StoredJob> {
  return update(db, c, 'job-trashed', {}, (job, actor, now) => trashJob(job, actor, now));
}

export function restoreJobFromTrash(db: D1Like, c: Change): Promise<StoredJob> {
  return update(db, c, 'job-restored', {}, async (job, actor, now) => {
    const { results } = await db.prepare("SELECT id, job_number AS jobNumber FROM jobs WHERE trashed = 0 AND job_number = ? AND id <> ?").bind(job.jobNumber || job.id, job.id).all<{ id: string; jobNumber: string }>();
    assertJobNumberAvailable(job, results);
    return restoreJob(job, actor, now);
  });
}
