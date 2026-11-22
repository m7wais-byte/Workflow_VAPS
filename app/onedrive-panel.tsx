'use client';
/**
 * OneDrive pilot: the job's OneDrive copy, shown on every job section (Sites edition only, when configured).
 * Workflow VAPS keeps the original of every file; OneDrive holds a copy in <Job ID>/Sampling or <Job ID>/Lab.
 * Failures say whether the original is saved here; MA001 can retry and connect the VAPS Microsoft account.
 */
import { useCallback, useEffect, useState } from 'react';
import { CloudOff, LogIn, RefreshCw, UploadCloud } from 'lucide-react';
import { serverMode } from './app-storage';
import { api, type CopyUpload } from './workspace-sync';
import { filePurposes, sectionFolder, type FilePurpose } from './file-routing';
import { ukDateTime } from './uk-format';

type FileRow = { id: string; purpose: FilePurpose; folder: string; name: string; status: 'pending' | 'ok' | 'error' | 'replaced'; copyName: string | null; renamed: boolean; error: string | null; savedInVaps: boolean; updatedAt: string };
type Status = { configured: boolean; connected: boolean; canManage: boolean; job: { status: 'ok' | 'error'; error: string | null; folderUrl: string | null; updatedAt: string } | null; files: FileRow[] };
type Connection = { status: 'off' | 'not-connected' | 'pending' | 'connected' | 'expired'; account: string | null; error: string | null; signIn?: { url: string; code: string; expiresAt: string } };

const RETRY_HINT = 'MA001 (Administrator) can retry from this panel.';

/** One sentence per upload: was the original saved, did OneDrive get it, under which name. */
export function uploadNotice(u: CopyUpload): { tone: 'ok' | 'warn' | 'risk'; text: string } | null {
  const s = u.copy;
  if (s.status === 'off') return null;
  const folder = sectionFolder[filePurposes[u.purpose].section];
  if (s.status === 'error') return { tone: 'risk', text: `${u.name} is saved in Workflow VAPS. The OneDrive copy failed: ${s.message || 'OneDrive could not be reached.'} ${RETRY_HINT}` };
  if (s.renamed) return { tone: 'warn', text: `${u.name} is saved in Workflow VAPS and copied to OneDrive (${folder}) as “${s.name}”, because a file with the same name is already in that folder. Both files are kept.` };
  return { tone: 'ok', text: `${u.name} is saved in Workflow VAPS and copied to OneDrive (${folder}).` };
}

function fileNote(f: FileRow): string {
  if (f.status === 'ok') return f.renamed ? `Saved in OneDrive as “${f.copyName}”: a file with this name was already in the folder. Both are kept.` : 'Copied.';
  if (f.status === 'replaced') return 'Not copied: this version was replaced in Workflow VAPS before it reached OneDrive.';
  return f.status === 'pending' ? 'Original saved in Workflow VAPS. Waiting to be copied.' : `Original saved in Workflow VAPS. OneDrive copy failed: ${f.error || 'unknown error'}`;
}
const pill = (s: string) => s === 'ok' ? 'flow-closed' : s === 'error' ? 'overdue' : 'flow-pending';
const label = (s: string) => ({ ok: 'Copied', error: 'Failed', pending: 'Pending', replaced: 'Replaced' })[s] || s;

