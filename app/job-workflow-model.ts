import { operationMilestones } from './operations-model';
import { roleHolder, storedResponsibilities } from "./authorization";
import { loadDirectory, initialDirectory } from "./employee-directory";
/** Employee records for resolving a configured duty; falls back to the seed list outside the browser. */
const loadEmployeesSafe = () => { try { return typeof window === "undefined" ? initialDirectory().employees : loadDirectory().employees; } catch { return []; } };
import type { JobRecord } from "./page";
import { currentProgress, labComplete, labProgress, labRequested, validationRequested, isValidationTest, scopeText } from "./lab-work";

export type TrackState = "pending" | "active" | "done";
export type TrackNode = { id: string; label: string; state: TrackState; detail?: string; children?: TrackNode[] };
export type TrackEvent = { label: string; state: TrackState; at: string };
export type JobSummary = { jobId: string; client: string; location: string; sampling: string; sampleCount: number; sampleTypes: { label: string; count: number }[]; nodes: TrackNode[]; history: TrackEvent[]; updatedAt: string; scopeMissing: boolean };
export const stateLabel: Record<TrackState, string> = { pending: "Not started", active: "In progress", done: "Done" };
/** Waiting reasons that may appear in a shared summary (no names, notes or results). */
export const waitingDetails = ["On hold", "Awaiting lab plan", "Awaiting samples", "Awaiting approval", "Awaiting assignment", "Not recorded"] as const;

export type StageId = "setup" | "sampling" | "delivery" | "lab" | "sampling-report" | "planning" | "reporting";
export type StageTask = { id: string; label: string; state: TrackState; status: string; owner?: string; group?: string; waiting?: string };
export type JobStage = { id: StageId; label: string; state: TrackState; waiting?: string; current: boolean; owner?: string; ownerFallback: string; nextAction: string; tasks: StageTask[]; done: number; total: number };
export type JobProgress = { stages: JobStage[]; current?: JobStage; closed: boolean; percent: number; statusLabel: string; tone: "closed" | "waiting" | "active" | "pending" };

export function combine(nodes: TrackNode[]): TrackState {
  return nodes.length && nodes.every(node => node.state === "done") ? "done" : nodes.some(node => node.state !== "pending") ? "active" : "pending";
}
export function leafNodes(nodes: TrackNode[]): TrackNode[] { return nodes.flatMap(node => node.children?.length ? leafNodes(node.children) : [node]); }
const combineTasks = (tasks: StageTask[]): TrackState => combine(tasks.map(task => ({ id: task.id, label: task.label, state: task.state })));

