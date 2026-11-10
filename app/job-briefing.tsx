"use client";
// Job briefing (what the job is and what is needed) with Start job for the accountable sampling employee,
// and Job access: who may work on the job and who only views it. Changes are recorded in the Sequence of Events.
import { useState } from "react";
import { Settings2, PlayCircle } from "lucide-react";
import type { JobRecord } from "./page";
import { samplingTeam, samplingWorkers, samplingStarted, canManageJobAccess, canViewJobAccess, operationsFor, jobFinished, jobCylinderSerials, hasAccess, type Actor, type Command } from "./operations-model";
import { legacyPlan, planRecordCount, rowSummary } from "./sampling-plan";
import { ukDate, ukDateTime } from "./uk-format";

type Props = { job: JobRecord; actor: Actor; onCommand: (c: Command) => void; onStarted: () => void };

export function JobBriefing({ job, actor, onCommand, onStarted }: Props) {
  const [error, setError] = useState("");
  const o = operationsFor(job), me = actor.id, name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || "Not assigned";
  if (!o.dispatchedAt) return null;
  const team = samplingTeam(job), workers = samplingWorkers(job), started = samplingStarted(job), lead = job.assignedEngineerId;
  const backups = team.filter((id) => id !== lead);
  const plan = legacyPlan(job);
  const wells = job.wellMode === "multiple" ? (job.wells || []).filter(Boolean).join(", ") : job.well;
  const accountable = me === lead, viewOnly = team.includes(me) && !workers.includes(me);
  const start = () => { try { onCommand({ type: "start-job" }); setError(""); onStarted(); } catch (e) { setError((e as Error).message); } };
  const box = (label: string, value?: string, full = false) => <div className={full ? "full-field" : undefined}><dt>{label}</dt><dd className={full ? "instructions-text" : undefined}>{value || "Not recorded"}</dd></div>;
  return <section className={"panel ops-panel job-briefing" + (started ? " is-started" : " is-new")} id="job-briefing" aria-labelledby="job-briefing-title">
    <div className="job-briefing-head">
      <div><span className="eyebrow">JOB BRIEFING</span><h2 id="job-briefing-title">{job.jobNumber} · {job.clientName}</h2>
        <p>{started ? <>Started{o.samplingStart ? <> by <strong>{name(o.samplingStart.by)}</strong> on {ukDateTime(o.samplingStart.at)}</> : ""}. Sampling work is in progress.</> : <>Sent to Sampling by <strong>{name(o.dispatchedBy)}</strong> on {ukDateTime(o.dispatchedAt)}. Waiting for <strong>{name(lead)}</strong> to start the job.</>}</p></div>
      <span className={"section-state " + (started ? "st-in-progress" : "st-not-started")}>{started ? "Started · in progress" : "Not started"}</span>
    </div>
    {(() => { const grid = <dl className="review-grid briefing-grid">
      {box("Field / well", [job.fieldArea, wells].filter(Boolean).join(" · "))}
      {box("Job date → due date", `${ukDate(job.dateReceived) || "Not recorded"} → ${ukDate(job.dueDate) || "Not recorded"}`)}
      {box("Client focal point", [job.clientFocalPoint, job.clientFocalPointContact, job.clientFocalPointEmail].filter(Boolean).join(" · "))}
      {box("Sample records", String(job.samples?.length || planRecordCount(plan) || ""))}
      <div className="full-field"><dt>Sampling scope</dt><dd><ul className="review-plan">{plan.map((row) => <li key={row.source}><strong>{row.source === "Other" && job.otherSamplingType ? `Other — ${job.otherSamplingType}` : row.source}</strong> · {rowSummary(row)}{row.note ? ` · ${row.note}` : ""}</li>)}</ul></dd></div>
      {box("Job / request description", job.description, true)}
      {box("Sampling instructions", job.samplingInstructions, true)}
      <div className="full-field"><dt>Crew</dt><dd className="crew-list">{lead && <span className="crew-person">{name(lead)} <span className="crew-role accountable">Accountable</span></span>}{backups.map((id) => <span key={id} className="crew-person">{name(id)} <span className="crew-role">Backup · {workers.includes(id) ? "can work" : "view only"}</span></span>)}{job.assignedDriverId && <span className="crew-person">{name(job.assignedDriverId)} <span className="crew-role driver">Driver</span></span>}</dd></div>
    </dl>; return started ? <details className="briefing-details"><summary>Show job details</summary>{grid}</details> : grid; })()}
    {!started && accountable && <div className="briefing-start"><p><strong>What is needed now:</strong> read the briefing, then press <strong>Start job</strong>. The start is recorded in the Sequence of Events and the sampling preparation opens.</p><button type="button" className="attention-button start-job-button" onClick={start}><PlayCircle size={18} aria-hidden="true" /> Start job</button></div>}
    {!started && !accountable && <p className="briefing-note">Only {name(lead)} (accountable) can start this job.</p>}
    {viewOnly && <p className="briefing-note">You are a backup on this job with <strong>view-only</strong> access: you can follow the job, its instructions and the sampling data, but not change them. The job coordinator can give you work access if needed.</p>}
    {error && <p className="ops-error" role="alert">{error}</p>}
    {canViewJobAccess(actor) && <JobAccess job={job} actor={actor} onCommand={onCommand} />}
  </section>;
}

