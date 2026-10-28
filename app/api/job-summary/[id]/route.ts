import { summaryDb } from "../../../../db/summary-store";
import { sanitizeSummary } from "../../../summary-validation";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } });
async function editHash(request: Request) { const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") || ""; if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Missing edit key"); const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)); return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""); }
export async function GET(request: Request, context: Context) {
 const { id } = await context.params; if (!validId(id)) return reply({ error: "Summary not found" }, 404);
 try { const row = await summaryDb().prepare("SELECT audience, payload, revision FROM job_summaries WHERE id = ?").bind(id).first<{ audience: string; payload: string; revision: number }>();
 if (!row) return reply({ error: "This summary is unavailable or sharing has stopped." }, 404);
 if (row.audience === "signed-in" && !request.headers.get("oai-authenticated-user-id")) return reply({ error: "Sign in to view this summary" }, 401);
 return reply({ summary: sanitizeSummary(JSON.parse(row.payload)), revision: row.revision });
 } catch { return reply({ error: "Summary is temporarily unavailable. Please retry." }, 503); }
}
export async function PUT(request: Request, context: Context) {
 const { id } = await context.params; if (!validId(id)) return reply({ error: "Invalid link" }, 400);
 let hash: string; try { hash = await editHash(request); } catch { return reply({ error: "An edit key is required" }, 401); }
 let body; let summary;
 try { const raw = await request.text(); if (raw.length > 60000) return reply({ error: "Summary too large" }, 413); body = JSON.parse(raw); summary = sanitizeSummary(body.summary); if (!["link", "signed-in"].includes(body.audience) || !Number.isInteger(body.revision) || body.revision < 0) throw new Error(); } catch { return reply({ error: "Invalid summary" }, 400); }
 try { const db = summaryDb(); const payload = JSON.stringify(summary); const now = new Date().toISOString();
 if (body.revision === 0) { const result = await db.prepare("INSERT INTO job_summaries (id, edit_hash, audience, payload, revision, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING").bind(id, hash, body.audience, payload, now).run(); if (!result.meta.changes) { const existing = await db.prepare("SELECT revision, payload, audience FROM job_summaries WHERE id = ? AND edit_hash = ?").bind(id, hash).first<{ revision: number; payload: string; audience: string }>(); if (existing?.payload === payload && existing.audience === body.audience) return reply({ revision: existing.revision }); return reply({ error: "This link already exists. Refresh sharing before retrying." }, 409); } return reply({ revision: 1 }); }
 const result = await db.prepare("UPDATE job_summaries SET payload = ?, audience = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND edit_hash = ? AND revision = ?").bind(payload, body.audience, now, id, hash, body.revision).run();
 if (!result.meta.changes) { const existing = await db.prepare("SELECT revision, payload, audience FROM job_summaries WHERE id = ? AND edit_hash = ?").bind(id, hash).first<{ revision: number; payload: string; audience: string }>(); if (existing?.payload === payload && existing.audience === body.audience) return reply({ revision: existing.revision }); return reply({ error: "The shared copy changed or the edit key is invalid. Please retry after reviewing the current job.", ...(existing ? { revision: existing.revision } : {}) }, 409); }
 return reply({ revision: body.revision + 1 });
 } catch { return reply({ error: "Could not save the summary. Your job is unchanged; please retry." }, 503); }
}
export async function DELETE(request: Request, context: Context) {
 const { id } = await context.params; if (!validId(id)) return reply({ error: "Invalid link" }, 400);
 let hash; try { hash = await editHash(request); } catch { return reply({ error: "An edit key is required" }, 401); }
 try { const result = await summaryDb().prepare("DELETE FROM job_summaries WHERE id = ? AND edit_hash = ?").bind(id, hash).run(); if (!result.meta.changes) return reply({ error: "The link or edit key is invalid." }, 403); return reply({ stopped: true }); } catch { return reply({ error: "Sharing could not be stopped. Please retry." }, 503); }
}