/** One connected job journey, built only from the work this job actually requires. */
export function jobStages(job: JobRecord): JobStage[] {
  const stage = (name: string): TrackState => {
    const value = job.stages?.find(item => item.name === name)?.status;
    return value === "Completed" || value === "Skipped" ? "done" : value === "In Progress" ? "active" : "pending";
  };
  const statusOf = (state: TrackState) => stateLabel[state];
  const transfer = /Transfer/.test(job.samplingSource || "");
  const lab = labRequested(job);
  const team = job.teamWork || {};
  const legacyDelivered = false; // Laboratory progress is not evidence of physical sample receipt.
  const stages: Omit<JobStage, "current">[] = [];

  // 1 · Job setup
  const setupTasks: StageTask[] = [
    { id: "setup:created", label: "Job created", state: "done", status: "Done" },
    { id: "setup:scope", label: "Scope of work recorded", state: lab ? "done" : "pending", status: lab ? (job.requiredTests || []).length + " item(s) selected" : "Not recorded" },
  ];
  stages.push({ id: "setup", label: "Job Setup", state: combineTasks(setupTasks), owner: job.jobResponsibleId || job.responsibleId, ownerFallback: "Job coordinator", nextAction: lab ? "No action required" : "Record the scope of work", tasks: setupTasks, done: 0, total: 0 });

  // 2 · Sampling (incl. sampling report)
  const samples = job.samples || [];
  const sheetsDone = samples.filter(sample => sample.dataComplete).length;
  const report = job.report?.reportStatus;
  // A blank default report object is not a started report.
  const reportStarted = !!(job.report && (job.report.summary?.trim() || job.report.preparedBy || report !== "Draft"));
  const reportState: TrackState = report === "Completed" && !!job.report?.approvedAt && !!job.report?.approvedBy ? "done" : reportStarted || stage("Report Preview") !== "pending" ? "active" : "pending";
  const samplingTasks: StageTask[] = [
    { id: "sampling:preparation", label: transfer ? "Transfer preparation" : job.samplingRequired === false ? "Pre-job coordination" : "Sampling preparation", state: stage("Sampling Preparation"), status: statusOf(stage("Sampling Preparation")), owner: team.sampling?.owner || job.assignedEngineerId },
    { id: "sampling:data", label: transfer ? "Sample transfer data" : "Sample data sheets", state: stage("Sampling Data"), status: samples.length ? `${sheetsDone} / ${samples.length} sheets complete` : statusOf(stage("Sampling Data")), owner: team.sampling?.owner || job.assignedEngineerId },
    { id: "sampling:report", label: "Sampling report", state: reportState, status: report === "Awaiting Approval" ? "Awaiting approval" : reportState === "done" ? "Approved" : report === "Completed" ? "Legacy approval evidence not recorded" : reportState === "active" ? "Draft" : statusOf(reportState), owner: report === "Awaiting Approval" ? roleHolder(storedResponsibilities(), "samplingApproval", loadEmployeesSafe()) || undefined : job.report?.preparedBy, ...(report === "Awaiting Approval" ? { waiting: "Awaiting approval" } : {}) },
  ];
  if (lab && job.samplingRequired !== false) {
    const handed = !!team.sampling?.completedAt || legacyDelivered;
    samplingTasks.push({ id: "sampling:handover", label: "Handover to driver", state: handed ? "done" : "pending", status: team.sampling?.completedAt ? "Done" : legacyDelivered ? "Not recorded" : "Not handed over", owner: team.sampling?.owner });
  }
  const samplingNext = samplingTasks.find(task => task.state !== "done");
  stages.push({
    id: "sampling", label: transfer ? "Sample Transfer" : "Sampling", state: combineTasks(samplingTasks),
    waiting: samplingNext?.waiting, owner: samplingNext?.id === "sampling:report" ? samplingNext.owner || team.sampling?.owner || job.assignedEngineerId : team.sampling?.owner || job.assignedEngineerId || job.responsibleId, ownerFallback: "Sampling team",
    nextAction: !samplingNext ? "No action required"
      : samplingNext.id === "sampling:preparation" ? (job.samplingRequired === false ? "Complete pre-job coordination" : "Complete sampling preparation")
      : samplingNext.id === "sampling:data" ? "Complete sample data sheets"
      : samplingNext.id === "sampling:report" ? (report === "Awaiting Approval" ? "Approve the sampling report" : "Prepare and submit the sampling report")
      : team.sampling?.owner ? "Hand samples over to the driver" : "Sampling team to accept ownership",
    tasks: samplingTasks, done: 0, total: 0,
  });

  if (lab) {
    // 3 · Delivery to laboratory
    const delivered = !!team.transport?.completedAt || legacyDelivered;
    const deliveryTasks: StageTask[] = [
      { id: "delivery:accepted", label: "Driver accepts delivery", state: team.transport?.owner || delivered ? "done" : "pending", status: team.transport?.owner ? "Accepted" : legacyDelivered ? "Not recorded" : "Waiting", owner: team.transport?.owner },
      { id: "delivery:delivered", label: "Delivered to laboratory", state: delivered ? "done" : team.transport?.owner ? "active" : "pending", status: team.transport?.completedAt ? "Delivered" : legacyDelivered ? "Not recorded" : team.transport?.owner ? "In transit" : "Not started", owner: team.transport?.owner },
    ];
    stages.push({ id: "delivery", label: "Delivery to Lab", state: combineTasks(deliveryTasks), owner: team.transport?.owner || job.assignedDriverId, ownerFallback: "Transport team", nextAction: delivered ? "No action required" : team.transport?.owner ? "Confirm delivery to the laboratory" : "Driver to accept the delivery", tasks: deliveryTasks, done: 0, total: 0 });

    // 4 · PVT Lab — only the work Ahmed assigned counts
    const progress = labProgress(job);
    let labTasks: StageTask[];
    if (job.labPlan) {
      labTasks = progress.items.map(item => {
        const status = item.progress.status;
        return { id: "lab:" + item.key, label: item.label, group: item.kind === "validation" ? "Validation" : "Detailed tests", owner: item.assignee,
          state: status === "Completed" ? "done" : status === "Not started" ? "pending" : "active",
          status: status === "Not started" ? (item.assignee ? "Assigned · not started" : "Awaiting assignment") : status,
          ...(status === "On hold" ? { waiting: "On hold" } : !item.assignee && status === "Not started" ? { waiting: "Awaiting assignment" } : {}) };
      });
    } else {
      // Requested work is visible immediately, but nothing is counted until the plan is saved.
      labTasks = [...new Set(job.requiredTests || [])].map(test => {
        const saved = currentProgress(job, test).status;
        const validation = isValidationTest(test);
        return { id: "lab:requested:" + test, label: validation ? "Validation · steps to be selected" : scopeText(job, test), group: validation ? "Validation" : "Detailed tests",
          state: saved === "Completed" ? "done" : saved === "Not started" ? "pending" : "active", status: saved === "Not started" ? "Awaiting assignment" : saved + " (recorded before planning)", waiting: saved === "Not started" ? "Awaiting assignment" : undefined };
      });
    }
    const complete = labComplete(job);
    const waiting = complete ? undefined : !job.labPlan ? "Awaiting lab plan" : progress.state === "on-hold" ? "On hold" : !delivered ? "Awaiting samples" : progress.state === "awaiting-assignment" ? "Awaiting assignment" : undefined;
    const remaining = progress.total - progress.done;
    stages.push({
      id: "lab", label: "PVT Lab", state: complete ? "done" : labTasks.some(task => task.state !== "pending") ? "active" : "pending", waiting,
      owner: team.analysis?.owner || job.labPlan?.savedBy, ownerFallback: "PVT lab team",
      nextAction: complete ? "No action required"
        : !job.labPlan ? (validationRequested(job) ? "Select validation steps and assign lab work" : "Assign the requested lab tests")
        : progress.state === "awaiting-assignment" ? "Assign the remaining lab items"
        : !delivered ? "Plan ready · awaiting sample delivery"
        : progress.state === "on-hold" ? "Resolve lab items on hold"
        : `Complete ${remaining} remaining lab item${remaining === 1 ? "" : "s"}`,
      tasks: labTasks, done: progress.done, total: progress.total,
    });
  }

  const currentIndex = stages.findIndex(item => item.state !== "done");
  return stages.map((item, index) => {
    const countable = item.id === "lab" ? null : item.tasks;
    return { ...item, current: index === currentIndex, done: countable ? countable.filter(task => task.state === "done").length : item.done, total: countable ? countable.length : item.total };
  });
}

