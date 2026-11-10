import type { ReportLetterhead } from './sampling-report-model';
import type { JobRecord } from './page';
import { defaultResponsibilities, explicitPermissions, roleHolder, storedResponsibilities, responsibilityLabels, type Authorization, type Permission, type Responsibilities, type Responsibility } from './authorization';
import type { Employee } from './employee-directory';
import { containerId, containerLabel, isGlass, type ContainerType } from './sample-container';
import { isValidationTest, validationStepNames } from './lab-work';
import { catalogueIds } from './test-catalogue';
import type { TestRouting } from './test-routing';
import { preparationDone } from './sampling-validation';
import type { LabTeams } from './lab-teams';
import { needsReview, type FluidType } from './scope-catalogue';
import { normalizeEstimate, estimateKeyPattern, type ScheduleEstimate } from './schedule-estimate';
import { teamName } from './team-name';
export type Stream = 'PVT' | 'Chemical';
/** Team lead who plans, assigns and reviews each laboratory workstream. */
export const streamLead = (stream:Stream):Responsibility=>stream==='PVT'?'pvtTeamLead':'chemicalTeamLead';
/** Workbook Submitted = awaiting team-lead review; Changes Requested = returned to the employee; QC Returned = back with the team lead; Completed = QC approved. */
export type WorkState = 'Unassigned' | 'Scheduled' | 'In Progress' | 'Workbook Submitted' | 'Changes Requested' | 'Awaiting QC' | 'QC Returned' | 'Completed';
export type FileVersion = { id:string; name:string; size:number; type:string; version:number; submittedBy:string; submittedAt:string; status:'Available'|'Changes Requested'; comments:string; /** Sheet, section or attachment reference named in a return. */target?:string; leadApprovedBy?:string; leadApprovedAt?:string; qcApprovedBy?:string; qcApprovedAt?:string; qcReturnedBy?:string; qcReturnedAt?:string; qcComments?:string };
export type ActivityEvent = { at:string; by:string; action:'assigned'|'reassigned'|'submitted'|'lead-approved'|'lead-returned'|'qc-approved'|'qc-returned'|'dispatched'|'results-received'|'planned'; version?:number; target?:string; comments?:string; from?:string; to?:string };
export type ActivityRecord = { id:string; scopeId:string; /** Shared by the PVT and Chemistry items created for one test sent to both sections. */linkId?:string; sampleId:string; title:string; stream:Stream; owner:string; start:string; due:string; conditions:string; notes:string; status:WorkState; files:FileVersion[]; required:boolean; kind?:'validation'|'analysis'; /** Assignment, submission and review decisions, oldest first. */history?:ActivityEvent[]; /** The assigned employee's own progress notes; notes keep the team lead's instructions. */progressNotes?:string; /** A job-specific test entered in the scope (never added to the global catalogue). */custom?:boolean; /** Performed by a third-party laboratory; the owner is the internal coordinator. Absent = performed internally. */external?:ExternalWork };
/** Third-party execution of one activity. Recording only: nothing is sent to the provider. */
export type ExternalWork = { provider:string; notes:string; expectedReturn:string; sentOn?:string; sentAt?:string; sentBy?:string; dispatchNotes?:string; receivedOn?:string; receivedAt?:string; receivedBy?:string };
/** Who performs a selected test. Third-party work keeps an internal owner (the coordinator) and the normal team review. */
export type ExecutionChoice = { by:'Internal'|'Third-party'; provider?:string; /** Optional at scope time; otherwise the team lead assigns the coordinator. */coordinator?:string; notes?:string; expectedReturn?:string };
export type CustomTest = { /** Stable ID kept through drafts, release and tracking. */id:string; name:string; notes:string; team:Destination; execution?:ExecutionChoice };
export type ScopeRecord = { id:string; linkId?:string; title:string; sampleIds:string[]; stream:Stream; notes:string; addedBy:string; at:string; reason:string; source:'Original request'|'Additional work'; /** Validation requested for the sample; the PVT Team Lead chooses the steps. */validationRequest?:boolean; plannedBy?:string; plannedAt?:string };
export type ReportVersion = { version:number; status:'Draft'|'Checking'|'Awaiting Approval'|'Changes Requested'|'Approved'; text:string; preparedBy:string; preparedAt:string; checker:string; checkedAt?:string; submittedAt?:string; approvedBy?:string; approvedAt?:string; comments:string; snapshot:string; file?:FileVersion;
 /** Sampling reports: details outside the sample evidence (installation, client branding, company, names/titles), saved with the version and frozen at approval. Missing on versions saved before it existed. */
 letterhead?:ReportLetterhead };
export type Destination = Stream | 'Both';
/** One sample in a laboratory-scope version. Container details are copied so issued documents never change. */
export type SampleScope = { sampleId:string; containerType:ContainerType; containerLabel:string; destination:Destination; pvtTests:string[]; chemicalTests:string[]; notes:string; excluded:boolean; exclusionReason:string;
 /** Not set on older records: never guessed, requested when the scope is next edited. */fluidType?:FluidType; fluidDescription?:string; fluidNotes?:string;
 /** Validation required for this sample. Older records express it as a catalogue "— Validation" test instead. */validation?:boolean;
 customTests?:CustomTest[]; /** Per catalogue test; a missing entry means performed internally. */execution?:Record<string,ExecutionChoice>;
 /** Tests without a default team whose team the scope owner chose explicitly (draft aid; the team itself is the test lists). */teamChosen?:string[] };
/** Tests with no default team (Unassigned in Settings) on a sample sent to both teams, still waiting for the scope owner's team choice. Released tests keep their team. */
export const teamChoicesNeeded=(s:Pick<SampleScope,'pvtTests'|'chemicalTests'|'destination'|'excluded'|'teamChosen'>,routing:TestRouting|null|undefined,previous?:Pick<SampleScope,'pvtTests'|'chemicalTests'>)=>s.excluded||s.destination!=='Both'||!routing?[]:[...new Set([...s.pvtTests,...s.chemicalTests])].filter(id=>!isValidationTest(id)&&!routing[id]&&!(s.teamChosen||[]).includes(id)&&!(previous&&[...previous.pvtTests,...previous.chemicalTests].includes(id)));
/** Per-sample laboratory scope selected after sampling-report approval. Released versions are never edited. */
export type LabScopeVersion = { version:number; status:'Draft'|'Released'; samples:SampleScope[]; conditions:Operations['conditions']; /** Test routing in force when this version was saved or released. */routing:TestRouting; reason:string; preparedBy:string; savedAt:string; releasedBy?:string; releasedAt?:string; job:{jobNumber:string;clientName:string;fieldArea:string;well:string;samplingSource:string} };
/** A reviewer comment pointing at the job, a section, or a sample (target ids from reviewTargets). */
export type ReviewComment = { target:string; label:string; text:string };
/** One submission of sampling data and its review. Data approval is separate from sampling-report approval. */
export type DataReview = { version:number; status:'Submitted'|'Returned'|'Approved'|'Reopened'; submittedBy:string; submittedAt:string; snapshot:string; note:string; reviewedBy?:string; reviewedAt?:string; general?:string; comments:ReviewComment[]; reopenedBy?:string; reopenedAt?:string; reason?:string };
export type Operations = { version:1; labScopes?:LabScopeVersion[]; samplingData?:DataReview[]; revision:number; originalRequest:string[]; scope:ScopeRecord[]; activities:ActivityRecord[]; conditions:{pressure:string;pressureUnit:string;temperature:string;temperatureUnit:string;notes:string}; scopeConfirmedAt?:string; dispatchedAt?:string; dispatchedBy?:string; samplingReports:ReportVersion[]; finalReports:ReportVersion[]; handover?:{sampleIds:string[];/** Container identifier per sample (bottle serial or glass-container ID). */bottles:Record<string,string>;containerTypes?:Record<string,ContainerType>;sentBy:string;sentAt:string;receivedBy?:string;receivedAt?:string;notes:string}; additions:{id:string;title:string;reason:string;by:string;at:string;confirmedAt?:string;destination?:Destination}[]; history:{at:string;by:string;action:string;reason:string}[];
 /** When the accountable sampling employee pressed Start job. */samplingStart?:{by:string;at:string};
 /** Backup sampling employees who may also work on the sampling (set in Job access). Others in the sampling team only view the job. */samplingEditors?:string[];
 /** Planning estimates for the job progress overview, keyed by progress row (schedule-estimate.ts). Never changes statuses or completion records. */progressPlan?:Record<string,ScheduleEstimate> };