/** MA001: connect the VAPS Microsoft account with Microsoft's device sign-in (no password or token passes through Workflow VAPS). */
function Connect({ onConnected }: { onConnected: () => void }) {
  const [c, setC] = useState<Connection | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const act = useCallback(async (action: string) => { setBusy(true); try { const r = await api<Connection>('/api/admin/onedrive', { method: 'POST', json: { action } }); setC((prev) => ({ ...r, signIn: r.signIn || (r.status === 'pending' ? prev?.signIn : undefined) })); setError(''); if (r.status === 'connected') onConnected(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }, [onConnected]);
  useEffect(() => { let current = true; api<Connection>('/api/admin/onedrive').then((r) => { if (current) setC(r); }, (e: Error) => { if (current) setError(e.message); }); return () => { current = false; }; }, []);
  // While a sign-in is waiting, check every 5 seconds whether it has been approved.
  useEffect(() => { if (c?.status !== 'pending' || !c.signIn) return; const t = setInterval(() => void act('poll'), 5000); return () => clearInterval(t); }, [c?.status, c?.signIn, act]);
  return <div className="od-connect">
    {error && <p className="ops-error" role="alert">{error}</p>}
    {c?.error && <p className="sp-notice sp-risk">{c.error}</p>}
    {c?.status === 'pending' && c.signIn ? <ol className="od-steps">
      <li>Open <a href={c.signIn.url} target="_blank" rel="noreferrer"><strong>{c.signIn.url.replace(/^https:\/\//, '')}</strong></a> in a new tab.</li>
      <li>Enter the code <strong className="od-code">{c.signIn.code}</strong> (valid until {ukDateTime(c.signIn.expiresAt)}).</li>
      <li>Sign in with the <strong>VAPS Microsoft account</strong> that owns the pilot folder, and approve <em>Workflow VAPS OneDrive Pilot</em>.</li>
      <li>Return here: this page notices the approval within a few seconds.</li>
    </ol> : <p>{c?.status === 'expired' ? 'The Microsoft sign-in expired or was revoked.' : 'OneDrive is not connected.'} New files are saved in Workflow VAPS and copied when OneDrive is connected.</p>}
    <button type="button" className="primary-button" disabled={busy} onClick={() => void act('connect')}><LogIn size={15} aria-hidden /> {c?.status === 'pending' ? 'Get a new code' : 'Connect OneDrive'}</button>
  </div>;
}

export function OneDrivePanel({ jobId, revision }: { jobId: string; /** Changes after each save, so the panel re-reads. */revision: string }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ReturnType<typeof uploadNotice>>(null), [open, setOpen] = useState(false), [tick, setTick] = useState(0);
  const load = useCallback(async () => { try { setStatus(await api<Status>(`/api/jobs/${encodeURIComponent(jobId)}/onedrive`)); setError(''); } catch (e) { setError((e as Error).message); } }, [jobId]);
  useEffect(() => {
    if (!serverMode) return;
    let current = true;
    api<Status>(`/api/jobs/${encodeURIComponent(jobId)}/onedrive`).then((s) => { if (current) { setStatus(s); setError(''); } }, (e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [jobId, revision, tick]);
  useEffect(() => {
    const on = (e: Event) => { const u = (e as CustomEvent<CopyUpload>).detail; if (u.jobId !== jobId) return; const n = uploadNotice(u); setNotice(n); if (n && n.tone !== 'ok') setOpen(true); void load(); };
    window.addEventListener('vaps-file-copy', on);
    return () => window.removeEventListener('vaps-file-copy', on);
  }, [jobId, load]);
  if (!serverMode || !status?.configured) return null;

  const failed = status.files.filter((f) => f.status === 'error').length + (status.job?.status === 'error' ? 1 : 0);
  const pending = status.files.filter((f) => f.status === 'pending').length;
  const state = !status.connected ? 'off' : !status.job ? 'pending' : failed ? 'error' : pending ? 'pending' : 'ok';
  const summary = state === 'off' ? 'Not connected · originals saved in Workflow VAPS' : state === 'ok' ? `Synced · ${status.files.filter((f) => f.status === 'ok').length} file${status.files.length === 1 ? '' : 's'}` : state === 'error' ? `${failed} problem${failed === 1 ? '' : 's'} · originals saved in Workflow VAPS` : !status.job ? 'Folders not created yet' : `${pending} waiting`;
  const retry = async () => {
    setBusy(true);
    try { setStatus(await api<Status>('/api/admin/onedrive', { method: 'POST', json: { action: 'retry', jobId } })); setNotice(null); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return <details className="panel ops-panel sp-panel" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
    <summary><span className="sp-title">{state === 'error' || state === 'off' ? <CloudOff size={16} aria-hidden /> : <UploadCloud size={16} aria-hidden />} OneDrive copy</span><span className={'status-pill ' + (state === 'off' ? 'overdue' : pill(state))}>{state === 'ok' ? 'Synced' : state === 'error' ? 'Needs retry' : state === 'off' ? 'Not connected' : 'Pending'}</span><small>{summary}</small></summary>
    {notice && <p className={'sp-notice sp-' + notice.tone} role="status">{notice.text}</p>}
    {error && <p className="ops-error" role="alert">{error}</p>}
    {!status.connected && (status.canManage ? <Connect onConnected={() => { setTick((t) => t + 1); void retry(); }} /> : <p className="sp-notice sp-warn">OneDrive is not connected. Files are saved in Workflow VAPS; MA001 (Administrator) must connect OneDrive before copies are made.</p>)}
    <div className="sp-head">
      <p>Workflow VAPS keeps the original of every file. OneDrive holds a copy in <strong>{jobId}/Sampling</strong> or <strong>{jobId}/Lab</strong>{status.job?.folderUrl && <> · <a href={status.job.folderUrl} target="_blank" rel="noreferrer">Open folder (pilot testers only)</a></>}.</p>
      {status.canManage && status.connected && state !== 'ok' && <button type="button" className="outline-button" disabled={busy} onClick={retry}><RefreshCw size={15} aria-hidden /> {busy ? 'Retrying…' : 'Retry OneDrive copy'}</button>}
    </div>
    {status.job?.status === 'error' && <p className="sp-notice sp-risk">Job folders: {status.job.error} The job itself is saved in Workflow VAPS.{status.canManage ? '' : ' ' + RETRY_HINT}</p>}
    {status.files.length ? <div className="client-table-wrap"><table className="client-table sp-table"><thead><tr><th>File</th><th>Type</th><th>Folder</th><th>OneDrive</th><th>Details</th></tr></thead><tbody>
      {status.files.map((f) => <tr key={f.id}><th scope="row">{f.name}<small>{ukDateTime(f.updatedAt)}</small></th><td>{filePurposes[f.purpose]?.label || f.purpose}</td><td>{f.folder}</td><td><span className={'status-pill ' + pill(f.status)}>{label(f.status)}</span></td><td>{fileNote(f)}{f.status === 'error' && !status.canManage ? ' ' + RETRY_HINT : ''}</td></tr>)}
    </tbody></table></div> : <p className="rv-hint">No files for this job yet.</p>}
  </details>;
}
