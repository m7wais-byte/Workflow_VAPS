import { useUnsaved } from './settings-pages';
import { useState } from 'react';
import { administratorId, permissionLabels, type Authorization, type Permission } from './authorization';

export function AuthorizationSettings({ policy, employees, onSave, error, departments }: {
  policy: Authorization; employees: { id: string; name: string; role: string; departmentId: string; active: boolean }[]; departments: {id:string;name:string}[];
  onSave: (policy: Authorization) => boolean; error: string;
}) {
  const [draft, setDraft] = useState(policy);
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(policy);
  const [search,setSearch]=useState(''),[department,setDepartment]=useState('');
  useUnsaved(changed);
  return <section className="panel authorization-panel">
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
    <p className="authorization-note">Local demo: permissions apply to employee profiles in this browser. They do not secure shared data or synchronize to other devices.</p>
  </section>;
}
