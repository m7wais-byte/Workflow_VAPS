import { activeDemoSetup } from './demo-setup';
import { catalogueIds, defaultRouting } from './test-catalogue';
/**
 * Default team for each catalogue test, maintained in Settings → Tests. A test routed Unassigned (or with no entry)
 * has no default: the scope owner chooses its team per sample. Released scopes keep the routing they were released with.
 */
export type TestSection = 'PVT' | 'Chemical' | 'Both';
/** Effective routing: only routed tests have an entry. */
export type TestRouting = Record<string, TestSection>;
/** Saved form: every test the administrator decided, including an explicit Unassigned. */
export type SavedRouting = Record<string, TestSection | 'Unassigned'>;
export const testRoutingKey = 'vaps-test-routing-v1';
export const testSections: TestSection[] = ['PVT', 'Chemical', 'Both'];
export const routingChoices = ['Chemical', 'PVT', 'Both', 'Unassigned'] as const;
export type RoutingChoice = typeof routingChoices[number];
/** The saved decisions, validated against the catalogue. Tests never saved keep their catalogue default. */
export function readSavedRouting(raw: string | null, ids: string[] = catalogueIds()): SavedRouting {
  if (raw === null) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid test routing settings');
  for (const [test, section] of Object.entries(value)) if (!ids.includes(test) || !(routingChoices as readonly string[]).includes(section as string)) throw Error('Invalid test routing settings');
  return value as SavedRouting;
}
/** Catalogue defaults, overridden by saved decisions; Unassigned entries are dropped. */
export function effectiveRouting(saved: SavedRouting): TestRouting {
  const merged: SavedRouting = { ...defaultRouting(), ...saved };
  return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== 'Unassigned')) as TestRouting;
}
export function readTestRouting(raw: string | null, ids?: string[]): TestRouting {
  return effectiveRouting(readSavedRouting(raw, ids));
}
/** Saved routing, or null when it cannot be read (scope release is then blocked rather than guessed). */
export function storedTestRouting(): TestRouting | null {
  if (typeof window === 'undefined' || !window.localStorage) return effectiveRouting({});
  const demo = activeDemoSetup();
  try { const saved = readTestRouting(window.localStorage.getItem(testRoutingKey)); return demo ? { ...saved, ...demo.routing } : saved; } catch { return null; }
}
export const routingChoice = (routing: TestRouting, id: string): RoutingChoice => routing[id] || 'Unassigned';
export const testsFor = (stream: 'PVT' | 'Chemical', routing: TestRouting) => catalogueIds().filter(test => routing[test] === stream || routing[test] === 'Both');
export const unclassifiedTests = (routing: TestRouting) => catalogueIds().filter(test => !routing[test]);
