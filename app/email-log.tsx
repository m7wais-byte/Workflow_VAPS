"use client";
/**
 * Settings → Sign-in accounts → Email log (Administrator only). Shows the mail configuration (no secrets) and the latest
 * messages from GET /api/admin/mail. A failed notification can be retried. One whose outcome is unknown ("uncertain", or
 * interrupted while sending) is retried only after MA001 confirms the sender's Sent Items were checked; the server
 * enforces and audits that confirmation. Nothing here is retried automatically.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "./workspace-sync";
import { ukDateTime } from "./uk-format";

type Row = { id: string; audience: string; event: string; job_id: string | null; employee_id: string | null; recipient: string; subject: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null; next: "retry" | "check-sent-items" | null };
type Log = { config: { provider: string | null; sender: string | null; dashboard: string | null; allowedRecipients: string[] | "everyone"; staffEvents: string[]; clientEvents: string[] }; messages: Row[] };

const statusLabel: Record<string, string> = { sent: "Sent", queued: "Queued", sending: "Sending", failed: "Failed", blocked: "Blocked", uncertain: "Outcome unknown" };

export function EmailLog() {
  const [log, setLog] = useState<Log | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState("");
  const [checking, setChecking] = useState<Row | null>(null), [checked, setChecked] = useState(false);
  const reload = useCallback(() => api<Log>("/api/admin/mail").then((r) => { setLog(r); setError(""); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { void reload(); }, [reload]);
  const sender = log?.config.sender || "bsg@visionaps.com";
  async function retry(row: Row, sentItemsChecked: boolean) {
    setBusy(row.id); setError(""); setMessage("");
    try {
      const r = await api<Row>("/api/admin/mail", { method: "POST", json: { action: "retry", id: row.id, ...(sentItemsChecked ? { sentItemsChecked: true } : {}) } });
      setMessage(r.status === "sent" ? `Sent to ${r.recipient}.` : `Not sent: ${r.last_error || statusLabel[r.status] || r.status}`);
      setChecking(null); setChecked(false);
    } catch (e) { setError(e instanceof Error ? e.message : "The email could not be retried."); }
    finally { setBusy(""); await reload(); }
  }
  const c = log?.config;
  return <section className="panel settings-panel email-log">
    <div className="panel-heading"><div><h2>Email log</h2><p>Invitations and notifications sent from {sender}. Nothing is retried automatically. If the outcome of a send is unknown, check that mailbox&apos;s Sent Items before retrying, so the recipient never gets it twice.</p></div>
      <button type="button" className="outline-button" disabled={!!busy} onClick={() => void reload()}>Refresh</button></div>
    {c && <p className="muted-text">{c.provider ? <>Sending: <strong>{c.provider === "graph" ? "Microsoft 365" : c.provider}</strong> as {c.sender || "—"}</> : <strong>Email is off (not configured).</strong>}
      {" · "}Allowed recipients: {c.allowedRecipients === "everyone" ? <strong>everyone</strong> : c.allowedRecipients.length ? c.allowedRecipients.join(", ") : <strong>nobody</strong>}
      {" · "}Employee notifications: {c.staffEvents.join(", ") || "off"} · Client notifications: {c.clientEvents.join(", ") || "off"}</p>}
    {checking && <div className="temp-password" role="dialog" aria-label="Check Sent Items before retrying">
      <h3>Check Sent Items first</h3>
      <p>It is not known whether this email was sent. Microsoft may already have delivered it.</p>
      <p>In Outlook, open the <strong>Sent Items</strong> of <strong>{sender}</strong> and look for <strong>&ldquo;{checking.subject}&rdquo;</strong> to <strong>{checking.recipient}</strong>, around {ukDateTime(checking.created_at)}.</p>
      <p>If it is there, do not retry: it was delivered. Retry only if it is not there.</p>
      <label className="sent-items-confirm"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I checked the Sent Items of {sender} and this email is not there.</label>
      <div className="row-actions"><button type="button" disabled={!checked || !!busy} onClick={() => void retry(checking, true)}>{busy === checking.id ? "Sending…" : "Retry now"}</button><button type="button" onClick={() => { setChecking(null); setChecked(false); }}>Cancel</button></div>
    </div>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {!log && !error && <p role="status">Loading the email log…</p>}
    {log && (log.messages.length ? <div className="client-table-wrap"><table className="client-table"><thead><tr><th>Created</th><th>Email</th><th>To</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {log.messages.map((m) => <tr key={m.id}>
        <td>{ukDateTime(m.created_at)}</td>
        <td>{m.subject}<small>{m.audience === "invite" ? "Invitation" : m.audience === "client" ? "Client" : "Employee"} · {m.event}{m.job_id ? " · " + m.job_id : ""}</small></td>
        <td>{m.recipient}</td>
        <td>{statusLabel[m.status] || m.status}<small>{m.sent_at ? "Sent " + ukDateTime(m.sent_at) : m.last_error || ""}{m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}</small></td>
        <td><div className="row-actions">
          {m.next === "retry" && <button type="button" disabled={!!busy} onClick={() => void retry(m, false)}>{busy === m.id ? "Sending…" : "Retry"}</button>}
          {m.next === "check-sent-items" && <button type="button" disabled={!!busy} onClick={() => { setChecking(m); setChecked(false); setError(""); setMessage(""); }}>Check Sent Items…</button>}
        </div></td>
      </tr>)}
    </tbody></table></div> : <p className="muted-text">No emails yet.</p>)}
  </section>;
}
