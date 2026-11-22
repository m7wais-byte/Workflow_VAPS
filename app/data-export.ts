/**
 * "Export all records": one read-only JSON file with every VAPS record in this browser, its uploaded files and the
 * request book, for the server import (server/import.ts). Nothing in the browser is changed or deleted.
 */
import { administratorId } from './authorization';
import { directoryKey, loadDirectory } from './employee-directory';
import { makeExport, sha256, type ExportFile } from './export-format';
import { loadRequests } from './request-store';
import { allStoredFiles } from './workbook-storage';

function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export type ExportResult = { blob: Blob; fileName: string; counts: { jobs: number; employees: number; files: number; requests: number } };

export async function exportAllRecords(actorId: string, includeFiles: boolean): Promise<ExportResult> {
  if (actorId !== administratorId || !loadDirectory().employees.some(e => e.id === actorId && e.active)) throw Error('Only the administrator can export all records.');
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key) local[key] = localStorage.getItem(key) ?? ''; }
  const files: ExportFile[] = [];
  let stored: { id: string; file: Blob }[] = [];
  if (includeFiles) { try { stored = await allStoredFiles(); } catch { throw Error('Uploaded files could not be read. Retry, or export without files.'); } }
  for (const { id, file } of stored) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    files.push({ id, name: (file as File).name || id, type: file.type, size: bytes.length, sha256: await sha256(bytes), base64: base64(bytes) });
  }
  let requests: unknown[] = [];
  try { requests = await loadRequests(); } catch { throw Error('The request book could not be read. Nothing was exported.'); }
  const now = new Date().toISOString();
  // A directory never edited in this browser is not saved; the app uses its built-in list, so that list is exported.
  const data = await makeExport({ local, files, requests, exportedBy: actorId, exportedAt: now, origin: location.origin, defaults: { [directoryKey]: JSON.stringify(loadDirectory()) } });
  const day = now.slice(0, 10);
  return { blob: new Blob([JSON.stringify(data)], { type: 'application/json' }), fileName: `vaps-export-${day}.json`, counts: data.manifest.counts };
}
