'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { addEquipment, updateEquipment, equipmentKey, readEquipment, textOn, type LabEquipment } from './lab-equipment';

function load(): { list: LabEquipment[]; error: string } {
  try { return { list: readEquipment(window.localStorage.getItem(equipmentKey)), error: '' }; }
  catch { return { list: readEquipment(null), error: 'The saved equipment list could not be read. Saved data has been preserved; the built-in list is shown and cannot be changed until it is repaired.' }; }
}

/**
 * Settings → Laboratory equipment: the PVT equipment the PVT Team Lead assigns to tests, with the colour shown on the
 * weekly plan. Each change is saved at once. Equipment is deactivated, never deleted, so tests already using it keep
 * their name and colour.
 */
export function EquipmentSettings() {
  const [state, setState] = useState(load), [name, setName] = useState(''), [color, setColor] = useState('#0b887e'), [message, setMessage] = useState(''), [problem, setProblem] = useState('');
  const { list, error } = state;
  const save = (next: () => LabEquipment[], done: string) => {
    try { const value = next(); window.localStorage.setItem(equipmentKey, JSON.stringify(value)); setState({ list: value, error: '' }); setMessage(done); setProblem(''); return true; }
    catch (e) { setProblem((e as Error).message || 'The list could not be saved.'); setMessage(''); return false; }
  };
  return <section className="panel settings-panel equip-settings">
    <div className="panel-heading"><div><h2>PVT equipment <span className="scope-chip">{list.filter((q) => q.active).length}</span></h2><p>Offered to the PVT Team Lead when assigning a test. The colour is the bar colour on the Dashboard weekly plan.</p></div></div>
    {error && <p role="alert">{error}</p>}
    <p role="status">{message}</p>
    <form className="equip-add" onSubmit={(e) => { e.preventDefault(); if (save(() => addEquipment(list, name, color), `“${name.trim()}” added.`)) setName(''); }}>
      <label className="equip-color" style={{ background: color }} title="Choose the colour"><span className="sr-only">Colour for the new equipment</span><input type="color" value={color} disabled={!!error} onChange={(e) => setColor(e.target.value)} /></label>
      <label className="equip-name"><span className="sr-only">New equipment name</span><input value={name} maxLength={40} placeholder="New equipment name, e.g. BO Sys-9" disabled={!!error} onChange={(e) => setName(e.target.value)} /></label>
      <button className="outline-button" disabled={!!error}><Plus size={14} aria-hidden="true" /> Add equipment</button>
    </form>
    {problem && <p className="ops-error" role="alert">{problem}</p>}
    <ul className="equip-list">{list.map((q) => <li key={q.id} className={q.active ? '' : 'is-inactive'}>
      <label className="equip-color" style={{ background: q.color }} title="Change the colour"><span className="sr-only">Colour for {q.name}</span><input type="color" value={q.color} disabled={!!error} onChange={(e) => save(() => updateEquipment(list, q.id, { color: e.target.value }), `${q.name} colour updated.`)} /></label>
      <label className="equip-name"><span className="sr-only">Name of {q.name}</span><input key={q.name} defaultValue={q.name} maxLength={40} disabled={!!error} onBlur={(e) => { const v = e.target.value; if (v.trim() !== q.name && !save(() => updateEquipment(list, q.id, { name: v }), `Renamed to “${v.trim()}”.`)) e.target.value = q.name; }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
      <span className="equip-preview" style={{ background: q.color, color: textOn(q.color) }} aria-hidden="true">{q.name}</span>
      <button type="button" className="text-button" disabled={!!error} onClick={() => save(() => updateEquipment(list, q.id, { active: !q.active }), `${q.name} ${q.active ? 'deactivated' : 'reactivated'}.`)}>{q.active ? 'Deactivate' : 'Reactivate'}</button>
    </li>)}</ul>
    <p className="filter-note">Deactivated equipment is no longer offered for new assignments. Tests already using it keep its name and colour on the weekly plan.</p>
  </section>;
}
