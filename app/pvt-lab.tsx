"use client";

import { useState } from "react";
import type { JobRecord } from "./page";
import { containerId, isGlass } from "./sample-container";
import { CircleCheck, CircleDashed, CircleDot, CirclePause, Hourglass, Pencil, UserRound } from "lucide-react";
import {
  currentProgress, isValidationTest, itemLabel, labItems, labProgress, planKeys, requestedDetailedTests, scopeTestOptions, scopeText,
  validationKey, validationRequested, validationStepNames, type LabItem, type LabPlan, type LabState, type LabTestProgress,
} from "./lab-work";
export type { LabTestProgress } from "./lab-work";

type Person = { id: string; name: string; active?: boolean };
const statuses: LabTestProgress["status"][] = ["Not started", "In progress", "On hold", "Completed"];
const stateTone: Record<LabState, string> = { "not-requested": "pending", "awaiting-plan": "waiting", "awaiting-assignment": "waiting", assigned: "pending", "in-progress": "active", "on-hold": "waiting", completed: "done" };
const itemTone = (item: LabItem) => item.progress.status === "Completed" ? "done" : item.progress.status === "On hold" || !item.assignee ? "waiting" : item.progress.status === "In progress" ? "active" : "pending";
const itemStatus = (item: LabItem) => item.progress.status === "Not started" ? (item.assignee ? "Assigned · not started" : "Awaiting assignment") : item.progress.status;
function ToneIcon({ tone }: { tone: string }) { const Icon = tone === "done" ? CircleCheck : tone === "waiting" ? Hourglass : tone === "active" ? CircleDot : tone === "hold" ? CirclePause : CircleDashed; return <Icon size={14} strokeWidth={2} aria-hidden="true" />; }
const wells = (job: JobRecord) => (job.wellMode === "multiple" ? job.wells?.filter(Boolean).join(", ") : job.well) || "Well not recorded";

/** One assigned validation step or test: responsible person, status and notes. */
function WorkRow({ job, item, index, employeeName, editable, blockedReason, onSave }: {
  job: JobRecord; item: LabItem; index?: number; employeeName: (id?: string) => string; editable: boolean; blockedReason: string; onSave: (value: LabTestProgress) => void;
}) {
  const saved = currentProgress(job, item.key);
  const [status, setStatus] = useState(saved.status);
  const [notes, setNotes] = useState(saved.notes);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const changed = status !== saved.status || notes !== saved.notes;
  const tone = itemTone(item);
  return <li className={"lab-row " + tone}>
    <div className="lab-row-main">
      <span className="lab-row-index">{index !== undefined ? index + 1 : <ToneIcon tone={tone} />}</span>
      <div className="lab-row-name"><strong>{item.label}</strong>{item.kind === "test" && <small>{item.requested ? "Requested in scope of work" : "Added by lab"}</small>}</div>
      <span className="lab-row-owner"><UserRound size={14} aria-hidden="true" />{item.assignee ? employeeName(item.assignee) : "Not assigned"}</span>
      <span className={"flow-pill " + tone}><ToneIcon tone={tone} />{itemStatus(item)}</span>
      <button type="button" className="continue-button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : editable ? "Update" : "Details"}</button>
    </div>
    {open && <form className="lab-row-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...saved, status, notes, scopeText: scopeText(job, item.key) }); setConfirmation("Progress saved."); }}>
      {!editable && <p className="lab-hint">{blockedReason}</p>}
      <fieldset disabled={!editable}>
        <label><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value as LabTestProgress["status"]); setConfirmation(""); }}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Lab notes</span><textarea value={notes} onChange={(event) => { setNotes(event.target.value); setConfirmation(""); }} rows={2} placeholder="Progress, results reference, missing information or handover notes" /></label>
        <footer><button className="primary-button" type="submit" disabled={!changed}>Save progress</button><span role="status">{confirmation}</span>{saved.updatedAt && <small>Updated by {employeeName(saved.updatedBy)} · {new Date(saved.updatedAt).toLocaleString()}</small>}</footer>
      </fieldset>
    </form>}
  </li>;
}

