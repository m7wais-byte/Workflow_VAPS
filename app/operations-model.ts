import type { JobRecord } from './page';
import { defaultResponsibilities, roleHolder, storedResponsibilities, responsibilityLabels, type Authorization, type Permission, type Responsibilities, type Responsibility } from './authorization';
import type { Employee } from './employee-directory';
import { containerId, isGlass, type ContainerType } from './sample-container';
export type Stream = 'PVT' | 'Chemical';
/** Team lead who plans, assigns and reviews each laboratory workstream. */
export const streamLead = (stream:Stream):Responsibility=>stream==='PVT'?'pvtTeamLead':'chemicalTeamLead';
export type WorkState = 'Unassigned' | 'Scheduled' | 'In Progress' | 'Workbook Submitted' | 'Changes Requested' | 'Completed';
export type FileVersion = { id:string; name:string; size:number; type:string; version:number; submittedBy:string; submittedAt:string; status:'Available'|'Changes Requested'; comments:string };
export type ActivityRecord = { id:string; scopeId:string; sampleId:string; title:string; stream:Stream; owner:string; start:string; due:string; conditions:string; notes:string; status:WorkState; files:FileVersion[]; required:boolean; kind?:'validation'|'analysis' };
export type ScopeRecord = { id:string; title:string; sampleIds:string[]; stream:Stream; notes:string; addedBy:string; at:string; reason:string; source:'Original request'|'Additional work' };
export type ReportVersion = { version:number; status:'Draft'|'Checking'|'Awaiting Approval'|'Changes Requested'|'Approved'; text:string; preparedBy:string; preparedAt:string; checker:string; checkedAt?:string; submittedAt?:string; approvedBy?:string; approvedAt?:string; comments:string; snapshot:string; file?:FileVersion };
export type Operations = { version:1; revision:number; originalRequest:string[]; scope:ScopeRecord[]; activities:ActivityRecord[]; conditions:{pressure:string;pressureUnit:string;temperature:string;temperatureUnit:string;notes:string}; scopeConfirmedAt?:string; dispatchedAt?:string; dispatchedBy?:string; samplingReports:ReportVersion[]; finalReports:ReportVersion[]; handover?:{sampleIds:string[];/** Container identifier per sample (bottle serial or glass-container ID). */bottles:Record<string,string>;containerTypes?:Record<string,ContainerType>;sentBy:string;sentAt:string;receivedBy?:string;receivedAt?:string;notes:string}; additions:{id:string;title:string;reason:string;by:string;at:string;confirmedAt?:string}[]; history:{at:string;by:string;action:string;reason:string}[] };
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
export function samplingApproved(job:JobRecord):boolean { const reports=operationsFor(job).samplingReports;return reports.length?latest(reports)?.status==='Approved':job.report?.reportStatus==='Completed'&&!!job.report.approvedAt&&!!job.report.approvedBy; }
/** Sampling was approved in the older workflow, before dispatch records existed. No dispatch is fabricated. */
export function legacyDispatch(job:JobRecord):boolean { const o=operationsFor(job);return !o.dispatchedAt&&!o.samplingReports.length&&samplingApproved(job); }
export function allWorkDone(job:JobRecord):boolean {const o=operationsFor(job);return !!o.scopeConfirmedAt && o.activities.filter(a=>a.required).every(a=>a.status==='Completed'&&a.files.some(f=>f.status==='Available')) && !o.additions.some(a=>!a.confirmedAt);}
export function finalReady(job:JobRecord):boolean {const o=operationsFor(job);const required=[...new Set(o.scope.flatMap(s=>s.sampleIds))];return allWorkDone(job)&&samplingApproved(job)&&!!o.handover?.receivedAt&&required.every(id=>o.handover!.sampleIds.includes(id));}
export function operationComplete(job:JobRecord):boolean {return finalReady(job)&&latest(operationsFor(job).finalReports)?.status==='Approved';}
export type Actor = { id:string; employees:Employee[]; policy:Authorization; roles?:Responsibilities };
/** The valid holder of a duty for this actor's settings ('' when unassigned or invalid). */
export const holder=(actor:Actor,key:Responsibility)=>roleHolder(actor.roles||defaultResponsibilities,key,actor.employees);
export function hasAccess(actor:Actor,permission:Permission) {return actor.employees.some(e=>e.id===actor.id&&e.active)&&((actor.id==='MA001'&&permission!=='createJob')||actor.policy[permission].includes(actor.id));}
function requireAccess(actor:Actor,permission:Permission,id?:string){if(!hasAccess(actor,permission)||(id&&actor.id!==id))throw Error('This action is not assigned to your active profile or permission.');}
function active(actor:Actor,id:string){if(!actor.employees.some(e=>e.id===id&&e.active))throw Error('Select an active employee.');}
/** Permission and duty must both pass. An unassigned duty blocks the action instead of opening it to everyone. */
function requireRole(actor:Actor,permission:Permission,...keys:Responsibility[]){requireAccess(actor,permission);const ids=keys.map(key=>holder(actor,key));if(ids.every(id=>!id))throw Error(responsibilityLabels[keys[0]]+' is not configured. Ask an administrator to assign it in Settings → Authorization.');if(!ids.includes(actor.id))throw Error('This action is not assigned to your active profile or permission.');}
/** Every duty resolved to a valid holder for this actor's settings. */
export const actorRoles=(actor:Actor)=>Object.fromEntries(Object.keys(responsibilityLabels).map(key=>[key,holder(actor,key as Responsibility)])) as Responsibilities;
function requireText(value:string,label:string){if(!value.trim())throw Error(label+' is required.');}
export type Command =
 | {type:'dispatch';engineer:string;driver:string}
 | {type:'scope';items:{title:string;sampleIds:string[];stream:Stream}[];conditions:Operations['conditions'];reason:string;additionId?:string}
 | {type:'request-addition';title:string;reason:string}
 | {type:'schedule';id:string;owner:string;start:string;due:string;conditions:string;notes:string}
 | {type:'progress';id:string;status:WorkState;notes:string}
 | {type:'workbook';id:string;notes?:string;file:Omit<FileVersion,'version'|'submittedBy'|'submittedAt'|'status'|'comments'>}
 | {type:'workbook-return';id:string;comments:string}
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
  requireAccess(actor,'createJob');active(actor,command.engineer);active(actor,command.driver);
  if(o.dispatchedAt)throw Error('This job has already been dispatched. Preserve the original dispatch record.');
  if(!job.clientCode||!job.samplingSource||!job.requiredTests?.length||!job.samples?.length)throw Error('Complete client, sampling type, scope and samples before dispatch.');
  if(!actor.policy.sampling.includes(command.engineer)&&command.engineer!=='MA001')throw Error('The engineer needs sampling access.');
  next.assignedEngineerId=command.engineer;next.assignedDriverId=command.driver;next.responsibleId=command.engineer;
  next.teamWork={...job.teamWork,sampling:{...job.teamWork?.sampling,owner:command.engineer,acceptedAt:now},transport:{...job.teamWork?.transport,owner:command.driver}};
  o.dispatchedAt=now;o.dispatchedBy=actor.id;break;
 }
 case 'scope':{
  requireRole(actor,'analysis','scopeSelector');requireText(command.reason,'Scope confirmation / change reason');reason=command.reason;
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
   const sequenceFor=(sampleId:string)=>{const nature=job.samples?.find(s=>s.id===sampleId)?.fieldData?.sampleNature;const source=({BHS:'Bottom-hole',WHS:'Wellhead',SEP:'Separator'} as Record<string,string>)[nature||'']||job.samplingSource||'';return validationSequence(source);};
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
 case 'request-addition':requireAccess(actor,'analysis');requireText(command.title,'Requested work');requireText(command.reason,'Reason');reason=command.reason;o.additions.push({id:now+':'+o.additions.length,title:command.title.trim(),reason,by:actor.id,at:now});break;
 case 'schedule':{
  const a=currentActivity();requireRole(actor,'analysis',streamLead(a.stream));active(actor,command.owner);
  if(!actor.policy.analysis.includes(command.owner)&&command.owner!=='MA001')throw Error('The employee needs laboratory access before assignment.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(command.start)||!/^\d{4}-\d{2}-\d{2}$/.test(command.due)||command.due<command.start)throw Error('Enter a planned start and a due date on or after it.');
  if(a.status==='Completed')throw Error('Completed work is retained; request additional work instead.');
  reason=`${a.owner||'Unassigned'} → ${command.owner}; ${a.start||'unscheduled'}–${a.due||''} → ${command.start}–${command.due}`;
  Object.assign(a,{owner:command.owner,start:command.start,due:command.due,conditions:command.conditions,notes:command.notes,status:a.status==='Unassigned'?'Scheduled':a.status});break;
 }
 case 'progress':{
  const a=currentActivity();requireAccess(actor,'analysis',a.owner||'unassigned');
  if(!['In Progress','Completed'].includes(command.status))throw Error('Use workbook submission or correction actions for this state.');
  if(a.status==='Completed')throw Error('Completed work is immutable; request additional work.');
  if(command.status==='Completed'&&(!a.files.length||a.files.at(-1)?.status!=='Available'))throw Error('Submit the current workbook before completing the activity.');
  a.status=command.status;a.notes=command.notes;break;
 }
 case 'workbook':{
  const a=currentActivity();requireAccess(actor,'analysis',a.owner||'unassigned');if(a.status==='Completed')throw Error('Request a correction before replacing completed work.');
  if(!command.file.id||command.file.size<=0)throw Error('Upload a workbook first.');
  if(command.notes!==undefined)a.notes=command.notes;
  a.files.push({...command.file,version:a.files.length+1,submittedBy:actor.id,submittedAt:now,status:'Available',comments:''});a.status='Workbook Submitted';break;
 }
 case 'workbook-return':{
  const a=currentActivity();requireAccess(actor,'analysis');if(![holder(actor,streamLead(a.stream)),holder(actor,'reporting')].filter(Boolean).includes(actor.id))throw Error('Only the team lead or report preparer may request a correction.');
  requireText(command.comments,'Correction request');if(!a.files.length)throw Error('No workbook has been submitted.');a.files[a.files.length-1]={...a.files[a.files.length-1],status:'Changes Requested',comments:command.comments};a.status='Changes Requested';reason=command.comments;break;
 }
 case 'report-draft':{
  if(command.kind==='final')requireRole(actor,'analysis','reporting');else requireAccess(actor,'sampling');
  const list=command.kind==='sampling'?o.samplingReports:o.finalReports;const old=latest(list);
  if(command.kind==='sampling'&&old&&actor.id!==old.preparedBy)throw Error('Only the recorded preparer can edit this report version.');
  if(old&&!['Draft','Changes Requested'].includes(old.status))throw Error('Create a revision before editing a submitted report.');
  requireText(command.text,'Report summary');active(actor,command.checker);if(command.kind==='sampling'&&!actor.policy.sampling.includes(command.checker)&&command.checker!=='MA001')throw Error('The selected checker needs sampling permission.');
  const version:ReportVersion={version:old?.status==='Draft'?old.version:list.length+1,status:'Draft',text:command.text,preparedBy:actor.id,preparedAt:now,checker:command.kind==='final'?holder(actor,'reporting'):command.checker,comments:'',snapshot:snapshot(command.kind),file:command.file};
  if(old?.status==='Draft')list[list.length-1]=version;else list.push(version);break;
 }
 case 'report-action':{
  requireAccess(actor,command.kind==='sampling'?'sampling':'analysis');
  const list=command.kind==='sampling'?o.samplingReports:o.finalReports;const r=latest(list);if(!r)throw Error('Save a report draft first.');
  if(command.action==='checking'){
   if(command.kind!=='sampling'||actor.id!==r.preparedBy||r.status!=='Draft')throw Error('Only the preparer can submit a draft for checking.');
   if(!job.samples?.length||job.samples.some(s=>!s.dataComplete))throw Error('Complete all sample data sheets first.');
   r.snapshot=snapshot(command.kind);r.status='Checking';r.submittedAt=now;
  } else if(command.action==='submit'){
   const ready=command.kind==='sampling'?r.status==='Checking':r.status==='Draft';
   if(actor.id!==r.checker||!ready)throw Error('Only the named checker can forward this version.');
   if(r.snapshot!==snapshot(command.kind))throw Error('The draft or checked evidence changed. Save an updated draft or return this version for correction before submission.');
   if(command.kind==='final'&&(!finalReady(next)||!r.file))throw Error('Complete required work, sampling approval and physical receipt, and attach the final report.');
   r.checkedAt=now;r.submittedAt=now;r.status='Awaiting Approval';r.snapshot=snapshot(command.kind);
  } else if(command.action==='approve'){
   const approver=holder(actor,command.kind==='sampling'?'samplingApproval':'finalApproval');
   if(!approver)throw Error(responsibilityLabels[command.kind==='sampling'?'samplingApproval':'finalApproval']+' is not configured. Ask an administrator to assign it in Settings → Authorization.');
   if(actor.id!==approver||r.status!=='Awaiting Approval')throw Error('Only the named approver can approve the submitted version.');
   if(r.snapshot!==snapshot(command.kind))throw Error('The submitted evidence changed. Return this version and review a new revision.');
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
  requireAccess(actor,'analysis');if(!o.handover||o.handover.receivedAt)throw Error('There is no outstanding transfer to receive.');
  o.handover.receivedBy=actor.id;o.handover.receivedAt=now;o.handover.notes+="\nReceipt: "+command.notes;break;
 }
 }
 // A scope or workbook change invalidates a pending final review, never overwrites an approved version.
 if(['scope','request-addition','workbook-return'].includes(command.type)){
  const r=latest(o.finalReports);if(r?.status==='Awaiting Approval'){r.status='Changes Requested';r.comments='Scope or workbook state changed. Review a new revision.';}
  if(r?.status==='Approved')o.finalReports.push({...r,version:o.finalReports.length+1,status:'Changes Requested',file:undefined,approvedAt:undefined,approvedBy:undefined,comments:'Additional work or workbook correction requires a new report revision.'});
 }
 o.revision++;o.history.push({at:now,by:actor.id,action:command.type,reason});next.lastUpdatedById=actor.id;next.lastUpdatedAt=now;
 next.status=operationComplete(next)?'Completed':samplingApproved(next)?'Sampling Completed':job.status==='Completed'?'Report Draft':job.status;
 return next;
}
export function operationMilestones(job:JobRecord,roles:Responsibilities=storedResponsibilities()){const o=operationsFor(job);const needsScope=!o.scopeConfirmedAt||o.additions.some(a=>!a.confirmedAt);const unplanned=o.activities.find(a=>a.required&&(!a.owner||!a.start||!a.due));const lab=o.activities.filter(a=>a.required);const sampleDone=!!job.samples?.length&&job.samples.every(s=>s.dataComplete);return [
 {id:'overview',label:'Job setup & assignment',done:!!o.dispatchedAt||legacyDispatch(job),note:legacyDispatch(job)?'Dispatch not recorded (legacy)':undefined,owner:job.createdById,next:'Review and send the job to Sampling'},
 {id:'sampling',label:'Sampling',done:sampleDone,owner:job.assignedEngineerId,next:'Complete the sample data sheets'},
 {id:'sampling-report',label:'Sampling report',done:samplingApproved(job),owner:latest(o.samplingReports)?.status==='Awaiting Approval'?roles.samplingApproval:latest(o.samplingReports)?.status==='Checking'?latest(o.samplingReports)?.checker:latest(o.samplingReports)?.preparedBy||job.assignedEngineerId,next:latest(o.samplingReports)?.status||'Prepare the sampling report'},
 {id:'handover',label:'Sample handover',done:!!o.handover?.receivedAt,owner:o.handover?.sentAt?roles.scopeSelector:job.assignedDriverId,next:o.handover?.receivedAt?'Receipt recorded':o.handover?'Confirm physical receipt':'Send approved samples'},
 {id:'scope',label:'Lab scope & planning',done:!!o.scopeConfirmedAt&&lab.every(a=>a.owner&&a.start&&a.due),owner:needsScope||!unplanned?roles.scopeSelector:roles[streamLead(unplanned.stream)],next:needsScope?'Confirm the laboratory scope':'Team leads assign and schedule tests'},
 {id:'laboratory',label:'Laboratory work',done:allWorkDone(job),owner:lab.find(a=>a.status!=='Completed')?.owner,next:'Complete assigned activities and submit workbooks'},
 {id:'reporting',label:'Final report & approval',done:latest(o.finalReports)?.status==='Approved'&&finalReady(job),owner:latest(o.finalReports)?.status==='Awaiting Approval'?roles.finalApproval:roles.reporting,next:latest(o.finalReports)?.status||'Collect workbooks and prepare final report'},
 {id:'completion',label:'Completion',done:operationComplete(job),owner:undefined,next:operationComplete(job)?'All required work and approvals complete':'Complete required work and approvals'},
 ];}


/** Independent queues keep parallel laboratory streams actionable. */
export function pendingActions(job:JobRecord, actor:Actor) {
 const o=operationsFor(job), report=latest(o.samplingReports), final=latest(o.finalReports);
 const roles=actorRoles(actor);
 const actions=operationMilestones(job,roles).filter(m=>{
  if(m.done||m.owner!==actor.id)return false;
  if(m.id==='overview')return !o.dispatchedAt&&hasAccess(actor,'createJob');
  if(m.id==='sampling')return !!o.dispatchedAt&&hasAccess(actor,'sampling');
  if(m.id==='sampling-report')return !!o.dispatchedAt&&!!job.samples?.length&&job.samples.every(s=>s.dataComplete)&&hasAccess(actor,'sampling');
  if(m.id==='handover')return samplingApproved(job)&&(o.handover?hasAccess(actor,'analysis'):hasAccess(actor,'sampling'));
  if(m.id==='scope')return hasAccess(actor,'analysis')&&(!o.scopeConfirmedAt||o.additions.some(a=>!a.confirmedAt));
  if(m.id==='reporting')return hasAccess(actor,'analysis')&&(finalReady(job)||final?.status==='Changes Requested');
  return false;
 }).map(m=>({...m,next:m.id==='sampling-report'?(report?.status==='Checking'?'Check the report and submit it for approval':report?.status==='Awaiting Approval'?'Review and approve this sampling report':report?.status==='Changes Requested'?'Correct the sampling report':'Prepare the sampling report'):m.id==='reporting'?(final?.status==='Awaiting Approval'?'Review and approve this final report':final?.status==='Changes Requested'?'Prepare a corrected report revision':'Collect workbooks and prepare final report'):m.next}));
 for(const stream of ['PVT','Chemical'] as const){
  if(!roles[streamLead(stream)]||actor.id!==roles[streamLead(stream)]||!hasAccess(actor,'analysis'))continue;
  const unplanned=o.activities.filter(a=>a.required&&a.stream===stream&&(!a.owner||!a.start||!a.due));
  if(unplanned.length)actions.push({id:'laboratory',label:stream+' planning',done:false,owner:actor.id,next:'Assign and schedule '+unplanned.length+' required activities'});
 }
 return actions;
}
