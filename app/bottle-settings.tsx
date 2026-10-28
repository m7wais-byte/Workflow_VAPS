"use client";
import { useState } from "react";
import { bottleTypes, validateBottle, type Bottle } from "./bottle-inventory";

export function BottleSettings({ inventory, onAdd, loadError }: { inventory: Bottle[]; onAdd: (bottle: Bottle) => void; loadError: string }) {
  const [draft, setDraft] = useState<Bottle>({ type: "", serial: "", capacity: "", specification: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const filtered = inventory.filter((item) => `${item.type} ${item.serial}`.toLowerCase().includes(search.toLowerCase()));
  function chooseType(type: string) {
    const capacities = [...new Set(inventory.filter((item) => item.type === type).map((item) => item.capacity))];
    const specifications = [...new Set(inventory.filter((item) => item.type === type).map((item) => item.specification))];
    setDraft({ ...draft, type, capacity: capacities.length === 1 ? capacities[0] : "", specification: specifications.length === 1 ? specifications[0] : "" });
    setError(""); setMessage("");
  }
  return <section className="panel bottle-settings"><div className="panel-heading"><div><h2>Bottle inventory</h2><p>Add bottles to the serial-number list for each bottle type.</p></div></div>
    <div className="bottle-settings-actions"><span>{inventory.length} bottles</span><button className="primary-button" type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? "Close form" : "+ Add Bottle"}</button></div>
    {loadError && <p role="alert">{loadError}</p>}
    {expanded && <form onSubmit={(event) => {
      event.preventDefault(); setMessage("");
      const bottle = { type: draft.type, serial: draft.serial.trim(), capacity: draft.capacity.trim(), specification: draft.specification.trim() };
      const invalid = validateBottle(bottle, inventory); if (invalid) { setError(invalid); return; }
      try { onAdd(bottle); } catch { setError("Bottle was not saved. Browser storage may be full or unavailable. Please try again."); return; }
      setDraft({ type: "", serial: "", capacity: "", specification: "" }); setError("");
      setMessage(`Bottle ${bottle.serial} saved under ${bottle.type} on this device. Excel update pending workbook connection.`);
    }}><div className="form-grid"><label><span>Bottle type *</span><select required value={draft.type} onChange={(event) => chooseType(event.target.value)}><option value="">Choose type</option>{bottleTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label><span>Serial number *</span><input required value={draft.serial} onChange={(event) => { setDraft({ ...draft, serial: event.target.value }); setError(""); }} maxLength={100} /></label><label><span>Capacity *</span><input required value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} placeholder="For example, 700 cc" maxLength={80} /></label><label><span>Specification (optional)</span><input value={draft.specification} onChange={(event) => setDraft({ ...draft, specification: event.target.value })} maxLength={250} /></label></div><p>New bottles are saved on this device. The Excel workbook is not connected yet.</p><button className="primary-button" disabled={!!loadError} type="submit">Add bottle</button></form>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <details open><summary>View bottle inventory</summary><label><span>Search type or serial</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="operations-table-wrap"><table className="lab-sample-table"><thead><tr><th>Type</th><th>Serial number</th><th>Capacity</th><th>Specification</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.serial}><td>{item.type}</td><td>{item.serial}</td><td>{item.capacity}</td><td>{item.specification || "—"}</td></tr>)}</tbody></table>{!filtered.length && <p>No matching bottles.</p>}</div></details>
  </section>;
}