export function jobProgress(job: JobRecord): JobProgress {
  if(job.operations){const milestones=operationMilestones(job);const closed=milestones.every(m=>m.done);const current=milestones.find(m=>!m.done);const stages:JobStage[]=milestones.filter(m=>m.id!=='completion').map(m=>({id:(m.id==='scope'?'planning':m.id==='laboratory'?'lab':m.id==='handover'?'delivery':m.id==='overview'?'setup':m.id) as StageId,label:m.label,state:m.done?'done':m.id===current?.id?'active':'pending',current:m.id===current?.id,owner:m.owner,ownerFallback:'Responsible team',nextAction:m.next,tasks:[],done:m.done?1:0,total:1}));return {stages,current:stages.find(s=>s.current),closed,percent:Math.round(100*milestones.filter(m=>m.done).length/milestones.length),statusLabel:closed?'Closed':current?.label||'In progress',tone:closed?'closed':'active'};}

  const stages = jobStages(job);
  const current = stages.find(stage => stage.current);
  const closed = !current;
  const fractions = stages.map(stage => stage.state === "done" ? 1 : stage.total ? stage.done / stage.total : 0);
  const percent = closed ? 100 : Math.round(100 * fractions.reduce((sum, value) => sum + value, 0) / Math.max(1, fractions.length));
  const statusLabel = closed ? "Closed" : current.waiting ? current.waiting : current.label + (current.state === "active" ? " in progress" : " · not started");
  return { stages, current, closed, percent: closed ? 100 : Math.min(99, percent), statusLabel, tone: closed ? "closed" : current.waiting ? "waiting" : current.state === "active" ? "active" : "pending" };
}

