/**
 * The browser export file (one JSON document) shared by the export button (app/data-export.ts) and the server
 * import (server/import.ts). Records are carried exactly as stored in the browser, with SHA-256 fingerprints so the
 * import can prove nothing changed in transit. Pure: no browser APIs, so the server and tests use the same code.
 */
export const exportFormat = 'vaps-browser-export';
export const exportVersion = 1;

/**
 * Left out of every export: the sign-in session, client share-link edit keys (secrets that control live links) and
 * the labelled demo setup (it must never become a real configuration). Everything else starting `vaps-` is kept.
 */
export const excludedKeys = ['vaps-demo-session-v1', 'vaps-job-summary-links-v1', 'vaps-demo-setup-v1'];
export const exportedKey = (key: string) => key.startsWith('vaps-') && !excludedKeys.includes(key);

export type ExportFile = { id: string; name: string; type: string; size: number; sha256: string; base64: string };
export type ExportManifest = {
  exportedAt: string; exportedBy: string; origin: string;
  /** Keys this browser never saved, exported as the built-in value the app was using (e.g. an unedited directory). */defaults?: string[];
  keys: Record<string, { sha256: string; length: number }>;
  files: { id: string; name: string; size: number; sha256: string }[];
  requests: { count: number; sha256: string };
  counts: { jobs: number; employees: number; files: number; requests: number };
};
export type BrowserExport = { format: typeof exportFormat; version: typeof exportVersion; manifest: ExportManifest; localStorage: Record<string, string>; requests: unknown[]; files: ExportFile[] };

export async function sha256(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

const count = (raw: string | undefined, field?: string) => { try { const v = raw ? JSON.parse(raw) : []; const list = field ? v?.[field] : v; return Array.isArray(list) ? list.length : 0; } catch { return 0; } };

/** Removes passwords from the employee directory; any other value is returned unchanged (unreadable ones too). */
export function withoutPasswords(raw: string): string {
  try {
    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.employees)) return raw;
    return JSON.stringify({ ...value, employees: value.employees.map((e: Record<string, unknown>) => ({ ...e, password: '' })) });
  } catch { return raw; }
}

/** Builds the export document from what was read in the browser. Values are kept byte for byte, except passwords. */
export async function makeExport(input: { local: Record<string, string>; files: ExportFile[]; requests: unknown[]; exportedBy: string; exportedAt: string; origin: string; /** Built-in values for keys the browser never saved; used only where `local` has no value. */defaults?: Record<string, string> }): Promise<BrowserExport> {
  const defaults = Object.keys(input.defaults || {}).filter(key => exportedKey(key) && input.local[key] === undefined).sort();
  const source: Record<string, string> = { ...input.local, ...Object.fromEntries(defaults.map(key => [key, input.defaults![key]])) };
  const local: Record<string, string> = {};
  for (const key of Object.keys(source).filter(exportedKey).sort()) local[key] = key === 'vaps-directory-v1' ? withoutPasswords(source[key]) : source[key];
  const keys: ExportManifest['keys'] = {};
  for (const [key, value] of Object.entries(local)) keys[key] = { sha256: await sha256(value), length: value.length };
  const requests = input.requests;
  return {
    format: exportFormat, version: exportVersion, localStorage: local, requests, files: input.files,
    manifest: {
      exportedAt: input.exportedAt, exportedBy: input.exportedBy, origin: input.origin, ...(defaults.length ? { defaults } : {}), keys,
      files: input.files.map(({ id, name, size, sha256 }) => ({ id, name, size, sha256 })),
      requests: { count: requests.length, sha256: await sha256(JSON.stringify(requests)) },
      counts: { jobs: count(local['vaps-demo-jobs-v1']), employees: count(local['vaps-directory-v1'], 'employees'), files: input.files.length, requests: requests.length },
    },
  };
}

/** The export's identity: the fingerprint of its manifest. The same export imported twice has the same ID. */
export const exportId = (manifest: ExportManifest) => sha256(JSON.stringify(manifest));

/**
 * Parses an export file and checks every fingerprint. Returns the problems found; an empty list means the file is
 * complete and unchanged since it was exported.
 */
export async function verifyExport(text: string): Promise<{ data?: BrowserExport; problems: string[] }> {
  let data: BrowserExport;
  try { data = JSON.parse(text); } catch { return { problems: ['The file is not a VAPS export (it is not valid JSON).'] }; }
  if (data?.format !== exportFormat || data.version !== exportVersion || !data.manifest || typeof data.localStorage !== 'object' || !Array.isArray(data.files) || !Array.isArray(data.requests)) return { problems: ['The file is not a VAPS export of a supported version.'] };
  const problems: string[] = [];
  const m = data.manifest;
  const listed = Object.keys(m.keys || {}).sort(), present = Object.keys(data.localStorage).sort();
  if (JSON.stringify(listed) !== JSON.stringify(present)) problems.push('The records in the file do not match its manifest.');
  for (const key of present) {
    const value = data.localStorage[key];
    if (typeof value !== 'string' || await sha256(value) !== m.keys[key]?.sha256) problems.push(`Record ${key} changed after export.`);
    if (!exportedKey(key)) problems.push(`Record ${key} should not be in an export.`);
  }
  if (await sha256(JSON.stringify(data.requests)) !== m.requests?.sha256) problems.push('The request book changed after export.');
  if (data.files.length !== (m.files || []).length) problems.push('The uploaded files do not match the manifest.');
  for (const f of data.files) {
    const listedFile = m.files.find(x => x.id === f.id);
    const bytes = Uint8Array.from(atob(f.base64 || ''), c => c.charCodeAt(0));
    if (!listedFile || bytes.length !== f.size || await sha256(bytes) !== f.sha256 || f.sha256 !== listedFile.sha256) problems.push(`Uploaded file ${f.name} (${f.id}) is incomplete or changed after export.`);
  }
  return { data, problems };
}
