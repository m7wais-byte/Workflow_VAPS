"use client";
/**
 * Sites edition sign-in. The workspace is not mounted until the server confirms a session and returns the records this
 * employee may read. Identity comes only from the HttpOnly session cookie, checked by the server on every request.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { assetUrl } from "./deployment";
import { api, ApiError, clearWorkspace, loadWorkspace, onSync, settled, type Me } from "./workspace-sync";

type State = { kind: "checking" } | { kind: "signed-out"; message?: string } | { kind: "must-change"; username: string } | { kind: "ready"; me: Me; generation: number; notice?: string } | { kind: "error"; message: string };

export type SessionProps = { me: Me; generation: number; signOut: () => Promise<void>; reload: (notice?: string) => void; notice?: string };

export function AuthGate({ children }: { children: (session: SessionProps) => ReactNode }) {
  const [state, setState] = useState<State>({ kind: "checking" });

  const start = useCallback(async (notice?: string) => {
    try {
      const session = await api<{ employeeId: string; username: string; mustChangePassword: boolean }>("/api/auth/session");
      if (session.mustChangePassword) { clearWorkspace(); setState({ kind: "must-change", username: session.username }); return; }
      const data = await loadWorkspace();
      setState((s) => ({ kind: "ready", me: data.me, generation: (s.kind === "ready" ? s.generation : 0) + 1, notice }));
    } catch (error) {
      clearWorkspace();
      if (error instanceof ApiError && error.status === 401) setState({ kind: "signed-out", message: error.signedOut && error.message !== "Sign in to continue." ? error.message : undefined });
      else setState({ kind: "error", message: error instanceof Error ? error.message : "The workspace could not be loaded." });
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the session is checked once on load
  useEffect(() => { void start(); }, [start]);
  useEffect(() => {
    const ended = (event: Event) => { clearWorkspace(); setState({ kind: "signed-out", message: (event as CustomEvent<string>).detail || "Your session has ended. Sign in again." }); };
    window.addEventListener("vaps-signed-out", ended);
    // A change the server refused: reload the saved records so the screen matches what was stored.
    const off = onSync((event) => { if (event.type === "error") void start(event.message + " The workspace was reloaded with the saved records."); });
    return () => { window.removeEventListener("vaps-signed-out", ended); off(); };
  }, [start]);

  const signOut = useCallback(async () => {
    await settled();
    try { await api("/api/auth/logout", { method: "POST", json: {} }); } catch { /* the session is cleared locally either way */ }
    clearWorkspace(); setState({ kind: "signed-out", message: "You have signed out." });
  }, []);

  if (state.kind === "checking") return <div className="login-loading"><img src={assetUrl("/vaps-logo.png")} alt="VAPS" /><span>Checking your session…</span></div>;
  if (state.kind === "error") return <LoginLayout><div className="login-card"><span className="eyebrow">EMPLOYEE ACCESS</span><h2>Workspace unavailable</h2><div className="login-error" role="alert"><span>!</span>{state.message}</div><button className="login-submit" type="button" onClick={() => { setState({ kind: "checking" }); void start(); }}>Retry</button></div></LoginLayout>;
  if (state.kind === "signed-out") return <LoginScreen message={state.message} onSignedIn={() => { setState({ kind: "checking" }); void start(); }} />;
  if (state.kind === "must-change") return <LoginLayout><div className="login-card"><span className="eyebrow">FIRST SIGN-IN</span><h2>Choose your password</h2><p>Your account was issued a temporary password. Choose a personal password to continue.</p><PasswordChangeForm username={state.username} submitLabel="Save password and continue" onChanged={() => { setState({ kind: "checking" }); void start("Password changed. Other sessions were signed out."); }} /><button className="text-button login-alt" type="button" onClick={() => void signOut()}>Sign out</button></div></LoginLayout>;
  return <>{children({ me: state.me, generation: state.generation, signOut, reload: (notice) => void start(notice), notice: state.notice })}</>;
}

function LoginLayout({ children }: { children: ReactNode }) {
  return <main className="login-page">
    <section className="login-visual" aria-label="VAPS PVT Lab & Sampling introduction">
      <div className="login-brand"><img src={assetUrl("/vaps-logo.png")} alt="VAPS" /><span>INTERNAL OPERATIONS</span></div>
      <div className="login-visual-copy"><span className="eyebrow">PETROLEUM LABORATORY SERVICES</span><h1>Technical workflows.<br />Clear responsibility.</h1><p>A focused workspace for managing PVT laboratory jobs, sampling records, and operational accountability.</p></div>
      <div className="login-security"><span className="status-dot" /><div><strong>VAPS employees only</strong><small>Sign in with your username or work email and your password. Accounts are created by your administrator.</small></div></div>
    </section>
    <section className="login-form-side">{children}</section>
  </main>;
}

function LoginScreen({ message, onSignedIn }: { message?: string; onSignedIn: () => void }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await api("/api/auth/login", { method: "POST", json: form }); setForm({ username: "", password: "" }); onSignedIn(); }
    catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); setForm((f) => ({ ...f, password: "" })); }
    finally { setBusy(false); }
  }
  return <LoginLayout>
    <form className="login-card" onSubmit={submit}>
      <div className="login-mobile-logo"><img src={assetUrl("/vaps-logo.png")} alt="VAPS" /></div>
      <span className="eyebrow">EMPLOYEE ACCESS</span>
      <h2>VAPS PVT Lab & Sampling</h2>
      <p>Internal Laboratory Workflow Management</p>
      {message && !error && <p className="login-info" role="status">{message}</p>}
      <div className="login-fields">
        <label><span>Username or email</span><input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setError(""); }} /></label>
        <label><span>Password</span><div className="password-field"><input name="password" type={show ? "text" : "password"} autoComplete="current-password" required value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); setError(""); }} /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button></div></label>
      </div>
      {error && <div className="login-error" role="alert"><span>!</span>{error}</div>}
      <button className="login-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : <>Sign In <span>→</span></>}</button>
      <small className="demo-hint">Forgotten your password? Ask your administrator to issue a temporary one.</small>
    </form>
  </LoginLayout>;
}

/** Own password change: verifies the current password on the server; other sessions are signed out. */
export function PasswordChangeForm({ username, onChanged, submitLabel = "Change password" }: { username: string; onChanged: () => void; submitLabel?: string }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (form.newPassword !== form.confirm) { setError("The new passwords do not match."); return; }
    setBusy(true); setError("");
    try { await api("/api/auth/password", { method: "POST", json: { currentPassword: form.currentPassword, newPassword: form.newPassword } }); setForm({ currentPassword: "", newPassword: "", confirm: "" }); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "The password could not be changed."); }
    finally { setBusy(false); }
  }
  return <form className="password-change" onSubmit={submit}>
    <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
    <div className="login-fields">
      <label><span>Current password</span><input type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></label>
      <label><span>New password</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /><small className="field-hint">At least 12 characters. A short sentence is easy to remember.</small></label>
      <label><span>Confirm new password</span><input type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></label>
    </div>
    {error && <div className="login-error" role="alert"><span>!</span>{error}</div>}
    <button className="login-submit" type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
  </form>;
}
