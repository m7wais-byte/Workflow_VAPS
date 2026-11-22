"use client";
/** Settings → Sign-in accounts (Sites edition). Requires Manage authorization; the server checks it on every call. */
import { useCallback, useEffect, useState } from "react";
import { api } from "./workspace-sync";
import type { Employee } from "./employee-directory";

type Account = { id: string; username: string; employeeId: string; active: boolean; mustChangePassword: boolean; passwordChangedAt: string | null; createdAt: string; activeSessions: number };
type Issued = { username: string; temporaryPassword: string; employee: string };

export function AccountSettings({ employees, meAccountId, positionOf }: { employees: Employee[]; meAccountId: string; positionOf: (e: Employee) => string }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<Issued | null>(null);
  const reload = useCallback(() => api<{ accounts: Account[] }>("/api/admin/accounts").then((r) => { setAccounts(r.accounts); setError(""); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { void reload(); }, [reload]);
  const name = (id: string) => employees.find((e) => e.id === id)?.name || id;
  async function run(key: string, work: () => Promise<void>) {
    setBusy(key); setError(""); setMessage("");
    try { await work(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "The account could not be changed."); } finally { setBusy(""); }
  }
  const create = (employee: Employee) => run("create:" + employee.id, async () => {
    const r = await api<{ username: string; temporaryPassword: string }>("/api/admin/accounts", { method: "POST", json: { username: drafts[employee.id] || "", employeeId: employee.id } });
    setIssued({ username: r.username, temporaryPassword: r.temporaryPassword, employee: employee.name }); setDrafts({ ...drafts, [employee.id]: "" });
  });
  const act = (account: Account, action: "reset-password" | "revoke-sessions" | "deactivate" | "reactivate") => {
    const label = { "reset-password": `Issue a new temporary password for ${account.username}? Their current password stops working and every session is signed out.`, "revoke-sessions": `Sign ${account.username} out of every device?`, deactivate: `Deactivate ${account.username}? They are signed out and cannot sign in until reactivated. Their work and history are kept.`, reactivate: `Reactivate ${account.username}?` }[action];
    if (!window.confirm(label)) return;
    void run(action + ":" + account.id, async () => {
      const r = await api<{ username?: string; temporaryPassword?: string }>(`/api/admin/accounts/${encodeURIComponent(account.id)}`, { method: "POST", json: { action } });
      if (r.temporaryPassword) setIssued({ username: account.username, temporaryPassword: r.temporaryPassword, employee: name(account.employeeId) });
      else setMessage(action === "revoke-sessions" ? `${account.username} was signed out of every device.` : action === "deactivate" ? `${account.username} was deactivated.` : `${account.username} was reactivated.`);
    });
  };
  const byEmployee = new Map((accounts || []).map((a) => [a.employeeId, a]));
  return <section className="panel settings-panel account-settings">
    <div className="panel-heading"><div><h2>Sign-in accounts</h2><p>Each employee signs in with their own username and password. An account is linked to the employee record by its internal ID, so renaming the employee never changes the login. Accounts never grant permissions: configure those in Authorization.</p></div></div>
    {issued && <div className="temp-password" role="status"><h3>Temporary password for {issued.employee}</h3><p>Username <strong>{issued.username}</strong> · Temporary password <code>{issued.temporaryPassword}</code></p><p>Give it to the employee in person or by phone. It is shown only once and must be changed at first sign-in.</p><button type="button" className="outline-button" onClick={() => setIssued(null)}>I have recorded it</button></div>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {!accounts && !error && <p role="status">Loading accounts…</p>}
    {accounts && <div className="client-table-wrap"><table className="client-table"><thead><tr><th>Employee</th><th>Username</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {employees.map((e) => { const a = byEmployee.get(e.id); return <tr key={e.id}>
        <th scope="row">{e.name}<small>{positionOf(e)}{e.active ? "" : " · employee inactive"}</small></th>
        <td>{a ? a.username : e.active ? <input aria-label={`Username for ${e.name}`} placeholder="e.g. s.almaqbali" value={drafts[e.id] || ""} onChange={(ev) => setDrafts({ ...drafts, [e.id]: ev.target.value.toLowerCase() })} /> : "—"}</td>
        <td>{a ? <>{a.active ? "Active" : "Deactivated"}{a.mustChangePassword ? " · temporary password" : ""}<small>{a.activeSessions} active session(s)</small></> : "No account"}</td>
        <td><div className="row-actions">{a ? <>
          <button type="button" disabled={!!busy} onClick={() => act(a, "reset-password")}>Reset password</button>
          <button type="button" disabled={!!busy || !a.activeSessions} onClick={() => act(a, "revoke-sessions")}>Sign out everywhere</button>
          {a.id !== meAccountId && <button type="button" disabled={!!busy} onClick={() => act(a, a.active ? "deactivate" : "reactivate")}>{a.active ? "Deactivate" : "Reactivate"}</button>}
        </> : e.active ? <button type="button" disabled={!!busy || !(drafts[e.id] || "").trim()} onClick={() => void create(e)}>{busy === "create:" + e.id ? "Creating…" : "Create account"}</button> : null}</div></td>
      </tr>; })}
    </tbody></table></div>}
  </section>;
}
