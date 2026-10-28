import type { JobSummary, TrackNode, TrackState } from "./job-workflow-model";
// Keep in step with waitingDetails in job-workflow-model.ts.
const waitingDetails = ["On hold", "Awaiting lab plan", "Awaiting samples", "Awaiting approval", "Awaiting assignment", "Not recorded"];
const text = (value: unknown, max = 160): string => { if (typeof value !== "string" || value.length > max) throw new Error("Invalid summary text"); return value; };
const state = (value: unknown): TrackState => { if (value !== "pending" && value !== "active" && value !== "done") throw new Error("Invalid state"); return value; };
const date = (value: unknown) => { const result = text(value, 40); if (!Number.isFinite(Date.parse(result))) throw new Error("Invalid date"); return result; };
const count = (value: unknown): number => { if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) throw new Error("Invalid count"); return value; };
const list = (value: unknown, max: number): unknown[] => { if (!Array.isArray(value) || value.length > max) throw new Error("Invalid list"); return value; };
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object"); return value as Record<string, unknown>; };
export function sanitizeSummary(value: unknown): JobSummary {
 const input = record(value); let total = 0;
 function node(value: unknown, depth: number): TrackNode { const item = record(value); if (++total > 100 || depth > 3) throw new Error("Tree too large"); return { id: text(item.id), label: text(item.label), state: state(item.state), ...(typeof item.detail === "string" && waitingDetails.includes(item.detail) ? { detail: item.detail } : {}), ...(item.children ? { children: list(item.children, 40).map(child => node(child, depth + 1)) } : {}) }; }
 return { jobId: text(input.jobId, 80), client: text(input.client), location: text(input.location, 400), sampling: text(input.sampling), sampleCount: count(input.sampleCount), sampleTypes: list(input.sampleTypes, 30).map(value => { const item = record(value); return { label: text(item.label, 80), count: count(item.count) }; }), nodes: list(input.nodes, 10).map(value => node(value, 0)), history: list(input.history, 100).map(value => { const item = record(value); return { label: text(item.label), state: state(item.state), at: date(item.at) }; }), updatedAt: date(input.updatedAt), scopeMissing: input.scopeMissing === true };
}