export const clarificationItems = [
 ['initial-scope','Initial scope owner','Confirm who selects and signs off the initial request before sampling. Existing job-creation permissions remain in use.'],
 ['sampling-review','Sampling preparer and checker','Confirm eligibility and independence rules. A named active preparer and checker are required; the checker forwards the reviewed version to the sampling approver.'],
 ['lab-entry','Laboratory entry dependency','Confirm whether laboratory execution may start before approved sampling reports or physical receipt. These milestones are displayed separately; no new automatic execution gate is inferred.'],
 ['validation-rules','Validation applicability','Confirm which steps are mandatory and whether individual steps may be omitted. The supplied sequence is generated per sample; no automatic omission rule is applied.'],
 ['validation-source','Other sampling types','Validation sequences are supplied for Bottom-hole, Wellhead and Separator only. Confirm the sequence for other sampling or transfer methods before confirming their Validation scope.'],
 ['bv','PV terminology in older records','Validation uses PV. Older records are preserved exactly as saved; confirm before reconciling any historical PV entries.'],
 ['workbook-review','Workbook review ownership','Team leads review workbooks. QC review is a separate responsibility that stays unassigned until configured in Settings; no QC identity is invented.'],
 ['final-review','Final preparation / review overlap','Ahmed prepares and reviews the final report; Wilfred approves. Confirm whether an independent reviewer is additionally required.'],
 ['scope-additions','Scope addition authority','Confirm who may authorize additional work. Requests are recorded and the scope selector explicitly confirms lab scope; planning remains with the PVT and Chemistry Team Leads.'],
 ['partial-handover','Partial sample shipments','This handover records all job cylinders together. Confirm partial-shipment and receipt rules before splitting a transfer.'],
 ['multi-owner','Multiple-person activities','The existing model has one accountable employee per activity. Confirm how shared execution should be represented before adding multiple owners.'],
 ['legacy','Legacy records','Historical assignments, reports and lab work remain unchanged. Unrecorded checking, physical receipt and approval evidence are not inferred.'],
] as const;
export function validationSequence(source:string):string[] {
 const base=['Opening Pressure','Restoration','Water Check','Agitation','Charging','Flash','PV','Direct Density'];
 if(/Bottomhole|Downhole|Bottom-hole|Cased Hole/i.test(source))return ['Sample Transfer',...base];
 if(/Wellhead/i.test(source))return base;
 if(/Separator/i.test(source))return [...base,'Recombination'];
 return [];
}
/** Older records named the PVT stream "BVT"; they are read as PVT without being rewritten until the next save. */
const pvtStream=<T extends {stream:string}>(item:T):T=>item.stream==='BVT'?{...item,stream:'PVT'}:item;
export function operationsFor(job:JobRecord):Operations {
 if(job.operations&&[...job.operations.scope,...job.operations.activities].some(i=>(i.stream as string)==='BVT'))return {...job.operations,scope:job.operations.scope.map(pvtStream),activities:job.operations.activities.map(pvtStream)};
 return job.operations || {version:1,revision:0,originalRequest:[...(job.requiredTests||[])],scope:[],activities:[],conditions:{pressure:'',pressureUnit:'psi',temperature:'',temperatureUnit:'°C',notes:''},samplingReports:[],finalReports:[],additions:[],history:[]};
}
export const latest = (versions:ReportVersion[]):ReportVersion|undefined=>versions[versions.length-1];
/** Saved but not yet sent to Sampling. */
export const isDraft=(job:JobRecord)=>job.status==='Draft'&&!job.operations?.dispatchedAt;
/** Everyone assigned to sampling: the accountable lead first, then supporting members. */
export const samplingTeam=(job:JobRecord)=>[...new Set([job.assignedEngineerId||'',...(job.samplingTeamIds||[])].filter(Boolean))];
/** Who may work on the sampling: the accountable employee plus backups given edit access in Job access. Other backups only view the job. */
export const samplingWorkers=(job:JobRecord)=>{const team=samplingTeam(job);const editors=job.operations?.samplingEditors||[];return [...new Set([job.assignedEngineerId||'',...editors.filter(id=>team.includes(id))].filter(Boolean))];};
/** Sampling work starts when the accountable employee presses Start job. */
/** Jobs sent before Start job existed count as started only once preparation is completed or sampling data was submitted; anything earlier waits for Start job (entries already made are kept). */
export const samplingStarted=(job:JobRecord)=>!!job.operations?.samplingStart||!job.operations?.dispatchedAt||!!job.operations?.samplingData?.length||(job.stages||[]).some(s=>s.name==='Sampling Preparation'&&s.status==='Completed');
/** Who may change Job access: holders of Edit job access (Settings → Authorization). */
export const canManageJobAccess=(_job:JobRecord,actor:Actor)=>hasAccess(actor,'jobAccessEdit');
/** Who sees the Job access panel: holders of View or Edit job access. */
export const canViewJobAccess=(actor:Actor)=>hasAccess(actor,'jobAccessView')||hasAccess(actor,'jobAccessEdit');
/** Sampling data as submitted for review: samples, events, preparation and coordination. */
export const dataSnapshot=(job:JobRecord)=>JSON.stringify({samples:job.samples||[],events:job.events||[],coordinationTasks:job.coordinationTasks||[],coordinationDetails:job.coordinationDetails||{},preparation:job.stages?.find(s=>s.name==='Sampling Preparation')?.status||'',source:job.samplingSource||''});
export const latestData=(job:JobRecord)=>(operationsFor(job).samplingData||[]).at(-1);
/** Jobs whose sampling report flow started before data review keep their recorded path. */
export const dataReviewRequired=(job:JobRecord)=>{const o=operationsFor(job);return !!o.samplingData?.length||!o.samplingReports.length;};
/** Sampling data is read-only while submitted for review or approved. */
export const samplingDataLocked=(job:JobRecord)=>['Submitted','Approved'].includes(latestData(job)?.status||'');
export const releasedScopes=(job:JobRecord)=>(operationsFor(job).labScopes||[]).filter(v=>v.status==='Released');
export const latestLabScope=(job:JobRecord)=>(operationsFor(job).labScopes||[]).at(-1);
/** Required tests not yet QC approved. Work completed before QC existed keeps its recorded completion. */
export const testsAwaitingQcApproval=(job:JobRecord)=>operationsFor(job).activities.filter(a=>a.required&&a.status!=='Completed');
/** QC applies to per-sample scopes and to any laboratory work still open. Completed historical jobs are never asked for approvals they predate. */
export const qcRequired=(job:JobRecord)=>releasedScopes(job).length>0||testsAwaitingQcApproval(job).length>0;
export const qcPending=(job:JobRecord)=>testsAwaitingQcApproval(job).length>0;
export type LabStatus='Not assigned'|'In progress'|'Under team-lead review'|'Returned'|'Awaiting QC'|'QC approved';
export const labStatuses:LabStatus[]=['Not assigned','In progress','Under team-lead review','Returned','Awaiting QC','QC approved'];
/** One of six understandable states per test, mapped from the work state. QC Returned sits with the team lead. */
export function labStatus(a:ActivityRecord):LabStatus{
 if(a.status==='Completed')return 'QC approved';if(a.status==='Awaiting QC')return 'Awaiting QC';
 if(a.status==='Workbook Submitted'||a.status==='QC Returned')return 'Under team-lead review';
 if(a.status==='Changes Requested')return 'Returned';if(!a.owner)return 'Not assigned';return 'In progress';
}
/** The assignee's employee record is missing or inactive. Shown as a flag; the assignment is never changed automatically. Team membership does not limit assignment. */
export const teamMismatch=(a:ActivityRecord,_teams?:LabTeams|null,_roles?:Responsibilities,employees?:Employee[])=>!!a.owner&&a.status!=='Completed'&&!!employees&&!employees.some(e=>e.id===a.owner&&e.active);
/**
 * Everyone a lead or coordinator can assign: the full active employee directory, from every department, including the
 * lead themselves. The stream's team members and its lead come first. Assigning never grants a permission; the
 * assignment itself lets the employee act on that one task.
 */
