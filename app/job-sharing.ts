import { jobSummary } from "./job-workflow-model";
import type { JobRecord } from "./page";
export type ShareRecord = { id: string; key: string; revision: number; audience: "link" | "signed-in"; fingerprint?: string; enabled: boolean; /** Withdrawn while the job is in Trash; republished to the same link on restore. */paused?: boolean };
const storageKey = "vaps-job-summary-links-v1";
const queues = new Map<string, Promise<unknown>>();
export function getShare(jobId: string): ShareRecord | undefined { const all = JSON.parse(localStorage.getItem(storageKey) || "{}"); return all[jobId]; }
function saveShare(jobId: string, record?: ShareRecord) { const all = JSON.parse(localStorage.getItem(storageKey) || "{}"); if (record) all[jobId] = record; else delete all[jobId]; localStorage.setItem(storageKey, JSON.stringify(all)); }
async function save(job: JobRecord, audience?: ShareRecord["audience"]) {
 let record = getShare(job.id);
 if (!record && !audience) return;
 if (!record) { record = { id: crypto.randomUUID(), key: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""), revision: 0, audience: audience!, enabled: false }; saveShare(job.id, record); }
 if (!audience && !record.enabled) return;
 const summary = jobSummary(job); const fingerprint = JSON.stringify(summary); const selectedAudience = audience || record.audience;
 if (record.enabled && record.fingerprint === fingerprint && record.audience === selectedAudience) return record;
 const response = await fetch("/api/job-summary/" + record.id, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + record.key }, body: JSON.stringify({ summary, audience: selectedAudience, revision: record.revision }) });
 const result = await response.json() as { revision: number; error?: string };
 if (!response.ok) { if (response.status === 409 && Number.isInteger(result.revision)) saveShare(job.id, { ...record, revision: result.revision }); throw new Error(result.error || "Shared summary could not be updated."); }
 const updated = { ...record, revision: result.revision, audience: selectedAudience, fingerprint, enabled: true }; saveShare(job.id, updated); return updated;
}
export function syncShare(job: JobRecord, audience?: ShareRecord["audience"]): Promise<ShareRecord | undefined> {
 const previous = queues.get(job.id) || Promise.resolve();
 const next = previous.catch(() => {}).then(() => save(job, audience)); queues.set(job.id, next); return next;
}
export async function stopShare(jobId: string) {
 await queues.get(jobId)?.catch(() => {}); const record = getShare(jobId); if (!record) return;
 const response = await fetch("/api/job-summary/" + record.id, { method: "DELETE", headers: { Authorization: "Bearer " + record.key } });
 if (!response.ok) throw new Error("Could not stop sharing. Please retry."); saveShare(jobId);
}
/** Withdraws the server summary while keeping the link's id and key, so restoration republishes to the same address. */
export async function pauseShare(jobId: string) {
 await queues.get(jobId)?.catch(() => {}); const record = getShare(jobId); if (!record?.enabled) return;
 const response = await fetch("/api/job-summary/" + record.id, { method: "DELETE", headers: { Authorization: "Bearer " + record.key } });
 if (!response.ok) throw new Error("The shared client link could not be paused, so the job was not moved to Trash. Please retry.");
 saveShare(jobId, { ...record, enabled: false, revision: 0, fingerprint: undefined, paused: true });
}
/** Republishes a paused link (same id and key) after restoration. */
export async function resumeShare(job: JobRecord) {
 const record = getShare(job.id); if (!record?.paused) return;
 saveShare(job.id, { ...record, paused: false });
 return syncShare(job, record.audience);
}
