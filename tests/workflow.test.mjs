import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { build } from "esbuild";
const moduleUrl = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64");
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" }); return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")); };
const model = await bundle("app/job-workflow-model.ts");
const lab = await bundle("app/lab-work.ts");
const { sanitizeSummary } = await import(moduleUrl(fs.readFileSync(new URL("../app/summary-validation.ts", import.meta.url), "utf8")));
export const fixture = { id: "TEST-JOB", clientName: "Test client", fieldArea: "Test field", samplingRequired: true, samplingSource: "Wellhead Sampling", requiredTests: ["Black Oil — Validation", "Black Oil — Viscosity"], samples: [{ fieldData: { sampleNature: "WHS", bhp: "SECRET-PRESSURE" }, bottleSerial: "SECRET-SERIAL", notes: "SECRET-NOTES" }], clientFocalPointEmail: "SECRET-CONTACT", scopeOfWorkAttachment: { dataUrl: "SECRET-ATTACHMENT" }, report: { summary: "SECRET-REPORT" }, stages: [{ name: "Sampling Preparation", status: "In Progress" }, { name: "Sampling Data", status: "Not Started" }, { name: "Report Preview", status: "Completed" }, { name: "Final Report", status: "Completed" }], lastUpdatedAt: "2026-09-22T10:00:00.000Z" };
test("lab stage shows requested work but counts nothing until a plan is saved", () => { const nodes=model.workflowNodes(fixture); const lab=nodes.find(node=>node.id==="lab"); assert.deepEqual(lab.children.map(node=>node.label),["Validation","Detailed tests"]); assert.equal(lab.detail,"Awaiting lab plan"); assert.equal(lab.state,"pending"); const stage=model.jobStages(fixture).find(item=>item.id==="lab"); assert.equal(stage.total,0); assert.equal(model.combine(model.leafNodes(nodes)),"active"); });
test("lab progress updates its branch without making unfinished work complete", () => { const job={...fixture,labPlan:{validationSteps:["Flash"],tests:["Black Oil — Viscosity"],assignees:{}},labTests:{"validation:Flash":{scopeText:"validation:Flash",status:"Completed"},"Black Oil — Viscosity":{scopeText:"Black Oil — Viscosity",status:"On hold"}}}; const nodes=model.workflowNodes(job); const lab=nodes.find(node=>node.id==="lab"); assert.equal(lab.state,"active"); assert.equal(lab.detail,"On hold"); assert.equal(model.leafNodes(nodes).find(node=>node.label==="Viscosity"||node.label==="Black Oil — Viscosity").detail,"On hold"); });
test("transfer jobs show transfer rather than field collection",()=> { const stages=model.jobStages({...fixture,samplingRequired:false,samplingSource:"Open Hole (MPSR - Lab Transfer)"}); const sampling=stages.find(stage=>stage.id==="sampling"); assert.equal(sampling.label,"Sample Transfer"); assert.equal(sampling.tasks[1].label,"Sample transfer data"); assert.ok(!sampling.tasks.some(task=>task.id==="sampling:handover")); });
test("summary never carries detailed job data",()=> { const summary=model.jobSummary(fixture); assert.equal(summary.sampleCount,1); assert.deepEqual(summary.sampleTypes,[{label:"Wellhead",count:1}]); assert.doesNotMatch(JSON.stringify(summary),/SECRET/); });
test("status history records transitions once without copying activity notes",()=> { const first=model.trackChanges(fixture); const unchanged=model.trackChanges(first,first); assert.deepEqual(unchanged.workflowHistory,first.workflowHistory); const changed=model.trackChanges({...first,stages:first.stages.map(node=>node.name==="Sampling Preparation"?{...node,status:"Completed"}:node)},first); assert.equal(changed.workflowHistory.length,first.workflowHistory.length+1); assert.deepEqual(changed.workflowHistory.at(-1),{label:"Sampling preparation",state:"done",at:fixture.lastUpdatedAt}); });
test("server allowlist removes injected fields at every level",()=> { const summary=model.jobSummary(fixture); summary.secret="SECRET"; summary.nodes[0].notes="SECRET"; const sanitized=sanitizeSummary(summary); assert.doesNotMatch(JSON.stringify(sanitized),/SECRET/); assert.throws(()=>sanitizeSummary({...summary,nodes:[{id:"x",label:"x",state:"approved"}]})); });
test("changing custom scope resets stale progress",()=> { const nodes=model.workflowNodes({...fixture,requiredTests:["Other"],otherTests:"Changed scope",labPlan:{validationSteps:[],tests:["Other"],assignees:{}},labTests:{Other:{scopeText:"Old scope",status:"Completed"}}}); assert.equal(model.leafNodes(nodes).find(node=>node.id==="lab:Other").state,"pending"); });