export function assignmentEngineers(actor:Actor,stream?:Stream):string[]{
 const first=stream?[...(actor.teams?.[stream]||[]),holder(actor,streamLead(stream))]:[];
 return [...new Set([...first,...actor.employees.map(e=>e.id)].filter(Boolean))].filter(id=>actor.employees.some(e=>e.id===id&&e.active));
}
/** Passes with the area permission, or with job access when the employee is assigned to this exact work. */
function requireAssigned(actor:Actor,permission:Permission,assigned:boolean){if(!hasAccess(actor,permission)&&!(assigned&&hasAccess(actor,'jobDetails')))throw Error('This action is not assigned to your active profile or permission.');}
/** Work on this job that is assigned to the employee personally (sampling team, driver, laboratory owner). */
export function assignedWork(job:JobRecord,id:string){const o=operationsFor(job);return {sampling:samplingTeam(job).includes(id),driver:job.assignedDriverId===id,lab:o.activities.some(a=>a.owner===id)};}
export function samplingApproved(job:JobRecord):boolean { const reports=operationsFor(job).samplingReports;return reports.length?latest(reports)?.status==='Approved':job.report?.reportStatus==='Completed'&&!!job.report.approvedAt&&!!job.report.approvedBy; }
/** Sampling was approved in the older workflow, before dispatch records existed. No dispatch is fabricated. */
export function legacyDispatch(job:JobRecord):boolean { const o=operationsFor(job);return !o.dispatchedAt&&!o.samplingReports.length&&samplingApproved(job); }
export function allWorkDone(job:JobRecord):boolean {const o=operationsFor(job);return !!o.scopeConfirmedAt && !unplannedValidation(job).length && o.activities.filter(a=>a.required).every(a=>a.status==='Completed'&&a.files.some(f=>f.status==='Available')) && !o.additions.some(a=>!a.confirmedAt);}
export function finalReady(job:JobRecord):boolean {const o=operationsFor(job);const required=[...new Set(o.scope.flatMap(s=>s.sampleIds))];return allWorkDone(job)&&samplingApproved(job)&&!!o.handover?.receivedAt&&required.every(id=>o.handover!.sampleIds.includes(id));}
export function operationComplete(job:JobRecord):boolean {return finalReady(job)&&latest(operationsFor(job).finalReports)?.status==='Approved';}
/** A job that had an approved final report and now has further work open (e.g. Validation added later). Earlier versions stay unchanged. */
export function additionalWorkPending(job:JobRecord):boolean {return operationsFor(job).finalReports.some(r=>r.status==='Approved'&&!!r.approvedAt)&&!operationComplete(job);}
/** The full Validation catalogue in its logical order (guidance only). */
export const validationCatalogue=[...validationStepNames];
/** Validation is requested for a scope entry, by the new Yes/No control or (older records) a catalogue Validation test. */
export const entryValidation=(s:Pick<SampleScope,'pvtTests'|'chemicalTests'|'validation'>)=>!!s.validation||[...s.pvtTests,...s.chemicalTests].some(isValidationTest);
/** Validation scope records the PVT Team Lead plans: new requests, Validation added later, and older Validation scope. */
export const validationScopes=(job:JobRecord)=>operationsFor(job).scope.filter(r=>r.stream==='PVT'&&(r.validationRequest||r.id.startsWith('addval:')||isValidationTest(r.title)));
/** Validation requests whose steps the PVT Team Lead has not chosen yet. They stay open until planned. */
export const unplannedValidation=(job:JobRecord)=>operationsFor(job).scope.filter(r=>r.validationRequest&&!r.plannedAt);
/** A separately requested Recombination test on the same sample (kept distinct from a Validation Recombination step). */
export const separateRecombination=(job:JobRecord,sampleId:string)=>operationsFor(job).activities.filter(a=>a.sampleId===sampleId&&a.kind!=='validation'&&/Recombination$/.test(a.title));
/** One understandable external-work state, mapped onto the existing work states. Empty for internal work. */
export function externalStage(a:ActivityRecord):string{
 if(!a.external)return '';
 if(a.status==='Completed')return 'Completed';if(a.status==='Awaiting QC')return 'Internal review · QC';
 if(a.status==='Workbook Submitted'||a.status==='QC Returned')return 'Internal review';if(a.status==='Changes Requested')return 'Returned · internal review';
 if(!a.owner)return 'Awaiting coordinator';if(!a.external.sentAt)return 'Awaiting dispatch';if(!a.external.receivedAt)return 'Sent to third party · Awaiting results';return 'Results received';
}
export const externalLabel=(a:Pick<ActivityRecord,'external'>)=>a.external?'External · '+(a.external.provider||'provider not recorded'):'';
const externalFrom=(e?:ExecutionChoice):ExternalWork|undefined=>e?.by==='Third-party'?{provider:(e.provider||'').trim(),notes:(e.notes||'').trim(),expectedReturn:e.expectedReturn||''}:undefined;
export type Actor = { id:string; employees:Employee[]; policy:Authorization; roles?:Responsibilities; /** Current test routing; null when the saved settings cannot be read. */routing?:TestRouting|null; /** Laboratory team lists; null when the saved settings cannot be read. */teams?:LabTeams|null; /** Every job, for advisory schedule-overlap checks in pickers. */jobs?:JobRecord[]; /** Department names for grouping pickers. */departments?:{id:string;name:string}[] };
/** The valid holder of a duty for this actor's settings ('' when unassigned or invalid). */
export const holder=(actor:Actor,key:Responsibility)=>roleHolder(actor.roles||defaultResponsibilities,key,actor.employees);
export function hasAccess(actor:Actor,permission:Permission) {return actor.employees.some(e=>e.id===actor.id&&e.active)&&((actor.id==='MA001'&&!explicitPermissions.includes(permission))||actor.policy[permission].includes(actor.id));}
function requireAccess(actor:Actor,permission:Permission,id?:string){if(!hasAccess(actor,permission)||(id&&actor.id!==id))throw Error('This action is not assigned to your active profile or permission.');}
/** Draft jobs are visible to job creators, their author and the project administrator only. */
export const canSeeDraft=(job:JobRecord,actor:Actor)=>!isDraft(job)||actor.id===job.createdById||actor.id==='MA001'||hasAccess(actor,'createJob');
export const isTrashed=(job:JobRecord)=>!!job.trash;
/** Recoverable deletion: marks the job only. Samples, operations, files, reports and history stay in the record. */
export function trashJob(job:JobRecord,actor:Actor,now=new Date().toISOString()):JobRecord{
 if(!hasAccess(actor,'deleteJobs')||!canSeeDraft(job,actor))throw Error('You do not have permission to delete jobs.');
 if(job.trash)throw Error('This job is already in Trash.');
 return {...job,trash:{deletedBy:actor.id,deletedAt:now},trashLog:[...(job.trashLog||[]),{action:'deleted',by:actor.id,at:now}]};
}
export function restoreJob(job:JobRecord,actor:Actor,now=new Date().toISOString()):JobRecord{
 if(!hasAccess(actor,'deleteJobs')||!canSeeDraft(job,actor))throw Error('You do not have permission to restore jobs.');
 if(!job.trash)throw Error('This job is not in Trash.');
 const restored:JobRecord={...job,trashLog:[...(job.trashLog||[]),{action:'restored',by:actor.id,at:now}]};delete restored.trash;return restored;
}
function active(actor:Actor,id:string){if(!actor.employees.some(e=>e.id===id&&e.active))throw Error('Select an active employee.');}
/** Permission and duty must both pass. An unassigned duty blocks the action instead of opening it to everyone. */
function requireRole(actor:Actor,permission:Permission,...keys:Responsibility[]){requireAccess(actor,permission);const ids=keys.map(key=>holder(actor,key));if(ids.every(id=>!id))throw Error(responsibilityLabels[keys[0]]+' is not configured. Ask an administrator to assign it in Settings → Authorization.');if(!ids.includes(actor.id))throw Error('This action is not assigned to your active profile or permission.');}
/** Every duty resolved to a valid holder for this actor's settings. */
/** Who may enter or revise schedule estimates for a progress row: coordinator (createJob), scope selector or PVT Supervisor for any row; a team lead for their own stream; report preparation for the final report. */
export function estimatePlanner(actor:Actor,key:string):boolean{
 if(!hasAccess(actor,'jobDetails'))return false;
 const me=actor.id,is=(k:Responsibility)=>!!me&&holder(actor,k)===me;
 if(hasAccess(actor,'createJob')||is('scopeSelector')||is('pvtSupervisor'))return true;
 if(key.startsWith('lab:PVT:'))return is('pvtTeamLead')&&hasAccess(actor,'analysis');
 if(key.startsWith('lab:Chemical:'))return is('chemicalTeamLead')&&hasAccess(actor,'analysis');
 if(key==='report')return is('reporting')&&hasAccess(actor,'analysis');
 return false;
}
export const actorRoles=(actor:Actor)=>Object.fromEntries(Object.keys(responsibilityLabels).map(key=>[key,holder(actor,key as Responsibility)])) as Responsibilities;
function requireText(value:string,label:string){if(!value.trim())throw Error(label+' is required.');}
/** Validation steps for one sample, from its recorded sample nature or the job's sampling type. */
export function sampleSequence(job:JobRecord,sampleId:string){const nature=job.samples?.find(s=>s.id===sampleId)?.fieldData?.sampleNature;const source=({BHS:'Bottom-hole',WHS:'Wellhead',SEP:'Separator'} as Record<string,string>)[nature||'']||job.samplingSource||'';return validationSequence(source);}
const streamsOf=(d:Destination):Stream[]=>d==='Both'?['PVT','Chemical']:[d];
const testsIn=(s:Pick<SampleScope,'pvtTests'|'chemicalTests'>,stream:Stream)=>stream==='PVT'?s.pvtTests:s.chemicalTests;
/** Work already released keeps its section even if Settings routing changes later. */
const releasedIn=(v:LabScopeVersion|undefined,sampleId:string,stream:Stream,test:string)=>!!v?.samples.some(p=>p.sampleId===sampleId&&!p.excluded&&testsIn(p,stream).includes(test));
/** Every check a scope release needs. Returns problems instead of throwing so the review panel can list them. */
export function labScopeProblems(job:JobRecord,samples:Omit<SampleScope,'containerType'|'containerLabel'>[],conditions:Operations['conditions'],routing:TestRouting|null|undefined,roles:Responsibilities,previous?:LabScopeVersion,actor?:Actor):string[]{
 const problems:string[]=[];
 if(!routing)return ['Laboratory test routing settings cannot be read. Ask an administrator to restore them in Settings → Authorization.'];
 const ids=(job.samples||[]).map(s=>s.id);const catalogue=catalogueIds();
 if(samples.length!==ids.length||ids.some(id=>samples.filter(s=>s.sampleId===id).length!==1))problems.push('Every job sample needs one scope entry.');
 const execProblems=(label:string,what:string,e:ExecutionChoice|undefined)=>{
  if(e?.by!=='Third-party')return;
  if(!e.provider?.trim())problems.push(label+': “'+what+'” is performed by a third-party laboratory; enter the provider/laboratory name.');
  if(e.expectedReturn&&!/^\d{4}-\d{2}-\d{2}$/.test(e.expectedReturn))problems.push(label+': “'+what+'” needs a valid expected return date.');
  if(e.coordinator&&actor){const c=e.coordinator;if(!actor.employees.some(x=>x.id===c&&x.active))problems.push(label+': the internal coordinator for “'+what+'” must be an active employee.');}
 };
 for(const s of samples){
  const label='Sample '+s.sampleId;const tests=[...s.pvtTests,...s.chemicalTests];const custom=s.customTests||[];const validation=entryValidation(s);
  if(s.excluded){if(!s.exclusionReason.trim())problems.push(label+': give a reason for excluding it.');if(tests.length||custom.length||s.validation)problems.push(label+': an excluded sample cannot have tests.');continue;}
  if(!s.fluidType)problems.push(label+': select the fluid type (Black Oil, Gas Condensate, Water, Chemical, OBM or Add Other).');
  else if(s.fluidType==='Other'&&!s.fluidDescription?.trim())problems.push(label+': describe the fluid/sample for fluid type Other.');
  if(!tests.length&&!custom.length&&!validation)problems.push(label+' has no tests. Select tests, request Validation or add a custom test, or explicitly exclude it with a reason.');
  // Validation is available for every sample: it always adds PVT responsibility (planned by the PVT Team Lead), whatever the sample's team.
  for(const stream of ['PVT','Chemical'] as const){const list=testsIn(s,stream);
   if(list.length&&!streamsOf(s.destination).includes(stream))problems.push(label+': '+teamName(stream)+' tests need the destination '+teamName(stream)+' or PVT and Chemistry.');
   if(new Set(list).size!==list.length)problems.push(label+': a test is listed twice in '+stream+'.');
   for(const test of list){if(!catalogue.includes(test))problems.push(label+': “'+test+'” is not in the test catalog.');else if(routing[test]&&routing[test]!=='Both'&&routing[test]!==stream&&!releasedIn(previous,s.sampleId,stream,test))problems.push(label+': “'+test+'” is routed to '+routing[test]+' in Settings, not '+stream+'.');}
  }
  for(const test of [...new Set(tests)])execProblems(label,shortName(test),s.execution?.[test]);
  const customIds=new Set<string>();
  for(const c of custom){
   if(!c.id||customIds.has(c.id))problems.push(label+': each custom test needs its own ID.');customIds.add(c.id);
   if(!c.name.trim())problems.push(label+': enter a name for each custom test, or remove it.');
   else if(streamsOf(c.team).some(st=>!streamsOf(s.destination).includes(st)))problems.push(label+': custom test “'+c.name.trim()+'” goes to '+(c.team==='Both'?'PVT and Chemistry':c.team)+'; the sample destination must include it.');
   execProblems(label,c.name.trim()||'custom test',c.execution);
  }
 }
 const used=new Set(samples.filter(s=>!s.excluded).flatMap(s=>[...(['PVT','Chemical'] as const).filter(stream=>testsIn(s,stream).length),...(s.customTests||[]).flatMap(c=>streamsOf(c.team)),...(entryValidation(s)?['PVT' as const]:[])]));
 for(const stream of used)if(!roles[streamLead(stream)])problems.push(responsibilityLabels[streamLead(stream)]+' is not configured. Ask an administrator to assign it in Settings → Authorization.');
 for(const value of [conditions.pressure,conditions.temperature])if(value&&!Number.isFinite(Number(value)))problems.push('Reservoir conditions must be numeric.');
 if(!samples.some(s=>!s.excluded))problems.push('Select tests for at least one sample.');
 if(previous){for(const p of previous.samples){if(p.excluded)continue;const n=samples.find(s=>s.sampleId===p.sampleId);
  if(!n||n.excluded){problems.push('Sample '+p.sampleId+' was released for testing and cannot be excluded in a revision.');continue;}
  for(const stream of ['PVT','Chemical'] as const)for(const test of testsIn(p,stream))if(!testsIn(n,stream).includes(test))problems.push('Sample '+p.sampleId+': released '+stream+' test “'+shortName(test)+'” cannot be removed or moved in a revision.');
  if(entryValidation(p)&&!entryValidation(n))problems.push('Sample '+p.sampleId+': released Validation cannot be removed in a revision.');
  for(const c of p.customTests||[]){const m=(n.customTests||[]).find(x=>x.id===c.id);if(!m||streamsOf(c.team).some(st=>!streamsOf(m.team).includes(st)))problems.push('Sample '+p.sampleId+': released custom test “'+c.name+'” cannot be removed or moved in a revision.');}}
  if(!problems.length&&!scopeChanged(previous,samples,conditions))problems.push('Nothing has changed since released version '+previous.version+'. Change the scope before releasing a revision.');}
 return [...new Set(problems)];
}
const shortName=(test:string)=>test.split(' — ').slice(1).join(' — ')||test;
/** Compares the released content only (not draft-only fields), so saving unchanged scope never creates a new release. */
function scopeChanged(previous:LabScopeVersion,samples:Omit<SampleScope,'containerType'|'containerLabel'>[],conditions:Operations['conditions']){
 const norm=(list:Omit<SampleScope,'containerType'|'containerLabel'>[])=>JSON.stringify([...list].sort((a,b)=>a.sampleId.localeCompare(b.sampleId)).map(s=>({id:s.sampleId,d:s.destination,p:[...s.pvtTests].sort(),c:[...s.chemicalTests].sort(),v:entryValidation(s),x:s.excluded,r:s.exclusionReason.trim(),n:s.notes.trim(),f:s.fluidType||'',fd:(s.fluidDescription||'').trim(),fn:(s.fluidNotes||'').trim(),ct:(s.customTests||[]).map(c=>({...c,name:c.name.trim(),notes:c.notes.trim()})),e:s.execution||{}})));
 return norm(previous.samples)!==norm(samples)||JSON.stringify(previous.conditions)!==JSON.stringify(conditions);
}
/** Saved catalogue selections not listed for the sample's chosen fluid type (flagged, never removed automatically). */
export const scopeReview=(s:Pick<SampleScope,'pvtTests'|'chemicalTests'|'fluidType'>)=>needsReview([...s.pvtTests,...s.chemicalTests],s.fluidType);
export type Command =
 | {type:'dispatch';engineer:string;driver:string;/** Supporting sampling employees besides the accountable engineer. */team?:string[]}
 /** The accountable sampling employee confirms the job briefing and starts the sampling work. */
 | {type:'start-job'}
 /** Job access: which backup sampling employees may work on the sampling (the rest view only). */
 | {type:'job-access';editors:string[];reason:string}
 | {type:'data-submit';note:string}
 | {type:'data-return';general:string;comments:ReviewComment[]}
 | {type:'data-approve'}
 | {type:'data-reopen';reason:string}
 | {type:'lab-scope';action:'save'|'release';samples:Omit<SampleScope,'containerType'|'containerLabel'>[];conditions:Operations['conditions'];reason:string}
 | {type:'scope';items:{title:string;sampleIds:string[];stream:Stream}[];conditions:Operations['conditions'];reason:string;additionId?:string}
 | {type:'request-addition';title:string;reason:string;destination?:Destination;requests?:{title:string;reason:string;destination:Destination}[]}
 /** Adds Validation to any job with sample records, from the full catalogue, as additional tracked work. Steps are guidance only: none blocks another. */
 | {type:'add-validation';sampleIds:string[];steps:string[];reason:string}
 /** The PVT Team Lead chooses the Validation steps for one requested sample. Existing steps are reused, never duplicated. */
 | {type:'validation-plan';scopeId:string;steps:{title:string;external?:ExecutionChoice}[];restoration?:Pick<Operations['conditions'],'pressure'|'temperature'|'pressureUnit'|'temperatureUnit'>;instructions?:string;/** Deliberately add a Validation Recombination step although Recombination is requested separately. */confirmRecombination?:boolean}
 /** Third-party work: the coordinator records dispatch, the returned results, then submits them for the normal internal review. */
 | {type:'external-dispatch';id:string;sentOn:string;expectedReturn:string;notes:string}
 | {type:'external-results';id:string;receivedOn:string;notes:string;file:Omit<FileVersion,'version'|'submittedBy'|'submittedAt'|'status'|'comments'>}
 | {type:'external-submit';id:string;notes:string}
 | {type:'schedule';id:string;owner:string;start:string;due:string;conditions:string;notes:string}
 | {type:'progress';id:string;status:WorkState;notes:string}
 | {type:'workbook';id:string;notes?:string;file:Omit<FileVersion,'version'|'submittedBy'|'submittedAt'|'status'|'comments'>}
 | {type:'workbook-return';id:string;comments:string}
 | {type:'lead-review';id:string;decision:'approve'|'return';target:string;comments:string}
 | {type:'qc-review';id:string;decision:'approve'|'return';target:string;comments:string}
 | {type:'report-draft';kind:'sampling'|'final';text:string;checker:string;file?:FileVersion;letterhead?:ReportLetterhead}
 | {type:'report-action';kind:'sampling'|'final';action:'checking'|'submit'|'return'|'approve'|'revise';comments:string;letterhead?:ReportLetterhead}
 | {type:'handover-send';sampleIds:string[];notes:string}
 | {type:'handover-receive';notes:string}
 /** Planned start / expected duration / expected completion for one progress row. Empty values clear the estimate. */
 | {type:'estimate';key:string;label?:string;start:string;days:string;finish:string;clientVisible:boolean};
