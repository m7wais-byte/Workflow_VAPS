"use client";
import { JobQR } from "./job-qr";
import { useState, type ComponentType } from "react";
import type { JobRecord } from "./page";
import { CircleCheck, CircleDashed, CircleDot, CirclePause, ClipboardList, FlaskConical, Hourglass, TestTubes, Truck, UserRound } from "lucide-react";
import { jobProgress, jobSummary, leafNodes, stateLabel, type JobSummary, type StageId, type TrackNode, type TrackState } from "./job-workflow-model";
import { labProgress } from "./lab-work";

export type TrackerTask = { id: string; label: string; state: TrackState; status: string; ownerName?: string; group?: string; waiting?: string };
export type TrackerStage = { id: string; label: string; state: TrackState; waiting?: string; current: boolean; ownerName?: string; nextAction?: string; done?: number; total?: number; tasks: TrackerTask[] };

const stageIcons: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = { setup: ClipboardList, sampling: FlaskConical, delivery: Truck, lab: TestTubes };
export const stageStatusText = (stage: Pick<TrackerStage, "state" | "waiting" | "done" | "total">) =>
  stage.state === "done" ? "Completed" : stage.waiting ? stage.waiting : stage.state === "active" ? (stage.total ? `In progress · ${stage.done}/${stage.total}` : "In progress") : "Not started";
const tone = (state: TrackState, waiting?: string) => state === "done" ? "done" : waiting ? "waiting" : state === "active" ? "active" : "pending";

function StatusIcon({ state, waiting, size = 15 }: { state: TrackState; waiting?: string; size?: number }) {
  const t = tone(state, waiting);
  const Icon = t === "done" ? CircleCheck : t === "waiting" ? (waiting === "On hold" ? CirclePause : Hourglass) : t === "active" ? CircleDot : CircleDashed;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />;
}

/** Compact left-to-right job journey. Click a stage to show its tasks underneath. */
export function StageTracker({ stages, selected, onSelect }: { stages: TrackerStage[]; selected?: string; onSelect?: (id: string) => void }) {
  return <div className="flow-scroll" role="region" aria-label="Job workflow stages" tabIndex={0}>
    <ol className="flow-track" style={{ ["--flow-count" as string]: stages.length }}>
      {stages.map((stage, index) => {
        const Icon = stageIcons[stage.id] || CircleDot;
        const t = tone(stage.state, stage.waiting);
        return <li key={stage.id} className={["flow-stage", t, stage.current ? "current" : "", selected === stage.id ? "selected" : "", index < stages.length - 1 && stage.state === "done" ? "line-done" : ""].join(" ")}>
          <button type="button" onClick={() => onSelect?.(stage.id)} aria-pressed={selected === stage.id} aria-label={`${index + 1}. ${stage.label}: ${stageStatusText(stage)}${stage.current ? " (current stage)" : ""}`}>
            <span className="flow-node"><Icon size={20} strokeWidth={1.8} /><i><StatusIcon state={stage.state} waiting={stage.waiting} size={14} /></i></span>
            <span className="flow-text"><small>Step {index + 1}{stage.current ? " · Current" : ""}</small><strong>{stage.label}</strong><em><StatusIcon state={stage.state} waiting={stage.waiting} size={13} />{stageStatusText(stage)}</em></span>
          </button>
        </li>;
      })}
    </ol>
  </div>;
}

