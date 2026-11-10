"use client";
// Sampling → Cylinders: every cylinder with its status. The sampling team checks cylinders here and sets them Ready,
// Under maintenance or Damaged. In use and Returned come from the jobs.
import { useMemo, useState } from "react";
import { cylinderStateLabel, cylinderStateTone, readyCheckLabels, setCylinderStatus, type CylinderState, type CylinderStatusMap, type EffectiveStatus, type ReadyChecks } from "./cylinder-status";
import { ukDateTime } from "./uk-format";

type Cylinder = { serial: string; type: string; capacity: string; specification: string };
type Props = {
  cylinders: Cylinder[];
  status: (serial: string) => EffectiveStatus;
  records: CylinderStatusMap;
  canEdit: boolean;
  me: string;
  name: (id?: string) => string;
  onSave: (next: CylinderStatusMap, message: string) => void;
  onOpenJob: (jobId: string) => void;
};
const order: CylinderState[] = ["returned", "not-checked", "ready", "in-use", "maintenance", "damaged"];
const noChecks: ReadyChecks = { emptied: false, cleaned: false, calibrated: false, pressureTested: false };

export function StateChip({ state }: { state: CylinderState }) {
  return <span className={"cyl-chip tone-" + cylinderStateTone[state]}>{cylinderStateLabel[state]}</span>;
}

export function CylinderRegister({ cylinders, status, records, canEdit, me, name, onSave, onOpenJob }: Props) {
  const [filter, setFilter] = useState<CylinderState | "all">("all");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState("");
  const [state, setState] = useState<CylinderState>("ready");
  const [checks, setChecks] = useState<ReadyChecks>(noChecks);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const rows = useMemo(() => cylinders.map((c) => ({ ...c, st: status(c.serial) })), [cylinders, status]);
  const counts = Object.fromEntries(order.map((s) => [s, rows.filter((r) => r.st.state === s).length])) as Record<CylinderState, number>;
  const types = [...new Set(cylinders.map((c) => c.type))].sort();
  const shown = rows.filter((r) => (filter === "all" || r.st.state === filter) && (!type || r.type === type) && (!search.trim() || [r.serial, r.type, r.specification, r.st.job?.jobNumber].some((v) => v?.toLowerCase().includes(search.trim().toLowerCase()))))
    .sort((a, b) => order.indexOf(a.st.state) - order.indexOf(b.st.state) || a.type.localeCompare(b.type) || a.serial.localeCompare(b.serial));
  const open = (serial: string, current: EffectiveStatus) => { setEditing(editing === serial ? "" : serial); setState(current.state === "ready" ? "ready" : "ready"); setChecks(noChecks); setNote(""); setError(""); };
  const save = (c: Cylinder, current: EffectiveStatus) => {
    try { onSave(setCylinderStatus(records, c.serial, { state, by: me, checks: state === "ready" ? checks : undefined, note }, current), `Cylinder ${c.serial} set to ${cylinderStateLabel[state]}.`); setEditing(""); setError(""); }
    catch (e) { setError((e as Error).message); }
  };
  return <section className="panel cyl-register" aria-labelledby="cyl-title">
    <div className="cyl-head"><div><span className="eyebrow">SAMPLING · CYLINDERS</span><h2 id="cyl-title">Cylinder status</h2>
      <p>Only <strong>Ready</strong> cylinders can be chosen for a job. A cylinder chosen in a job is <strong>In use</strong> and blocked for every other job. When a finished job releases its cylinders they are <strong>Returned · needs cleaning</strong> until the sampling team checks them again.</p></div></div>
    <div className="cyl-counts" role="group" aria-label="Filter by status">
      <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}><strong>{rows.length}</strong> All cylinders</button>
      {order.map((s) => <button key={s} type="button" className={"tone-" + cylinderStateTone[s] + (filter === s ? " is-active" : "")} onClick={() => setFilter(s)}><strong>{counts[s]}</strong> {cylinderStateLabel[s]}</button>)}
    </div>
    <div className="cyl-filters"><label><span>Type</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select></label><label className="cyl-search"><span>Search</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search serial, type or job" /></label></div>
    <ul className="cyl-list">
      {shown.map((c) => { const st = c.st, rec = st.record, isOpen = editing === c.serial; return <li key={c.serial} className={"cyl-row tone-" + cylinderStateTone[st.state]}>
        <div className="cyl-row-main">
          <span className="cyl-serial"><strong>{c.serial}</strong><small>{c.type} · {c.capacity}</small></span>
          <span className="cyl-spec">{c.specification}</span>
          <span className="cyl-state"><StateChip state={st.state} />
            {st.job && <button type="button" className="text-button" onClick={() => onOpenJob(st.job!.id)}>{st.state === "in-use" ? "Job" : "From job"} {st.job.jobNumber}{st.state === "in-use" ? ` · sample ${st.job.sampleIds.join(", ")}` : ""}</button>}
            <small>{st.state === "returned" ? `Released ${ukDateTime(st.releasedAt)}` : rec ? `${name(rec.by)} · ${ukDateTime(rec.at)}` : "Never checked"}</small>
            {rec?.note && st.state !== "returned" && <small className="cyl-note">{rec.note}</small>}</span>
          {canEdit && st.state !== "in-use" && <button type="button" className={st.state === "returned" || st.state === "not-checked" ? "attention-button" : "outline-button"} aria-expanded={isOpen} onClick={() => open(c.serial, st)}>{isOpen ? "Close" : st.state === "returned" || st.state === "not-checked" ? "Check cylinder" : "Update status"}</button>}
        </div>
        {isOpen && <div className="cyl-form">
          <div className="cyl-form-states" role="radiogroup" aria-label={"New status for " + c.serial}>{(["ready", "maintenance", "damaged"] as CylinderState[]).map((s) => <label key={s} className={"tone-" + cylinderStateTone[s] + (state === s ? " is-on" : "")}><input type="radio" name={"cyl-" + c.serial} checked={state === s} onChange={() => setState(s)} /> {cylinderStateLabel[s]}</label>)}</div>
          {state === "ready" && <div className="cyl-checks"><p>Confirm each check before setting Ready:</p>{(Object.keys(readyCheckLabels) as (keyof ReadyChecks)[]).map((k) => <label key={k}><input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} /> {readyCheckLabels[k]}</label>)}</div>}
          <label className="cyl-note-field"><span>Note{state === "ready" ? " (optional)" : " *"}</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={state === "ready" ? "e.g. calibration certificate reference" : "Describe the maintenance or damage"} /></label>
          {error && <p className="ops-error" role="alert">{error}</p>}
          <div className="panel-actions"><button type="button" className="primary-button" onClick={() => save(c, st)}>Save status</button><button type="button" className="text-button" onClick={() => setEditing("")}>Cancel</button></div>
          {rec?.history?.length ? <details className="cyl-history"><summary>Status history ({rec.history.length})</summary><ol>{[...rec.history].reverse().map((h, i) => <li key={i}><StateChip state={h.state} /> {name(h.by)} · {ukDateTime(h.at)}{h.fromJob ? ` · after job ${h.fromJob}` : ""}{h.note ? ` · ${h.note}` : ""}</li>)}</ol></details> : null}
        </div>}
      </li>; })}
      {!shown.length && <li className="cyl-empty">No cylinders match these filters.</li>}
    </ul>
  </section>;
}
