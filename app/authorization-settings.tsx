import { useUnsaved } from './settings-pages';
import { useState } from 'react';
import { scopeTestGroups } from './lab-work';
import { testSections, type TestRouting, type TestSection } from './test-routing';
import { administratorId, permissionLabels, responsibilityLabels, responsibilityPermission, invalidResponsibilities, driverOnlyIds, type Authorization, type Permission, type Responsibilities, type Responsibility } from './authorization';

const roleNotes: Partial<Record<Responsibility, string>> = {
  pvtSupervisor: 'Supervisory overview of PVT work. Test assignment and workbook review stay with the PVT Team Lead.',
  pvtTeamLead: 'Receives PVT work from the approved scope, assigns tests, reviews workbooks.',
  chemicalTeamLead: 'Receives chemical work from the approved scope, assigns tests, reviews workbooks.',
  finalApproval: 'Approves and signs the final report.',
  qcReviewer: 'QC approval is separate from team-lead workbook approval and final approval.',
};
type Person = { id: string; name: string; role: string; departmentId: string; active: boolean };
/** Who carries each workflow duty. Assigning a duty never grants a permission. */
function ResponsibilitySettings({ roles, employees, policy, onSave, error }: { roles: Responsibilities; employees: Person[]; policy: Authorization; onSave: (roles: Responsibilities) => boolean; error: string }) {
  const [draft, setDraft] = useState(roles);
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(roles);
  const invalid = invalidResponsibilities(draft, employees);
  useUnsaved(changed);
  return <section className="panel authorization-panel">
    <div className="panel-heading"><div><span className="eyebrow">WORKFLOW DUTIES</span><h2>Responsibilities</h2><p>Name the employee who carries each duty. A duty does not grant access: the person also needs the listed permission below.</p></div></div>
    {error && <p role="alert">{error}</p>}
    <div className="authorization-table-wrap"><table className="client-table"><thead><tr><th>Responsibility</th><th>Assigned employee</th><th>Status</th></tr></thead><tbody>
      {(Object.keys(responsibilityLabels) as Responsibility[]).map(key => {
        const id = draft[key], person = employees.find(e => e.id === id), permission = responsibilityPermission[key];
        const status = !id ? (key === 'qcReviewer' ? 'QC reviewer not configured' : 'Not assigned · this step is blocked')
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

/** Which laboratory section receives each catalog test. Unclassified tests get an explicit destination per sample at scope release. */
function TestRoutingSettings({ routing, error, onSave }: { routing: TestRouting; error: string; onSave: (routing: TestRouting) => boolean }) {
  const [draft, setDraft] = useState(routing);
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(routing);
  useUnsaved(changed);
  const unclassified = scopeTestGroups.flatMap(g => g.tests.map(t => g.name + ' — ' + t)).filter(test => !draft[test]).length;
  return <section className="panel authorization-panel">
    <div className="panel-heading"><div><span className="eyebrow">LABORATORY SCOPE</span><h2>Laboratory test routing</h2><p>Choose the section that performs each catalog test. Classified tests appear in that section’s checklist. Unclassified tests need an explicit destination from the scope selector for each sample. Released scopes keep the routing in force when they were released.</p></div></div>
    {error && <p role="alert">{error}</p>}
    <p role="status">{unclassified ? `${unclassified} test${unclassified === 1 ? '' : 's'} unclassified` : 'All catalog tests are classified.'}</p>
    <div className="authorization-table-wrap"><table className="client-table"><thead><tr><th>Test</th><th>Section</th></tr></thead><tbody>
      {scopeTestGroups.flatMap(group => group.tests.map(label => { const test = group.name + ' — ' + label; return <tr key={test}><th scope="row">{label}<small>{group.name}</small></th><td><select aria-label={'Section for ' + test} value={draft[test] || ''} disabled={!!error} onChange={event => { setSaved(false); const value = event.target.value as TestSection | ''; setDraft(old => { const next = { ...old }; if (value) next[test] = value; else delete next[test]; return next; }); }}><option value="">Unclassified</option>{testSections.map(section => <option key={section} value={section}>{section === 'Both' ? 'PVT and Chemical' : section}</option>)}</select></td></tr>; }))}
    </tbody></table></div>
    <footer><button className="text-button" type="button" disabled={!changed} onClick={() => { setDraft(routing); setSaved(false); }}>Cancel changes</button><button type="button" className="primary-button" disabled={!changed || !!error} onClick={() => { if (onSave(draft)) setSaved(true); }}>Save Test Routing</button><span role="status">{saved && !changed ? 'Test routing saved.' : changed ? 'Unsaved changes' : ''}</span></footer>
  </section>;
}

export function AuthorizationSettings({ policy, employees, onSave, error, departments, roles, rolesError, onSaveRoles, routing, routingError, onSaveRouting }: {
  policy: Authorization; employees: Person[]; departments: {id:string;name:string}[];
  onSave: (policy: Authorization) => boolean; error: string;
  roles: Responsibilities; rolesError: string; onSaveRoles: (roles: Responsibilities) => boolean;
  routing: TestRouting; routingError: string; onSaveRouting: (routing: TestRouting) => boolean;
}) {
  const [draft, setDraft] = useState(policy);
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(policy);
  const [search,setSearch]=useState(''),[department,setDepartment]=useState('');
  useUnsaved(changed);
  const drivers = employees.filter(p => driverOnlyIds.includes(p.id));
  return <><ResponsibilitySettings roles={roles} employees={employees} policy={policy} onSave={onSaveRoles} error={rolesError} /><TestRoutingSettings routing={routing} error={routingError} onSave={onSaveRouting} /><section className="panel authorization-panel">
    <div className="panel-heading"><div><span className="eyebrow">ADMINISTRATOR</span><h2>Authorization</h2><p>Select who can create jobs and access each part of the project.</p></div></div>
    <p>Managed by Mohammed Al Awaisi. Administrator access is retained for all pages. Creating jobs is assigned separately.</p>
    <div className="settings-filters"><label>Search employees<input value={search} onChange={e=>setSearch(e.target.value)} /></label><label>Department<select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div><p>Access permissions open the named workspace. Management permissions allow saving that category. Existing workflow ownership rules still apply. Inactive employees retain their assignments but cannot use their permissions.</p><div className="authorization-table-wrap"><table className="client-table"><thead><tr><th>Person</th>{Object.values(permissionLabels).map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{employees.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()) && (!department||p.departmentId===department)).map(person => <tr key={person.id}><th scope="row">{person.name}{!person.active && " (Inactive)"}<small>{person.id === administratorId ? 'Project administrator' : person.role}</small></th>{(Object.keys(permissionLabels) as Permission[]).map(permission => {
        const fixed = person.id === administratorId && permission !== 'createJob';
        return <td key={permission}><input type="checkbox" aria-label={`${person.name}: ${permissionLabels[permission]}`} checked={fixed || draft[permission].includes(person.id)} disabled={fixed || !!error || !person.active} onChange={event => {
          const checked = event.target.checked;
          setSaved(false);
          setDraft(old => ({ ...old, [permission]: checked ? [...old[permission], person.id] : old[permission].filter(id => id !== person.id) }));
        }} /></td>;
      })}</tr>)}</tbody></table></div>
    {error && <p role="alert">{error}</p>}
    <footer><button className="text-button" type="button" disabled={!changed} onClick={() => { setDraft(policy); setSaved(false); }}>Cancel changes</button><button type="button" className="primary-button" disabled={!changed || !!error} onClick={() => { if (onSave(draft)) setSaved(true); }}>Save Changes</button><span role="status">{saved && !changed ? 'Authorization saved.' : changed ? 'Unsaved changes' : ''}</span></footer>
    {drivers.length > 0 && <p className="authorization-note"><strong>Driver access:</strong> there is no shared Driver permission profile; permissions are set per employee. {drivers.map(d => d.name).join(', ')} received only “{permissionLabels.jobDetails}”. Sample transport and handover are allowed by the job’s driver assignment, not by sampling access.</p>}
    <p className="authorization-note">Local demo: permissions apply to employee profiles in this browser. They do not secure shared data or synchronize to other devices.</p>
  </section></>;
}
