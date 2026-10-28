export const authorizationKey = 'vaps-authorization-v1';
export const administratorId = 'MA001';
export const permissionLabels = {
  createJob: 'Create new jobs',
  jobDetails: 'Access job details',
  sampling: 'Access sampling and reports',
  analysis: 'Access PVT analysis',
  inventory: 'Access bottle inventory',
  settings: 'Manage clients',
  company: 'Manage company',
  employees: 'Manage employees & options',
  authorization: 'Manage authorization',
};
export type Permission = keyof typeof permissionLabels;
export type Authorization = Record<Permission, string[]>;
export function defaultAuthorization(ids: string[]): Authorization {
  return { createJob: ['SALIM'], jobDetails: [...ids], sampling: [...ids], analysis: [...ids], inventory: [...ids], settings: [administratorId], company: [administratorId], employees: [administratorId], authorization: [administratorId] };
}
export function readAuthorization(raw: string | null, ids: string[]): Authorization {
  if (raw === null) return defaultAuthorization(ids);
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw Error('Invalid authorization settings');
  for (const key of ['company','employees','authorization']) { if (value[key] === undefined) value[key] = [administratorId]; }
  for (const key of Object.keys(permissionLabels) as Permission[]) {
    if (!Array.isArray(value[key]) || value[key].some((id: unknown) => typeof id !== 'string' || !ids.includes(id))) throw Error('Invalid authorization settings');
  }
  return Object.fromEntries(Object.keys(permissionLabels).map(key => [key, [...new Set(value[key])]])) as Authorization;
}
export function allowed(policy: Authorization, id: string | undefined, permission: Permission): boolean {
  // The administrator retains access to the project, but job creation is explicitly assigned.
  return !!id && ((id === administratorId && permission !== 'createJob') || policy[permission].includes(id));
}
