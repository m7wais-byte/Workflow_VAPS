"use client";
/**
 * Settings → Sign-in accounts (Sites edition).
 * - The Administrator sets each employee's work email and access role and sends invitations. An invited account becomes
 *   active only when the employee sets their password from the emailed one-time link.
 * - Holders of Manage authorization keep the existing account actions (email change, password reset, sign out
 *   everywhere, deactivate / reactivate). The server checks every action.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "./workspace-sync";
import { appStorage } from "./app-storage";
import { accessRole, accessRoleLabels, accessRolesKey, storedSuperUsers } from "./authorization";
import { ukDateTime } from "./uk-format";
import type { Employee } from "./employee-directory";

type Account = { id: string; username: string; email: string | null; employeeId: string; active: boolean; mustChangePassword: boolean; passwordChangedAt: string | null; createdAt: string; activeSessions: number; activatedAt: string | null; lastSignInAt: string | null; invitedAt: string | null; invitationExpiresAt: string | null };
type Issued = { username: string; temporaryPassword: string; employee: string };
type Sent = { employee: string; email: string; expiresAt: string; testLink?: string };

export function AccountSettings({ employees, meAccountId, positionOf, isAdministrator }: { employees: Employee[]; meAccountId: string; positionOf: (e: Employee) => string; isAdministrator: boolean }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState("");
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [superUsers, setSuperUsers] = useState<string[]>(() => storedSuperUsers());
  const reload = useCallback(() => api<{ accounts: Account[] }>("/api/admin/accounts").then((r) => { setAccounts(r.accounts); setError(""); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { void reload(); }, [reload]);
  const name = (id: string) => employees.find((e) => e.id === id)?.name || id;
  async function run(key: string, work: () => Promise<void>) {
    setBusy(key); setError(""); setMessage("");
    try { await work(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "The account could not be changed."); } finally { setBusy(""); }
  }
  /** Work email shown in the form: what was typed, else the account's, else the directory's contact email. */
  const emailFor = (e: Employee, a?: Account) => emails[e.id] ?? a?.email ?? e.email ?? "";
  const invite = (e: Employee, a?: Account) => run("invite:" + e.id, async () => {
    const r = await api<{ email: string; expiresAt: string; testLink?: string }>("/api/admin/invitations", { method: "POST", json: { employeeId: e.id, email: emailFor(e, a) } });
    setSent({ employee: e.name, email: r.email, expiresAt: r.expiresAt, testLink: r.testLink });
    const { [e.id]: _done, ...rest } = emails; void _done; setEmails(rest);
  });
  /** Access role: saved as the shared Super User list; the server accepts it only from the Administrator. */
  const setRole = (e: Employee, role: "super" | "normal") => {
    const next = role === "super" ? [...new Set([...superUsers, e.id])] : superUsers.filter((id) => id !== e.id);
    try { appStorage()!.setItem(accessRolesKey, JSON.stringify({ superUsers: next })); setSuperUsers(next); setMessage(`${e.name} is now a ${role === "super" ? "Super User" : "Normal User"}.`); setError(""); }
    catch { setError("The access role could not be saved."); }
  };
  const saveEmail = (account: Account) => run("email:" + account.id, async () => {
    const r = await api<{ email: string | null }>(`/api/admin/accounts/${encodeURIComponent(account.id)}`, { method: "POST", json: { action: "set-email", email: emails[account.employeeId] ?? "" } });
    setEditing(""); setMessage(r.email ? `${name(account.employeeId)} signs in with ${r.email} or employee ID ${account.employeeId}.` : `${name(account.employeeId)} signs in with employee ID ${account.employeeId} only.`);
  });
  const act = (account: Account, action: "reset-password" | "revoke-sessions" | "deactivate" | "reactivate") => {
    const who = name(account.employeeId);
    const label = { "reset-password": `Issue a new temporary password for ${who}? Their current password stops working and every session is signed out.`, "revoke-sessions": `Sign ${who} out of every device?`, deactivate: `Deactivate ${who}? They are signed out and cannot sign in until reactivated. Their work and history are kept.`, reactivate: `Reactivate ${who}?` }[action];
    if (!window.confirm(label)) return;
    void run(action + ":" + account.id, async () => {
      const r = await api<{ temporaryPassword?: string }>(`/api/admin/accounts/${encodeURIComponent(account.id)}`, { method: "POST", json: { action } });
      if (r.temporaryPassword) setIssued({ username: account.employeeId, temporaryPassword: r.temporaryPassword, employee: who });
      else setMessage(action === "revoke-sessions" ? `${who} was signed out of every device.` : action === "deactivate" ? `${who} was deactivated.` : `${who} was reactivated.`);
    });
  };
  const status = (a?: Account) => {
    if (!a) return <>Not invited</>;
    if (!a.activatedAt) return a.invitationExpiresAt ? <>Invitation sent<small>Link expires {ukDateTime(a.invitationExpiresAt)}</small></> : <>Invitation expired<small>Send a new invitation</small></>;
    return <>{a.active ? "Active" : "Deactivated"}{a.mustChangePassword ? " · temporary password" : ""}<small>{a.lastSignInAt ? "Last sign-in " + ukDateTime(a.lastSignInAt) : "Not signed in yet"} · {a.activeSessions} session(s)</small></>;
  };
  const byEmployee = new Map((accounts || []).map((a) => [a.employeeId, a]));
  return <section className="panel settings-panel account-settings">
    <div className="panel-heading"><div><h2>Sign-in accounts</h2><p>Access is by invitation only. {isAdministrator ? "Enter the work email, choose the access level and send the invitation." : "The Administrator sends invitations and sets access levels."} The employee sets their own password from the emailed link; the account becomes active only then. They sign in with their work email or their fixed employee ID.</p>
      <p className="role-legend"><strong>Super User:</strong> the extra permissions configured in Authorization. <strong>Normal User:</strong> jobs assigned to them only (including jobs covered by a workflow duty assigned to them). Roles never grant workflow duties or approvals.</p></div></div>
    {sent && <div className="temp-password" role="status"><h3>Invitation sent to {sent.employee}</h3><p>Emailed to <strong>{sent.email}</strong>. The link works once and expires {ukDateTime(sent.expiresAt)}.</p>
      {sent.testLink && <><p><strong>Test mail mode:</strong> no email was sent. Open this link to complete the invitation:</p><p><code className="invite-link">{sent.testLink}</code></p></>}
      <button type="button" className="outline-button" onClick={() => setSent(null)}>Close</button></div>}
    {issued && <div className="temp-password" role="status"><h3>Temporary password for {issued.employee}</h3><p>Employee ID <strong>{issued.username}</strong> · Temporary password <code>{issued.temporaryPassword}</code></p><p>Give it to the employee in person or by phone. It is shown only once and must be changed at first sign-in.</p><button type="button" className="outline-button" onClick={() => setIssued(null)}>I have recorded it</button></div>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {!accounts && !error && <p role="status">Loading accounts…</p>}
    {accounts && <div className="client-table-wrap"><table className="client-table"><thead><tr><th>Employee</th><th>Work email</th><th>Access</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {employees.map((e) => { const a = byEmployee.get(e.id), role = accessRole(e.id, superUsers), pending = !a?.activatedAt; return <tr key={e.id}>
        <th scope="row">{e.name}<small>{positionOf(e)}{e.active ? "" : " · employee inactive"}</small><small className="employee-id">ID {e.id}</small></th>
        <td>{pending
          ? (isAdministrator && e.active ? <input type="email" aria-label={`Work email for ${e.name}`} autoComplete="off" placeholder="name@company" value={emailFor(e, a)} onChange={(ev) => setEmails({ ...emails, [e.id]: ev.target.value })} /> : (a?.email || "—"))
          : editing === a!.id
            ? <form className="email-edit" onSubmit={(ev) => { ev.preventDefault(); saveEmail(a!); }}><input type="email" aria-label={`Work email for ${e.name}`} autoComplete="off" value={emails[e.id] ?? ""} onChange={(ev) => setEmails({ ...emails, [e.id]: ev.target.value })} placeholder="Leave empty to remove" /><button type="submit" disabled={!!busy}>{busy === "email:" + a!.id ? "Saving…" : "Save"}</button><button type="button" onClick={() => setEditing("")}>Cancel</button></form>
            : <>{a!.email || <span className="muted-text">No email</span>}<button type="button" className="text-button" disabled={!!busy} onClick={() => { setEditing(a!.id); setEmails({ ...emails, [e.id]: a!.email || "" }); setError(""); }}>{a!.email ? "Change" : "Add email"}</button></>}</td>
        <td>{role === "administrator" ? <strong>Administrator</strong> : isAdministrator ? <select aria-label={`Access for ${e.name}`} value={role} onChange={(ev) => setRole(e, ev.target.value as "super" | "normal")}><option value="super">{accessRoleLabels.super}</option><option value="normal">{accessRoleLabels.normal}</option></select> : accessRoleLabels[role]}</td>
        <td>{status(a)}</td>
        <td><div className="row-actions">
          {pending && isAdministrator && e.active && <button type="button" disabled={!!busy || !emailFor(e, a).trim()} onClick={() => void invite(e, a)}>{busy === "invite:" + e.id ? "Sending…" : a?.invitedAt ? "Resend invitation" : "Send invitation"}</button>}
          {a && !pending && <>
            <button type="button" disabled={!!busy} onClick={() => act(a, "reset-password")}>Reset password</button>
            <button type="button" disabled={!!busy || !a.activeSessions} onClick={() => act(a, "revoke-sessions")}>Sign out everywhere</button>
            {a.id !== meAccountId && <button type="button" disabled={!!busy} onClick={() => act(a, a.active ? "deactivate" : "reactivate")}>{a.active ? "Deactivate" : "Reactivate"}</button>}
          </>}
          {a && pending && a.invitationExpiresAt && isAdministrator && <button type="button" disabled={!!busy} onClick={() => act(a, "deactivate")}>Cancel invitation</button>}
        </div></td>
      </tr>; })}
    </tbody></table></div>}
  </section>;
}
