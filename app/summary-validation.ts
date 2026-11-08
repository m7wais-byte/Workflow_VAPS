import type { JobSummary, TrackNode, TrackState } from "./job-workflow-model";
import type { ProgressView, ProgressRow, ProgressStage, ProgressStatus } from "./job-progress";
// Keep in step with waitingDetails in job-workflow-model.ts.
const waitingDetails = ["On hold", "Awaiting lab plan", "Awaiting samples", "Awaiting approval", "Awaiting assignment", "Not recorded"];
const text = (value: unknown, max = 160): string => { if (typeof value !== "string" || value.length > max) throw new Error("Invalid summary text"); return value; };
const state = (value: unknown): TrackState => { if (value !== "pending" && value !== "active" && value !== "done") throw new Error("Invalid state"); return value; };
const date = (value: unknown) => { const result = text(value, 40); if (!Number.isFinite(Date.parse(result))) throw new Error("Invalid date"); return result; };
const count = (value: unknown): number => { if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) throw new Error("Invalid count"); return value; };
const list = (value: unknown, max: number): unknown[] => { if (!Array.isArray(value) || value.length > max) throw new Error("Invalid list"); return value; };
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object"); return value as Record<string, unknown>; };
/**
 * Accepts only the client-safe summary fields; anything else is dropped. Version 2 adds the shared workflow status
 * (sections → groups → steps), the agreed scope lines and milestone dates. Older summaries stay valid.
 */
export function sanitizeSummary(value: unknown): JobSummary {
 const input = record(value); let total = 0;
 function node(value: unknown, depth: number): TrackNode { const item = record(value); if (++total > 600 || depth > 3) throw new Error("Tree too large"); return { id: text(item.id), label: text(item.label), state: state(item.state), ...(typeof item.detail === "string" && waitingDetails.includes(item.detail) ? { detail: item.detail } : {}), ...(item.at !== undefined ? { at: date(item.at) } : {}), ...(item.children ? { children: list(item.children, 200).map(child => node(child, depth + 1)) } : {}) }; }
 const summary: JobSummary = { jobId: text(input.jobId, 80), client: text(input.client), location: text(input.location, 400), sampling: text(input.sampling), sampleCount: count(input.sampleCount), sampleTypes: list(input.sampleTypes, 30).map(value => { const item = record(value); return { label: text(item.label, 80), count: count(item.count) }; }), nodes: list(input.nodes, 10).map(value => node(value, 0)), history: list(input.history, 100).map(value => { const item = record(value); return { label: text(item.label), state: state(item.state), at: date(item.at) }; }), updatedAt: date(input.updatedAt), scopeMissing: input.scopeMissing === true };
 if (input.version !== 2) return summary;
 return { ...summary, version: 2, ...(input.progress !== undefined ? { progress: sanitizeProgress(input.progress) } : {}), status: text(input.status, 60), current: text(input.current, 120), next: text(input.next, 200), done: count(input.done), total: count(input.total),
  scope: list(input.scope, 12).map(line => text(line, 400)), dates: list(input.dates, 8).map(value => { const item = record(value); return { label: text(item.label, 60), value: date(item.value) }; }) };
}

const statuses: ProgressStatus[] = ["not-started", "in-progress", "under-review", "completed"];
const status = (value: unknown): ProgressStatus => { if (!statuses.includes(value as ProgressStatus)) throw new Error("Invalid status"); return value as ProgressStatus; };
const day = (value: unknown) => { const v = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v))) throw new Error("Invalid date"); return v; };
const opt = <T,>(value: unknown, read: (v: unknown) => T): T | undefined => value === undefined || value === null ? undefined : read(value);
/**
 * Client progress block (job-progress.ts, client audience). Only client fields are kept: internal attention notes and
 * team-plan dates are dropped even if a caller sends them; only planner estimates explicitly marked client-visible remain.
 */
export function sanitizeProgress(value: unknown): ProgressView { return JSON.parse(JSON.stringify(readProgress(value))); }
function readProgress(value: unknown): ProgressView {
 const p = record(value);
 const groups = ["sampling", "receipt", "PVT", "Chemical", "report"];
 const rows: ProgressRow[] = list(p.rows, 300).map((v) => { const r = record(v); if (!groups.includes(r.group as string)) throw new Error("Invalid group");
  const sc = r.schedule === undefined ? undefined : record(r.schedule);
  const schedule = sc && sc.source === "plan" && sc.clientVisible === true ? { source: "plan" as const, clientVisible: true, start: opt(sc.start, day), finish: opt(sc.finish, day), days: opt(sc.days, count) } : undefined;
  return { key: text(r.key, 300), label: text(r.label, 200), group: r.group as ProgressRow["group"], status: status(r.status), detail: opt(r.detail, (x) => text(x, 300)), samples: opt(r.samples, count), done: opt(r.done, count), total: opt(r.total, count), additional: r.additional === true || undefined, thirdParty: r.thirdParty === true || undefined, schedule, actual: opt(r.actual, day), overdue: !!schedule && r.overdue === true }; });
 const keys = new Set(rows.map((r) => r.key));
 const stageIds = ["created", "sampling", "receipt", "lab", "report"];
 const stages: ProgressStage[] = list(p.stages, 6).map((v) => { const s = record(v); if (!stageIds.includes(s.id as string)) throw new Error("Invalid stage");
  return { id: s.id as ProgressStage["id"], label: text(s.label, 80), status: status(s.status), current: s.current === true, at: opt(s.at, day), note: opt(s.note, (x) => text(x, 200)), planned: s.planned === true || undefined, rows: list(s.rows, 300).map((k) => text(k, 300)).filter((k) => keys.has(k)) }; });
 const e = record(p.expected); const kinds = ["actual", "confirmed", "provisional", "tbc"]; if (!kinds.includes(e.kind as string)) throw new Error("Invalid expected kind");
 return { audience: "client", jobId: text(p.jobId, 80), client: text(p.client), location: text(p.location, 400), sampling: opt(p.sampling, (x) => text(x, 160)), stages, rows,
  currentStage: text(p.currentStage, 120), now: text(p.now, 400), next: text(p.next, 300), sentence: text(p.sentence, 800), done: count(p.done), total: count(p.total),
  expected: { kind: e.kind as ProgressView["expected"]["kind"], date: opt(e.date, day), reason: opt(e.reason, (x) => text(x, 200)) }, lastUpdate: opt(p.lastUpdate, date), scopeConfirmed: p.scopeConfirmed === true,
  overdue: rows.filter((r) => r.overdue).length, convention: "calendar", closed: p.closed === true, draft: p.draft === true, legacy: p.legacy === true, notes: list(p.notes ?? [], 5).map((n) => text(n, 300)) };
}
