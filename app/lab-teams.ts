import type { Stream } from './operations-model';
import { activeDemoSetup } from './demo-setup';
/** Laboratory team membership groups employees in planning. Membership never grants a permission. */
export type LabTeams = Record<Stream, string[]>;
export const labTeamsKey = 'vaps-lab-teams-v1';
const defaultLabTeams: LabTeams = {
  PVT: ['SHEREIQI', 'NASSER', 'RANJITH', 'YAQEEN'],
  Chemical: ['BAHRI', 'AHAD'],
};
export const emptyLabTeams = (): LabTeams => ({ PVT: [], Chemical: [] });
export function readLabTeams(raw: string | null, ids: string[]): LabTeams {
  if (raw === null) return {
    PVT: defaultLabTeams.PVT.filter(id => ids.includes(id)),
    Chemical: defaultLabTeams.Chemical.filter(id => ids.includes(id)),
  };
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
  const demo = activeDemoSetup();
  if (demo) return { PVT: demo.teams.PVT.filter(id => ids.includes(id)), Chemical: demo.teams.Chemical.filter(id => ids.includes(id)) };
  try { return readLabTeams(window.localStorage.getItem(labTeamsKey), ids); } catch { return null; }
}