export function StageDetail({ stage, actionLabel, onAction }: { stage: TrackerStage; actionLabel?: string; onAction?: () => void }) {
  const groups = [...new Set(stage.tasks.map(task => task.group || ""))];
  return <section className="panel flow-detail" aria-live="polite">
    <header><div><span className="eyebrow">{stage.current ? "CURRENT STAGE" : "STAGE DETAILS"}</span><h2>{stage.label}</h2><p className={"flow-pill " + tone(stage.state, stage.waiting)}><StatusIcon state={stage.state} waiting={stage.waiting} />{stageStatusText(stage)}</p></div>
      {(stage.ownerName || stage.nextAction) && <dl>{stage.ownerName && <div><dt>Responsible</dt><dd><UserRound size={15} aria-hidden="true" />{stage.ownerName}</dd></div>}{stage.nextAction && <div><dt>Next action</dt><dd>{stage.nextAction}</dd></div>}</dl>}
      {actionLabel && onAction && <button type="button" className="primary-button" onClick={onAction}>{actionLabel}</button>}
    </header>
    {groups.map(group => { const tasks = stage.tasks.filter(task => (task.group || "") === group); const done = tasks.filter(task => task.state === "done").length; return <div className="flow-task-group" key={group || "tasks"}>
      {group && <h3>{group}<span>{done} / {tasks.length} complete</span></h3>}
      {group && tasks.length > 0 && <span className="flow-bar" aria-hidden="true"><i style={{ width: `${Math.round(100 * done / tasks.length)}%` }} /></span>}
      <ol className="flow-tasks">{tasks.map((task, index) => <li key={task.id} className={tone(task.state, task.waiting)}><span className="flow-task-index">{group === "Validation" ? index + 1 : <StatusIcon state={task.state} waiting={task.waiting} />}</span><strong>{task.label}</strong><span className="flow-task-owner">{task.ownerName ? <><UserRound size={13} aria-hidden="true" />{task.ownerName}</> : null}</span><span className={"flow-pill " + tone(task.state, task.waiting)}><StatusIcon state={task.state} waiting={task.waiting} size={13} />{task.status}</span></li>)}</ol>
    </div>; })}
    {!stage.tasks.length && <p className="flow-empty">No tasks recorded for this stage.</p>}
  </section>;
}

/** Shared (QR) summary: same tracker, built from the privacy-safe node tree. */
export function WorkflowSummary({ summary }: { summary: JobSummary }) {
  const currentIndex = summary.nodes.findIndex(node => node.state !== "done");
  const stages: TrackerStage[] = summary.nodes.map((node, index) => {
    const tasks = (node.children || []).flatMap(child => child.children?.length ? child.children.map(leaf => ({ leaf, group: child.label })) : [{ leaf: child, group: "" }]).map(({ leaf, group }: { leaf: TrackNode; group: string }) => ({ id: leaf.id, label: leaf.label, state: leaf.state, status: leaf.detail || stateLabel[leaf.state], group, waiting: leaf.detail }));
    const leaves = leafNodes([node]);
    return { id: node.id, label: node.label, state: node.state, waiting: node.detail, current: index === currentIndex, tasks, done: node.id === "lab" ? leaves.filter(leaf => leaf.state === "done").length : undefined, total: node.id === "lab" ? leaves.length : undefined };
  });
  const [selected, setSelected] = useState(stages[Math.max(0, currentIndex)]?.id);
  const stage = stages.find(item => item.id === selected);
  const closed = currentIndex === -1;
  return <div className="job-tracker">
    <section className="track-overview"><div><span className="eyebrow">JOB WORKFLOW</span><h1>{summary.jobId}</h1><p>{summary.client}</p></div><span className={"track-badge " + (closed ? "done" : "active")}>{closed ? "Job complete" : "Job in progress"}</span></section>
    <dl className="track-facts"><div><dt>Field / well</dt><dd>{summary.location}</dd></div><div><dt>Sampling method</dt><dd>{summary.sampling}</dd></div><div><dt>Samples</dt><dd>{summary.sampleCount}</dd></div><div><dt>Sample types</dt><dd>{summary.sampleTypes.map(item => item.count + " × " + item.label).join(" · ") || "Types not recorded"}</dd></div></dl>
    <section className="panel flow-panel"><StageTracker stages={stages} selected={selected} onSelect={setSelected} /></section>
    {stage && <StageDetail stage={stage} />}
    <section className="panel track-history"><h2>Progress history</h2>{summary.history.length ? <ol>{[...summary.history].reverse().map((event, index) => <li key={index}><span className={"track-dot " + event.state} /><div><strong>{event.label}</strong><span>{stateLabel[event.state]}</span></div><time>{new Date(event.at).toLocaleString()}</time></li>)}</ol> : <p>Status history will appear as the team updates this job.</p>}</section>
    <p className="track-updated">Last updated {new Date(summary.updatedAt).toLocaleString()}</p>
  </div>;
}

export const stageActionLabel: Record<StageId, string> = { setup: "Open job setup", sampling: "Open in Sampling", delivery: "Open team handoffs", lab: "Open in PVT Lab", "sampling-report":"Open sampling report", planning:"Open laboratory scope", reporting:"Open final reporting" };

/** Internal tracker stages with responsible people resolved to names. */
export function trackerStages(job: JobRecord, employeeName: (id?: string) => string): TrackerStage[] {
  const name = (id?: string) => id ? employeeName(id) : undefined;
  return jobProgress(job).stages.map(stage => ({ ...stage, ownerName: name(stage.owner) || stage.ownerFallback, tasks: stage.tasks.map(task => ({ ...task, ownerName: name(task.owner) })) }));
}

