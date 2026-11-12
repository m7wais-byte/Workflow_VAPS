import { useUnsaved } from './settings-pages';
import { useEffect, useState } from 'react';
import type { LabTeams } from './lab-teams';
import { administratorId, explicitPermissions, permissionLabels, responsibilityLabels, responsibilityPermission, invalidResponsibilities, driverOnlyIds, type Authorization, type Permission, type Responsibilities, type Responsibility } from './authorization';
import { teamName } from './team-name';

const roleNotes: Partial<Record<Responsibility, string>> = {
  pvtSupervisor: 'Supervisory overview of PVT work. Test assignment and workbook review stay with the PVT Team Lead.',
  pvtTeamLead: 'Receives PVT work from the approved scope, assigns tests, and approves finished tests (approval completes the test).',
  chemicalTeamLead: 'Receives chemical work from the approved scope, assigns tests, and approves finished tests (approval completes the test).',
  finalApproval: 'Approves and signs the final report.',
};
type Person = { id: string; name: string; role: string; departmentId: string; active: boolean };
/** Who carries each workflow duty. Assigning a duty never grants a permission. */
function ResponsibilitySettings({ roles, employees, policy, onSave, error }: { roles: Responsibilities; employees: Person[]; policy: Authorization; onSave: (roles: Responsibilities) => boolean; error: string }) {
  const [draft, setDraft] = useState(roles);
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(roles);
  const invalid = invalidResponsibilities(draft, employees);
  useUnsaved(changed);
  return <section className="panel authorization-panel" id="responsibilities">
    <div className="panel-heading"><div><span className="eyebrow">WORKFLOW DUTIES</span><h2>Responsibilities</h2><p>Name the employee who carries each duty. A duty does not grant access: the person also needs the listed permission below.</p></div></div>
    {error && <p role="alert">{error}</p>}
    <div className="authorization-table-wrap"><table className="client-table"><thead><tr><th>Responsibility</th><th>Assigned employee</th><th>Status</th></tr></thead><tbody>
      {(Object.keys(responsibilityLabels) as Responsibility[]).map(key => {
        const id = draft[key], person = employees.find(e => e.id === id), permission = responsibilityPermission[key];
        const status = !id ? 'Not assigned · this step is blocked'
          : invalid.includes(key) ? (person ? `Invalid: ${person.name} is inactive · this step is blocked` : `Invalid: employee record “${id}” no longer exists · this step is blocked`)
          : id !== administratorId && !policy[permission].includes(id) ? `Needs “${permissionLabels[permission]}” permission to act` : 'Ready';
        return <tr key={key}><th scope="row">{responsibilityLabels[key]}{roleNotes[key] && <small>{roleNotes[key]}</small>}</th>
          <td><select aria-label={responsibilityLabels[key]} value={id} onChange={event => { setSaved(false); setDraft(old => ({ ...old, [key]: event.target.value })); }}>
            <option value="">Not assigned</option>
            {id && !person && <option value={id}>Missing record ({id})</option>}
            {employees.filter(e => e.active || e.id === id).map(e => <option key={e.id} value={e.id} disabled={!e.active}>{e.name}{e.active ? '' : ' (Inactive)'}</option>)}
          </select></td>
          <td>{status === 'Ready' ? status : <strong role={invalid.includes(key) ? 'alert' : undefined}>{status}</strong>}</td></tr>;
      })}
    </tbody></table></div>
    <footer><button className="text-button" type="button" disabled={!changed} onClick={() => { setDraft(roles); setSaved(false); }}>Cancel changes</button><button type="button" className="primary-button" disabled={!changed} onClick={() => { if (onSave(draft)) setSaved(true); }}>Save Responsibilities</button><span role="status">{saved && !changed ? 'Responsibilities saved.' : changed ? 'Unsaved changes' : ''}</span></footer>
  </section>;
}

/** PVT and Chemistry team members. Team leads assign only within their own team; membership grants no permission. */
function LabTeamSettings({ teams, employees, policy, error, onSave }: { teams: LabTeams; employees: Person[]; policy: Authorization; error: string; onSave: (teams: LabTeams) => boolean }) {
  const [draft, setDraft] = useState(teams);
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(teams);
  useUnsaved(changed);
  return <section className="panel authorization-panel" id="lab-teams">
    <div className="panel-heading"><div><span className="eyebrow">LABORATORY TEAMS</span><h2>PVT and Chemistry teams</h2><p>Team leads assign tests only to active members of their own team who also have “{permissionLabels.analysis}”. Membership does not grant any permission. Existing assignments are kept and flagged if they no longer match.</p></div></div>
    {error && <p role="alert">{error}</p>}
    <div className="lab-team-grid">{(['PVT', 'Chemical'] as const).map(stream => <fieldset key={stream} className="lab-team-list" disabled={!!error}><legend>{teamName(stream)} team · {draft[stream].length} member{draft[stream].length === 1 ? '' : 's'}</legend>
      {employees.filter(e => e.active || draft[stream].includes(e.id)).map(e => { const noAccess = e.id !== administratorId && !policy.analysis.includes(e.id); return <label key={e.id} className="ops-check"><input type="checkbox" checked={draft[stream].includes(e.id)} onChange={event => { setSaved(false); const on = event.target.checked; setDraft(old => ({ ...old, [stream]: on ? [...old[stream], e.id] : old[stream].filter(id => id !== e.id) })); }} /><span>{e.name}{!e.active ? ' (Inactive)' : ''}{draft[stream].includes(e.id) && (noAccess || !e.active) && <strong className="flag-note"> · {e.active ? 'needs laboratory access to be assigned' : 'inactive · cannot be assigned'}</strong>}</span></label>; })}
      {!draft[stream].length && <p className="flag-note">No members yet. {teamName(stream)} tests cannot be assigned until members are added.</p>}
    </fieldset>)}</div>
    <footer><button className="text-button" type="button" disabled={!changed} onClick={() => { setDraft(teams); setSaved(false); }}>Cancel changes</button><button type="button" className="primary-button" disabled={!changed || !!error} onClick={() => { if (onSave(draft)) setSaved(true); }}>Save Laboratory Teams</button><span role="status">{saved && !changed ? 'Laboratory teams saved.' : changed ? 'Unsaved changes' : ''}</span></footer>
  </section>;
}

