import type { JobRecord } from './page';
import { defaultResponsibilities, roleHolder, storedResponsibilities, responsibilityLabels, type Authorization, type Permission, type Responsibilities, type Responsibility } from './authorization';
import type { Employee } from './employee-directory';
import { containerId, containerLabel, isGlass, type ContainerType } from './sample-container';
import { scopeTestOptions, isValidationTest } from './lab-work';
import type { TestRouting } from './test-routing';
import { preparationDone } from './sampling-validation';
import type { LabTeams } from './lab-teams';
export type Stream = 'PVT' | 'Chemical';
/** Team lead who plans, assigns and reviews each laboratory workstream. */
export const streamLead = (stream:Stream):Responsibility=>stream==='PVT'?'pvtTeamLead':'chemicalTeamLead';
/** Workbook Submitted = awaiting team-lead review; Changes Requested = returned to the employee; QC Returned = back with the team lead; Completed = QC approved. */
export type WorkState = 'Unassigned' | 'Scheduled' | 'In Progress' | 'Workbook Submitted' | 'Changes Requested' | 'Awaiting QC' | 'QC Returned' | 'Completed';
export type FileVersion = { id:string; name:string; size:number; type:string; version:number; submittedBy:string; submittedAt:string; status:'Available'|'Changes Requested'; comments:string; /** Sheet, section or attachment reference named in a return. */target?:string; leadApprovedBy?:string; leadApprovedAt?:string; qcApprovedBy?:string; qcApprovedAt?:string; qcReturnedBy?:string; qcReturnedAt?:string; qcComments?:string };
export type ActivityEvent = { at:string; by:string; action:'assigned'|'reassigned'|'submitted'|'lead-approved'|'lead-returned'|'qc-approved'|'qc-returned'; version?:number; target?:string; comments?:string; from?:string; to?:string };
export type ActivityRecord = { id:string; scopeId:string; /** Shared by the PVT and Chemical items created for one test sent to both sections. */linkId?:string; sampleId:string; title:string; stream:Stream; owner:string; start:string; due:string; conditions:string; notes:string; status:WorkState; files:FileVersion[]; required:boolean; kind?:'validation'|'analysis'; /** Assignment, submission and review decisions, oldest first. */history?:ActivityEvent[]; /** The assigned employee's own progress notes; notes keep the team lead's instructions. */progressNotes?:string };
export type ScopeRecord = { id:string; linkId?:string; title:string; sampleIds:string[]; stream:Stream; notes:string; addedBy:string; at:string; reason:string; source:'Original request'|'Additional work' };
export type ReportVersion = { version:number; status:'Draft'|'Checking'|'Awaiting Approval'|'Changes Requested'|'Approved'; text:string; preparedBy:string; preparedAt:string; checker:string; checkedAt?:string; submittedAt?:string; approvedBy?:string; approvedAt?:string; comments:string; snapshot:string; file?:FileVersion };
export type Destination = Stream | 'Both';
/** One sample in a laboratory-scope version. Container details are copied so issued documents never change. */
export type SampleScope = { sampleId:string; containerType:ContainerType; containerLabel:string; destination:Destination; pvtTests:string[]; chemicalTests:string[]; notes:string; excluded:boolean; exclusionReason:string };
/** Per-sample laboratory scope selected after sampling-report approval. Released versions are never edited. */
export type LabScopeVersion = { version:number; status:'Draft'|'Released'; samples:SampleScope[]; conditions:Operations['conditions']; /** Test routing in force when this version was saved or released. */routing:TestRouting; reason:string; preparedBy:string; savedAt:string; releasedBy?:string; releasedAt?:string; job:{jobNumber:string;clientName:string;fieldArea:string;well:string;samplingSource:string} };
/** A reviewer comment pointing at the job, a section, or a sample (target ids from reviewTargets). */
export type ReviewComment = { target:string; label:string; text:string };
/** One submission of sampling data and its review. Data approval is separate from sampling-report approval. */
export type DataReview = { version:number; status:'Submitted'|'Returned'|'Approved'|'Reopened'; submittedBy:string; submittedAt:string; snapshot:string; note:string; reviewedBy?:string; reviewedAt?:string; general?:string; comments:ReviewComment[]; reopenedBy?:string; reopenedAt?:string; reason?:string };
export type Operations = { version:1; labScopes?:LabScopeVersion[]; samplingData?:DataReview[]; revision:number; originalRequest:string[]; scope:ScopeRecord[]; activities:ActivityRecord[]; conditions:{pressure:string;pressureUnit:string;temperature:string;temperatureUnit:string;notes:string}; scopeConfirmedAt?:string; dispatchedAt?:string; dispatchedBy?:string; samplingReports:ReportVersion[]; finalReports:ReportVersion[]; handover?:{sampleIds:string[];/** Container identifier per sample (bottle serial or glass-container ID). */bottles:Record<string,string>;containerTypes?:Record<string,ContainerType>;sentBy:string;sentAt:string;receivedBy?:string;receivedAt?:string;notes:string}; additions:{id:string;title:string;reason:string;by:string;at:string;confirmedAt?:string}[]; history:{at:string;by:string;action:string;reason:string}[] };
export const clarificationItems = [
 ['initial-scope','Initial scope owner','Confirm who selects and signs off the initial request before sampling. Existing job-creation permissions remain in use.'],
 ['sampling-review','Sampling preparer and checker','Confirm eligibility and independence rules. A named active preparer and checker are required; the checker forwards the reviewed version to the sampling approver.'],
 ['lab-entry','Laboratory entry dependency','Confirm whether laboratory execution may start before approved sampling reports or physical receipt. These milestones are displayed separately; no new automatic execution gate is inferred.'],
 ['validation-rules','Validation applicability','Confirm which steps are mandatory and whether individual steps may be omitted. The supplied sequence is generated per sample; no automatic omission rule is applied.'],
 ['validation-source','Other sampling types','Validation sequences are supplied for Bottom-hole, Wellhead and Separator only. Confirm the sequence for other sampling or transfer methods before confirming their Validation scope.'],
 ['bv','PV / historical BV terminology','New Validation sequences use PV as specified in the latest verification request. Existing BV and PV records are preserved. Confirm their technical meaning and equivalence before renaming or reconciling historical work.'],
 ['workbook-review','Workbook review ownership','Team leads review workbooks. QC review is a separate responsibility that stays unassigned until configured in Settings; no QC identity is invented.'],
 ['final-review','Final preparation / review overlap','Ahmed prepares and reviews the final report; Wilfred approves. Confirm whether an independent reviewer is additionally required.'],
 ['scope-additions','Scope addition authority','Confirm who may authorize additional work. Requests are recorded and the scope selector explicitly confirms lab scope; planning remains with the PVT and Chemical Team Leads.'],
 ['partial-handover','Partial sample shipments','This handover records all job bottles together. Confirm partial-shipment and receipt rules before splitting a transfer.'],
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
/** The assignee is no longer in the stream's configured team. Shown as a flag; the assignment is never changed automatically. */
export const teamMismatch=(a:ActivityRecord,teams?:LabTeams|null)=>!!a.owner&&a.status!=='Completed'&&!!teams&&!teams[a.stream].includes(a.owner);
export function samplingApproved(job:JobRecord):boolean { const reports=operationsFor(job).samplingReports;return reports.length?latest(reports)?.status==='Approved':job.report?.reportStatus==='Completed'&&!!job.report.approvedAt&&!!job.report.approvedBy; }
/** Sampling was approved in the older workflow, before dispatch records existed. No dispatch is fabricated. */
export function legacyDispatch(job:JobRecord):boolean { const o=operationsFor(job);return !o.dispatchedAt&&!o.samplingReports.length&&samplingApproved(job); }
export function allWorkDone(job:JobRecord):boolean {const o=operationsFor(job);return !!o.scopeConfirmedAt && o.activities.filter(a=>a.required).every(a=>a.status==='Completed'&&a.files.some(f=>f.status==='Available')) && !o.additions.some(a=>!a.confirmedAt);}
export function finalReady(job:JobRecord):boolean {const o=operationsFor(job);const required=[...new Set(o.scope.flatMap(s=>s.sampleIds))];return allWorkDone(job)&&samplingApproved(job)&&!!o.handover?.receivedAt&&required.every(id=>o.handover!.sampleIds.includes(id));}
export function operationComplete(job:JobRecord):boolean {return finalReady(job)&&latest(operationsFor(job).finalReports)?.status==='Approved';}
export type Actor = { id:string; employees:Employee[]; policy:Authorization; roles?:Responsibilities; /** Current test routing; null when the saved settings cannot be read. */routing?:TestRouting|null; /** Laboratory team lists; null when the saved settings cannot be read. */teams?:LabTeams|null };
/** The valid holder of a duty for this actor's settings ('' when unassigned or invalid). */
export const holder=(actor:Actor,key:Responsibility)=>roleHolder(actor.roles||defaultResponsibilities,key,actor.employees);
export function hasAccess(actor:Actor,permission:Permission) {return actor.employees.some(e=>e.id===actor.id&&e.active)&&((actor.id==='MA001'&&permission!=='createJob')||actor.policy[permission].includes(actor.id));}
function requireAccess(actor:Actor,permission:Permission,id?:string){if(!hasAccess(actor,permission)||(id&&actor.id!==id))throw Error('This action is not assigned to your active profile or permission.');}
/** Draft jobs are visible to job creators, their author and the project administrator only. */
export const canSeeDraft=(job:JobRecord,actor:Actor)=>!isDraft(job)||actor.id===job.createdById||actor.id==='MA001'||hasAccess(actor,'createJob');
const canSample=(actor:Actor,id:string)=>id==='MA001'||actor.policy.sampling.includes(id);
function active(actor:Actor,id:string){if(!actor.employees.some(e=>e.id===id&&e.active))throw Error('Select an active employee.');}
/** Permission and duty must both pass. An unassigned duty blocks the action instead of opening it to everyone. */
function requireRole(actor:Actor,permission:Permission,...keys:Responsibility[]){requireAccess(actor,permission);const ids=keys.map(key=>holder(actor,key));if(ids.every(id=>!id))throw Error(responsibilityLabels[keys[0]]+' is not configured. Ask an administrator to assign it in Settings → Authorization.');if(!ids.includes(actor.id))throw Error('This action is not assigned to your active profile or permission.');}
/** Every duty resolved to a valid holder for this actor's settings. */
export const actorRoles=(actor:Actor)=>Object.fromEntries(Object.keys(responsibilityLabels).map(key=>[key,holder(actor,key as Responsibility)])) as Responsibilities;
function requireText(value:string,label:string){if(!value.trim())throw Error(label+' is required.');}
/** Validation steps for one sample, from its recorded sample nature or the job's sampling type. */
export function sampleSequence(job:JobRecord,sampleId:string){const nature=job.samples?.find(s=>s.id===sampleId)?.fieldData?.sampleNature;const source=({BHS:'Bottom-hole',WHS:'Wellhead',SEP:'Separator'} as Record<string,string>)[nature||'']||job.samplingSource||'';return validationSequence(source);}
const streamsOf=(d:Destination):Stream[]=>d==='Both'?['PVT','Chemical']:[d];
const testsIn=(s:Pick<SampleScope,'pvtTests'|'chemicalTests'>,stream:Stream)=>stream==='PVT'?s.pvtTests:s.chemicalTests;
/** Work already released keeps its section even if Settings routing changes later. */
const releasedIn=(v:LabScopeVersion|undefined,sampleId:string,stream:Stream,test:string)=>!!v?.samples.some(p=>p.sampleId===sampleId&&!p.excluded&&testsIn(p,stream).includes(test));
/** Every check a scope release needs. Returns problems instead of throwing so the review panel can list them. */
export function labScopeProblems(job:JobRecord,samples:Omit<SampleScope,'containerType'|'containerLabel'>[],conditions:Operations['conditions'],routing:TestRouting|null|undefined,roles:Responsibilities,previous?:LabScopeVersion):string[]{
 const problems:string[]=[];
 if(!routing)return ['Laboratory test routing settings cannot be read. Ask an administrator to restore them in Settings → Authorization.'];
 const ids=(job.samples||[]).map(s=>s.id);
 if(samples.length!==ids.length||ids.some(id=>samples.filter(s=>s.sampleId===id).length!==1))problems.push('Every job sample needs one scope entry.');
 for(const s of samples){
  const label='Sample '+s.sampleId;const tests=[...s.pvtTests,...s.chemicalTests];
  if(s.excluded){if(!s.exclusionReason.trim())problems.push(label+': give a reason for excluding it.');if(tests.length)problems.push(label+': an excluded sample cannot have tests.');continue;}
  if(!tests.length)problems.push(label+' has no tests. Select tests or explicitly exclude it with a reason.');
  for(const stream of ['PVT','Chemical'] as const){const list=testsIn(s,stream);
   if(list.length&&!streamsOf(s.destination).includes(stream))problems.push(label+': '+stream+' tests need the destination '+stream+' or Both.');
   if(new Set(list).size!==list.length)problems.push(label+': a test is listed twice in '+stream+'.');
   for(const test of list){if(!scopeTestOptions.includes(test))problems.push(label+': “'+test+'” is not in the test catalog.');else if(routing[test]&&routing[test]!=='Both'&&routing[test]!==stream&&!releasedIn(previous,s.sampleId,stream,test))problems.push(label+': “'+test+'” is routed to '+routing[test]+' in Settings, not '+stream+'.');}
  }
  if(tests.some(isValidationTest)&&!sampleSequence(job,s.sampleId).length)problems.push(label+': needs clarification — no Validation sequence for this sampling type.');
 }
 const used=new Set(samples.flatMap(s=>(['PVT','Chemical'] as const).filter(stream=>testsIn(s,stream).length)));
 for(const stream of used)if(!roles[streamLead(stream)])problems.push(responsibilityLabels[streamLead(stream)]+' is not configured. Ask an administrator to assign it in Settings → Authorization.');
 if(samples.some(s=>!s.excluded&&[...s.pvtTests,...s.chemicalTests].some(isValidationTest))&&(!conditions.pressure||!conditions.temperature))problems.push('Record reservoir pressure and temperature for Validation (Restoration).');
 for(const value of [conditions.pressure,conditions.temperature])if(value&&!Number.isFinite(Number(value)))problems.push('Reservoir conditions must be numeric.');
 if(!samples.some(s=>!s.excluded))problems.push('Select tests for at least one sample.');
 if(previous)for(const p of previous.samples){if(p.excluded)continue;const n=samples.find(s=>s.sampleId===p.sampleId);
  if(!n||n.excluded){problems.push('Sample '+p.sampleId+' was released for testing and cannot be excluded in a revision.');continue;}
  for(const stream of ['PVT','Chemical'] as const)for(const test of testsIn(p,stream))if(!testsIn(n,stream).includes(test))problems.push('Sample '+p.sampleId+': released '+stream+' test “'+test+'” cannot be removed or moved in a revision.');}
 return [...new Set(problems)];
}
export type Command =
 | {type:'dispatch';engineer:string;driver:string;/** Supporting sampling employees besides the accountable engineer. */team?:string[]}
 | {type:'data-submit';note:string}
 | {type:'data-return';general:string;comments:ReviewComment[]}
 | {type:'data-approve'}
 | {type:'data-reopen';reason:string}
 | {type:'lab-scope';action:'save'|'release';samples:Omit<SampleScope,'containerType'|'containerLabel'>[];conditions:Operations['conditions'];reason:string}
 | {type:'scope';items:{title:string;sampleIds:string[];stream:Stream}[];conditions:Operations['conditions'];reason:string;additionId?:string}
 | {type:'request-addition';title:string;reason:string}
 | {type:'schedule';id:string;owner:string;start:string;due:string;conditions:string;notes:string}
 | {type:'progress';id:string;status:WorkState;notes:string}
 | {type:'workbook';id:string;notes?:string;file:Omit<FileVersion,'version'|'submittedBy'|'submittedAt'|'status'|'comments'>}
 | {type:'workbook-return';id:string;comments:string}
 | {type:'lead-review';id:string;decision:'approve'|'return';target:string;comments:string}
 | {type:'qc-review';id:string;decision:'approve'|'return';target:string;comments:string}
 | {type:'report-draft';kind:'sampling'|'final';text:string;checker:string;file?:FileVersion}
 | {type:'report-action';kind:'sampling'|'final';action:'checking'|'submit'|'return'|'approve'|'revise';comments:string}
 | {type:'handover-send';sampleIds:string[];notes:string}
 | {type:'handover-receive';notes:string};
export function applyOperation(job:JobRecord,command:Command,actor:Actor,now=new Date().toISOString()):JobRecord {
 requireAccess(actor,'jobDetails');
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
  for(const id of team){active(actor,id);if(!canSample(actor,id))throw Error((actor.employees.find(e=>e.id===id)?.name||id)+' needs sampling access before assignment.');}
  active(actor,command.driver);
  next.samplingTeamIds=team.slice(1);if(isDraft(job))next.status='Job Created';
  // Laboratory tests requested at creation stay reference information; the laboratory scope is selected after sampling approval.
  o.originalRequest=[...(job.requiredTests||[])];
  next.assignedEngineerId=command.engineer;next.assignedDriverId=command.driver;next.responsibleId=command.engineer;
  next.teamWork={...job.teamWork,sampling:{...job.teamWork?.sampling,owner:command.engineer,acceptedAt:now},transport:{...job.teamWork?.transport,owner:command.driver}};
  o.dispatchedAt=now;o.dispatchedBy=actor.id;break;
 }
 case 'scope':{
  requireRole(actor,'analysis','scopeSelector');requireText(command.reason,'Scope confirmation / change reason');reason=command.reason;
  if(!command.additionId&&o.labScopes?.some(v=>v.status==='Released'))throw Error('This job uses the per-sample laboratory scope. Revise it in Laboratory scope.');
  if(!command.items.length)throw Error('Select at least one requested activity.');
  if(!['psi','bar','kPa','MPa'].includes(command.conditions.pressureUnit)||!['°C','°F','K'].includes(command.conditions.temperatureUnit))throw Error('Select valid pressure and temperature units.');
  for(const value of [command.conditions.pressure,command.conditions.temperature])if(value&&!Number.isFinite(Number(value)))throw Error('Conditions must be numeric when supplied.');
  const addition=command.additionId?o.additions.find(a=>a.id===command.additionId&&!a.confirmedAt):undefined;if(command.additionId&&!addition)throw Error('Additional-work request was already confirmed.');
  for(const item of command.items){
   requireText(item.title,'Activity');if(!item.sampleIds.length||item.sampleIds.some(id=>!job.samples?.some(s=>s.id===id)))throw Error('Select existing samples for each scope item.');
   if(!addition&&!o.originalRequest.includes(item.title))throw Error('New work must first be recorded as an additional-work request.');
   if(addition&&item.title!==addition.title)throw Error('Confirm the requested additional work without replacing its identity.');
   const scopeId=(addition?.id||'original')+':'+item.title;
   const existing=o.scope.find(s=>s.id===scopeId);
   if(existing&&(existing.stream!==item.stream||item.sampleIds.length!==existing.sampleIds.length||item.sampleIds.some(id=>!existing.sampleIds.includes(id))))throw Error('Use an additional-work request to change an existing confirmed scope.');
   if(existing)continue;
   const validation=/Validation$/.test(item.title);
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
  requireAccess(actor,'sampling');if(!job.assignedEngineerId||actor.id!==job.assignedEngineerId)throw Error('Only the accountable sampling employee ('+(actor.employees.find(e=>e.id===job.assignedEngineerId)?.name||'not assigned')+') can submit the sampling data.');
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
  requireAccess(actor,'sampling');requireText(command.reason,'Reason for correcting approved data');
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
  if(o.scope.some(s=>!s.id.startsWith('labscope:'))&&!o.labScopes?.length)throw Error('This job’s scope was confirmed in the earlier workflow. Record further work as an additional-work request.');
  const versions=o.labScopes||(o.labScopes=[]);const last=versions.at(-1);const previous=[...versions].reverse().find(v=>v.status==='Released');
  const samples:SampleScope[]=command.samples.map(s=>{const sample=job.samples?.find(x=>x.id===s.sampleId);if(!sample)throw Error('Sample '+s.sampleId+' no longer exists.');return {...s,pvtTests:[...s.pvtTests],chemicalTests:[...s.chemicalTests],notes:s.notes.trim(),exclusionReason:s.exclusionReason.trim(),containerType:isGlass(sample)?'Glass container':'Bottle',containerLabel:containerLabel(sample)};});
  const version:LabScopeVersion={version:last?.status==='Draft'?last.version:versions.length+1,status:'Draft',samples,conditions:{...command.conditions},routing:{...(actor.routing||{})},reason:command.reason.trim(),preparedBy:actor.id,savedAt:now,job:{jobNumber:job.jobNumber,clientName:job.clientName,fieldArea:job.fieldArea||'',well:job.wellMode==='multiple'?(job.wells||[]).filter(Boolean).join(', '):job.well||'',samplingSource:job.samplingSource||''}};
  if(command.action==='release'){
   const problems=labScopeProblems(job,command.samples,command.conditions,actor.routing,actorRoles(actor),previous);if(problems.length)throw Error(problems.join(' '));
   if(previous)requireText(command.reason,'Revision reason');
   version.status='Released';version.releasedBy=actor.id;version.releasedAt=now;reason=command.reason.trim()||'Laboratory scope released';
   const source=previous?'Additional work':'Original request';
   for(const s of samples)for(const stream of ['PVT','Chemical'] as const)for(const test of testsIn(s,stream)){
    const linkId='labscope:'+s.sampleId+':'+test,scopeId='labscope:'+s.sampleId+':'+stream+':'+test;
    if(!o.scope.some(x=>x.id===scopeId))o.scope.push({id:scopeId,linkId,title:test,sampleIds:[s.sampleId],stream,notes:s.notes,addedBy:actor.id,at:now,reason,source});
    const validation=isValidationTest(test);
    for(const title of validation?sampleSequence(job,s.sampleId):[test]){
     const id=validation?'labscope:'+s.sampleId+':'+stream+':validation:'+title:scopeId;
     if(o.activities.some(a=>a.id===id))continue;
     o.activities.push({kind:validation?'validation':'analysis',id,scopeId,linkId,sampleId:s.sampleId,title,stream,owner:'',start:'',due:'',conditions:title==='Restoration'?`${command.conditions.pressure} ${command.conditions.pressureUnit}; ${command.conditions.temperature} ${command.conditions.temperatureUnit}`:title==='Water Check'?'Check for water on the sample side.':[command.conditions.notes,s.notes].filter(Boolean).join(' · '),notes:'',status:'Unassigned',files:[],required:true});
    }
   }
   o.conditions={...command.conditions};o.scopeConfirmedAt=o.scopeConfirmedAt||now;
  } else reason='Laboratory scope draft v'+version.version+' saved';
  if(last?.status==='Draft')versions[versions.length-1]=version;else versions.push(version);
  break;
 }
 case 'request-addition':requireAccess(actor,'analysis');requireText(command.title,'Requested work');requireText(command.reason,'Reason');reason=command.reason;o.additions.push({id:now+':'+o.additions.length,title:command.title.trim(),reason,by:actor.id,at:now});break;
 case 'schedule':{
  const a=currentActivity();requireRole(actor,'analysis',streamLead(a.stream));active(actor,command.owner);
  if(!actor.policy.analysis.includes(command.owner)&&command.owner!=='MA001')throw Error('The employee needs laboratory access before assignment.');
  if(!actor.teams)throw Error('Laboratory team settings cannot be read. Ask an administrator to restore them in Settings → Authorization.');
  if(command.owner!==a.owner&&!actor.teams[a.stream].includes(command.owner))throw Error((actor.employees.find(e=>e.id===command.owner)?.name||command.owner)+' is not in the '+a.stream+' team. Ask an administrator to add them in Settings → Authorization.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(command.start)||!/^\d{4}-\d{2}-\d{2}$/.test(command.due)||command.due<command.start)throw Error('Enter a planned start and a due date on or after it.');
  if(a.status==='Completed')throw Error('Completed work is retained; request additional work instead.');
  if(command.owner!==a.owner&&['Workbook Submitted','Awaiting QC','QC Returned'].includes(a.status))throw Error('This test is under review. Finish the review before reassigning it.');
  reason=`${a.owner||'Unassigned'} → ${command.owner}; ${a.start||'unscheduled'}–${a.due||''} → ${command.start}–${command.due}`;
  if(command.owner!==a.owner)(a.history||(a.history=[])).push({at:now,by:actor.id,action:a.owner?'reassigned':'assigned',from:a.owner||undefined,to:command.owner,comments:command.notes});
  Object.assign(a,{owner:command.owner,start:command.start,due:command.due,conditions:command.conditions,notes:command.notes,status:a.status==='Unassigned'?'Scheduled':a.status});break;
 }
 case 'progress':{
  const a=currentActivity();requireAccess(actor,'analysis',a.owner||'unassigned');
  if(command.status==='Completed')throw Error('A test is completed by QC approval after team-lead review. Submit the workbook to your team lead.');
  if(command.status!=='In Progress')throw Error('Use workbook submission or correction actions for this state.');
  if(a.status==='Completed')throw Error('Completed work is immutable; request additional work.');
  if(['Workbook Submitted','Awaiting QC','QC Returned'].includes(a.status))throw Error('The submitted workbook is under review and cannot be edited.');
  a.status=command.status;a.progressNotes=command.notes;break;
 }
 case 'workbook':{
  const a=currentActivity();requireAccess(actor,'analysis',a.owner||'unassigned');if(a.status==='Completed')throw Error('Request a correction before replacing completed work.');
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
  if(command.kind==='final')requireRole(actor,'analysis','reporting');else requireAccess(actor,'sampling');
  const list=command.kind==='sampling'?o.samplingReports:o.finalReports;const old=latest(list);
  const reviewed=command.kind==='sampling'&&dataReviewRequired(job);
  if(reviewed){if(latestData(job)?.status!=='Approved')throw Error('The sampling report is generated after the sampling data is approved.');if(actor.id!==job.assignedEngineerId)throw Error('Only the accountable sampling employee prepares the sampling report.');}
  else if(command.kind==='sampling'&&old&&actor.id!==old.preparedBy)throw Error('Only the recorded preparer can edit this report version.');
  if(old&&!['Draft','Changes Requested'].includes(old.status))throw Error('Create a revision before editing a submitted report.');
  requireText(command.text,'Report summary');if(!reviewed){active(actor,command.checker);if(command.kind==='sampling'&&!actor.policy.sampling.includes(command.checker)&&command.checker!=='MA001')throw Error('The selected checker needs sampling permission.');}
  const version:ReportVersion={version:old?.status==='Draft'?old.version:list.length+1,status:'Draft',text:command.text,preparedBy:actor.id,preparedAt:now,checker:command.kind==='final'?holder(actor,'reporting'):reviewed?'':command.checker,comments:'',snapshot:snapshot(command.kind),file:command.file};
  if(old?.status==='Draft')list[list.length-1]=version;else list.push(version);break;
 }
 case 'report-action':{
  requireAccess(actor,command.kind==='sampling'?'sampling':'analysis');
  const list=command.kind==='sampling'?o.samplingReports:o.finalReports;const r=latest(list);if(!r)throw Error('Save a report draft first.');
  if(command.action==='checking'){
   if(command.kind!=='sampling'||actor.id!==r.preparedBy||r.status!=='Draft')throw Error('Only the preparer can submit a draft for checking.');
   if(dataReviewRequired(job))throw Error('Reports from approved sampling data go directly to the sampling approver. Use Submit for approval.');
   if(!job.samples?.length||job.samples.some(s=>!s.dataComplete))throw Error('Complete all sample data sheets first.');
   r.snapshot=snapshot(command.kind);r.status='Checking';r.submittedAt=now;
  } else if(command.action==='submit'){
   const direct=command.kind==='sampling'&&dataReviewRequired(job)&&!r.checker;
   if(direct){if(actor.id!==r.preparedBy||actor.id!==job.assignedEngineerId||r.status!=='Draft')throw Error('Only the accountable sampling employee can submit this report for approval.');if(latestData(job)?.status!=='Approved')throw Error('The sampling data must be approved before the report is submitted.');}
   else{const ready=command.kind==='sampling'?r.status==='Checking':r.status==='Draft';
   if(actor.id!==r.checker||!ready)throw Error('Only the named checker can forward this version.');}
   if(r.snapshot!==snapshot(command.kind))throw Error('The draft or checked evidence changed. Save an updated draft or return this version for correction before submission.');
   if(command.kind==='final'&&qcPending(next))throw Error(testsAwaitingQcApproval(next).length+' required test(s) are not yet QC approved. Final reporting waits for every QC approval.');
   if(command.kind==='final'&&(!finalReady(next)||!r.file))throw Error('Complete required work, sampling approval and physical receipt, and attach the final report.');
   if(!direct)r.checkedAt=now;r.submittedAt=now;r.status='Awaiting Approval';r.snapshot=snapshot(command.kind);
  } else if(command.action==='approve'){
   const approver=holder(actor,command.kind==='sampling'?'samplingApproval':'finalApproval');
   if(!approver)throw Error(responsibilityLabels[command.kind==='sampling'?'samplingApproval':'finalApproval']+' is not configured. Ask an administrator to assign it in Settings → Authorization.');
   if(actor.id!==approver||r.status!=='Awaiting Approval')throw Error('Only the named approver can approve the submitted version.');
   if(r.snapshot!==snapshot(command.kind))throw Error('The submitted evidence changed. Return this version and review a new revision.');
   if(command.kind==='final'&&qcPending(next))throw Error(testsAwaitingQcApproval(next).length+' required test(s) are not yet QC approved. Final approval waits for every QC approval.');
   if(command.kind==='sampling'&&dataReviewRequired(job)&&latestData(job)?.status!=='Approved')throw Error('The sampling data must be approved before the report.');
   if(command.kind==='final'&&!finalReady(next))throw Error('Required work changed or remains incomplete. Return this version for correction.');
   r.approvedBy=actor.id;r.approvedAt=now;r.status='Approved';
  } else if(command.action==='return'){
   const reviewer=r.status==='Checking'?r.checker:holder(actor,command.kind==='sampling'?'samplingApproval':'finalApproval');if(!reviewer||actor.id!==reviewer||!['Checking','Awaiting Approval'].includes(r.status))throw Error('Only the current reviewer can return a submitted version.');
   requireText(command.comments,'Correction comments');r.status='Changes Requested';r.comments=command.comments;reason=command.comments;
  } else {
   if(actor.id!==r.preparedBy||!['Approved','Changes Requested'].includes(r.status))throw Error('Only the preparer can create a revision of an approved or returned report.');
   requireText(command.comments,'Revision reason');list.push({...r,version:list.length+1,status:'Draft',file:command.kind==='final'?undefined:r.file,preparedAt:now,approvedAt:undefined,approvedBy:undefined,checkedAt:undefined,submittedAt:undefined,comments:command.comments,snapshot:snapshot(command.kind)});reason=command.comments;
  }break;
 }
 case 'handover-send':{
  // The assigned driver acts through the job assignment (job details access); the engineer needs sampling access.
  if(!job.assignedDriverId||actor.id!==job.assignedDriverId){requireAccess(actor,'sampling');if(actor.id!==job.assignedEngineerId)throw Error('Only the assigned engineer or driver can send the samples.');}
  if(!samplingApproved(next))throw Error('Obtain sampling-report approval before transferring bottles.');
  if(o.handover)throw Error('Handover already recorded. Use receipt notes for discrepancies.');
  if(command.sampleIds.length!==job.samples?.length)throw Error('Select all job samples for this handover. Partial-shipment handling needs confirmation.');
  if(!command.sampleIds.length||command.sampleIds.length!==new Set(command.sampleIds).size||command.sampleIds.some(id=>{const s=job.samples?.find(s=>s.id===id);return !s||!containerId(s);}))throw Error('Select existing samples with a recorded bottle serial or glass-container ID.');
  const sent=command.sampleIds.map(id=>job.samples!.find(s=>s.id===id)!);o.handover={sampleIds:command.sampleIds,bottles:Object.fromEntries(sent.map(s=>[s.id,containerId(s)])),containerTypes:Object.fromEntries(sent.map(s=>[s.id,isGlass(s)?'Glass container':'Bottle'])),sentBy:actor.id,sentAt:now,notes:command.notes};break;
 }
 case 'handover-receive':{
  requireRole(actor,'analysis','labReceipt');if(!o.handover||o.handover.receivedAt)throw Error('There is no outstanding transfer to receive.');
  o.handover.receivedBy=actor.id;o.handover.receivedAt=now;o.handover.notes+="\nReceipt: "+command.notes;break;
 }
 }
 // A scope or workbook change invalidates a pending final review, never overwrites an approved version.
 if(['scope','request-addition','workbook-return'].includes(command.type)||(command.type==='lab-scope'&&command.action==='release')){
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
export function operationMilestones(job:JobRecord,roles:Responsibilities=storedResponsibilities()){const st=samplingStatus(job,roles);const early=['draft','preparation','data','returned'].includes(st.key)&&st.tab==='sampling';const o=operationsFor(job);const needsScope=!o.scopeConfirmedAt||o.additions.some(a=>!a.confirmedAt);const unplanned=o.activities.find(a=>a.required&&(!a.owner||!a.start||!a.due));const lab=o.activities.filter(a=>a.required);const sampleDone=!!job.samples?.length&&job.samples.every(s=>s.dataComplete);return [
 {id:'overview',label:'Job creation',done:!!o.dispatchedAt||legacyDispatch(job),note:legacyDispatch(job)?'Dispatch not recorded (legacy)':undefined,owner:job.createdById,next:isDraft(job)?'Complete the draft and send it to Sampling':'Review and send the job to Sampling'},
 {id:'sampling',label:'Sampling',done:dataReviewRequired(job)?['Submitted','Approved'].includes(latestData(job)?.status||'')||samplingApproved(job):sampleDone,owner:job.assignedEngineerId,next:early?st.next:'Complete the sample data sheets'},
 {id:'sampling-report',label:'Sampling review & report approval',done:samplingApproved(job),owner:early?job.assignedEngineerId:st.owner,next:early?'Submit sampling data for review':st.next},
 {id:'handover',label:'Sample handover',done:!!o.handover?.receivedAt,owner:o.handover?.sentAt?roles.labReceipt||undefined:job.assignedDriverId,next:o.handover?.receivedAt?'Receipt recorded':o.handover?'Confirm physical receipt':'Send approved samples'},
 {id:'scope',label:'Laboratory scope',done:!!o.scopeConfirmedAt&&lab.every(a=>a.owner&&a.start&&a.due),owner:needsScope||!unplanned?roles.scopeSelector:roles[streamLead(unplanned.stream)],next:needsScope?(samplingApproved(job)?'Select and release the laboratory scope per sample':'Laboratory scope opens after sampling-report approval'):'Team leads assign and schedule tests'},
 {id:'laboratory',label:'Laboratory work',done:allWorkDone(job),owner:lab.find(a=>a.status!=='Completed')?.owner,next:'Complete assigned tests, team-lead review and QC'},
 {id:'reporting',label:'Final reporting',done:latest(o.finalReports)?.status==='Approved'&&finalReady(job),owner:latest(o.finalReports)?.status==='Awaiting Approval'?roles.finalApproval:roles.reporting,next:qcPending(job)?testsAwaitingQcApproval(job).length+' test(s) awaiting QC approval':latest(o.finalReports)?.status||'Collect QC-approved workbooks and prepare the final report'},
 {id:'completion',label:'Completion',done:operationComplete(job),owner:undefined,next:operationComplete(job)?'All required work and approvals complete':'Complete required work and approvals'},
 ];}


/** Independent queues keep parallel laboratory streams actionable. */
export function pendingActions(job:JobRecord, actor:Actor) {
 const o=operationsFor(job), final=latest(o.finalReports);
 const roles=actorRoles(actor);const st=samplingStatus(job,roles);const early=['draft','preparation','data','returned'].includes(st.key)&&st.tab==='sampling';
 const actions=operationMilestones(job,roles).filter(m=>{
  if(m.done||(m.owner!==actor.id&&!(m.id==='sampling'&&st.team&&samplingTeam(job).includes(actor.id))))return false;
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
  if(waiting&&roles.qcReviewer===actor.id)actions.push({id:'reporting',label:'QC review',done:false,owner:actor.id,next:'QC review '+waiting+' team-lead-approved workbook(s)'});
  if(waiting&&!roles.qcReviewer&&[roles.pvtTeamLead,roles.chemicalTeamLead,roles.pvtSupervisor].includes(actor.id))actions.push({id:'reporting',label:'QC not configured',done:false,owner:actor.id,next:waiting+' workbook(s) waiting: QC reviewer not configured in Settings → Authorization'});
 }
 return actions;
}
