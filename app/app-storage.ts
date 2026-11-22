/**
 * One storage entry point for the saved workspace (jobs, employee directory, authorization, duties, catalogue …).
 *
 * - GitHub Pages edition (static demo): the browser's localStorage, as before.
 * - Sites edition: an in-memory copy of the shared records loaded from the server after sign-in. Reads are synchronous
 *   so the existing workflow logic is unchanged; writes are sent to the server, which checks the signed-in employee's
 *   permissions again and is the only authority (see app/workspace-sync.ts and server/workspace.ts).
 * - On the server, `runWithStorage` points the same readers at the records loaded from the database for one request,
 *   so permission checks there use exactly the same functions as the interface.
 */
import { staticPages, viteBuild } from "./deployment";

export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

/**
 * True in the Sites edition: identity comes from the server session and shared records live on the server.
 * Unit tests bundle the modules without Vite and exercise the browser-only behaviour, unless they define
 * `import.meta.env` (the server tests do).
 */
export const serverMode = viteBuild && !staticPages;

/** Keys held in shared server storage (Sites edition). Anything else stays a per-browser preference. */
export const sharedKeys = [
  "vaps-directory-v1", "vaps-authorization-v1", "vaps-responsibilities-v1", "vaps-lab-teams-v1", "vaps-test-catalogue-v1", "vaps-test-routing-v1",
  "vaps-lab-equipment-v1", "vaps-request-lists-v1", "vaps-company-v1", "vaps-demo-clients-v1", "vaps-custom-bottles-v1", "vaps-cylinder-status-v1",
  "vaps-access-roles-v1",
] as const;
export type SharedKey = typeof sharedKeys[number];
export const jobsKey = "vaps-demo-jobs-v1";
export const activityKey = "vaps-demo-activity-v1";
export const isSharedKey = (key: string): key is SharedKey => (sharedKeys as readonly string[]).includes(key);
/** Browser-only demo keys that must have no effect in the Sites edition (identity switching, demo duty overrides). */
export const demoOnlyKeys = ["vaps-demo-session-v1", "vaps-demo-setup-v1"];

let override: StorageLike | null = null;
/**
 * Runs synchronous work with `appStorage()` reading the given records (server-side permission checks). The work must
 * not await: nothing else can run in between, so concurrent requests never see each other's records.
 */
export function runWithStorage<T>(storage: StorageLike, work: () => T): T {
  const previous = override; override = storage;
  try { const result = work(); if (result instanceof Promise) throw Error("runWithStorage work must be synchronous"); return result; }
  finally { override = previous; }
}
export const onServer = () => override !== null;

let browserStore: StorageLike | null = null;
/** Installed by workspace-sync.ts in the Sites edition once the signed-in workspace is loaded. */
export function installBrowserStore(store: StorageLike | null) { browserStore = store; }

/** The storage the workspace reads and writes, or null when none is available (server render without records). */
export function appStorage(): StorageLike | null {
  if (override) return override;
  if (typeof window === "undefined" || !window.localStorage) return null;
  if (!serverMode) return window.localStorage;
  return browserStore;
}

/** In the Sites edition demo-only keys are never read, so a stored value cannot change duties or identity. */
export const demoStorage = (): StorageLike | null => serverMode || override ? null : appStorage();