export function applyOperation(job:JobRecord,command:Command,actor:Actor,now=new Date().toISOString()):JobRecord {
 requireAccess(actor,'jobDetails');
 if(job.trash)throw Error('This job is in Trash. Restore it before making changes.');
 const o:Operations=structuredClone(operationsFor(job));const next={...job,operations:o};let reason='';
 const currentActivity=()=>{const a=o.activities.find(a=>'id'in command&&a.id===command.id);if(!a)throw Error('Activity no longer exists.');return a;};
 const snapshot=(kind:'sampling'|'final')=>JSON.stringify(kind==='sampling'?{samples:job.samples,events:job.events,source:job.samplingSource,jobNumber:job.jobNumber,clientName:job.clientName,well:job.well,fieldArea:job.fieldArea}:{scope:o.scope,conditions:o.conditions,activities:o.activities,samples:job.samples,handOver:o.handover});
 switch(command.type){
 case 'dispatch':{
  requireAccess(actor,'createJob');
  if(o.dispatchedAt)throw Error('This job has already been dispatched. Preserve the original dispatch record.');
  if(!job.clientCode||!job.samplingSource||!job.samples?.length)throw Error('Complete client, sampling type and samples before sending to Sampling.');
  if(!job.samplingInstructions?.trim())throw Error('Sampling instructions are required before sending to Sampling.');
  if(!command.engineer)throw Error('Assign the accountable sampling employee.');if(!command.driver)throw Error('Assign a driver.');
  const team=[...new Set([command.engineer,...(command.team||[])].filter(Boolean))];
  // Any active employee may be assigned, from any department; the assignment lets them act on this job's sampling work.
  for(const id of team)active(actor,id);
  active(actor,command.driver);
  next.samplingTeamIds=team.slice(1);if(isDraft(job))next.status='Job Created';
  // Laboratory tests requested at creation stay reference information; the laboratory scope is selected after sampling approval.
  o.originalRequest=[...(job.requiredTests||[])];
  next.assignedEngineerId=command.engineer;next.assignedDriverId=command.driver;next.responsibleId=command.engineer;
  next.teamWork={...job.teamWork,sampling:{...job.teamWork?.sampling,owner:command.engineer,acceptedAt:now},transport:{...job.teamWork?.transport,owner:command.driver}};
  o.dispatchedAt=now;o.dispatchedBy=actor.id;break;
 }
 case 'start-job':{
  if(!o.dispatchedAt)throw Error('This job has not been sent to Sampling yet.');
  if(!job.assignedEngineerId||actor.id!==job.assignedEngineerId)throw Error('Only the accountable sampling employee ('+(actor.employees.find(e=>e.id===job.assignedEngineerId)?.name||'not assigned')+') can start this job.');
  if(o.samplingStart)throw Error('This job was already started on '+o.samplingStart.at.slice(0,10)+'.');
  o.samplingStart={by:actor.id,at:now};
  const d=new Date(now);const pad=(n:number)=>String(n).padStart(2,'0');
  next.events=[...(job.events||[]),{date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,time:`${pad(d.getHours())}:${pad(d.getMinutes())}`,description:'Job started by '+(actor.employees.find(e=>e.id===actor.id)?.name||actor.id)+' (accountable). Sampling preparation begins.',createdBy:actor.id,createdAt:now,auto:true}];
  break;
 }
 case 'job-access':{
  if(!canManageJobAccess(job,actor))throw Error('Only employees with Edit job access (Settings → Authorization) can change who may work on this job.');
  requireText(command.reason,'Reason for the access change');reason=command.reason;
  const backups=samplingTeam(job).filter(id=>id!==job.assignedEngineerId);
  for(const id of command.editors)if(!backups.includes(id))throw Error('Only backup sampling employees on this job can be given edit access.');
  const before=o.samplingEditors||[];const editors=[...new Set(command.editors)];
  if(JSON.stringify([...before].sort())===JSON.stringify([...editors].sort()))throw Error('No access change to save.');
  o.samplingEditors=editors;
  const nm=(id:string)=>actor.employees.find(e=>e.id===id)?.name||id;
  const changes=[...editors.filter(id=>!before.includes(id)).map(id=>nm(id)+' can now work on the sampling'),...before.filter(id=>!editors.includes(id)).map(id=>nm(id)+' is now view only')];
  const d=new Date(now);const pad=(n:number)=>String(n).padStart(2,'0');
  next.events=[...(job.events||[]),{date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,time:`${pad(d.getHours())}:${pad(d.getMinutes())}`,description:'Job access changed by '+nm(actor.id)+': '+changes.join('; ')+'. Reason: '+command.reason.trim(),createdBy:actor.id,createdAt:now,auto:true}];
  break;
 }
 case 'scope':{
  requireRole(actor,'analysis','scopeSelector');requireText(command.reason,'Scope confirmation / change reason');reason=command.reason;
  if(!command.additionId&&o.labScopes?.some(v=>v.status==='Released'))throw Error('This job uses the per-sample laboratory scope. Revise it in Laboratory scope.');
  if(!command.items.length)throw Error('Select at least one requested activity.');
  if(!['psi','bar','kPa','MPa'].includes(command.conditions.pressureUnit)||!['°C','°F','K'].includes(command.conditions.temperatureUnit))throw Error('Select valid pressure and temperature units.');
  for(const value of [command.conditions.pressure,command.conditions.temperature])if(value&&!Number.isFinite(Number(value)))throw Error('Conditions must be numeric when supplied.');
  const addition=command.additionId?o.additions.find(a=>a.id===command.additionId&&!a.confirmedAt):undefined;if(command.additionId&&!addition)throw Error('Additional-work request was already confirmed.');
  if(addition?.destination){
   const required:Stream[]=addition.destination==='Both'?['PVT','Chemical']:[addition.destination];
   if(command.items.length!==required.length||required.some(stream=>command.items.filter(item=>item.stream===stream).length!==1))throw Error('Confirm all requested teams without changing the request destination.');
   if(required.length===2&&JSON.stringify([...command.items[0].sampleIds].sort())!==JSON.stringify([...command.items[1].sampleIds].sort()))throw Error('Both teams must receive the same requested samples.');
  }
  for(const item of command.items){
   requireText(item.title,'Activity');if(!item.sampleIds.length||item.sampleIds.some(id=>!job.samples?.some(s=>s.id===id)))throw Error('Select existing samples for each scope item.');
   if(!addition&&!o.originalRequest.includes(item.title))throw Error('New work must first be recorded as an additional-work request.');
   if(addition&&item.title!==addition.title)throw Error('Confirm the requested additional work without replacing its identity.');
   const scopeId=(addition?.id||'original')+':'+item.title+(addition?.destination?':'+item.stream:'');
   const existing=o.scope.find(s=>s.id===scopeId);
   if(existing&&(existing.stream!==item.stream||item.sampleIds.length!==existing.sampleIds.length||item.sampleIds.some(id=>!existing.sampleIds.includes(id))))throw Error('Use an additional-work request to change an existing confirmed scope.');
   if(existing)continue;
   const validation=/Validation$/.test(item.title)&&item.stream==='PVT';
   const sequenceFor=(sampleId:string)=>sampleSequence(job,sampleId);
   if(validation&&item.sampleIds.some(id=>!sequenceFor(id).length))throw Error('Needs clarification: confirm the Validation sequence for this sampling type.');
   if(validation&&(!command.conditions.pressure||!command.conditions.temperature))throw Error('Record reservoir pressure and temperature for Restoration.');
   o.scope.push({...item,id:scopeId,addedBy:actor.id,at:now,reason,notes:command.conditions.notes,source:addition?'Additional work':'Original request'});
   for(const sampleId of item.sampleIds)for(const title of validation?sequenceFor(sampleId):[item.title]){
    const id=validation?(addition?addition.id+':':'')+'validation:'+sampleId+':'+title:scopeId+':'+sampleId+':'+title;
    if(o.activities.some(a=>a.id===id))continue;
    o.activities.push({kind:validation?'validation':'analysis',id,scopeId,sampleId,title,stream:validation?'PVT':item.stream,owner:'',start:'',due:'',conditions:title==='Restoration'?`${command.conditions.pressure} ${command.conditions.pressureUnit}; ${command.conditions.temperature} ${command.conditions.temperatureUnit}`:title==='Water Check'?'Check for water on the sample side.':command.conditions.notes,notes:'',status:'Unassigned',files:[],required:true});
   }
  }
  o.conditions=command.conditions;
  if(o.originalRequest.every(title=>o.scope.some(s=>s.source==='Original request'&&s.title===title)))o.scopeConfirmedAt=now;
  if(addition)addition.confirmedAt=now;
  break;
 }
 case 'data-submit':{
  requireAssigned(actor,'sampling',actor.id===job.assignedEngineerId);if(!job.assignedEngineerId||actor.id!==job.assignedEngineerId)throw Error('Only the accountable sampling employee ('+(actor.employees.find(e=>e.id===job.assignedEngineerId)?.name||'not assigned')+') can submit the sampling data.');
  if(!o.dispatchedAt&&!legacyDispatch(job))throw Error('Send the job to Sampling first.');
  if(!dataReviewRequired(job))throw Error('This job’s sampling report started before data review. Continue it in the sampling report.');
  const last=o.samplingData?.at(-1);if(last&&!['Returned','Reopened'].includes(last.status))throw Error(last.status==='Submitted'?'The sampling data is already waiting for review.':'The sampling data is approved. Reopen it with a reason before changing it.');
  const missing=[!preparationDone(job)&&'complete the preparation step',!job.samples?.length&&'add the sample records',...(job.samples||[]).filter(s=>!containerId(s)||(!isGlass(s)&&!s.bottle)).map(s=>'record the container for sample '+s.id),...(job.samples||[]).filter(s=>!s.dataComplete).map(s=>'complete the data sheet for sample '+s.id)].filter(Boolean);
  if(missing.length)throw Error('Before submitting: '+missing.join('; ')+'.');
  (o.samplingData||(o.samplingData=[])).push({version:o.samplingData.length+1,status:'Submitted',submittedBy:actor.id,submittedAt:now,snapshot:dataSnapshot(job),note:command.note.trim(),comments:[]});
  reason=command.note.trim();break;
 }
 case 'data-return':case 'data-approve':{
  requireRole(actor,'sampling','samplingApproval');const d=o.samplingData?.at(-1);if(!d||d.status!=='Submitted')throw Error('There is no submitted sampling data to review.');
  if(command.type==='data-return'){
   requireText(command.general,'Correction explanation');if(command.general.trim().length<10)throw Error('Explain what needs correcting in at least a sentence.');
   const comments=command.comments.map(c=>({...c,text:c.text.trim()})).filter(c=>c.text);if(!comments.length)throw Error('Add at least one comment that names the affected section or sample.');
   if(comments.some(c=>!c.target||c.text.length<10))throw Error('Each comment needs a section or sample and a specific explanation.');
   Object.assign(d,{status:'Returned',reviewedBy:actor.id,reviewedAt:now,general:command.general.trim(),comments});reason=command.general.trim();
  } else {
   if(d.snapshot!==dataSnapshot(job))throw Error('The sampling data changed after submission. Return it so the accountable employee resubmits the current data.');
   Object.assign(d,{status:'Approved',reviewedBy:actor.id,reviewedAt:now});
  }
  break;
 }
 case 'data-reopen':{
  requireAssigned(actor,'sampling',actor.id===job.assignedEngineerId);requireText(command.reason,'Reason for correcting approved data');
  const d=o.samplingData?.at(-1);if(!d||d.status!=='Approved')throw Error('Only approved sampling data can be reopened.');
  if(![job.assignedEngineerId,holder(actor,'samplingApproval')].filter(Boolean).includes(actor.id))throw Error('Only the accountable sampling employee or the sampling approver can reopen approved data.');
  if(o.handover||o.scopeConfirmedAt)throw Error('Needs clarification: approved sampling data cannot be reopened after sample handover or laboratory scope release.');
  o.samplingData!.push({...d,version:o.samplingData!.length+1,status:'Reopened',reopenedBy:actor.id,reopenedAt:now,reason:command.reason.trim(),reviewedBy:undefined,reviewedAt:undefined,comments:[],general:undefined});
  const r=latest(o.samplingReports);
  if(r&&['Draft','Checking','Awaiting Approval'].includes(r.status)){r.status='Changes Requested';r.comments='Sampling data reopened: '+command.reason.trim();}
  if(r?.status==='Approved')o.samplingReports.push({...r,version:o.samplingReports.length+1,status:'Changes Requested',approvedAt:undefined,approvedBy:undefined,checkedAt:undefined,submittedAt:undefined,comments:'Sampling data reopened: '+command.reason.trim()});
  reason=command.reason.trim();break;
 }
 case 'lab-scope':{
  requireRole(actor,'analysis','scopeSelector');
  if(!samplingApproved(job))throw Error('The laboratory scope is selected after the sampling report is approved.');
  if(o.scope.some(s=>!s.id.startsWith('labscope:')&&!s.id.startsWith('addval:'))&&!o.labScopes?.length)throw Error('This job’s scope was confirmed in the earlier workflow. Record further work as an additional-work request.');
  const versions=o.labScopes||(o.labScopes=[]);const last=versions.at(-1);const previous=[...versions].reverse().find(v=>v.status==='Released');
  const samples:SampleScope[]=command.samples.map(s=>{const sample=job.samples?.find(x=>x.id===s.sampleId);if(!sample)throw Error('Sample '+s.sampleId+' no longer exists.');return {...s,pvtTests:[...s.pvtTests],chemicalTests:[...s.chemicalTests],notes:s.notes.trim(),exclusionReason:s.exclusionReason.trim(),...(s.fluidDescription!==undefined?{fluidDescription:s.fluidDescription.trim()}:{}),...(s.fluidNotes!==undefined?{fluidNotes:s.fluidNotes.trim()}:{}),...(s.customTests?{customTests:s.customTests.map(c=>({...c,name:c.name.trim(),notes:c.notes.trim()}))}:{}),containerType:isGlass(sample)?'Glass container':'Bottle',containerLabel:containerLabel(sample)};});
  const version:LabScopeVersion={version:last?.status==='Draft'?last.version:versions.length+1,status:'Draft',samples,conditions:{...command.conditions},routing:{...(actor.routing||{})},reason:command.reason.trim(),preparedBy:actor.id,savedAt:now,job:{jobNumber:job.jobNumber,clientName:job.clientName,fieldArea:job.fieldArea||'',well:job.wellMode==='multiple'?(job.wells||[]).filter(Boolean).join(', '):job.well||'',samplingSource:job.samplingSource||''}};
  if(command.action==='release'){
   const problems=labScopeProblems(job,command.samples,command.conditions,actor.routing,actorRoles(actor),previous,actor);if(problems.length)throw Error(problems.join(' '));
   if(previous)requireText(command.reason,'Revision reason');
   version.status='Released';version.releasedBy=actor.id;version.releasedAt=now;reason=command.reason.trim()||'Laboratory scope released';
   const source=previous?'Additional work':'Original request';
   const day=now.slice(0,10);
   /** A coordinator chosen in the scope is assigned on release, only for the stream whose team they belong to. */
   const coordinate=(a:ActivityRecord,e?:ExecutionChoice)=>{const c=e?.by==='Third-party'?e.coordinator:'';if(!c||!actor.employees.some(x=>x.id===c&&x.active))return;a.owner=c;a.start=day;a.due=e?.expectedReturn||'';a.status='Scheduled';a.history=[{at:now,by:actor.id,action:'assigned',to:c,comments:'Internal coordinator for third-party work ('+(e?.provider||'').trim()+')'}];};
   const conditionText=(title:string,notes:string)=>title==='Restoration'?`${command.conditions.pressure} ${command.conditions.pressureUnit}; ${command.conditions.temperature} ${command.conditions.temperatureUnit}`:title==='Water Check'?'Check for water on the sample side.':[command.conditions.notes,notes].filter(Boolean).join(' · ');
   for(const s of samples){
    if(s.excluded)continue;
    for(const stream of ['PVT','Chemical'] as const)for(const test of testsIn(s,stream)){
     const linkId='labscope:'+s.sampleId+':'+test,scopeId='labscope:'+s.sampleId+':'+stream+':'+test;
     if(!o.scope.some(x=>x.id===scopeId))o.scope.push({id:scopeId,linkId,title:test,sampleIds:[s.sampleId],stream,notes:s.notes,addedBy:actor.id,at:now,reason,source});
     const validation=isValidationTest(test);
     // Older records: a catalogue Validation test keeps its generated sequence (activities already exist after release).
     for(const title of validation?sampleSequence(job,s.sampleId):[test]){
      const id=validation?'labscope:'+s.sampleId+':'+stream+':validation:'+title:scopeId;
      if(o.activities.some(a=>a.id===id))continue;
      const a:ActivityRecord={kind:validation?'validation':'analysis',id,scopeId,linkId,sampleId:s.sampleId,title,stream,owner:'',start:'',due:'',conditions:conditionText(title,s.notes),notes:'',status:'Unassigned',files:[],required:true};
      if(!validation){const ext=externalFrom(s.execution?.[test]);if(ext){a.external=ext;coordinate(a,s.execution?.[test]);}}
      o.activities.push(a);
     }
    }
    // Validation requested: one planning item for the PVT Team Lead. No step is created or assigned until the lead chooses them.
    if(s.validation&&![...s.pvtTests,...s.chemicalTests].some(isValidationTest)){
     const scopeId='labscope:'+s.sampleId+':PVT:Validation';
     if(!o.scope.some(x=>x.id===scopeId))o.scope.push({id:scopeId,linkId:'labscope:'+s.sampleId+':Validation',title:'Validation',sampleIds:[s.sampleId],stream:'PVT',notes:s.notes,addedBy:actor.id,at:now,reason,source,validationRequest:true});
    }
    for(const c of s.customTests||[])for(const stream of streamsOf(c.team)){
     const linkId='labscope:'+s.sampleId+':custom:'+c.id,scopeId='labscope:'+s.sampleId+':'+stream+':custom:'+c.id;
     if(o.scope.some(x=>x.id===scopeId))continue;
     o.scope.push({id:scopeId,linkId,title:c.name,sampleIds:[s.sampleId],stream,notes:c.notes,addedBy:actor.id,at:now,reason,source});
     const a:ActivityRecord={kind:'analysis',custom:true,id:scopeId,scopeId,linkId,sampleId:s.sampleId,title:c.name,stream,owner:'',start:'',due:'',conditions:[command.conditions.notes,s.notes,c.notes].filter(Boolean).join(' · '),notes:'',status:'Unassigned',files:[],required:true};
     const ext=externalFrom(c.execution);if(ext){a.external=ext;coordinate(a,c.execution);}
     o.activities.push(a);
    }
   }
   o.conditions={...command.conditions};o.scopeConfirmedAt=o.scopeConfirmedAt||now;
  } else reason='Laboratory scope draft v'+version.version+' saved';
  if(last?.status==='Draft')versions[versions.length-1]=version;else versions.push(version);
  break;
 }
 case 'add-validation':{
  requireRole(actor,'analysis','scopeSelector');requireText(command.reason,'Reason for adding Validation');
  if(isDraft(job))throw Error('Send the job to Sampling before adding laboratory work.');
  if(!job.samples?.length)throw Error('This job has no sample records yet.');
  const sampleIds=[...new Set(command.sampleIds)];if(!sampleIds.length)throw Error('Select at least one sample/container.');
  if(sampleIds.some(id=>!job.samples!.some(s=>s.id===id)))throw Error('Select existing samples.');
  const steps=validationStepNames.filter(step=>command.steps.includes(step));
  if(steps.length!==new Set(command.steps).size)throw Error('Choose Validation activities from the catalogue.');
  const n=o.additions.filter(a=>a.id.startsWith('addval:')).length+1,additionId='addval:'+n;reason=command.reason.trim();
  // No steps: Validation is requested and the PVT Team Lead chooses the steps in laboratory planning.
  if(!steps.length){
   const open=sampleIds.filter(id=>unplannedValidation(job).some(r=>r.sampleIds.includes(id)));
   if(open.length)throw Error('Validation is already requested and awaiting planning for Sample '+open.join(', ')+'.');
   for(const sampleId of sampleIds)o.scope.push({id:additionId+':'+sampleId,linkId:additionId+':'+sampleId,title:'Validation',sampleIds:[sampleId],stream:'PVT',notes:'',addedBy:actor.id,at:now,reason,source:'Additional work',validationRequest:true});
   o.additions.push({id:additionId,title:'Validation requested · Sample '+sampleIds.join(', '),reason,by:actor.id,at:now,confirmedAt:now});
   reason='Validation requested · Sample '+sampleIds.join(', ')+' · '+reason;break;
  }
  for(const sampleId of sampleIds){
   const scopeId=additionId+':'+sampleId;
   o.scope.push({id:scopeId,linkId:scopeId,title:'Validation',sampleIds:[sampleId],stream:'PVT',notes:steps.join(', '),addedBy:actor.id,at:now,reason,source:'Additional work'});
   for(const title of steps)o.activities.push({kind:'validation',id:scopeId+':validation:'+title,scopeId,linkId:scopeId,sampleId,title,stream:'PVT',owner:'',start:'',due:'',conditions:title==='Restoration'&&o.conditions.pressure?`${o.conditions.pressure} ${o.conditions.pressureUnit}; ${o.conditions.temperature} ${o.conditions.temperatureUnit}`:title==='Water Check'?'Check for water on the sample side.':'',notes:'',status:'Unassigned',files:[],required:true});
  }
  o.additions.push({id:additionId,title:'Validation · '+steps.join(', ')+' · Sample '+sampleIds.join(', '),reason,by:actor.id,at:now,confirmedAt:now});
  reason='Validation added · Sample '+sampleIds.join(', ')+' · '+steps.join(', ')+' · '+reason;
  break;
 }
 case 'validation-plan':{
  requireRole(actor,'analysis','pvtTeamLead');
  const record=validationScopes(job).find(r=>r.id===command.scopeId);if(!record)throw Error('This Validation request no longer exists.');
  const r=o.scope.find(x=>x.id===record.id)!;const sampleId=r.sampleIds[0];
  const chosen=[...new Set(command.steps.map(x=>x.title))];
  if(chosen.some(t=>!validationStepNames.includes(t as typeof validationStepNames[number])))throw Error('Choose Validation steps from the catalogue.');
  if(!chosen.length)throw Error('Select at least one Validation step. Steps are chosen per sample; none is mandatory.');
  const existing=o.activities.filter(a=>a.scopeId===r.id&&a.kind==='validation');
  if(chosen.includes('Recombination')&&!existing.some(a=>a.title==='Recombination')&&separateRecombination(job,sampleId).length&&!command.confirmRecombination)throw Error('Recombination is already requested as a separate test on Sample '+sampleId+'. Confirm that a separate Validation Recombination step is intended, or leave it unselected.');
  for(const step of command.steps){const e=step.external;if(e?.by==='Third-party'&&!e.provider?.trim())throw Error('Enter the provider/laboratory for '+step.title+' (third-party).');}
  const restoration=command.restoration||o.conditions;
  const addsRestoration=chosen.includes('Restoration')&&!existing.some(a=>a.title==='Restoration');
  if(addsRestoration&&(![restoration.pressure,restoration.temperature].every(v=>v.trim()&&Number.isFinite(Number(v)))||
    !['psi','bar','kPa','MPa'].includes(restoration.pressureUnit)||!['°C','°F','K'].includes(restoration.temperatureUnit))){
   throw Error('Enter numeric reservoir pressure and temperature with units for Restoration.');
  }
  // Values entered for Restoration become the job's reservoir conditions (shown in every engineer's Job Details).
  let conditionsNote='';
  if(addsRestoration&&command.restoration){const r0=o.conditions,next={...r0,pressure:restoration.pressure.trim(),pressureUnit:restoration.pressureUnit,temperature:restoration.temperature.trim(),temperatureUnit:restoration.temperatureUnit};
   if(JSON.stringify(next)!==JSON.stringify(r0)){conditionsNote=' · reservoir conditions '+(r0.pressure||r0.temperature?'updated':'recorded')+': '+next.pressure+' '+next.pressureUnit+', '+next.temperature+' '+next.temperatureUnit;o.conditions=next;}}
  const added:string[]=[],removed:string[]=[],kept:string[]=[];
  for(const title of validationStepNames.filter(t=>chosen.includes(t))){
   const step=command.steps.find(x=>x.title===title)!;const old=existing.find(a=>a.title===title);
   if(old){
    // Reused: an untouched step may switch between internal and third-party execution; started work keeps its record.
    if(old.status==='Unassigned'&&!old.files.length){const ext=externalFrom(step.external);if(ext)old.external=ext;else delete old.external;if(command.instructions!==undefined)old.notes=command.instructions.trim();}
    continue;
   }
   const a:ActivityRecord={kind:'validation',id:r.id+':validation:'+title,scopeId:r.id,linkId:r.linkId||r.id,sampleId,title,stream:'PVT',owner:'',start:'',due:'',conditions:title==='Restoration'?`${restoration.pressure.trim()} ${restoration.pressureUnit}; ${restoration.temperature.trim()} ${restoration.temperatureUnit}`:title==='Water Check'?'Check for water on the sample side.':o.conditions.notes||'',notes:(command.instructions||'').trim(),status:'Unassigned',files:[],required:true};
   const ext=externalFrom(step.external);if(ext)a.external=ext;
   if(o.activities.some(x=>x.id===a.id))throw Error('Validation step '+title+' already exists for this request.');
   o.activities.push(a);added.push(title);
  }
  // A step no longer chosen is removed only while untouched (never assigned, no files, no history); otherwise it is kept.
  for(const a of existing.filter(a=>!chosen.includes(a.title))){
   if(a.status==='Unassigned'&&!a.owner&&!a.files.length&&!(a.history||[]).length){o.activities.splice(o.activities.indexOf(o.activities.find(x=>x.id===a.id)!),1);removed.push(a.title);}else kept.push(a.title);
  }
  r.plannedBy=actor.id;r.plannedAt=now;
  reason='Validation steps planned · Sample '+sampleId+(added.length?' · added '+added.join(', '):'')+(removed.length?' · removed '+removed.join(', '):'')+(kept.length?' · kept (already started) '+kept.join(', '):'')+conditionsNote;
  break;
 }
 case 'external-dispatch':case 'external-results':case 'external-submit':{
  const a=currentActivity();const ext=a.external;if(!ext)throw Error('This activity is performed internally.');
  requireAssigned(actor,'analysis',!!a.owner&&actor.id===a.owner);
  const lead=holder(actor,streamLead(a.stream));
  if(actor.id!==a.owner&&!(command.type!=='external-submit'&&actor.id===lead))throw Error('Only the internal coordinator ('+(actor.employees.find(e=>e.id===a.owner)?.name||'not assigned')+') records this third-party work.');
  if(!a.owner)throw Error('Assign an internal coordinator first.');
  const date=(v:string,label:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('Enter the '+label+'.');};
  const history=(a.history||(a.history=[]));
  if(command.type==='external-dispatch'){
   if(ext.sentAt)throw Error('Dispatch is already recorded for this test.');if(!['Scheduled','In Progress'].includes(a.status))throw Error('This test cannot be dispatched in its current state.');
   date(command.sentOn,'date sent');if(command.expectedReturn)date(command.expectedReturn,'expected return date');
   Object.assign(ext,{sentOn:command.sentOn,sentAt:now,sentBy:actor.id,dispatchNotes:command.notes.trim(),expectedReturn:command.expectedReturn||ext.expectedReturn});a.status='In Progress';
   history.push({at:now,by:actor.id,action:'dispatched',comments:['Sent to '+ext.provider+' on '+command.sentOn,command.notes.trim()].filter(Boolean).join(' · ')});reason='Sent to '+ext.provider;
  } else if(command.type==='external-results'){
   if(!ext.sentAt)throw Error('Record the dispatch to the third-party laboratory first.');
   if(!['In Progress','Changes Requested'].includes(a.status))throw Error('Results are already under internal review.');
   date(command.receivedOn,'date the results were received');if(!command.file.id||command.file.size<=0)throw Error('Attach the returned report or results file.');
   a.files.push({...command.file,version:a.files.length+1,submittedBy:actor.id,submittedAt:now,status:'Available',comments:command.notes.trim()});
   Object.assign(ext,{receivedOn:command.receivedOn,receivedAt:now,receivedBy:actor.id});if(a.status==='Changes Requested')a.status='In Progress';
   history.push({at:now,by:actor.id,action:'results-received',version:a.files.length,comments:['Received from '+ext.provider+' on '+command.receivedOn,command.notes.trim()].filter(Boolean).join(' · ')});reason='Results received from '+ext.provider;
  } else {
   if(!ext.receivedAt||!a.files.length)throw Error('Record the returned results before submitting them for review.');
   if(a.status!=='In Progress')throw Error(['Workbook Submitted','Awaiting QC','QC Returned'].includes(a.status)?'These results are already under internal review.':'Record the corrected results first.');
   a.status='Workbook Submitted';if(command.notes.trim())a.progressNotes=command.notes.trim();
   history.push({at:now,by:actor.id,action:'submitted',version:a.files.length,comments:command.notes.trim()||undefined});reason='External results submitted for review';
  }
  break;
 }
 case 'request-addition':{
  requireAccess(actor,'analysis');
  const requests=command.requests||[{title:command.title,reason:command.reason,destination:command.destination}];
  if(!requests.length)throw Error('Add at least one additional-work request.');
  for(const request of requests){
   requireText(request.title,'Requested work');requireText(request.reason,'Reason');
   if(request.destination!==undefined&&!['PVT','Chemical','Both'].includes(request.destination))throw Error('Select PVT, Chemistry or Both for each request.');
   if(command.requests&&!request.destination)throw Error('Select a responsible team for each request.');
  }
  reason=requests.map(request=>request.reason.trim()).join('; ');
  for(const request of requests)o.additions.push({id:now+':'+o.additions.length,title:request.title.trim(),reason:request.reason.trim(),destination:request.destination,by:actor.id,at:now});
  break;
 }
 case 'schedule':{
  // The responsible team lead assigns; any active employee (any department, the lead included) can be chosen.
  const a=currentActivity();requireRole(actor,'analysis',streamLead(a.stream));active(actor,command.owner);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(command.start)||!/^\d{4}-\d{2}-\d{2}$/.test(command.due)||command.due<command.start)throw Error('Enter a planned start and a due date on or after it.');
  if(a.status==='Completed')throw Error('Completed work is retained; request additional work instead.');
  if(command.owner!==a.owner&&['Workbook Submitted','Awaiting QC','QC Returned'].includes(a.status))throw Error('This test is under review. Finish the review before reassigning it.');
  reason=`${a.owner||'Unassigned'} → ${command.owner}; ${a.start||'unscheduled'}–${a.due||''} → ${command.start}–${command.due}`;
  if(command.owner!==a.owner)(a.history||(a.history=[])).push({at:now,by:actor.id,action:a.owner?'reassigned':'assigned',from:a.owner||undefined,to:command.owner,comments:command.notes});
  Object.assign(a,{owner:command.owner,start:command.start,due:command.due,conditions:command.conditions,notes:command.notes,status:a.status==='Unassigned'?'Scheduled':a.status});break;
 }
 case 'progress':{
  const a=currentActivity();requireAssigned(actor,'analysis',!!a.owner&&actor.id===a.owner);if(actor.id!==a.owner)throw Error('This action is not assigned to your active profile or permission.');
  if(command.status==='Completed')throw Error('A test is completed by QC approval after team-lead review. Submit the workbook to your team lead.');
  if(command.status!=='In Progress')throw Error('Use workbook submission or correction actions for this state.');
  if(a.status==='Completed')throw Error('Completed work is immutable; request additional work.');
  if(['Workbook Submitted','Awaiting QC','QC Returned'].includes(a.status))throw Error('The submitted workbook is under review and cannot be edited.');
  a.status=command.status;a.progressNotes=command.notes;break;
 }
 case 'workbook':{
  const a=currentActivity();requireAssigned(actor,'analysis',!!a.owner&&actor.id===a.owner);if(actor.id!==a.owner)throw Error('This action is not assigned to your active profile or permission.');if(a.status==='Completed')throw Error('Request a correction before replacing completed work.');
  if(a.external)throw Error('This test is performed by a third-party laboratory. Record the returned results, then submit them for review.');
  if(['Workbook Submitted','Awaiting QC','QC Returned'].includes(a.status))throw Error('The current workbook is under review. Wait for the team lead’s decision.');
  if(!command.file.id||command.file.size<=0)throw Error('Upload a workbook first.');
  if(command.notes!==undefined)a.progressNotes=command.notes;
  a.files.push({...command.file,version:a.files.length+1,submittedBy:actor.id,submittedAt:now,status:'Available',comments:''});a.status='Workbook Submitted';
  (a.history||(a.history=[])).push({at:now,by:actor.id,action:'submitted',version:a.files.length,comments:command.notes});break;
 }
 case 'workbook-return':{
  const a=currentActivity();requireAccess(actor,'analysis');if(![holder(actor,streamLead(a.stream)),holder(actor,'reporting')].filter(Boolean).includes(actor.id))throw Error('Only the team lead or report preparer may request a correction.');
  requireText(command.comments,'Correction request');if(!a.files.length)throw Error('No workbook has been submitted.');if(a.status==='Completed')throw Error('QC-approved work is retained; request additional work instead.');a.files[a.files.length-1]={...a.files[a.files.length-1],status:'Changes Requested',comments:command.comments};a.status='Changes Requested';reason=command.comments;
  (a.history||(a.history=[])).push({at:now,by:actor.id,action:'lead-returned',version:a.files.length,comments:command.comments});break;
 }
 case 'lead-review':case 'qc-review':{
  const a=currentActivity();const f=a.files.at(-1);
  if(command.type==='lead-review'){requireRole(actor,'analysis',streamLead(a.stream));if(!['Workbook Submitted','QC Returned'].includes(a.status)||!f)throw Error('There is no submitted workbook waiting for team-lead review.');}
  else{requireRole(actor,'analysis','qcReviewer');if(a.status!=='Awaiting QC'||!f?.leadApprovedAt)throw Error('Only team-lead-approved workbooks can be QC reviewed.');}
  if(command.decision==='return'){
   requireText(command.target,'Affected sheet, section or attachment reference');if(command.comments.trim().length<10)throw Error('Explain the correction specifically (at least a sentence).');
   reason=command.comments.trim();
   if(command.type==='qc-review'){a.files[a.files.length-1]={...f,qcReturnedBy:actor.id,qcReturnedAt:now,qcComments:reason,target:command.target.trim()};a.status='QC Returned';(a.history||(a.history=[])).push({at:now,by:actor.id,action:'qc-returned',version:f.version,target:command.target.trim(),comments:reason});}
   else{a.files[a.files.length-1]={...f,status:'Changes Requested',comments:reason,target:command.target.trim()};a.status='Changes Requested';(a.history||(a.history=[])).push({at:now,by:actor.id,action:'lead-returned',version:f.version,target:command.target.trim(),comments:reason});}
  } else if(command.type==='lead-review'){
   if(a.status==='QC Returned')throw Error('QC returned this workbook. Return it to the employee for correction; a corrected version needs your review again.');
   a.files[a.files.length-1]={...f,leadApprovedBy:actor.id,leadApprovedAt:now};a.status='Awaiting QC';(a.history||(a.history=[])).push({at:now,by:actor.id,action:'lead-approved',version:f.version,comments:command.comments.trim()||undefined});
  } else {
   a.files[a.files.length-1]={...f,qcApprovedBy:actor.id,qcApprovedAt:now};a.status='Completed';(a.history||(a.history=[])).push({at:now,by:actor.id,action:'qc-approved',version:f.version,comments:command.comments.trim()||undefined});
  }
  break;
 }
 case 'report-draft':{
  if(command.kind==='final')requireRole(actor,'analysis','reporting');else requireAssigned(actor,'sampling',actor.id===job.assignedEngineerId||actor.id===latest(o.samplingReports)?.preparedBy);
  const list=command.kind==='sampling'?o.samplingReports:o.finalReports;const old=latest(list);
  const reviewed=command.kind==='sampling'&&dataReviewRequired(job);
  if(reviewed){if(latestData(job)?.status!=='Approved')throw Error('The sampling report is generated after the sampling data is approved.');if(actor.id!==job.assignedEngineerId)throw Error('Only the accountable sampling employee prepares the sampling report.');}
  else if(command.kind==='sampling'&&old&&actor.id!==old.preparedBy)throw Error('Only the recorded preparer can edit this report version.');
  if(old&&!['Draft','Changes Requested'].includes(old.status))throw Error('Create a revision before editing a submitted report.');
  requireText(command.text,'Report summary');if(!reviewed){active(actor,command.checker);if(command.kind==='sampling'&&!actor.policy.sampling.includes(command.checker)&&command.checker!=='MA001')throw Error('The selected checker needs sampling permission.');}
  const version:ReportVersion={version:old?.status==='Draft'?old.version:list.length+1,status:'Draft',text:command.text,preparedBy:actor.id,preparedAt:now,checker:command.kind==='final'?holder(actor,'reporting'):reviewed?'':command.checker,comments:'',snapshot:snapshot(command.kind),file:command.file,...(command.kind==='sampling'&&command.letterhead?{letterhead:command.letterhead}:{})};
  if(old?.status==='Draft')list[list.length-1]=version;else list.push(version);break;
 }
 case 'report-action':{
  const list=command.kind==='sampling'?o.samplingReports:o.finalReports;const r=latest(list);
  // Approving and returning keep their permission; the preparer and named checker act through their assignment.
  requireAssigned(actor,command.kind==='sampling'?'sampling':'analysis',command.kind==='sampling'&&!['approve','return'].includes(command.action)&&!!r&&[r.preparedBy,r.checker].includes(actor.id));
  if(!r)throw Error('Save a report draft first.');
  if(command.action==='checking'){
   if(command.kind!=='sampling'||actor.id!==r.preparedBy||r.status!=='Draft')throw Error('Only the preparer can submit a draft for checking.');
   if(dataReviewRequired(job))throw Error('Reports from approved sampling data go directly to the sampling approver. Use Submit for approval.');
   if(!job.samples?.length||job.samples.some(s=>!s.dataComplete))throw Error('Complete all sample data sheets first.');
   r.snapshot=snapshot(command.kind);r.status='Checking';r.submittedAt=now;if(command.letterhead)r.letterhead=command.letterhead;
  } else if(command.action==='submit'){
   const direct=command.kind==='sampling'&&dataReviewRequired(job)&&!r.checker;
   if(direct){if(actor.id!==r.preparedBy||actor.id!==job.assignedEngineerId||r.status!=='Draft')throw Error('Only the accountable sampling employee can submit this report for approval.');if(latestData(job)?.status!=='Approved')throw Error('The sampling data must be approved before the report is submitted.');}
   else{const ready=command.kind==='sampling'?r.status==='Checking':r.status==='Draft';
   if(actor.id!==r.checker||!ready)throw Error('Only the named checker can forward this version.');}
   if(r.snapshot!==snapshot(command.kind))throw Error('The draft or checked evidence changed. Save an updated draft or return this version for correction before submission.');
   if(command.kind==='final'&&qcPending(next))throw Error(testsAwaitingQcApproval(next).length+' required test(s) are not yet QC approved. Final reporting waits for every QC approval.');
   if(command.kind==='final'&&(!finalReady(next)||!r.file))throw Error('Complete required work, sampling approval and physical receipt, and attach the final report.');
   if(!direct)r.checkedAt=now;r.submittedAt=now;r.status='Awaiting Approval';r.snapshot=snapshot(command.kind);if(command.kind==='sampling'&&command.letterhead)r.letterhead=command.letterhead;
  } else if(command.action==='approve'){
   const approver=holder(actor,command.kind==='sampling'?'samplingApproval':'finalApproval');
   if(!approver)throw Error(responsibilityLabels[command.kind==='sampling'?'samplingApproval':'finalApproval']+' is not configured. Ask an administrator to assign it in Settings → Authorization.');
   if(actor.id!==approver||r.status!=='Awaiting Approval')throw Error('Only the named approver can approve the submitted version.');
   if(r.snapshot!==snapshot(command.kind))throw Error('The submitted evidence changed. Return this version and review a new revision.');
   if(command.kind==='final'&&qcPending(next))throw Error(testsAwaitingQcApproval(next).length+' required test(s) are not yet QC approved. Final approval waits for every QC approval.');
   if(command.kind==='sampling'&&dataReviewRequired(job)&&latestData(job)?.status!=='Approved')throw Error('The sampling data must be approved before the report.');
   if(command.kind==='final'&&!finalReady(next))throw Error('Required work changed or remains incomplete. Return this version for correction.');
   r.approvedBy=actor.id;r.approvedAt=now;r.status='Approved';
   // The details shown on the approved report are frozen here; later edits to job, client, company or people do not reach it.
   if(command.kind==='sampling'&&command.letterhead)r.letterhead=command.letterhead;
  } else if(command.action==='return'){
   const reviewer=r.status==='Checking'?r.checker:holder(actor,command.kind==='sampling'?'samplingApproval':'finalApproval');if(!reviewer||actor.id!==reviewer||!['Checking','Awaiting Approval'].includes(r.status))throw Error('Only the current reviewer can return a submitted version.');
   requireText(command.comments,'Correction comments');r.status='Changes Requested';r.comments=command.comments;reason=command.comments;
  } else {
   if(actor.id!==r.preparedBy||!['Approved','Changes Requested'].includes(r.status))throw Error('Only the preparer can create a revision of an approved or returned report.');
   requireText(command.comments,'Revision reason');list.push({...r,version:list.length+1,status:'Draft',file:command.kind==='final'?undefined:r.file,preparedAt:now,approvedAt:undefined,approvedBy:undefined,checkedAt:undefined,submittedAt:undefined,comments:command.comments,snapshot:snapshot(command.kind),letterhead:command.kind==='sampling'?command.letterhead:undefined});reason=command.comments;
  }break;
 }
 case 'estimate':{
  if(!job.operations&&!isDraft(job))throw Error('Schedule estimates are recorded on jobs in the current workflow. This job was recorded in the earlier workflow.');
  if(!estimateKeyPattern.test(command.key))throw Error('This activity cannot be scheduled.');
  if(!estimatePlanner(actor,command.key))throw Error('Schedule estimates are entered by the job coordinator, the scope selector, the PVT Supervisor or the responsible team lead.');
  const value=normalizeEstimate(command);const plan=o.progressPlan||(o.progressPlan={});const before=plan[command.key];
  const describe=(e?:{start?:string;days?:number;finish?:string;clientVisible?:boolean})=>e?[e.start||'start TBC',e.days?e.days+' d':'duration TBC',e.finish||'completion TBC',e.clientVisible?'client-visible':'internal'].join(' · '):'no estimate';
  if(value)plan[command.key]={...value,clientVisible:!!command.clientVisible,by:actor.id,at:now};else delete plan[command.key];
  reason=(command.label||command.key)+': '+describe(before)+' → '+describe(value?{...value,clientVisible:command.clientVisible}:undefined);
  break;
 }
 case 'handover-send':{
  // The assigned driver acts through the job assignment (job details access); the engineer needs sampling access.
  if(!job.assignedDriverId||actor.id!==job.assignedDriverId){requireAssigned(actor,'sampling',actor.id===job.assignedEngineerId);if(actor.id!==job.assignedEngineerId)throw Error('Only the assigned engineer or driver can send the samples.');}
  if(!samplingApproved(next))throw Error('Obtain sampling-report approval before transferring bottles.');
  if(o.handover)throw Error('Handover already recorded. Use receipt notes for discrepancies.');
  if(command.sampleIds.length!==job.samples?.length)throw Error('Select all job samples for this handover. Partial-shipment handling needs confirmation.');
  if(!command.sampleIds.length||command.sampleIds.length!==new Set(command.sampleIds).size||command.sampleIds.some(id=>{const s=job.samples?.find(s=>s.id===id);return !s||!containerId(s);}))throw Error('Select existing samples with a recorded cylinder serial or glass-container ID.');
  const sent=command.sampleIds.map(id=>job.samples!.find(s=>s.id===id)!);o.handover={sampleIds:command.sampleIds,bottles:Object.fromEntries(sent.map(s=>[s.id,containerId(s)])),containerTypes:Object.fromEntries(sent.map(s=>[s.id,isGlass(s)?'Glass container':'Bottle'])),sentBy:actor.id,sentAt:now,notes:command.notes};break;
 }
 case 'handover-receive':{
  requireRole(actor,'analysis','labReceipt');if(!o.handover||o.handover.receivedAt)throw Error('There is no outstanding transfer to receive.');
  o.handover.receivedBy=actor.id;o.handover.receivedAt=now;o.handover.notes+="\nReceipt: "+command.notes;break;
 }
 }
 // A scope or workbook change invalidates a pending final review, never overwrites an approved version.
 if(['scope','request-addition','add-validation','workbook-return'].includes(command.type)||(command.type==='lab-scope'&&command.action==='release')){
  const r=latest(o.finalReports);if(r?.status==='Awaiting Approval'){r.status='Changes Requested';r.comments='Scope or workbook state changed. Review a new revision.';}
  if(r?.status==='Approved')o.finalReports.push({...r,version:o.finalReports.length+1,status:'Changes Requested',file:undefined,approvedAt:undefined,approvedBy:undefined,comments:'Additional work or workbook correction requires a new report revision.'});
 }
 o.revision++;o.history.push({at:now,by:actor.id,action:command.type,reason});next.lastUpdatedById=actor.id;next.lastUpdatedAt=now;
 next.status=operationComplete(next)?'Completed':samplingApproved(next)?'Sampling Completed':next.status==='Completed'?'Report Draft':next.status;
 return next;
}
export type SamplingStatusKey='draft'|'preparation'|'data'|'data-review'|'returned'|'report-generation'|'report-review'|'report-approved';
export type SamplingStatus={key:SamplingStatusKey;label:string;owner?:string;next:string;tab:string;/** Supporting sampling employees may help at this point. */team:boolean};
/** One understandable sampling status, mapped from the data review, sampling report and legacy records. */
export function samplingStatus(job:JobRecord,roles:Responsibilities=storedResponsibilities()):SamplingStatus{
 const o=operationsFor(job),d=latestData(job),r=latest(o.samplingReports),lead=job.assignedEngineerId;
 if(isDraft(job))return {key:'draft',label:'Draft · not sent to Sampling',owner:job.createdById,next:'Send the job to Sampling',tab:'overview',team:false};
 if(samplingApproved(job))return {key:'report-approved',label:o.scopeConfirmedAt?'Sampling report approved · laboratory scope released':'Sampling report approved · laboratory scope needed',owner:o.scopeConfirmedAt?undefined:roles.scopeSelector,next:o.scopeConfirmedAt?'Sampling complete':'Define the laboratory scope',tab:'scope',team:false};
 if(r?.status==='Awaiting Approval')return {key:'report-review',label:'Awaiting report approval',owner:roles.samplingApproval,next:'Review and approve the sampling report',tab:'sampling-report',team:false};
 if(r?.status==='Checking')return {key:'report-review',label:'Sampling report with checker',owner:r.checker,next:'Check the report and submit it for approval',tab:'sampling-report',team:false};
 const reviewed=dataReviewRequired(job);
 if(r?.status==='Changes Requested'&&(!reviewed||d?.status==='Approved'))return {key:'returned',label:'Returned for correction · sampling report',owner:reviewed?lead:r.preparedBy,next:'Correct the sampling report and resubmit it',tab:'sampling-report',team:false};
 if(!reviewed)return {key:'report-generation',label:'Sampling report in preparation',owner:r?.preparedBy||lead,next:'Complete the sampling report',tab:'sampling-report',team:false};
 if(d?.status==='Submitted')return {key:'data-review',label:'Awaiting data review',owner:roles.samplingApproval,next:'Review the submitted sampling data',tab:'sampling-report',team:false};
 if(d?.status==='Returned')return {key:'returned',label:'Returned for correction · sampling data',owner:lead,next:'Correct the sampling data and resubmit',tab:'sampling',team:true};
 if(d?.status==='Approved')return {key:'report-generation',label:'Data approved · report generation needed',owner:lead,next:r?.status==='Draft'?'Submit the sampling report for approval':'Generate the sampling report',tab:'sampling-report',team:false};
 if(!preparationDone(job))return {key:'preparation',label:'Assigned · preparation needed',owner:lead,next:'Complete sampling preparation',tab:'sampling',team:true};
 const ready=!!job.samples?.length&&job.samples.every(s=>s.dataComplete);
 return {key:'data',label:d?.status==='Reopened'?'Sampling data reopened for correction':'Sampling data in progress',owner:lead,next:ready?'Review and submit the sampling data':'Complete the sample data sheets',tab:'sampling',team:true};
}
export function operationMilestones(job:JobRecord,roles:Responsibilities=storedResponsibilities()){const st=samplingStatus(job,roles);const early=['draft','preparation','data','returned'].includes(st.key)&&st.tab==='sampling';const o=operationsFor(job);const needsScope=!o.scopeConfirmedAt||o.additions.some(a=>!a.confirmedAt);const unplanned=o.activities.find(a=>a.required&&(!a.owner||!a.start||!a.due))||(unplannedValidation(job).length?{stream:'PVT' as Stream}:undefined);const lab=o.activities.filter(a=>a.required);const sampleDone=!!job.samples?.length&&job.samples.every(s=>s.dataComplete);return [
 {id:'overview',label:'Job creation',done:!!o.dispatchedAt||legacyDispatch(job),note:legacyDispatch(job)?'Dispatch not recorded (legacy)':undefined,owner:job.createdById,next:isDraft(job)?'Complete the draft and send it to Sampling':'Review and send the job to Sampling'},
 {id:'sampling',label:'Sampling',done:dataReviewRequired(job)?['Submitted','Approved'].includes(latestData(job)?.status||'')||samplingApproved(job):sampleDone,owner:job.assignedEngineerId,next:early?st.next:'Complete the sample data sheets'},
 {id:'sampling-report',label:'Sampling review & report approval',done:samplingApproved(job),owner:early?job.assignedEngineerId:st.owner,next:early?'Submit sampling data for review':st.next},
 {id:'handover',label:'Sample handover',done:!!o.handover?.receivedAt,owner:o.handover?.sentAt?roles.labReceipt||undefined:job.assignedDriverId,next:o.handover?.receivedAt?'Receipt recorded':o.handover?'Confirm physical receipt':'Send approved samples'},
 {id:'scope',label:'Laboratory scope',done:!!o.scopeConfirmedAt&&!unplannedValidation(job).length&&lab.every(a=>a.owner&&a.start&&a.due),owner:needsScope||!unplanned?roles.scopeSelector:roles[streamLead(unplanned.stream)],next:needsScope?(samplingApproved(job)?'Select and release the laboratory scope per sample':'Laboratory scope opens after sampling-report approval'):'Team leads assign and schedule tests'},
 {id:'laboratory',label:'Laboratory work',done:allWorkDone(job),owner:lab.find(a=>a.status!=='Completed')?.owner,next:'Complete assigned tests, team-lead review and QC'},
 {id:'reporting',label:'Final reporting',done:latest(o.finalReports)?.status==='Approved'&&finalReady(job),owner:latest(o.finalReports)?.status==='Awaiting Approval'?roles.finalApproval:roles.reporting,next:qcPending(job)?testsAwaitingQcApproval(job).length+' test(s) awaiting QC approval':latest(o.finalReports)?.status||'Collect QC-approved workbooks and prepare the final report'},
 {id:'completion',label:'Completion',done:operationComplete(job),owner:undefined,next:operationComplete(job)?'All required work and approvals complete':'Complete required work and approvals'},
 ];}


