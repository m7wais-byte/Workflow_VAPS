/**
 * Demo setup: a labelled, separate configuration (teams, receipt, routing) used only while the demo is switched on.
 * It is stored under its own key and never written to the real Settings keys, so turning it off restores the saved Settings.
 */
export const demoSetupKey = 'vaps-demo-setup-v1';
export type DemoSetup = {
  enabled: boolean;
  /** Responsibility key → employee ID. Unlisted duties fall back to the saved Settings. */roles: Record<string, string>;
  teams: { PVT: string[]; Chemical: string[] };
  routing: Record<string, 'PVT' | 'Chemical' | 'Both'>;
  loadedAt: string;
};
const valid = (v: unknown): v is DemoSetup => {
  const d = v as DemoSetup;
  return !!d && typeof d === 'object' && typeof d.enabled === 'boolean' && !!d.roles && typeof d.roles === 'object' && !!d.teams && Array.isArray(d.teams.PVT) && Array.isArray(d.teams.Chemical) && !!d.routing && typeof d.routing === 'object';
};
/** The stored demo setup (on or off), or null when absent or unreadable. */
export function readDemoSetup(): DemoSetup | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try { const raw = window.localStorage.getItem(demoSetupKey); if (!raw) return null; const value = JSON.parse(raw); return valid(value) ? value : null; } catch { return null; }
}
/** The demo setup only while it is switched on. */
export function activeDemoSetup(): DemoSetup | null { const d = readDemoSetup(); return d?.enabled ? d : null; }
export function saveDemoSetup(value: DemoSetup) { window.localStorage.setItem(demoSetupKey, JSON.stringify(value)); }
