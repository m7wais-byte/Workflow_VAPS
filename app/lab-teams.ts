import type { Stream } from './operations-model';
/** Members of each laboratory team. Team leads assign only within their team; membership never grants a permission. */
export type LabTeams = Record<Stream, string[]>;
export const labTeamsKey = 'vaps-lab-teams-v1';
/** Both teams start empty: membership is configured, never guessed. */
export const emptyLabTeams = (): LabTeams => ({ PVT: [], Chemical: [] });
export function readLabTeams(raw: string | null, ids: string[]): LabTeams {
  if (raw === null) return emptyLabTeams();
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid laboratory team settings');
  const teams = emptyLabTeams();
  for (const stream of ['PVT', 'Chemical'] as const) {
    const list = value[stream] ?? [];
    if (!Array.isArray(list) || list.some((id: unknown) => typeof id !== 'string' || !ids.includes(id))) throw Error('Invalid laboratory team settings');
    teams[stream] = [...new Set(list as string[])];
  }
  return teams;
}
/** Saved teams, or null when unreadable (assignment is then blocked rather than opened to everyone). */
export function storedLabTeams(ids: string[]): LabTeams | null {
  if (typeof window === 'undefined' || !window.localStorage) return emptyLabTeams();
  try { return readLabTeams(window.localStorage.getItem(labTeamsKey), ids); } catch { return null; }
}