/** Who may work on this job. Backups are view only unless the coordinator gives them work access; every change needs a reason. */
export function JobAccess({ job, actor, onCommand }: Omit<Props, "onStarted">) {
  const o = operationsFor(job), lead = job.assignedEngineerId;
  const backups = samplingTeam(job).filter((id) => id !== lead);
  const saved = o.samplingEditors || [];
  const [open, setOpen] = useState(false);
  const [editors, setEditors] = useState<string[]>(saved);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || "Not assigned";
  const manage = canManageJobAccess(job, actor);
  const changed = JSON.stringify([...editors].sort()) !== JSON.stringify([...saved].sort());
  const save = () => { try { onCommand({ type: "job-access", editors, reason }); setError(""); setReason(""); setDone("Job access saved and recorded in the Sequence of Events."); setOpen(false); } catch (e) { setError((e as Error).message); } };
  return <div className="job-access">
    <div className="job-access-head"><strong>Job access</strong><span>Who can work on this job. Laboratory access will be added here later.</span>
      {manage && <button type="button" className="outline-button" aria-expanded={open} onClick={() => { setOpen(!open); setEditors(saved); setError(""); setDone(""); }}><Settings2 size={15} aria-hidden="true" /> {open ? "Close" : "Job access settings"}</button>}</div>
    {done && <p className="ops-success" role="status">{done}</p>}
    <table className="job-access-table"><thead><tr><th>Person</th><th>Role on this job</th><th>Access</th></tr></thead><tbody>
      {lead && <tr><td>{name(lead)}</td><td>Accountable sampling employee</td><td><span className="access-chip can-work">Can work · starts the job</span></td></tr>}
      {backups.map((id) => { const can = (open ? editors : saved).includes(id); return <tr key={id}><td>{name(id)}</td><td>Backup sampling employee</td><td>{open ? <span className="access-toggle" role="radiogroup" aria-label={"Access for " + name(id)}>
        <label><input type="radio" name={"access-" + id} checked={!can} onChange={() => setEditors(editors.filter((x) => x !== id))} /> View only</label>
        <label><input type="radio" name={"access-" + id} checked={can} onChange={() => setEditors([...editors.filter((x) => x !== id), id])} /> Can work</label></span>
        : <span className={"access-chip " + (can ? "can-work" : "view-only")}>{can ? "Can work" : "View only"}</span>}</td></tr>; })}
      {job.assignedDriverId && <tr><td>{name(job.assignedDriverId)}</td><td>Driver</td><td><span className="access-chip view-only">Transport after sampling-report approval</span></td></tr>}
      {!backups.length && <tr><td colSpan={3} className="muted">No backup sampling employees on this job.</td></tr>}
    </tbody></table>
    {open && backups.length > 0 && <div className="job-access-save"><label className="full-field"><span>Reason for the change *</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ahmed on leave from 20/11; Mohsin continues the sampling" /></label>
      <button type="button" className="primary-button" disabled={!changed || !reason.trim()} onClick={save}>Save job access</button></div>}
    {error && <p className="ops-error" role="alert">{error}</p>}
  </div>;
}

/** After the job is finished, the coordinator releases its cylinders back to the sampling team for cleaning and checks. */
export function CylinderRelease({ job, actor, onCommand }: Omit<Props, "onStarted">) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const o = operationsFor(job), serials = jobCylinderSerials(job);
  const name = (id?: string) => actor.employees.find((e) => e.id === id)?.name || "Not recorded";
  if (!serials.length || !jobFinished(job)) return null;
  const rel = o.cylindersReleased;
  const canRelease = hasAccess(actor, "createJob") || actor.id === o.dispatchedBy;
  if (rel) return <section className="panel ops-panel cyl-release is-done"><h2>Cylinders released</h2><p>{name(rel.by)} released {serials.length} cylinder{serials.length === 1 ? "" : "s"} on {ukDateTime(rel.at)}: {serials.join(", ")}. The sampling team collects, cleans, calibrates and checks them in <a href="#sampling">Sampling → Cylinders</a>.</p></section>;
  const release = () => { try { onCommand({ type: "release-cylinders", note }); setError(""); } catch (e) { setError((e as Error).message); } };
  return <section className="panel ops-panel cyl-release" aria-labelledby="cyl-release-title">
    <h2 id="cyl-release-title">Job finished · release the cylinders</h2>
    <p>This job still holds <strong>{serials.length} cylinder{serials.length === 1 ? "" : "s"}</strong>: {serials.join(", ")}. Release them so the sampling team can dispose of the remaining sample, clean, calibrate and check them for the next job. Until then they stay blocked as In use.</p>
    {canRelease ? <div className="cyl-release-form"><label><span>Message to the sampling team (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cylinders are in the PVT lab store, shelf B" /></label><button type="button" className="attention-button" onClick={release}>Release cylinders to the sampling team</button></div> : <p className="briefing-note">The job coordinator releases the cylinders.</p>}
    {error && <p className="ops-error" role="alert">{error}</p>}
  </section>;
}
