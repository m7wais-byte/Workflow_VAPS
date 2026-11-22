'use client';
/**
 * Microsoft 365 pilot: the job's SharePoint copy, shown on every job section (Sites edition only).
 * Workflow VAPS keeps the original of every file; SharePoint holds a copy in <Job ID>/Sampling or <Job ID>/Lab.
 * Failures say whether the original is saved here; MA001 can retry. A copy renamed by SharePoint shows its new name.
 */
import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, UploadCloud } from 'lucide-react';
import { serverMode } from './app-storage';
import { api, type SharePointUpload } from './workspace-sync';
import { filePurposes, type FilePurpose } from './file-routing';
import { ukDateTime } from './uk-format';

type FileRow = { id: string; purpose: FilePurpose; folder: string; name: string; status: 'pending' | 'ok' | 'error' | 'replaced'; sharePointName: string | null; renamed: boolean; error: string | null; savedInVaps: boolean; updatedAt: string };
type Status = { configured: boolean; canRetry: boolean; job: { status: 'pending' | 'ok' | 'error'; error: string | null; folderUrl: string | null; updatedAt: string } | null; files: FileRow[] };

const RETRY_HINT = 'MA001 (Administrator) can retry from this panel.';

/** One sentence per upload, in plain words: was the original saved, did SharePoint get it, under which name. */
export function uploadNotice(u: SharePointUpload): { tone: 'ok' | 'warn' | 'risk'; text: string } | null {
  const s = u.sharepoint;
  if (s.status === 'off') return null;
  if (s.status === 'error') return { tone: 'risk', text: `${u.name} is saved in Workflow VAPS. The SharePoint copy failed: ${s.message || 'SharePoint could not be reached.'} ${RETRY_HINT}` };
  const folder = filePurposes[u.purpose].section === 'lab' ? 'Lab' : 'Sampling';
  if (s.renamed) return { tone: 'warn', text: `${u.name} is saved in Workflow VAPS and copied to SharePoint (${folder}) as “${s.name}”, because a file with the same name is already in that folder. The existing file was not changed.` };
  return { tone: 'ok', text: `${u.name} is saved in Workflow VAPS and copied to SharePoint (${folder}).` };
}

function fileNote(f: FileRow): string {
  if (f.status === 'ok') return f.renamed ? `Saved in SharePoint as “${f.sharePointName}”: a file with this name was already in the folder.` : 'Copied.';
  if (f.status === 'replaced') return 'Not copied: this version was replaced in Workflow VAPS before it reached SharePoint.';
  const kept = f.savedInVaps ? 'Original saved in Workflow VAPS.' : '';
  return f.status === 'pending' ? `${kept} Waiting to be copied.` : `${kept} SharePoint copy failed: ${f.error || 'unknown error'}`;
}

const pill = (s: string) => s === 'ok' ? 'flow-closed' : s === 'error' ? 'overdue' : 'flow-pending';
const label = (s: string) => ({ ok: 'Copied', error: 'Failed', pending: 'Pending', replaced: 'Replaced' })[s] || s;

export function SharePointPanel({ jobId, revision }: { jobId: string; /** Changes after each save, so the panel re-reads. */revision: string }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ReturnType<typeof uploadNotice>>(null), [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try { setStatus(await api<Status>(`/api/jobs/${encodeURIComponent(jobId)}/sharepoint`)); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, [jobId]);
  useEffect(() => {
    if (!serverMode) return;
    let current = true;
    api<Status>(`/api/jobs/${encodeURIComponent(jobId)}/sharepoint`).then((s) => { if (current) { setStatus(s); setError(''); } }, (e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [jobId, revision]);
  useEffect(() => {
    const on = (e: Event) => { const u = (e as CustomEvent<SharePointUpload>).detail; if (u.jobId !== jobId) return; const n = uploadNotice(u); setNotice(n); if (n && n.tone !== 'ok') setOpen(true); void load(); };
    window.addEventListener('vaps-sharepoint', on);
    return () => window.removeEventListener('vaps-sharepoint', on);
  }, [jobId, load]);
  if (!serverMode || !status?.configured) return null;

  const failed = status.files.filter((f) => f.status === 'error').length + (status.job?.status === 'error' ? 1 : 0);
  const pending = status.files.filter((f) => f.status === 'pending').length;
  const state = !status.job ? 'pending' : failed ? 'error' : pending || status.job.status === 'pending' ? 'pending' : 'ok';
  const summary = state === 'ok' ? `Synced · ${status.files.filter((f) => f.status === 'ok').length} file${status.files.length === 1 ? '' : 's'}` : state === 'error' ? `${failed} problem${failed === 1 ? '' : 's'} · originals saved in Workflow VAPS` : !status.job ? 'Not copied yet' : `${pending} waiting`;
  const retry = async () => {
    setBusy(true);
    try { setStatus({ ...(await api<Status>('/api/admin/sharepoint', { method: 'POST', json: { jobId } })) }); setNotice(null); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return <details className="panel ops-panel sp-panel" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
    <summary><span className="sp-title">{state === 'error' ? <CloudOff size={16} aria-hidden /> : <UploadCloud size={16} aria-hidden />} SharePoint copy</span><span className={'status-pill ' + pill(state)}>{state === 'ok' ? 'Synced' : state === 'error' ? 'Needs retry' : 'Pending'}</span><small>{summary}</small></summary>
    {notice && <p className={'sp-notice sp-' + notice.tone} role="status">{notice.text}</p>}
    {error && <p className="ops-error" role="alert">{error}</p>}
    <div className="sp-head">
      <p>Workflow VAPS keeps the original of every file. SharePoint holds a copy in <strong>{jobId}/Sampling</strong> or <strong>{jobId}/Lab</strong>{status.job?.folderUrl && <> · <a href={status.job.folderUrl} target="_blank" rel="noreferrer">Open folder (pilot testers only)</a></>}.</p>
      {status.canRetry && state !== 'ok' && <button type="button" className="outline-button" disabled={busy} onClick={retry}><RefreshCw size={15} aria-hidden /> {busy ? 'Retrying…' : 'Retry SharePoint copy'}</button>}
    </div>
    {status.job?.status === 'error' && <p className="sp-notice sp-risk">Job folders / Job Register: {status.job.error} The job itself is saved in Workflow VAPS.{status.canRetry ? '' : ' ' + RETRY_HINT}</p>}
    {status.files.length ? <div className="client-table-wrap"><table className="client-table sp-table"><thead><tr><th>File</th><th>Type</th><th>Folder</th><th>SharePoint</th><th>Details</th></tr></thead><tbody>
      {status.files.map((f) => <tr key={f.id}><th scope="row">{f.name}<small>{ukDateTime(f.updatedAt)}</small></th><td>{filePurposes[f.purpose]?.label || f.purpose}</td><td>{f.folder}</td><td><span className={'status-pill ' + pill(f.status)}>{label(f.status)}</span></td><td>{fileNote(f)}{f.status === 'error' && !status.canRetry ? ' ' + RETRY_HINT : ''}</td></tr>)}
    </tbody></table></div> : <p className="rv-hint">No files for this job yet.</p>}
  </details>;
}
