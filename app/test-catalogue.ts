import { scopeTestGroups, isValidationTest } from './lab-work';

/**
 * The laboratory test catalogue: the built-in tests (IDs such as "Black Oil — DL" are the stored identity of every
 * selection and never change) plus tests an administrator adds in Settings → Tests. Added tests are stored under
 * their own key and follow the same "Group — Name" ID format, so saved jobs and scopes stay compatible.
 */
export type CatalogueSection = 'Fluid tests' | 'General analysis' | 'Specialised analysis' | 'Other tests';
export const catalogueSections: CatalogueSection[] = ['Fluid tests', 'General analysis', 'Specialised analysis', 'Other tests'];
/** Fluid tests belong to one fluid method; the group name is part of the test ID. */
export type FluidGroup = 'Black Oil' | 'Gas Condensates (GC)';
export const fluidGroups: FluidGroup[] = ['Black Oil', 'Gas Condensates (GC)'];
export type CatalogueTest = { id: string; name: string; group: string; section: CatalogueSection; builtIn: boolean };
export const testCatalogueKey = 'vaps-test-catalogue-v1';

const sectionGroup: Record<Exclude<CatalogueSection, 'Fluid tests'>, string> = { 'General analysis': 'Others', 'Specialised analysis': 'Specialised Analysis', 'Other tests': 'Other Tests' };
/** EOR stays a catalogue test (same ID) but is offered under Other tests, where the scope owner assigns the team. */
const otherTestIds = ['Specialised Analysis — EOR'];
const sectionOf = (group: string, id: string): CatalogueSection =>
  otherTestIds.includes(id) ? 'Other tests' : (fluidGroups as string[]).includes(group) ? 'Fluid tests' : group === 'Others' ? 'General analysis' : group === 'Other Tests' ? 'Other tests' : 'Specialised analysis';

export const builtInTests: CatalogueTest[] = scopeTestGroups.flatMap((g) => g.tests.map((name) => {
  const id = `${g.name} — ${name}`;
  return { id, name, group: g.name, section: sectionOf(g.name, id), builtIn: true };
}));

/**
 * Default routing applied when a test has no saved setting. Existing PVT fluid tests stay PVT; the existing Chemical
 * tests, SARA and the Sulphur tests go to Chemical; EOR has no default (Unassigned) and is routed per sample.
 */
export const chemicalDefaults = ['Others — Water Analysis', 'Others — Compositional Analysis', 'Specialised Analysis — SARA', 'Specialised Analysis — Pour Point', 'Specialised Analysis — Wax Content', 'Specialised Analysis — Asphaltene Content', 'Specialised Analysis — WAT', 'Specialised Analysis — Sulphur Content', 'Specialised Analysis — Sulphur Asphaltene'];
export const defaultRouting = (): Record<string, 'PVT' | 'Chemical'> => Object.fromEntries([
  ...builtInTests.filter((t) => t.section === 'Fluid tests').map((t) => [t.id, 'PVT'] as const),
  ...chemicalDefaults.map((id) => [id, 'Chemical'] as const),
]);

type StoredTest = { id: string; name: string; group: string; section: CatalogueSection };
/** Added tests from storage. Unreadable data is reported, never silently replaced. */
export function readCustomTests(raw: string | null): CatalogueTest[] {
  if (raw === null) return [];
  const value = JSON.parse(raw);
  const list = value?.tests;
  if (!Array.isArray(list)) throw Error('Invalid test catalogue settings');
  const ids = new Set(builtInTests.map((t) => t.id.toLowerCase()));
  return list.map((t: StoredTest) => {
    if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || typeof t.group !== 'string' || !catalogueSections.includes(t.section) || t.id !== `${t.group} — ${t.name}` || ids.has(t.id.toLowerCase())) throw Error('Invalid test catalogue settings');
    ids.add(t.id.toLowerCase());
    return { id: t.id, name: t.name, group: t.group, section: t.section, builtIn: false };
  });
}
export function storedCustomTests(): CatalogueTest[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try { return readCustomTests(window.localStorage.getItem(testCatalogueKey)); } catch { return []; }
}
/** Every catalogue test, built-in first, in section order. */
export function catalogueTests(custom: CatalogueTest[] = storedCustomTests()): CatalogueTest[] {
  return [...builtInTests, ...custom];
}
export const catalogueIds = (custom?: CatalogueTest[]) => catalogueTests(custom).map((t) => t.id);
export const catalogueTest = (id: string, custom?: CatalogueTest[]) => catalogueTests(custom).find((t) => t.id === id);

/** A new test for Settings → Tests. Returns the record or throws a plain-language reason. */
export function newCatalogueTest(name: string, section: CatalogueSection, fluid: FluidGroup | undefined, existing: CatalogueTest[]): CatalogueTest {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw Error('Enter the test name.');
  if (clean.length > 60) throw Error('Keep the test name to 60 characters or fewer.');
  if (clean.includes('—')) throw Error('The test name cannot contain “—”.');
  if (isValidationTest(clean)) throw Error('Validation is requested per sample, not added as a test.');
  if (section === 'Fluid tests' && !fluid) throw Error('Choose the fluid method for a fluid test.');
  const group = section === 'Fluid tests' ? fluid! : sectionGroup[section];
  const id = `${group} — ${clean}`;
  if (existing.some((t) => t.id.toLowerCase() === id.toLowerCase() || (t.section === section && t.name.toLowerCase() === clean.toLowerCase() && (section !== 'Fluid tests' || t.group === group)))) throw Error(`“${clean}” is already in the catalogue.`);
  return { id, name: clean, group, section, builtIn: false };
}