export function AuthorizationSettings({ policy, employees, onSave, error, departments, roles, rolesError, onSaveRoles, teams, teamsError, onSaveTeams }: {
  policy: Authorization; employees: Person[]; departments: {id:string;name:string}[];
  onSave: (policy: Authorization) => boolean; error: string;
  roles: Responsibilities; rolesError: string; onSaveRoles: (roles: Responsibilities) => boolean;
  teams: LabTeams; teamsError: string; onSaveTeams: (teams: LabTeams) => boolean;
}) {
  const [draft, setDraft] = useState(policy);
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(policy);
  const [search,setSearch]=useState(''),[department,setDepartment]=useState('');
  useUnsaved(changed);
  const drivers = employees.filter(p => driverOnlyIds.includes(p.id));
  // Dashboard links such as #settings/authorization/lab-teams open the exact panel.
  useEffect(() => { const section = location.hash.split('/')[2]; if (section) document.getElementById(section)?.scrollIntoView({ block: 'start' }); }, []);
  return <><ResponsibilitySettings roles={roles} employees={employees} policy={policy} onSave={onSaveRoles} error={rolesError} /><LabTeamSettings teams={teams} employees={employees} policy={policy} error={teamsError} onSave={onSaveTeams} /><p className="authorization-note" id="test-routing"><strong>Test routing</strong> moved to <a href="#settings/tests">Settings → Tests</a>, with the full test catalogue.</p><section className="panel authorization-panel">
    <div className="panel-heading"><div><span className="eyebrow">ADMINISTRATOR</span><h2>Authorization</h2><p>Select who can create jobs and access each part of the project.</p></div></div>
    <p>Managed by Mohammed Al Awaisi. Administrator access is retained for all pages. Creating jobs is assigned separately.</p>
    <div className="settings-filters"><label>Search employees<input value={search} onChange={e=>setSearch(e.target.value)} /></label><label>Department<select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div><p>Access permissions open the named workspace. Management permissions allow saving that category. Existing workflow ownership rules still apply. Inactive employees retain their assignments but cannot use their permissions.</p><div className="authorization-table-wrap"><table className="client-table"><thead><tr><th>Person</th>{Object.values(permissionLabels).map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{employees.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()) && (!department||p.departmentId===department)).map(person => <tr key={person.id}><th scope="row">{person.name}{!person.active && " (Inactive)"}<small>{person.id === administratorId ? 'Project administrator' : person.role}</small></th>{(Object.keys(permissionLabels) as Permission[]).map(permission => {
        const fixed = person.id === administratorId && !explicitPermissions.includes(permission);
        return <td key={permission}><input type="checkbox" aria-label={`${person.name}: ${permissionLabels[permission]}`} checked={fixed || draft[permission].includes(person.id)} disabled={fixed || !!error || !person.active} onChange={event => {
          const checked = event.target.checked;
          setSaved(false);
          setDraft(old => ({ ...old, [permission]: checked ? [...old[permission], person.id] : old[permission].filter(id => id !== person.id) }));
        }} /></td>;
      })}</tr>)}</tbody></table></div>
    {error && <p role="alert">{error}</p>}
    <footer><button className="text-button" type="button" disabled={!changed} onClick={() => { setDraft(policy); setSaved(false); }}>Cancel changes</button><button type="button" className="primary-button" disabled={!changed || !!error} onClick={() => { if (onSave(draft)) setSaved(true); }}>Save Changes</button><span role="status">{saved && !changed ? 'Authorization saved.' : changed ? 'Unsaved changes' : ''}</span></footer>
    {drivers.length > 0 && <p className="authorization-note"><strong>Driver access:</strong> there is no shared Driver permission profile; permissions are set per employee. {drivers.map(d => d.name).join(', ')} received only “{permissionLabels.jobDetails}”.</p>}
    <p className="authorization-note">Local demo: permissions apply to employee profiles in this browser. They do not secure shared data or synchronize to other devices.</p>
  </section></>;
}
