/**
 * Server import of a browser export (app/export-format.ts). Two steps:
 *
 *  1. planImport: checks the file's fingerprints, validates every record with the app's own readers and compares it
 *     with what the database already holds. Nothing is written. The plan lists every record as add / unchanged /
 *     conflict / skipped, plus blocking problems and warnings.
 *  2. applyImport: writes only the "add" records, with existing IDs and job numbers, never overwriting a row
 *     (INSERT … ON CONFLICT DO NOTHING). Each imported record gets an audit entry. Running the same import again
 *     changes nothing.
 *
 * A record that differs from the database copy is a conflict: it is reported and left out, never merged. Uploaded
 * files are verified and counted but not stored yet; they move to file storage (R2) in a later step, so the export
 * file remains their copy until then.
 */
import type { JobRecord } from '../app/page';
import { administratorId } from '../app/authorization';
import { demoClient } from '../app/demo-data';
import { assignmentRefs } from '../app/job-save';
import { directoryKey } from '../app/employee-directory';
import { exportId, sha256, verifyExport, type BrowserExport } from '../app/export-format';
import { loadSettings, normalise, readDirectory, serverSettingKeys, type SettingKey, type Stored } from './settings-store';
import { auditAfterChange, StoreError, type D1Like } from './d1';

export const jobsKey = 'vaps-demo-jobs-v1';
/** D1 stores at most 2 MB per row; stay below it. */
const maxRowBytes = 1_900_000;
const bytes = (s: string) => new TextEncoder().encode(s).length;

