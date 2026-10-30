export const authorizationKey = 'vaps-authorization-v1';
export const administratorId = 'MA001';
export const permissionLabels = {
  createJob: 'Create new jobs',
  jobDetails: 'Access job details',
  sampling: 'Access sampling and reports',
  analysis: 'Access PVT analysis',
  inventory: 'Access bottle inventory',
  companyOverview: 'View company overview & activity',
  deleteJobs: 'Delete and restore jobs',
  settings: 'Manage clients',
  company: 'Manage company',
  employees: 'Manage employees & options',
  authorization: 'Manage authorization',
};
export type Permission = keyof typeof permissionLabels;
export type Authorization = Record<Permission, string[]>;
/** Follow the saved setting for every employee: the administrator's automatic access does not cover them. */
export const explicitPermissions: Permission[] = ['createJob', 'deleteJobs'];
/**
 * There is no shared Driver permission profile; permissions are per employee. Drivers added later
 * receive only job details, and driver actions are authorized by the job's driver assignment.
 */
export const driverOnlyAccess: Permission[] = ['jobDetails'];
export const driverOnlyIds = ['HUMAID'];
/** Company-wide overview (all jobs, pipeline, activity): administrator, coordinator and PVT supervisor by default. */
export const companyOverviewDefault = [administratorId, 'SALIM', 'WILFRED'];
export function defaultAuthorization(ids: string[]): Authorization {
  const broad = ids.filter(id => !driverOnlyIds.includes(id));
  return { createJob: ['SALIM'], jobDetails: [...ids], sampling: [...broad], analysis: [...broad], inventory: [...broad], companyOverview: companyOverviewDefault.filter(id => ids.includes(id)), deleteJobs: [administratorId], settings: [administratorId], company: [administratorId], employees: [administratorId], authorization: [administratorId] };
}
export function readAuthorization(raw: string | null, ids: string[]): Authorization {
  if (raw === null) return defaultAuthorization(ids);
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw Error('Invalid authorization settings');
  for (const key of ['company','employees','authorization']) { if (value[key] === undefined) value[key] = [administratorId]; }
  // Added later: defaults apply only when the setting was never saved. A saved empty selection stays empty.
  if (value.companyOverview === undefined) value.companyOverview = companyOverviewDefault.filter(id => ids.includes(id));
  if (value.deleteJobs === undefined) value.deleteJobs = [administratorId];
  for (const key of Object.keys(permissionLabels) as Permission[]) {
    if (!Array.isArray(value[key]) || value[key].some((id: unknown) => typeof id !== 'string' || !ids.includes(id))) throw Error('Invalid authorization settings');
  }
  return Object.fromEntries(Object.keys(permissionLabels).map(key => [key, [...new Set(value[key])]])) as Authorization;
}
export function allowed(policy: Authorization, id: string | undefined, permission: Permission): boolean {
  // The administrator retains access to the project; job creation and deletion are explicitly assigned.
  return !!id && ((id === administratorId && !explicitPermissions.includes(permission)) || policy[permission].includes(id));
}

/** Workflow duties, assigned to employee IDs. A duty never grants a permission; both must pass. */
export const responsibilityLabels = {
  scopeSelector: 'Scope selection',
  samplingApproval: 'Sampling approval',
  pvtSupervisor: 'PVT Supervisor',
  pvtTeamLead: 'PVT Team Lead',
  chemicalTeamLead: 'Chemical Team Lead',
  reporting: 'Final report preparation',
  finalApproval: 'Final report approval',
  qcReviewer: 'QC review',
  labReceipt: 'Laboratory receipt',
};
export type Responsibility = keyof typeof responsibilityLabels;
export type Responsibilities = Record<Responsibility, string>;
/** Permission each duty needs in order to act; shown as a warning, never granted automatically. */
export const responsibilityPermission: Record<Responsibility, Permission> = { scopeSelector: 'analysis', samplingApproval: 'sampling', pvtSupervisor: 'analysis', pvtTeamLead: 'analysis', chemicalTeamLead: 'analysis', reporting: 'analysis', finalApproval: 'analysis', qcReviewer: 'analysis', labReceipt: 'analysis' };
export const responsibilitiesKey = 'vaps-responsibilities-v1';
/** Initial setup and migration only. QC review and laboratory receipt stay unassigned until an administrator names someone. */
export const defaultResponsibilities: Responsibilities = { scopeSelector: 'SALIM', samplingApproval: 'SALIM', pvtSupervisor: 'WILFRED', pvtTeamLead: 'SHEREIQI', chemicalTeamLead: 'BAHRI', reporting: 'SHEREIQI', finalApproval: 'WILFRED', qcReviewer: '', labReceipt: '' };
/** Missing settings or keys added later receive defaults; a saved empty value stays empty. */
export function readResponsibilities(raw: string | null): Responsibilities {
  if (raw === null) return { ...defaultResponsibilities };
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid responsibility settings');
  return Object.fromEntries((Object.keys(responsibilityLabels) as Responsibility[]).map(key => {
    if (value[key] === undefined) return [key, defaultResponsibilities[key]];
    if (typeof value[key] !== 'string') throw Error('Invalid responsibility settings');
    return [key, value[key]];
  })) as Responsibilities;
}
/** Duties assigned to an employee record that is missing or inactive. */
export function invalidResponsibilities(roles: Responsibilities, employees: { id: string; active: boolean }[]): Responsibility[] {
  return (Object.keys(responsibilityLabels) as Responsibility[]).filter(key => roles[key] && !employees.some(e => e.id === roles[key] && e.active));
}
/** The valid holder of a duty, or '' when it is unassigned or points to a missing/inactive record. */
export function roleHolder(roles: Responsibilities, key: Responsibility, employees: { id: string; active: boolean }[]): string {
  return invalidResponsibilities(roles, employees).includes(key) ? '' : roles[key];
}
/** Used when saved responsibilities cannot be read: every duty is blocked rather than defaulted. */
export const unassignedResponsibilities = Object.fromEntries(Object.keys(responsibilityLabels).map(key => [key, ''])) as Responsibilities;
export const driverMigrationKey = 'vaps-migration-driver-access-v1';
/** One-time: a driver added by migration gets job details only. Later administrator edits are never re-applied. */
export function migrateDriverAccess(policy: Authorization, ids: string[]): Authorization {
  const added = driverOnlyIds.filter(id => ids.includes(id) && !(Object.keys(permissionLabels) as Permission[]).some(key => policy[key].includes(id)));
  if (!added.length) return policy;
  return { ...policy, ...Object.fromEntries(driverOnlyAccess.map(key => [key, [...policy[key], ...added]])) };
}
/** Saved duties for views without an actor. Unreadable settings block every duty instead of restoring defaults. */
export function storedResponsibilities(): Responsibilities {
  if (typeof window === 'undefined' || !window.localStorage) return { ...defaultResponsibilities };
  try { return readResponsibilities(window.localStorage.getItem(responsibilitiesKey)); } catch { return { ...unassignedResponsibilities }; }
}
