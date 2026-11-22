/**
 * Shared settings in D1 and the server-side Actor.
 *
 * Each setting keeps its existing browser key and is validated with the same reader the browser uses, so stored
 * values stay interchangeable with today's records. The labelled demo setup (`vaps-demo-setup-v1`) is never read
 * here: on the server, duties, teams and routing always come from the saved Settings.
 */
import { authorizationKey, readAuthorization, readResponsibilities, responsibilitiesKey, unassignedResponsibilities, type Permission } from '../app/authorization';
import { directoryKey, validateDirectory, type Directory } from '../app/employee-directory';
import { labTeamsKey, readLabTeams } from '../app/lab-teams';
import { catalogueIds, readCustomTests, testCatalogueKey } from '../app/test-catalogue';
import { effectiveRouting, readSavedRouting, testRoutingKey } from '../app/test-routing';
import { hasAccess, type Actor } from '../app/operations-model';
import { auditAfterChange, StoreError, type D1Like } from './d1';

export const serverSettingKeys = [directoryKey, authorizationKey, responsibilitiesKey, labTeamsKey, testCatalogueKey, testRoutingKey] as const;
export type SettingKey = typeof serverSettingKeys[number];
type Stored = Partial<Record<SettingKey, { value: string; revision: number }>>;

/** Who may change each setting: the same permission the Settings screens check today. */
export const settingPermission: Record<SettingKey, Permission> = {
  [directoryKey]: 'employees', [authorizationKey]: 'authorization', [responsibilitiesKey]: 'authorization',
  [labTeamsKey]: 'authorization', [testCatalogueKey]: 'tests', [testRoutingKey]: 'tests',
};

export async function loadSettings(db: D1Like): Promise<Stored> {
  const { results } = await db.prepare("SELECT key, value, revision FROM settings").all<{ key: string; value: string; revision: number }>();
  return Object.fromEntries(results.filter(r => (serverSettingKeys as readonly string[]).includes(r.key)).map(r => [r.key, { value: r.value, revision: r.revision }])) as Stored;
}

/** Parses and checks a stored directory. Passwords are never part of the server copy. */
function readDirectory(raw: string): Directory {
  const value = JSON.parse(raw) as Directory;
  if (!value || !Array.isArray(value.employees) || !Array.isArray(value.departments) || !Array.isArray(value.positions)) throw Error('Invalid employee directory');
  validateDirectory(value);
  return { ...value, employees: value.employees.map(e => ({ ...e, password: '' })) };
}

/** The validated, normalised JSON to store for `key`, or a 400 refusal with the validator's reason. */
function normalise(key: SettingKey, value: unknown, stored: Stored): string {
  const raw = JSON.stringify(value);
  const directory = key === directoryKey ? null : stored[directoryKey] ? readDirectory(stored[directoryKey]!.value) : null;
  const ids = () => { if (!directory) throw Error('Set up the employee directory first.'); return directory.employees.map(e => e.id); };
  try {
    switch (key) {
      case directoryKey: {
        const next = readDirectory(raw);
        // Internal employee IDs are referenced by jobs, permissions and history: they can be deactivated, never removed.
        const before = stored[directoryKey] ? readDirectory(stored[directoryKey]!.value) : null;
        const missing = before?.employees.filter(e => !next.employees.some(n => n.id === e.id)) || [];
        if (missing.length) throw Error(`Employees cannot be removed, only deactivated (${missing.map(e => e.id).join(', ')}).`);
        return JSON.stringify(next);
      }
      case authorizationKey: return JSON.stringify(readAuthorization(raw, ids()));
      case responsibilitiesKey: return JSON.stringify(readResponsibilities(raw));
      case labTeamsKey: return JSON.stringify(readLabTeams(raw, ids()));
      case testCatalogueKey: return JSON.stringify({ tests: readCustomTests(raw).map(({ id, name, group, section }) => ({ id, name, group, section })) });
      case testRoutingKey: {
        const custom = stored[testCatalogueKey] ? readCustomTests(stored[testCatalogueKey]!.value) : [];
        return JSON.stringify(readSavedRouting(raw, catalogueIds(custom)));
      }
    }
  } catch (error) { throw new StoreError(error instanceof Error ? error.message : 'Invalid setting.', 400); }
}