export type PlanItem = { kind: 'setting' | 'job' | 'request' | 'archive'; id: string; outcome: 'add' | 'unchanged' | 'conflict' | 'skipped-demo'; note?: string };
type Row = { kind: PlanItem['kind']; id: string; value: string; trashed?: boolean; jobNumber?: string };
export type ImportPlan = {
  exportId: string; exportedAt: string; exportedBy: string; origin: string;
  /** Any problem blocks the whole import. */problems: string[];
  warnings: string[];
  items: PlanItem[];
  files: { count: number; bytes: number };
  rows: Row[];
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Every {id, name, size, type} object inside a job: the references to uploaded files. */
function fileRefs(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach(v => fileRefs(v, out));
  else if (isObject(value)) {
    if (typeof value.id === 'string' && typeof value.name === 'string' && typeof value.size === 'number' && typeof value.type === 'string') out.add(value.id);
    Object.values(value).forEach(v => fileRefs(v, out));
  }
  return out;
}

export async function planImport(db: D1Like, text: string, options: { includeDemo?: boolean } = {}): Promise<ImportPlan> {
  const { data, problems: integrity } = await verifyExport(text);
  if (!data) return { exportId: '', exportedAt: '', exportedBy: '', origin: '', problems: integrity, warnings: [], items: [], files: { count: 0, bytes: 0 }, rows: [] };
  const plan: ImportPlan = { exportId: await exportId(data.manifest), exportedAt: data.manifest.exportedAt, exportedBy: data.manifest.exportedBy, origin: data.manifest.origin, problems: [...integrity], warnings: [], items: [], rows: [], files: { count: data.files.length, bytes: data.files.reduce((n, f) => n + f.size, 0) } };
  const local = data.localStorage;
  for (const key of data.manifest.defaults || []) plan.warnings.push(`${key} was never saved in this browser; the app's built-in value it was using is imported.`);
  const stored = await loadSettings(db);

  // Settings: validated against the export's own directory and catalogue, then compared with the database.
  const context: Stored = Object.fromEntries(serverSettingKeys.filter(k => local[k] !== undefined).map(k => [k, { value: local[k], revision: 0 }]));
  for (const key of serverSettingKeys) {
    if (local[key] === undefined) continue;
    let value: string;
    try { value = normalise(key as SettingKey, JSON.parse(local[key]), key === directoryKey ? {} : context); }
    catch (e) { plan.problems.push(`Setting ${key} cannot be imported: ${e instanceof Error ? e.message : 'invalid'}`); continue; }
    if (bytes(value) > maxRowBytes) { plan.problems.push(`Setting ${key} is too large for one database row.`); continue; }
    const existing = stored[key as SettingKey];
    if (!existing) { plan.items.push({ kind: 'setting', id: key, outcome: 'add' }); plan.rows.push({ kind: 'setting', id: key, value }); }
    else plan.items.push({ kind: 'setting', id: key, outcome: existing.value === value ? 'unchanged' : 'conflict', ...(existing.value === value ? {} : { note: 'The database already holds a different version. It was kept; this one was not imported.' }) });
  }
  const directory = local[directoryKey] ? (() => { try { return readDirectory(local[directoryKey]); } catch { return null; } })() : null;
  const known = new Set((directory?.employees || []).map(e => e.id));

  // Jobs: kept byte-for-byte as the browser stored them, keyed by their existing internal IDs.
  let list: unknown = [];
  try { list = local[jobsKey] === undefined ? [] : JSON.parse(local[jobsKey]); } catch { plan.problems.push('The jobs record cannot be read.'); }
  if (!Array.isArray(list)) { plan.problems.push('The jobs record is not a list.'); list = []; }
  const jobs = list as JobRecord[];
  const seen = new Set<string>();
  const { results: dbJobs } = await db.prepare("SELECT id, job_number AS jobNumber, payload, trashed FROM jobs").all<{ id: string; jobNumber: string; payload: string; trashed: number }>();
  const activeNumbers = new Map(dbJobs.filter(j => !j.trashed).map(j => [j.jobNumber, j.id]));
  const exportedFiles = new Set(data.files.map(f => f.id));
  let missingFiles = 0;
  for (const job of jobs) {
    if (!isObject(job) || typeof job.id !== 'string' || !job.id || !Array.isArray(job.stages)) { plan.problems.push('A job record is incomplete (missing ID or stages).'); continue; }
    if (seen.has(job.id)) { plan.problems.push(`Job ${job.id} appears twice in the export.`); continue; }
    seen.add(job.id);
    if (job.clientCode === demoClient.code && !options.includeDemo) { plan.items.push({ kind: 'job', id: job.id, outcome: 'skipped-demo' }); continue; }
    const value = JSON.stringify(job);
    if (bytes(value) > maxRowBytes) { plan.problems.push(`Job ${job.id} is too large for one database row.`); continue; }
    const number = job.jobNumber || job.id;
    const existing = dbJobs.find(j => j.id === job.id);
    if (existing) { plan.items.push({ kind: 'job', id: job.id, outcome: existing.payload === value ? 'unchanged' : 'conflict', ...(existing.payload === value ? {} : { note: `The database holds a different version (operations revision ${(JSON.parse(existing.payload) as JobRecord).operations?.revision ?? 'none'} there, ${job.operations?.revision ?? 'none'} here). Decide which copy is correct; neither was changed.` }) }); continue; }
    if (!job.trash && activeNumbers.has(number)) { plan.items.push({ kind: 'job', id: job.id, outcome: 'conflict', note: `Job number ${number} is already used by active job ${activeNumbers.get(number)} in the database.` }); continue; }
    if (!job.trash) activeNumbers.set(number, job.id);
    plan.items.push({ kind: 'job', id: job.id, outcome: 'add' });
    plan.rows.push({ kind: 'job', id: job.id, value, trashed: !!job.trash, jobNumber: number });
    const people = [...assignmentRefs(job), job.createdById, ...(job.operations?.history || []).map(h => h.by)].filter((id): id is string => !!id);
    const unknown = [...new Set(people.filter(id => directory && !known.has(id)))];
    if (unknown.length) plan.warnings.push(`Job ${job.id} names employees not in the exported directory: ${unknown.join(', ')}. Imported as recorded.`);
    missingFiles += [...fileRefs(job)].filter(id => !exportedFiles.has(id)).length;
  }
  const activeInExport = new Map<string, string>();
  for (const job of jobs) if (isObject(job) && typeof job.id === 'string' && !job.trash && (job.clientCode !== demoClient.code || options.includeDemo)) {
    const number = job.jobNumber || job.id; const other = activeInExport.get(number);
    if (other && other !== job.id) plan.problems.push(`Jobs ${other} and ${job.id} are both active with job number ${number}.`);
    activeInExport.set(number, job.id);
  }
  if (missingFiles) plan.warnings.push(`${missingFiles} file references in these jobs point to files that are not in this export (uploaded in another browser, or exported without files). Export those browsers too.`);

  // Request book: one row per request number.
  const { results: dbRequests } = await db.prepare("SELECT no, payload FROM requests").all<{ no: string; payload: string }>();
  for (const record of data.requests) {
    if (!isObject(record) || typeof record.no !== 'string' || !record.no) { plan.problems.push('A request book entry has no request number.'); continue; }
    const value = JSON.stringify(record); const existing = dbRequests.find(r => r.no === record.no);
    if (existing) { plan.items.push({ kind: 'request', id: record.no, outcome: existing.payload === value ? 'unchanged' : 'conflict' }); continue; }
    plan.items.push({ kind: 'request', id: record.no, outcome: 'add' }); plan.rows.push({ kind: 'request', id: record.no, value });
  }

  // Everything else is archived verbatim for this export until the step that serves it.
  const { results: archived } = await db.prepare("SELECT key FROM browser_archive WHERE export_id = ?").bind(plan.exportId).all<{ key: string }>();
  for (const key of Object.keys(local).filter(k => k !== jobsKey && !(serverSettingKeys as readonly string[]).includes(k))) {
    if (bytes(local[key]) > maxRowBytes) { plan.problems.push(`Record ${key} is too large for one database row.`); continue; }
    if (archived.some(a => a.key === key)) { plan.items.push({ kind: 'archive', id: key, outcome: 'unchanged' }); continue; }
    plan.items.push({ kind: 'archive', id: key, outcome: 'add' }); plan.rows.push({ kind: 'archive', id: key, value: local[key] });
  }
  return plan;
}

/** Writes the plan's "add" rows. Refuses a plan with problems. Returns how many rows were actually added. */
export async function applyImport(db: D1Like, plan: ImportPlan, actorId: string, now = new Date().toISOString()): Promise<{ added: Record<PlanItem['kind'], number> }> {
  if (plan.problems.length) throw new StoreError('The import has problems to resolve first. Nothing was imported.', 400);
  // The administrator imports. Before the first directory exists, the directory being imported must name them.
  const stored = await loadSettings(db);
  const directoryRow = stored[directoryKey]?.value ?? plan.rows.find(r => r.kind === 'setting' && r.id === directoryKey)?.value;
  const directory = directoryRow ? readDirectory(directoryRow) : null;
  if (actorId !== administratorId || !directory?.employees.some(e => e.id === actorId && e.active)) throw new StoreError('Only the active administrator can import records.', 403);

  const provenance = { exportId: plan.exportId, exportedAt: plan.exportedAt, exportedBy: plan.exportedBy, origin: plan.origin, note: 'Copied from a browser export. Names and times inside the record were recorded in the browser before authenticated sign-in and are kept as recorded.' };
  const pairs = await Promise.all(plan.rows.map(async (row) => {
    const detail = JSON.stringify({ ...provenance, sha256: await sha256(row.value) });
    const write = row.kind === 'setting' ? db.prepare("INSERT INTO settings (key, value, revision, updated_by, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(key) DO NOTHING").bind(row.id, row.value, actorId, now)
      : row.kind === 'job' ? db.prepare("INSERT INTO jobs (id, job_number, payload, revision, trashed, updated_by, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(row.id, row.jobNumber!, row.value, row.trashed ? 1 : 0, actorId, now)
      : row.kind === 'request' ? db.prepare("INSERT INTO requests (no, payload, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(no) DO NOTHING").bind(row.id, row.value, actorId, now)
      : db.prepare("INSERT INTO browser_archive (export_id, key, value, sha256, exported_at, imported_by, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(export_id, key) DO NOTHING").bind(plan.exportId, row.id, row.value, await sha256(row.value), plan.exportedAt, actorId, now);
    return { kind: row.kind, write, log: db.prepare(auditAfterChange).bind(now, actorId, 'imported', row.kind === 'archive' ? 'archive' : row.kind, row.kind === 'archive' ? plan.exportId + ':' + row.id : row.id, detail) };
  }));
  const added: Record<PlanItem['kind'], number> = { setting: 0, job: 0, request: 0, archive: 0 };
  // Settings first, so the directory exists before anything that refers to it. 25 records per transaction.
  const order = ['setting', 'job', 'request', 'archive'];
  pairs.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (let i = 0; i < pairs.length; i += 25) {
    const chunk = pairs.slice(i, i + 25);
    const results = await db.batch(chunk.flatMap(p => [p.write, p.log]));
    chunk.forEach((p, j) => { added[p.kind] += results[j * 2].meta.changes; });
  }
  const total = Object.values(added).reduce((a, b) => a + b, 0);
  if (total) await db.prepare("INSERT INTO audit_log (at, actor_id, action, record_type, record_id, detail) VALUES (?, ?, ?, ?, ?, ?)").bind(now, actorId, 'import-run', 'import', plan.exportId, JSON.stringify({ ...provenance, added, filesNotYetStored: plan.files })).run();
  return { added };
}

/** A short text report of a plan, with IDs and counts only (no record contents). */
export function planReport(plan: ImportPlan): string {
  const by = (kind: PlanItem['kind']) => { const items = plan.items.filter(i => i.kind === kind); const n = (o: PlanItem['outcome']) => items.filter(i => i.outcome === o).length; return `${kind.padEnd(8)} add ${n('add')}, unchanged ${n('unchanged')}, conflict ${n('conflict')}${kind === 'job' ? `, demo skipped ${n('skipped-demo')}` : ''}`; };
  const lines = [`Export ${plan.exportId.slice(0, 12)} · exported ${plan.exportedAt} by ${plan.exportedBy} from ${plan.origin}`, by('setting'), by('job'), by('request'), by('archive'), `files    ${plan.files.count} verified (${(plan.files.bytes / 1048576).toFixed(1)} MB) · kept in the export file until file storage is set up`];
  for (const i of plan.items.filter(i => i.outcome === 'conflict')) lines.push(`CONFLICT ${i.kind} ${i.id}: ${i.note || 'differs from the database copy; not imported.'}`);
  for (const w of plan.warnings) lines.push('WARNING  ' + w);
  for (const p of plan.problems) lines.push('PROBLEM  ' + p);
  lines.push(plan.problems.length ? 'Result: blocked. Resolve the problems above; nothing can be imported.' : 'Result: ready to import.');
  return lines.join('\n');
}

export type { BrowserExport };