/** Ahmed's planning view: choose validation steps and detailed tests, then assign people. */
function PlanEditor({ job, team, onSave, onCancel }: { job: JobRecord; team: Person[]; onSave: (plan: Omit<LabPlan, "savedBy" | "savedAt">) => void; onCancel?: () => void }) {
  const requested = requestedDetailedTests(job);
  const plan = job.labPlan;
  const [steps, setSteps] = useState<string[]>(plan?.validationSteps || []);
  const [tests, setTests] = useState<string[]>(plan ? plan.tests : requested);
  const [assignees, setAssignees] = useState<Record<string, string>>(plan?.assignees || {});
  const [addTest, setAddTest] = useState("");
  const [bulk, setBulk] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const showValidation = validationRequested(job);
  const draft = { validationSteps: showValidation ? validationStepNames.filter((step) => steps.includes(step)) : steps, tests, assignees: {} as Record<string, string> };
  const keys = planKeys(job, draft);
  draft.assignees = Object.fromEntries(keys.filter((key) => assignees[key]).map((key) => [key, assignees[key]]));
  const removedWithProgress = planKeys(job).filter((key) => !keys.includes(key)).filter((key) => { const p = currentProgress(job, key); return p.status !== "Not started" || p.notes.trim(); });
  const catalogue = scopeTestOptions.filter((test) => !isValidationTest(test) && !tests.includes(test) && !requested.includes(test));
  const testRows = [...new Set([...requested, ...tests])];
  const unassigned = keys.filter((key) => !draft.assignees[key]).length;
  const assign = (key: string, id: string) => setAssignees((current) => ({ ...current, [key]: id }));
  const select = (key: string) => <select aria-label={"Responsible person for " + itemLabel(job, key)} value={assignees[key] || ""} onChange={(event) => assign(key, event.target.value)}><option value="">Assign person…</option>{team.filter(person=>person.active!==false || person.id===assignees[key]).map((person) => <option disabled={person.active===false} key={person.id} value={person.id}>{person.name}{person.active===false?" (Unavailable for new assignments)":""}</option>)}</select>;
  return <form className="lab-plan-editor" onSubmit={(event) => { event.preventDefault(); if (removedWithProgress.length && !confirmRemoval) { setConfirmRemoval(true); return; } onSave(draft); }}>
    <section className="panel">
      <div className="lab-section-heading"><div><span className="eyebrow">STEP 1 · VALIDATION</span><h2>Validation steps</h2><p>{showValidation ? "Select only the steps this job needs. Unselected steps are not tracked and do not affect progress." : "Validation is not in this job’s scope of work, so no validation checklist is assigned."}</p></div>{showValidation && <div className="lab-inline-actions"><button type="button" className="outline-button" onClick={() => setSteps([...validationStepNames])}>Select all</button><button type="button" className="outline-button" onClick={() => setSteps([])}>Clear</button></div>}</div>
      {showValidation && <ol className="lab-plan-list">{validationStepNames.map((step, index) => { const key = validationKey(step); const checked = steps.includes(step); return <li key={step} className={checked ? "selected" : ""}>
        <label className="lab-plan-check"><input type="checkbox" checked={checked} onChange={(event) => { setSteps((current) => event.target.checked ? [...current, step] : current.filter((item) => item !== step)); setConfirmRemoval(false); }} /><span className="lab-row-index">{index + 1}</span><strong>{step}</strong></label>
        {checked ? select(key) : <span className="lab-plan-muted">Not required</span>}
      </li>; })}</ol>}
    </section>
    <section className="panel">
      <div className="lab-section-heading"><div><span className="eyebrow">STEP 2 · DETAILED TESTS</span><h2>Detailed laboratory tests</h2><p>Tests requested in the scope of work are listed first. Add any further test from the catalogue only if this job needs it.</p></div></div>
      {testRows.length ? <ul className="lab-plan-list">{testRows.map((test) => { const checked = tests.includes(test); return <li key={test} className={checked ? "selected" : ""}>
        <label className="lab-plan-check"><input type="checkbox" checked={checked} onChange={(event) => { setTests((current) => event.target.checked ? [...current, test] : current.filter((item) => item !== test)); setConfirmRemoval(false); }} /><strong>{scopeText(job, test)}</strong><small className={requested.includes(test) ? "scope-tag requested" : "scope-tag added"}>{requested.includes(test) ? "Requested in scope" : "Added by lab"}</small></label>
        {checked ? select(test) : <span className="lab-plan-muted">{requested.includes(test) ? "Requested · not included in plan" : "Not included"}</span>}
      </li>; })}</ul> : <p className="lab-hint">No detailed tests were requested in the scope of work.</p>}
      <div className="lab-add-test"><label><span>Add a test from the catalogue</span><select value={addTest} onChange={(event) => setAddTest(event.target.value)}><option value="">Select a test…</option>{catalogue.map((test) => <option key={test}>{test}</option>)}</select></label><button type="button" className="outline-button" disabled={!addTest} onClick={() => { setTests((current) => [...current, addTest]); setAddTest(""); }}>Add test</button></div>
    </section>
    <section className="panel lab-plan-footer">
      <div><strong>{draft.validationSteps.length && showValidation ? `${draft.validationSteps.length} validation step${draft.validationSteps.length === 1 ? "" : "s"}` : "No validation steps"} · {tests.length} detailed test{tests.length === 1 ? "" : "s"}</strong><span>{unassigned ? `${unassigned} item${unassigned === 1 ? "" : "s"} still need a responsible person` : keys.length ? "Every selected item has a responsible person" : "Select at least one item"}</span></div>
      <label className="lab-bulk"><span>Assign all unassigned to</span><select value={bulk} onChange={(event) => { const id = event.target.value; setBulk(""); if (id) setAssignees((current) => ({ ...current, ...Object.fromEntries(keys.filter((key) => !current[key]).map((key) => [key, id])) })); }}><option value="">Choose person…</option>{team.filter(person=>person.active!==false).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      {confirmRemoval && <div className="lab-warning" role="alert"><strong>Recorded progress will be removed for:</strong><ul>{removedWithProgress.map((key) => <li key={key}>{itemLabel(job, key)} — {currentProgress(job, key).status}</li>)}</ul><p>Keep these items selected to preserve their progress, or confirm to remove them from the plan.</p></div>}
      <div className="lab-inline-actions">{onCancel && <button type="button" className="outline-button" onClick={onCancel}>Cancel</button>}<button type="submit" className="primary-button" disabled={!keys.length}>{confirmRemoval ? "Confirm and save plan" : plan ? "Save plan changes" : "Save lab plan"}</button></div>
    </section>
  </form>;
}

export function PvtLab({ initialJobId = "", jobs, employeeName, team, onOpenJob, onEditScope, onUpdateTest, onSavePlan, canPlan, lockReason, today }: {
  initialJobId?: string; jobs: JobRecord[]; employeeName: (id?: string) => string; team: Person[]; today: string;
  onOpenJob: (job: JobRecord) => void; onEditScope: (job: JobRecord) => void;
  onUpdateTest: (id: string, key: string, progress: LabTestProgress) => void;
  onSavePlan: (id: string, plan: Omit<LabPlan, "savedBy" | "savedAt">) => void;
  canPlan: (job: JobRecord) => boolean; lockReason: (job: JobRecord, item: LabItem) => string;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(initialJobId);
  const [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState(false);
  const scopedJobs = jobs.filter((job) => (job.requiredTests || []).length > 0);
  const visible = scopedJobs.filter((job) => { const state = labProgress(job).state; return (filter === "all" || (filter === "completed" ? state === "completed" : filter === "plan" ? state === "awaiting-plan" : state !== "completed")) && [job.id, job.clientName, job.fieldArea, job.well, ...(job.wells || []), ...(job.requiredTests || []).map((test) => scopeText(job, test))].join(" ").toLowerCase().includes(search.toLowerCase()); }).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const selected = scopedJobs.find((job) => job.id === selectedId);
  const missingScope = jobs.length - scopedJobs.length;
  const count = (state: LabState) => scopedJobs.filter((job) => labProgress(job).state === state).length;
  const scopeChips = (job: JobRecord) => (job.requiredTests || []).map((test) => <span key={test} className={"scope-chip" + (isValidationTest(test) ? " validation" : "")}>{scopeText(job, test)}</span>);

  if (selected) {
    const progress = labProgress(selected);
    const items = labItems(selected);
    const validation = items.filter((item) => item.kind === "validation");
    const tests = items.filter((item) => item.kind === "test");
    const plannable = canPlan(selected);
    const showEditor = plannable && (editing || !selected.labPlan);
    const legacyValidation = (selected.requiredTests || []).filter(isValidationTest).map((test) => currentProgress(selected, test)).filter((p) => p.status !== "Not started");
    const delivered = !!selected.teamWork?.transport?.completedAt;
    const hiddenSteps = !validationRequested(selected) && (selected.labPlan?.validationSteps.length || 0) > 0;
    return <div className="pvt-lab">
      <button className="back-link" onClick={() => { setSelectedId(""); setEditing(false); }} type="button">← Back to lab jobs</button>
      <section className="panel lab-job-panel">
        <div className="lab-job-heading"><div><span className="eyebrow">PVT LAB · JOB</span><h1>{selected.id}</h1><p>{selected.clientName} · {selected.fieldArea || "Field not recorded"} · {wells(selected)}</p></div><div className="lab-inline-actions"><span className={"flow-pill large " + stateTone[progress.state]}><ToneIcon tone={stateTone[progress.state]} />{progress.label}{progress.total ? ` · ${progress.done}/${progress.total}` : ""}</span><button className="outline-button" onClick={() => onOpenJob(selected)} type="button">Job workflow</button></div></div>
        <dl className="lab-facts">{[
          ["Sampling source", selected.samplingSource || (selected.samplingRequired === false ? "Sampling not required" : "Not specified")],
          ["Samples", `${selected.samples?.length || 0} records · ${selected.requestedSampleCount || "?"} requested`],
          ["Sample delivery", delivered ? "Delivered to lab" : selected.teamWork?.transport?.owner ? "In transit" : "Awaiting samples"],
          ["Due date", selected.dueDate ? selected.dueDate + (selected.dueDate < today && progress.state !== "completed" ? " · overdue" : "") : "Not recorded"],
          ["Job responsible", employeeName(selected.jobResponsibleId || selected.responsibleId)],
          ["PVT owner", selected.teamWork?.analysis?.owner ? employeeName(selected.teamWork.analysis.owner) : "Not accepted yet"],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className="lab-scope-block"><div className="lab-scope-head"><h2>Requested scope of work</h2>{plannable && <button type="button" className="outline-button" onClick={() => onEditScope(selected)}>Edit job & scope</button>}</div><div className="flow-scope-chips">{scopeChips(selected)}</div>
          {selected.sampleCountNotes && <p className="lab-note"><strong>Scope notes:</strong> {selected.sampleCountNotes}</p>}
          {selected.description && <p className="lab-note">{selected.description}</p>}
          {selected.scopeOfWorkAttachment && <a className="back-link" href={selected.scopeOfWorkAttachment.dataUrl} download={selected.scopeOfWorkAttachment.name}>Download scope: {selected.scopeOfWorkAttachment.name}</a>}
        </div>
      </section>

      {showEditor ? <PlanEditor key={selected.id + (selected.labPlan?.savedAt || "")} job={selected} team={team} onCancel={selected.labPlan ? () => setEditing(false) : undefined} onSave={(plan) => { onSavePlan(selected.id, plan); setEditing(false); }} />
      : !selected.labPlan ? <section className="panel lab-awaiting"><Hourglass size={22} aria-hidden="true" /><div><h2>Awaiting lab plan</h2><p>The requested work is shown above. The PVT lab lead selects the validation steps, confirms detailed tests and assigns responsible people. Nothing is counted as started until then.</p>{legacyValidation.length > 0 && <p className="lab-hint">Validation progress recorded before step planning: {legacyValidation.map((p) => p.status).join(", ")}.</p>}</div></section>
      : <>
        <div className="lab-plan-bar"><p>Plan saved by {employeeName(selected.labPlan.savedBy)}{selected.labPlan.savedAt ? " · " + new Date(selected.labPlan.savedAt).toLocaleString() : ""}{!delivered && " · Progress can be recorded once samples are delivered."}</p>{plannable && <button type="button" className="outline-button" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /> Edit plan & assignments</button>}</div>
        {validationRequested(selected) && <section className="panel lab-work-section">
          <div className="lab-section-heading"><div><span className="eyebrow">VALIDATION</span><h2>Validation checklist</h2><p>{validation.length ? `${validation.length} of ${validationStepNames.length} steps selected for this job.` : "No validation steps selected yet."}</p></div><div className="lab-progress-figure"><strong>{validation.filter((item) => item.progress.status === "Completed").length} / {validation.length}</strong><span className="flow-bar"><i style={{ width: `${validation.length ? Math.round(100 * validation.filter((item) => item.progress.status === "Completed").length / validation.length) : 0}%` }} /></span></div></div>
          {legacyValidation.length > 0 && <p className="lab-hint">Earlier job-level validation status ({legacyValidation.map((p) => p.status).join(", ")}) is kept on record; step progress below is tracked separately.</p>}
          <ol className="lab-rows">{validation.map((item) => <WorkRow key={item.key + item.progress.scopeText} job={selected} item={item} index={validationStepNames.indexOf(item.label as typeof validationStepNames[number])} employeeName={employeeName} editable={!lockReason(selected, item)} blockedReason={lockReason(selected, item)} onSave={(value) => onUpdateTest(selected.id, item.key, value)} />)}</ol>
        </section>}
        {hiddenSteps && <p className="lab-hint">Validation was removed from the scope of work, so its planned steps are hidden and not counted.</p>}
        <section className="panel lab-work-section">
          <div className="lab-section-heading"><div><span className="eyebrow">DETAILED TESTS</span><h2>Detailed laboratory tests</h2><p>{tests.length ? "Assigned tests for this job." : "No detailed tests in the plan."}</p></div><div className="lab-progress-figure"><strong>{tests.filter((item) => item.progress.status === "Completed").length} / {tests.length}</strong><span className="flow-bar"><i style={{ width: `${tests.length ? Math.round(100 * tests.filter((item) => item.progress.status === "Completed").length / tests.length) : 0}%` }} /></span></div></div>
          {requestedDetailedTests(selected).filter((test) => !tests.some((item) => item.key === test)).length > 0 && <p className="lab-hint">Requested but not in the plan: {requestedDetailedTests(selected).filter((test) => !tests.some((item) => item.key === test)).map((test) => scopeText(selected, test)).join(", ")}.</p>}
          <ol className="lab-rows">{tests.map((item) => <WorkRow key={item.key + item.progress.scopeText} job={selected} item={item} employeeName={employeeName} editable={!lockReason(selected, item)} blockedReason={lockReason(selected, item)} onSave={(value) => onUpdateTest(selected.id, item.key, value)} />)}</ol>
        </section>
      </>}

      <details className="panel lab-details"><summary>Samples and bottles · {selected.samples?.length || 0} records</summary><p>These are recorded sample details; they do not confirm physical receipt by the lab.</p>
        {selected.samples?.length ? <div className="operations-table-wrap"><table className="lab-sample-table"><thead><tr><th>Sample</th><th>Bottle / container</th><th>Capacity</th><th>Sampling data</th><th>Notes</th></tr></thead><tbody>{selected.samples.map((sample) => <tr key={sample.id}><td>{sample.id}</td><td>{isGlass(sample) ? "Glass container" : sample.bottle || "Not recorded"}<br />{containerId(sample) || (isGlass(sample) ? "ID not recorded" : "Serial not recorded")}</td><td>{isGlass(sample) ? "—" : sample.bottleCapacity || "Not recorded"}</td><td>{sample.dataComplete ? "Complete" : "Pending"}</td><td>{sample.notes || sample.preparationRemarks || "—"}</td></tr>)}</tbody></table></div> : <p>No sample records have been added yet.</p>}
      </details>
      <details className="panel lab-details"><summary>Client contact and job handover</summary><dl className="lab-facts"><div><dt>Client focal point</dt><dd>{selected.clientFocalPoint || "Not recorded"}</dd></div><div><dt>Phone</dt><dd>{selected.clientFocalPointContact || "Not recorded"}</dd></div><div><dt>Email</dt><dd>{selected.clientFocalPointEmail || "Not recorded"}</dd></div><div><dt>Client reference</dt><dd>{selected.clientReference || "Not recorded"}</dd></div></dl></details>
    </div>;
  }

  return <div className="pvt-lab">
    <section className="page-intro"><div><span className="eyebrow">LABORATORY WORKSPACE</span><h1>PVT Lab</h1><p>Every job with laboratory work in its scope appears here as soon as it is created. Open a job to plan validation steps, assign tests and track progress.</p></div></section>
    <div className="lab-summary"><span><strong>{count("awaiting-plan")}</strong> awaiting lab plan</span><span><strong>{count("awaiting-assignment") + count("assigned")}</strong> planned · not started</span><span><strong>{count("in-progress") + count("on-hold")}</strong> in progress</span><span><strong>{count("completed")}</strong> completed</span></div>
    <section className="panel">
      <div className="lab-tools"><label><span>Find a lab job</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Job number, client, well, or test" /></label><label><span>Show</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Open lab work</option><option value="plan">Awaiting lab plan</option><option value="completed">Completed lab work</option><option value="all">All lab jobs</option></select></label></div>
      <div className="lab-job-list">{visible.map((job) => { const progress = labProgress(job); const tone = stateTone[progress.state]; return <article key={job.id}>
        <div><div className="lab-card-title"><h2>{job.id}</h2><span className={"flow-pill " + tone}><ToneIcon tone={tone} />{progress.label}</span></div><p>{job.clientName} · {job.fieldArea || "Field not recorded"} · {wells(job)}</p><p className="lab-card-meta">{job.samplingSource || "Sampling not specified"} · {job.samples?.length || job.requestedSampleCount || 0} samples</p><div className="flow-scope-chips">{scopeChips(job)}</div></div>
        <div className="lab-job-action"><strong className={job.dueDate && job.dueDate < today && progress.state !== "completed" ? "overdue-text" : ""}>Due {job.dueDate || "not set"}</strong>{progress.total ? <><span className="flow-bar"><i style={{ width: `${Math.round(100 * progress.done / progress.total)}%` }} /></span><span>{progress.done} / {progress.total} assigned items complete</span></> : <span>No work assigned yet</span>}<button className="primary-button" type="button" onClick={() => { setSelectedId(job.id); setEditing(false); }}>{progress.state === "awaiting-plan" && canPlan(job) ? "Plan lab work" : "Open lab job"}</button></div>
      </article>; })}</div>
      {!visible.length && <div className="lab-empty"><h2>{scopedJobs.length ? "No matching lab jobs" : "No lab work requested yet"}</h2><p>{scopedJobs.length ? "Change the search or filter to find another job." : "Jobs appear here when work / tests are selected in the job’s Scope of Work."}</p></div>}
      {missingScope > 0 && <p className="lab-hint">{missingScope} job{missingScope === 1 ? " has" : "s have"} no selected scope of work. Add the required tests in Jobs to include them here.</p>}
    </section>
  </div>;
}