const done = (key) => ({ scopeText: key, status: "Completed", notes: "" });
const delivered = { sampling: { owner: "MOHSIN", completedAt: "1" }, transport: { owner: "ALI", completedAt: "2" }, analysis: { owner: "AHAD" } };
const allSteps = ["Sample Transfer","Opening Pressure","Restoration","Water Check","Agitation","Charging","Flash","PV","Direct Density","Recombination"];
test("validation selected: job appears for the lab awaiting assignment, with no checklist assigned", () => {
  const p = lab.labProgress(fixture); assert.equal(p.state, "awaiting-plan"); assert.equal(p.total, 0);
  assert.equal(lab.labComplete(fixture), false);
});
test("a chosen subset of validation steps is tracked in the defined order", () => {
  const job = { ...fixture, labPlan: { validationSteps: ["Flash", "Opening Pressure", "Sample Transfer"], tests: ["Black Oil — Viscosity"], assignees: { "validation:Flash": "AHAD" } } };
  assert.deepEqual(lab.planKeys(job), ["validation:Sample Transfer", "validation:Opening Pressure", "validation:Flash", "Black Oil — Viscosity"]);
  assert.equal(lab.labProgress(job).state, "awaiting-assignment");
  const assigned = { ...job, labPlan: { ...job.labPlan, assignees: Object.fromEntries(lab.planKeys(job).map((key) => [key, "AHAD"])) } };
  assert.equal(lab.labProgress(assigned).state, "assigned");
});
test("only assigned work contributes to lab progress", () => {
  const job = { ...fixture, labPlan: { validationSteps: ["Sample Transfer", "Flash", "PV"], tests: ["Black Oil — Viscosity"], assignees: {} }, labTests: { "validation:Sample Transfer": done("validation:Sample Transfer"), "validation:Flash": done("validation:Flash"), "Black Oil — Viscosity": done("Black Oil — Viscosity") } };
  const p = lab.labProgress(job); assert.equal(p.done, 3); assert.equal(p.total, 4); assert.equal(lab.labComplete(job), false);
  const stage = model.jobStages(job).find((item) => item.id === "lab"); assert.equal(stage.done, 3); assert.equal(stage.total, 4);
});
test("a job without Validation in scope never gets a validation checklist", () => {
  const job = { ...fixture, requiredTests: ["Black Oil — DL"], labPlan: { validationSteps: allSteps, tests: ["Black Oil — DL"], assignees: {} } };
  assert.deepEqual(lab.planKeys(job), ["Black Oil — DL"]);
  assert.ok(!model.jobStages(job).find((item) => item.id === "lab").tasks.some((task) => task.group === "Validation"));
});
test("a job is not closed while assigned lab work remains, and closes when everything is done", () => {
  const base = { ...fixture, teamWork: delivered, stages: fixture.stages.map((stage) => ({ ...stage, status: "Completed" })), report: { reportStatus: "Completed", approvedBy:"SALIM", approvedAt:"2026-09-22T10:00:00Z" }, labPlan: { validationSteps: ["Flash"], tests: ["Black Oil — Viscosity"], assignees: {} } };
  const open = model.jobProgress({ ...base, labTests: { "validation:Flash": done("validation:Flash") } });
  assert.equal(open.closed, false); assert.equal(open.current.id, "lab"); assert.ok(open.percent < 100);
  const closed = model.jobProgress({ ...base, labTests: { "validation:Flash": done("validation:Flash"), "Black Oil — Viscosity": done("Black Oil — Viscosity") } });
  assert.equal(closed.closed, true); assert.equal(closed.percent, 100);
});
test("plan changes keep progress of retained items and remove only deselected ones", () => {
  const job = { ...fixture, labPlan: { validationSteps: ["Flash"], tests: [], assignees: {} }, labTests: { "validation:Flash": done("validation:Flash"), "validation:PV": done("validation:PV"), "Black Oil — Validation": done("Black Oil — Validation") } };
  assert.deepEqual(Object.keys(lab.reconcileLabScope(job).labTests).sort(), ["Black Oil — Validation", "validation:Flash"]);
});
test("shared summary accepts the waiting reasons but nothing else", () => {
  const summary = sanitizeSummary(model.jobSummary(fixture)); assert.equal(summary.nodes.find((node) => node.id === "lab").detail, "Awaiting lab plan");
  const injected = model.jobSummary(fixture); injected.nodes[0].detail = "SECRET"; assert.equal(sanitizeSummary(injected).nodes[0].detail, undefined);
});

test('legacy stage completion cannot manufacture report approval or physical receipt',()=>{const j={...fixture,report:{reportStatus:'Completed'},labTests:{'Black Oil — Viscosity':{status:'In progress',scopeText:'Black Oil — Viscosity'}}};const stages=model.jobStages(j);assert.notEqual(stages.find(s=>s.id==='sampling').tasks.find(t=>t.id==='sampling:report').state,'done');assert.notEqual(stages.find(s=>s.id==='delivery').state,'done');});
