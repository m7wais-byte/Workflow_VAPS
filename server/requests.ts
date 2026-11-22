/** Request book on the server: the same numbering rules as the browser register (app/request-store.ts), in one D1 batch. */
import { baseNumber, draftRecords, groupKey, nextBase, stageNumbers, type RequestDraft, type RequestRecord } from "../app/request-book";
import { fail } from "./http";
import { audit } from "./auth";
import type { Who } from "./workspace";

export async function listRequests(db: D1Database): Promise<RequestRecord[]> {
  const { results } = await db.prepare("SELECT payload FROM requests").all<{ payload: string }>();
  return results.flatMap((r) => { try { return [JSON.parse(r.payload) as RequestRecord]; } catch { return []; } });
}
const numbers = async (db: D1Database) => (await db.prepare("SELECT no FROM requests").all<{ no: string }>()).results.map((r) => r.no);
const put = (db: D1Database, record: RequestRecord, who: Who, at: string) => db.prepare("INSERT INTO requests (no, payload, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(no) DO UPDATE SET payload = excluded.payload, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(record.no, JSON.stringify(record), who.employeeId, at);
const isDraft = (d: unknown): d is RequestDraft => !!d && typeof d === "object" && Array.isArray((d as RequestDraft).stages) && (d as RequestDraft).stages.length > 0 && (d as RequestDraft).stages.length <= 50;

/** `savedBy` is the signed-in employee's name from the directory, never a value from the request. */
export async function saveRequestDraft(db: D1Database, who: Who, savedBy: string, input: { draft?: unknown; today?: unknown }, at = new Date().toISOString()) {
  if (!isDraft(input.draft) || typeof input.today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.today)) throw fail(400, "The request could not be read.");
  const draft = input.draft, all = await numbers(db);
  const own = draft.group === undefined ? [] : all.filter((no) => groupKey(no) === draft.group);
  if (draft.group !== undefined && !own.length) throw fail(409, "This request no longer exists. Another employee may have changed it; open it again from the list.");
  const base = draft.group === undefined ? nextBase(all) : baseNumber(own[0]);
  if (base === null && draft.stages.length > 1) throw fail(400, "Stages cannot be added to this historical request number. Create a new request for the extra stages.");
  const assigned = stageNumbers(base ?? 0, draft.stages.map((stage) => stage.no));
  const taken = assigned.find((no) => !own.includes(no) && all.includes(no));
  if (taken) throw fail(409, `Request number ${taken} is already in use. Nothing was saved.`);
  let records: RequestRecord[];
  try { records = draftRecords(draft, assigned, savedBy, input.today); } catch (e) { throw fail(400, e instanceof Error ? e.message : "The request could not be saved."); }
  await db.batch([
    ...own.filter((no) => !assigned.includes(no)).map((no) => db.prepare("DELETE FROM requests WHERE no = ?").bind(no)),
    ...records.map((record) => put(db, record, who, at)),
  ]);
  await audit(db, { ...who, action: draft.group === undefined ? "request.created" : "request.saved", target: records.map((r) => r.no).join(",") }, at);
  return records;
}

export async function replaceRequest(db: D1Database, who: Who, savedBy: string, record: unknown, at = new Date().toISOString()) {
  const r = record as RequestRecord;
  if (!r || typeof r !== "object" || typeof r.no !== "string") throw fail(400, "The request could not be read.");
  if (!(await db.prepare("SELECT no FROM requests WHERE no = ?").bind(r.no).first())) throw fail(404, "This request no longer exists.");
  const next = { ...r, savedBy };
  await put(db, next, who, at).run();
  await audit(db, { ...who, action: "request.status", target: r.no }, at);
  return next;
}

/** Imported records never overwrite a request number already in the register. */
export async function importRequestRecords(db: D1Database, who: Who, records: unknown, at = new Date().toISOString()) {
  if (!Array.isArray(records) || records.length > 20000 || records.some((r) => !r || typeof r !== "object" || typeof (r as RequestRecord).no !== "string")) throw fail(400, "The import could not be read.");
  const existing = new Set(await numbers(db));
  const fresh = (records as RequestRecord[]).filter((r) => !existing.has(r.no) && (existing.add(r.no), true));
  for (let i = 0; i < fresh.length; i += 50) await db.batch(fresh.slice(i, i + 50).map((r) => put(db, r, who, at)));
  await audit(db, { ...who, action: "request.imported", detail: { added: fresh.length, skipped: records.length - fresh.length } }, at);
  return { added: fresh.length, skipped: records.length - fresh.length };
}