/** Independent queues keep parallel laboratory streams actionable. */
export function pendingActions(job:JobRecord, actor:Actor) {
 const o=operationsFor(job), final=latest(o.finalReports);
 const roles=actorRoles(actor);const st=samplingStatus(job,roles);const early=['draft','preparation','data','returned'].includes(st.key)&&st.tab==='sampling';
 const actions=operationMilestones(job,roles).filter(m=>{
  if(m.done||(m.owner!==actor.id&&!(m.id==='sampling'&&st.team&&samplingWorkers(job).includes(actor.id))))return false;
  if(m.id==='overview')return !o.dispatchedAt&&hasAccess(actor,'createJob');
  if(m.id==='sampling')return !!o.dispatchedAt&&hasAccess(actor,'sampling');
  if(m.id==='sampling-report')return (!!o.dispatchedAt||legacyDispatch(job))&&!early&&st.key!=='report-approved'&&hasAccess(actor,'sampling');
  if(m.id==='handover')return samplingApproved(job)&&(o.handover?hasAccess(actor,'analysis'):hasAccess(actor,'sampling'));
  if(m.id==='scope')return hasAccess(actor,'analysis')&&(!o.scopeConfirmedAt&&samplingApproved(job)||o.additions.some(a=>!a.confirmedAt));
  if(m.id==='reporting')return hasAccess(actor,'analysis')&&!qcPending(job)&&(finalReady(job)||final?.status==='Changes Requested');
  return false;
 }).map(m=>({...m,next:m.id==='sampling'?(m.owner===actor.id?st.next:'Help complete the sampling data ('+(actor.employees.find(e=>e.id===job.assignedEngineerId)?.name||'accountable employee')+' submits)'):m.id==='sampling-report'?st.next:m.id==='reporting'?(final?.status==='Awaiting Approval'?'Review and approve this final report':final?.status==='Changes Requested'?'Prepare a corrected report revision':'Collect workbooks and prepare final report'):m.next}));
 for(const stream of ['PVT','Chemical'] as const){
  if(!roles[streamLead(stream)]||actor.id!==roles[streamLead(stream)]||!hasAccess(actor,'analysis'))continue;
  const unplanned=o.activities.filter(a=>a.required&&a.stream===stream&&(!a.owner||!a.start||!a.due));
  if(unplanned.length)actions.push({id:'laboratory',label:stream+' planning',done:false,owner:actor.id,next:'Assign and schedule '+unplanned.length+' required activities'});
  const submitted=o.activities.filter(a=>a.stream===stream&&a.status==='Workbook Submitted').length,qcBack=o.activities.filter(a=>a.stream===stream&&a.status==='QC Returned').length;
  if(submitted)actions.push({id:'laboratory',label:stream+' workbook review',done:false,owner:actor.id,next:'Review '+submitted+' submitted workbook(s)'});
  if(qcBack)actions.push({id:'laboratory',label:stream+' QC returns',done:false,owner:actor.id,next:'Review QC comments on '+qcBack+' workbook(s)'});
 }
 if(hasAccess(actor,'analysis')){
  const mine=o.activities.filter(a=>a.owner===actor.id&&['Scheduled','In Progress','Changes Requested'].includes(a.status));
  const returned=mine.filter(a=>a.status==='Changes Requested').length;
  if(returned)actions.push({id:'laboratory',label:'Returned tests',done:false,owner:actor.id,next:'Correct and resubmit '+returned+' returned workbook(s)'});
  if(mine.length>returned)actions.push({id:'laboratory',label:'Assigned tests',done:false,owner:actor.id,next:'Complete '+(mine.length-returned)+' test(s) and submit the workbook'});
  const waiting=o.activities.filter(a=>a.status==='Awaiting QC').length;
  // An unconfigured QC reviewer is a blocker shown in My work, not an action for team leads or the supervisor.
  if(waiting&&roles.qcReviewer===actor.id)actions.push({id:'reporting',label:'QC review',done:false,owner:actor.id,next:'QC review '+waiting+' team-lead-approved workbook(s)'});
 }
 return actions;
}
