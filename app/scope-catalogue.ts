import { scopeTestGroups, isValidationTest } from './lab-work';
import type { TestRouting } from './test-routing';

/**
 * Presentation of the existing test catalogue per fluid type. Catalogue IDs ("Black Oil — DL") are unchanged and stay
 * the stored identity of every selection; this module only decides which cards to show and maps a card to its IDs.
 * Validation is never a card: it is requested with the per-sample "Validation required?" control.
 */
export type FluidType = 'Black Oil' | 'Gas Condensate' | 'Water' | 'Chemical' | 'OBM' | 'Other';
export const fluidTypes: FluidType[] = ['Black Oil', 'Gas Condensate', 'Water', 'Chemical', 'OBM', 'Other'];
export type TeamChoice = 'PVT' | 'Chemical' | 'Both';
/** Catalogue group names that carry a fluid-specific method. */
export const fluidGroup: Record<'Black Oil' | 'Gas Condensate', string> = { 'Black Oil': 'Black Oil', 'Gas Condensate': 'Gas Condensates (GC)' };
const methodLabel: Record<string, string> = { 'Black Oil': 'Black Oil method', 'Gas Condensates (GC)': 'Gas Condensate method' };
export type TestCard = { key: string; label: string; section: 'Fluid tests' | 'General analysis' | 'Specialised analysis'; ids: string[] };
export const groupOf = (id: string) => id.split(' — ')[0];
export const shortTest = (id: string) => id.split(' — ').slice(1).join(' — ') || id;
/** "Black Oil method" etc., for an ID whose test name also exists for the other fluid type. */
export const methodOf = (id: string) => methodLabel[groupOf(id)] || '';
const fluidIds = (group: string) => (scopeTestGroups.find((g) => g.name === group)?.tests || []).map((t) => `${group} — ${t}`).filter((id) => !isValidationTest(id));

/** Test cards for a fluid type: each test name appears once. Other (or not yet chosen) shows every fluid test once, with its methods. */
export function testCards(fluid?: FluidType): TestCard[] {
  const groups = fluid === 'Black Oil' || fluid === 'Gas Condensate' ? [fluidGroup[fluid]] : [fluidGroup['Black Oil'], fluidGroup['Gas Condensate']];
  const cards = new Map<string, TestCard>();
  for (const group of groups) for (const id of fluidIds(group)) {
    const key = shortTest(id), card = cards.get(key) || { key, label: key, section: 'Fluid tests' as const, ids: [] };
    card.ids.push(id); cards.set(key, card);
  }
  const general = (name: string, section: TestCard['section']) => (scopeTestGroups.find((g) => g.name === name)?.tests || []).map((t) => ({ key: t, label: t, section, ids: [`${name} — ${t}`] }));
  return [...cards.values(), ...general('Others', 'General analysis'), ...general('Specialised Analysis', 'Specialised analysis')];
}
/** Saved catalogue selections that the chosen fluid type does not list (kept, flagged for review, never deleted automatically). */
export function needsReview(ids: string[], fluid?: FluidType): string[] {
  if (!fluid) return [];
  const shown = new Set(testCards(fluid).flatMap((c) => c.ids));
  return [...new Set(ids)].filter((id) => !isValidationTest(id) && !shown.has(id));
}
/** Teams a test may go to for a sample destination. Settings classification wins; an unclassified test follows the destination. */
export function allowedTeams(id: string, destination: TeamChoice, routing: TestRouting | null | undefined): TeamChoice[] {
  const routed = routing?.[id];
  if (routed === 'PVT' || routed === 'Chemical') return destination === 'Both' || destination === routed ? [routed] : [];
  return destination === 'Both' ? ['PVT', 'Chemical', 'Both'] : [destination];
}
/** Default team when a test is selected: the Settings classification, otherwise the sample destination. */
export function defaultTeam(id: string, destination: TeamChoice, routing: TestRouting | null | undefined): TeamChoice | undefined {
  const allowed = allowedTeams(id, destination, routing);
  if (!allowed.length) return undefined;
  return allowed.includes(destination) ? destination : allowed[0];
}