/** Privacy-safe tree for history tracking and the shared QR summary (no names, notes or results). */
export function workflowNodes(job: JobRecord): TrackNode[] {
 if(job.operations)return operationMilestones(job).map(m=>({id:m.id,label:m.label,state:m.done?'done':'pending'}));

  const safe = (detail?: string) => detail && (waitingDetails as readonly string[]).includes(detail) ? { detail } : {};
  return jobStages(job).map(stage => {
    const leaf = (task: StageTask): TrackNode => ({ id: task.id, label: task.label, state: task.state, ...safe(task.waiting) });
    const groups = stage.id === "lab" ? [...new Set(stage.tasks.map(task => task.group || "Lab work"))] : [];
    const children = groups.length ? groups.map(group => { const items = stage.tasks.filter(task => (task.group || "Lab work") === group).map(leaf); return { id: "lab-group:" + group, label: group, state: combine(items), children: items }; }) : stage.tasks.map(leaf);
    return { id: stage.id, label: stage.label, state: stage.state, ...safe(stage.waiting), children };
  });
}
export function trackChanges(next: JobRecord, previous?: JobRecord): JobRecord {
  const oldNodes = new Map(leafNodes(previous ? workflowNodes(previous) : []).map(node => [node.id, node.state]));
  const changes = leafNodes(workflowNodes(next)).filter(node => previous ? oldNodes.has(node.id) ? oldNodes.get(node.id) !== node.state : node.state !== "pending" : node.state !== "pending").map(node => ({ label: node.label, state: node.state, at: next.lastUpdatedAt }));
  return { ...next, workflowHistory: [...(next.workflowHistory || previous?.workflowHistory || []), ...changes].slice(-100) };
}
const natureNames: Record<string, string> = { OIL: "Oil", GAS: "Gas", WATER: "Water", CONDENSATE: "Condensate", BHS: "Bottomhole", SPMC: "SPMC field", MPSR: "MPSR transfer", WHS: "Wellhead", SEP: "Separator", STN: "Station", MDT: "MDT transfer" };
export function jobSummary(job: JobRecord): JobSummary {
  const types = new Map<string, number>();
  for (const sample of job.samples || []) {
    const nature = sample.fieldData?.sampleNature?.trim();
    const label = nature ? natureNames[nature.toUpperCase()] || "Other sample type" : "Type not recorded";
    types.set(label, (types.get(label) || 0) + 1);
  }
  return { jobId: job.id, client: job.clientName, location: [job.fieldArea, job.wellMode === "multiple" ? job.wells?.filter(Boolean).join(", ") : job.well].filter(Boolean).join(" · ") || "Not recorded", sampling: job.samplingSource || "Not recorded", sampleCount: job.samples?.length || Number(job.requestedSampleCount) || 0, sampleTypes: [...types].map(([label, count]) => ({ label, count })), nodes: workflowNodes(job), history: job.workflowHistory || [], updatedAt: job.lastUpdatedAt, scopeMissing: !(job.requiredTests || []).length };
}