export function JobWorkflow({ job, employeeName, onBack, onOpenStage, today }: { job: JobRecord; employeeName: (id?: string) => string; onBack: () => void; onOpenStage: (stage: StageId | "closed", task?: string) => void; today: string }) {
  const [preview, setPreview] = useState(false);
  const progress = jobProgress(job);
  const stages = trackerStages(job, employeeName);
  const [selected, setSelected] = useState<string>(progress.current?.id || stages[stages.length - 1]?.id);
  const stage = stages.find(item => item.id === selected) || stages[0];
  const current = stages.find(item => item.current);
  const overdue = !progress.closed && !!job.dueDate && job.dueDate < today;
  const lab = labProgress(job);
  const scope = (job.requiredTests || []).map(test => test === "Other" ? job.otherTests?.trim() || "Other" : test);
  return <div className="job-flow-page">
    <div className="track-toolbar"><button type="button" className="outline-button" onClick={onBack}>← All jobs</button><div><button type="button" className="outline-button" onClick={() => setPreview(!preview)}>{preview ? "Back to workflow" : "Preview QR summary"}</button>{!preview && <button type="button" className="primary-button" onClick={() => onOpenStage(progress.current?.id || "closed")}>{progress.closed ? "Open job record" : "Continue · " + (current?.label || "")}</button>}</div></div>
    {preview ? <><p className="track-preview-note">Summary preview · Job details and progress only. Measurements, results, contacts, names, bottle serials and internal notes are excluded.</p><WorkflowSummary summary={jobSummary(job)} /></> : <>
      <section className="panel flow-header">
        <div className="flow-header-main"><span className="eyebrow">JOB WORKFLOW</span><h1>{job.id}</h1><p>{job.clientName} · {[job.fieldArea, job.wellMode === "multiple" ? job.wells?.filter(Boolean).join(", ") : job.well].filter(Boolean).join(" · ") || "Location not recorded"}</p></div>
        <div className="flow-header-status"><span className={"flow-pill large " + progress.tone}>{progress.statusLabel}</span>{overdue && <span className="flow-pill overdue">Overdue · due {job.dueDate}</span>}<div className="flow-percent"><span><i style={{ width: progress.percent + "%" }} /></span><strong>{progress.percent}%</strong></div></div>
        <dl className="flow-facts"><div><dt>Sampling</dt><dd>{job.samplingSource === "Other" && job.otherSamplingType ? "Other — " + job.otherSamplingType : job.samplingSource || "Not selected"}</dd></div><div><dt>Samples</dt><dd>{job.samples?.length || job.requestedSampleCount || 0}</dd></div><div><dt>Due date</dt><dd>{job.dueDate || "No due date"}</dd></div><div><dt>Lab work</dt><dd>{lab.label}{lab.total ? ` · ${lab.done}/${lab.total}` : ""}</dd></div></dl>
        <div className="flow-scope"><small>Scope of work</small><div>{scope.length ? scope.map(item => <span key={item} className="scope-chip">{item}</span>) : <span className="scope-chip missing">Not recorded</span>}</div></div>
      </section>
      <section className="panel flow-panel">
        <StageTracker stages={stages} selected={stage?.id} onSelect={setSelected} />
        {current && <div className="flow-now"><div><small>Current stage</small><strong>{current.label}</strong></div><div><small>Responsible</small><strong>{current.ownerName}</strong></div><div><small>Next action</small><strong>{current.nextAction}</strong></div></div>}
        {!current && <div className="flow-now done"><div><small>Job status</small><strong>All required work is complete</strong></div></div>}
      </section>
      {stage && <StageDetail stage={stage} actionLabel={stageActionLabel[stage.id as StageId]} onAction={() => onOpenStage(stage.id as StageId)} />}
      <details className="panel track-history"><summary>Progress history · {job.workflowHistory?.length || 0}</summary>{job.workflowHistory?.length ? <ol>{[...job.workflowHistory].reverse().map((event, index) => <li key={index}><span className={"track-dot " + event.state} /><div><strong>{event.label}</strong><span>{stateLabel[event.state]}</span></div><time>{new Date(event.at).toLocaleString()}</time></li>)}</ol> : <p>Status history will appear as the team updates this job.</p>}</details>
    </>}
    <JobQR job={job} />
  </div>;
}
