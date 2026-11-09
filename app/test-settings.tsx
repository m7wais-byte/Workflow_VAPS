'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useUnsaved } from './settings-pages';
import { catalogueSections, catalogueTests, fluidGroups, newCatalogueTest, type CatalogueSection, type CatalogueTest, type FluidGroup } from './test-catalogue';
import { effectiveRouting, routingChoice, routingChoices, type RoutingChoice, type SavedRouting } from './test-routing';
import { isValidationTest } from './lab-work';

const choiceLabel: Record<RoutingChoice, string> = { Chemical: 'Chemistry', PVT: 'PVT', Both: 'PVT and Chemistry', Unassigned: 'Unassigned' };
const sectionNote: Record<CatalogueSection, string> = {
  'Fluid tests': 'Required tests · shown for the matching fluid type',
  'General analysis': 'Required tests',
  'Specialised analysis': 'Required tests',
  'Other tests': 'Other tests · the scope owner chooses the team',
};

/**
 * Settings → Tests: the full catalogue that feeds every sample's Scope of Work, with each test's default team.
 * Saving writes an explicit decision for every test, so Unassigned is kept as chosen. Released scopes keep their routing.
 */
export function TestCatalogueSettings({ custom, saved, error, onSave, demoActive = false }: { custom: CatalogueTest[]; saved: SavedRouting; error: string; demoActive?: boolean; onSave: (custom: CatalogueTest[], routing: SavedRouting) => boolean }) {
  const initial = () => { const routing = effectiveRouting(saved); return Object.fromEntries(catalogueTests(custom).map((t) => [t.id, routingChoice(routing, t.id)])) as SavedRouting; };
  const [routing, setRouting] = useState<SavedRouting>(initial), [tests, setTests] = useState(custom), [message, setMessage] = useState(''), [formError, setFormError] = useState('');
  const [name, setName] = useState(''), [section, setSection] = useState<CatalogueSection>('Specialised analysis'), [fluid, setFluid] = useState<FluidGroup | ''>(''), [team, setTeam] = useState<RoutingChoice>('Chemical');
  const changed = JSON.stringify({ routing, tests }) !== JSON.stringify({ routing: initial(), tests: custom });
  useUnsaved(changed || !!name.trim());
  const all = catalogueTests(tests).filter((t) => !isValidationTest(t.id));
  const counts = routingChoices.map((c) => [c, all.filter((t) => routing[t.id] === c).length] as const);
  const add = () => {
    try {
      const test = newCatalogueTest(name, section, fluid || undefined, catalogueTests(tests));
      setTests([...tests, test]); setRouting({ ...routing, [test.id]: team }); setName(''); setFormError(''); setMessage(`“${test.name}” added. Save the catalogue to make it available in Scope of Work.`);
    } catch (e) { setFormError((e as Error).message); }
  };
  return <section className="panel settings-panel test-catalogue">
    <div className="panel-heading"><div><span className="eyebrow">LABORATORY SCOPE</span><h2>Test catalogue</h2><p>Every test listed here appears in each sample’s Scope of Work. The default team is preselected when the scope owner selects the test; Unassigned tests are routed per sample by the scope owner. Changes apply to future selections. Released jobs keep the routing they were released with.</p></div></div>
    {error && <p role="alert">{error}</p>}
    {demoActive && <p className="flag-note" role="note">Demo setup is on: its labelled routing for the demo fluid, Water Analysis and Compositional Analysis tests applies on top of these settings until the demo is switched off.</p>}
    <p className="catalogue-counts" role="status">{counts.map(([c, n]) => <span key={c} className={'scope-chip' + (c === 'Unassigned' && n ? ' chip-missing' : '')}>{choiceLabel[c]}: {n}</span>)}</p>
    <form className="catalogue-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <h3>Add a test</h3>
      <div className="settings-form-grid">
        <label>Test name *<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mercury Content" disabled={!!error} /></label>
        <label>Section *<select value={section} onChange={(e) => setSection(e.target.value as CatalogueSection)} disabled={!!error}>{catalogueSections.map((s) => <option key={s} value={s}>{s === 'Other tests' ? 'Other tests' : 'Required tests · ' + s}</option>)}</select></label>
        {section === 'Fluid tests' && <label>Fluid method *<select required value={fluid} onChange={(e) => setFluid(e.target.value as FluidGroup)}><option value="">Select</option>{fluidGroups.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>}
        <label>Default team *<select value={team} onChange={(e) => setTeam(e.target.value as RoutingChoice)} disabled={!!error}>{routingChoices.map((c) => <option key={c} value={c}>{choiceLabel[c]}</option>)}</select></label>
      </div>
      {formError && <p className="ops-error" role="alert">{formError}</p>}
      <button className="outline-button" disabled={!name.trim() || !!error}><Plus size={14} /> Add to catalogue</button>
    </form>
    {catalogueSections.map((s) => { const list = all.filter((t) => t.section === s); return list.length > 0 && <div key={s} className="catalogue-section">
      <h3>{s}<small>{sectionNote[s]}</small></h3>
      <div className="client-table-wrap"><table className="client-table"><thead><tr><th>Test</th><th>Default team</th></tr></thead><tbody>
        {list.map((t) => <tr key={t.id} className={routing[t.id] === 'Unassigned' ? 'is-unassigned' : ''}><th scope="row">{t.name}<small>{t.section === 'Fluid tests' ? t.group + ' · ' : ''}{t.builtIn ? 'Built-in' : 'Added in Settings'}{tests.includes(t) && !custom.includes(t) ? ' · not saved yet' : ''}</small></th>
          <td><select aria-label={'Default team for ' + t.name + (t.section === 'Fluid tests' ? ' (' + t.group + ')' : '')} value={routing[t.id] || 'Unassigned'} disabled={!!error} onChange={(e) => { setMessage(''); setRouting({ ...routing, [t.id]: e.target.value as RoutingChoice }); }}>{routingChoices.map((c) => <option key={c} value={c}>{choiceLabel[c]}</option>)}</select></td></tr>)}
      </tbody></table></div></div>; })}
    <p className="filter-note">Validation is not a catalogue test: it is requested per sample and planned step by step by the PVT Team Lead.</p>
    <footer className="settings-footer-actions"><button className="text-button" type="button" disabled={!changed} onClick={() => { setRouting(initial()); setTests(custom); setMessage(''); }}>Cancel changes</button><button type="button" className="primary-button" disabled={!changed || !!error} onClick={() => { if (onSave(tests, routing)) setMessage('Test catalogue saved. Scope of Work uses it for new selections.'); }}>Save test catalogue</button><span role="status">{message || (changed ? 'Unsaved changes' : '')}</span></footer>
  </section>;
}
