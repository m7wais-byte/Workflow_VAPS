import { scopeTestOptions } from './lab-work';
/**
 * Which laboratory section(s) each catalog test belongs to. Maintained in Settings → Authorization.
 * A test without a saved entry is Unclassified: the scope selector chooses its destination per sample.
 */
export type TestSection = 'PVT' | 'Chemical' | 'Both';
export type TestRouting = Record<string, TestSection>;
export const testRoutingKey = 'vaps-test-routing-v1';
export const testSections: TestSection[] = ['PVT', 'Chemical', 'Both'];
/** No assumed classification: every existing test starts Unclassified. */
export function readTestRouting(raw: string | null): TestRouting {
  if (raw === null) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid test routing settings');
  for (const [test, section] of Object.entries(value)) if (!scopeTestOptions.includes(test) || !testSections.includes(section as TestSection)) throw Error('Invalid test routing settings');
  return value as TestRouting;
}
/** Saved routing, or null when it cannot be read (scope release is then blocked rather than guessed). */
export function storedTestRouting(): TestRouting | null {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try { return readTestRouting(window.localStorage.getItem(testRoutingKey)); } catch { return null; }
}
export const testsFor = (stream: 'PVT' | 'Chemical', routing: TestRouting) => scopeTestOptions.filter(test => routing[test] === stream || routing[test] === 'Both');
export const unclassifiedTests = (routing: TestRouting) => scopeTestOptions.filter(test => !routing[test]);