/**
 * The acting employee, built only from server-stored settings. Unreadable settings block in the same way as the
 * browser: no permissions at all for unreadable authorization, every duty empty for unreadable responsibilities,
 * and no assignment or scope release for unreadable teams or routing.
 */
export async function buildActor(db: D1Like, employeeId: string, stored?: Stored): Promise<Actor> {
  const s = stored || await loadSettings(db);
  if (!s[directoryKey]) throw new StoreError('The employee directory is not set up on the server yet.', 503);
  let directory: Directory;
  try { directory = readDirectory(s[directoryKey]!.value); } catch { throw new StoreError('The saved employee directory cannot be read. Nothing was changed.', 503); }
  const employees = directory.employees, ids = employees.map(e => e.id);
  if (!employees.some(e => e.id === employeeId && e.active)) throw new StoreError('This employee profile is not active.', 403);
  let policy;
  try { policy = readAuthorization(s[authorizationKey]?.value ?? null, ids); } catch { throw new StoreError('Saved authorization cannot be read. Access is disabled until it is restored.', 503); }
  let roles; try { roles = readResponsibilities(s[responsibilitiesKey]?.value ?? null); } catch { roles = { ...unassignedResponsibilities }; }
  let teams; try { teams = readLabTeams(s[labTeamsKey]?.value ?? null, ids); } catch { teams = null; }
  let routing = null, catalogue: string[] | undefined;
  try {
    const custom = readCustomTests(s[testCatalogueKey]?.value ?? null);
    catalogue = catalogueIds(custom);
    routing = effectiveRouting(readSavedRouting(s[testRoutingKey]?.value ?? null, catalogue));
  } catch { routing = null; }
  return { id: employeeId, employees, policy, roles, teams, routing, catalogue };
}

/**
 * Saves one setting if `expectedRevision` is the stored revision (0 for a setting not stored yet). The permission is
 * checked against settings read now, and the audit entry records the value before and after.
 */
export async function putSetting(db: D1Like, key: SettingKey, value: unknown, expectedRevision: number, actorId: string, now = new Date().toISOString()): Promise<{ revision: number }> {
  if (!(serverSettingKeys as readonly string[]).includes(key)) throw new StoreError('Unknown setting.', 404);
  const stored = await loadSettings(db);
  // The very first directory has no actor to check yet; it is written only by the administrator import (later step).
  const actor = await buildActor(db, actorId, stored);
  if (!hasAccess(actor, settingPermission[key])) throw new StoreError('You do not have permission to change this setting.', 403);
  const current = stored[key];
  if ((current?.revision ?? 0) !== expectedRevision) throw new StoreError('This setting was changed by someone else. Reload it before saving; nothing was changed.', 409);
  const next = normalise(key, value, stored);
  const revision = expectedRevision + 1;
  const write = expectedRevision === 0
    ? db.prepare("INSERT INTO settings (key, value, revision, updated_by, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(key) DO NOTHING").bind(key, next, actorId, now)
    : db.prepare("UPDATE settings SET value = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE key = ? AND revision = ?").bind(next, actorId, now, key, expectedRevision);
  const detail = JSON.stringify({ fromRevision: expectedRevision, toRevision: revision, before: current ? JSON.parse(current.value) : null, after: JSON.parse(next) });
  const [result] = await db.batch([write, db.prepare(auditAfterChange).bind(now, actorId, 'setting-saved', 'setting', key, detail)]);
  if (result.meta.changes !== 1) throw new StoreError('This setting was changed by someone else. Reload it before saving; nothing was changed.', 409);
  return { revision };
}
