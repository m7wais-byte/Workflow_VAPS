import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}};globalThis.localStorage=window.localStorage;
const {applyOperation,pendingActions,finalReady,qcPending,labStatus,teamMismatch,operationsFor,operationComplete,samplingApproved}=await bundle('app/operations-model.ts');
const {defaultAuthorization,defaultResponsibilities,readResponsibilities}=await bundle('app/authorization.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');
const {readLabTeams,emptyLabTeams}=await bundle('app/lab-teams.ts');

const employees=initialDirectory().employees,policy=defaultAuthorization(employees.map(e=>e.id));
const routing={'Black Oil — DL':'PVT','Others — Water Analysis':'Chemical','Specialised Analysis — SARA':'Both'};
const roles={...defaultResponsibilities,qcReviewer:'RANJITH',labReceipt:'SHEREIQI'};
const teams={PVT:['NASSER','AHAD'],Chemical:['YAQEEN']};
const actor=(id,extra={})=>({id,employees,policy,roles,routing,teams,...extra});
let tick=0;const at=()=>new Date(Date.UTC(2026,9,30,8,0,tick++)).toISOString();
const step=(job,c,id,extra)=>applyOperation(job,c,actor(id,extra),at());
const s=(id,extra={})=>({id,bottle:'PDS',bottleSerial:'B-'+id,dataComplete:true,fieldData:{sampleNature:'WHS'},...extra});
const base=()=>({id:'OM-P-26-301',jobNumber:'OM-P-26-301',clientCode:'P',clientName:'Test',fieldArea:'F',well:'W',samplingSource:'Wellhead Sampling',samplingInstructions:'Collect four samples.',status:'Draft',createdById:'SALIM',stages:[],events:[],
 samples:[s('1.01'),s('1.02',{containerType:'Glass container',containerId:'G-07',bottle:'',bottleSerial:''}),s('1.03'),s('1.04')]});
const entry=(sampleId,destination,pvtTests=[],chemicalTests=[],more={})=>({sampleId,destination,pvtTests,chemicalTests,notes:'Run at reservoir temperature.',excluded:false,exclusionReason:'',...more});
const conditions={pressure:'2100',pressureUnit:'psi',temperature:'88',temperatureUnit:'°C',notes:''};
function released(){
 let j=step(base(),{type:'dispatch',engineer:'MOHSIN',driver:'ALI'},'SALIM');
 j=step(j,{type:'data-submit',note:''},'MOHSIN');j=step(j,{type:'data-approve'},'SALIM');
 j=step(j,{type:'report-draft',kind:'sampling',text:'Summary',checker:''},'MOHSIN');j=step(j,{type:'report-action',kind:'sampling',action:'submit',comments:''},'MOHSIN');j=step(j,{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');
 return step(j,{type:'lab-scope',action:'release',conditions,reason:'',samples:[entry('1.01','PVT',['Black Oil — DL']),entry('1.02','Chemical',[],['Others — Water Analysis']),entry('1.03','Both',['Specialised Analysis — SARA'],['Specialised Analysis — SARA']),entry('1.04','PVT',[],[],{excluded:true,exclusionReason:'Leaked'})]},'SALIM');
}
const act=(j,sample,stream)=>operationsFor(j).activities.find(a=>a.sampleId===sample&&a.stream===stream);
const assign=(j,a,owner,by,extra)=>step(j,{type:'schedule',id:a.id,owner,start:'2026-11-01',due:'2026-11-03',conditions:'',notes:'Use the calibrated cell.'},by,extra);
const file=n=>({id:'f'+n+Math.random(),name:`workbook-${n}.xlsx`,size:100,type:'application/vnd.ms-excel'});
const submit=(j,a,owner)=>step(j,{type:'workbook',id:a.id,file:file(a.id),notes:'Done'},owner);
const approve=(j,a,lead)=>step(j,{type:'lead-review',id:a.id,decision:'approve',target:'',comments:''},lead);
const qc=(j,a)=>step(j,{type:'qc-review',id:a.id,decision:'approve',target:'',comments:''},'RANJITH');

test('released scope routes PVT, Chemical and Both to separate items; excluded samples create no work',()=>{
 const j=released();const o=operationsFor(j);
 assert.deepEqual(o.activities.map(a=>[a.sampleId,a.stream,a.title]),[['1.01','PVT','Black Oil — DL'],['1.02','Chemical','Others — Water Analysis'],['1.03','PVT','Specialised Analysis — SARA'],['1.03','Chemical','Specialised Analysis — SARA']]);
 assert.equal(o.activities.some(a=>a.sampleId==='1.04'),false);
 assert.equal(act(j,'1.03','PVT').linkId,act(j,'1.03','Chemical').linkId);
 assert.ok(pendingActions(j,actor('SHEREIQI')).some(a=>a.label==='PVT planning'));assert.ok(pendingActions(j,actor('BAHRI')).some(a=>a.label==='Chemical planning'));
 assert.equal(pendingActions(j,actor('WILFRED')).some(a=>/planning/.test(a.label)),false,'the supervisor gets no team-lead actions');
 assert.equal(o.labScopes[0].routing['Black Oil — DL'],'PVT','routing snapshot kept');
});

test('team leads assign only within their own stream and team; membership grants no permission; history is kept',()=>{
 let j=released();const pvt=act(j,'1.01','PVT'),chem=act(j,'1.02','Chemical');
 assert.throws(()=>assign(j,pvt,'NASSER','BAHRI'),/not assigned/);
 assert.throws(()=>assign(j,chem,'YAQEEN','SHEREIQI'),/not assigned/);
 assert.throws(()=>assign(j,pvt,'YAQEEN','SHEREIQI'),/not in the PVT team/);
 assert.throws(()=>assign(j,pvt,'NASSER','SHEREIQI',{teams:null}),/team settings cannot be read/);
 assert.throws(()=>assign(j,pvt,'HUMAID','SHEREIQI',{teams:{PVT:['HUMAID'],Chemical:[]}}),/laboratory access/,'team membership does not grant lab permission');
 assert.throws(()=>assign(j,pvt,'NASSER','WILFRED'),/not assigned/,'the PVT Supervisor cannot assign');
 j=assign(j,pvt,'NASSER','SHEREIQI');j=step(j,{type:'progress',id:pvt.id,status:'In Progress',notes:'Half done'},'NASSER');
 j=assign(j,act(j,'1.01','PVT'),'AHAD','SHEREIQI');
 const a=act(j,'1.01','PVT');assert.equal(a.owner,'AHAD');assert.equal(a.status,'In Progress','progress is not discarded');
 assert.deepEqual(a.history.map(h=>[h.action,h.from||'',h.to]),[['assigned','','NASSER'],['reassigned','NASSER','AHAD']]);
 assert.equal(teamMismatch(a,{PVT:['NASSER'],Chemical:[]}),true,'an assignment outside the configured team is flagged, not changed');
});

test('employee submits; self-completion is refused; lead returns with specific comments; versions are kept',()=>{
 let j=released();const a0=act(j,'1.01','PVT');j=assign(j,a0,'NASSER','SHEREIQI');
 assert.throws(()=>step(j,{type:'progress',id:a0.id,status:'Completed',notes:''},'NASSER'),/completed by QC approval/);
 assert.throws(()=>submit(j,a0,'AHAD'),/not assigned/,'only the assignee submits');
 j=submit(j,a0,'NASSER');assert.equal(labStatus(act(j,'1.01','PVT')),'Under team-lead review');
 assert.throws(()=>submit(j,a0,'NASSER'),/under review/,'a submitted workbook cannot be replaced');
 assert.throws(()=>step(j,{type:'progress',id:a0.id,status:'In Progress',notes:'edit'},'NASSER'),/under review/);
 assert.throws(()=>step(j,{type:'lead-review',id:a0.id,decision:'return',target:'',comments:'Fix the density calculation please.'},'SHEREIQI'),/Affected sheet/);
 assert.throws(()=>step(j,{type:'lead-review',id:a0.id,decision:'return',target:'Sheet Results',comments:'Fix'},'SHEREIQI'),/at least a sentence/);
 assert.throws(()=>step(j,{type:'lead-review',id:a0.id,decision:'approve',target:'',comments:''},'BAHRI'),/not assigned/);
 j=step(j,{type:'lead-review',id:a0.id,decision:'return',target:'workbook-1.xlsx · sheet Results row 12',comments:'Recalculate the density with the corrected volume.'},'SHEREIQI');
 let a=act(j,'1.01','PVT');assert.equal(labStatus(a),'Returned');assert.equal(a.files[0].target,'workbook-1.xlsx · sheet Results row 12');
 assert.ok(pendingActions(j,actor('NASSER')).some(p=>p.label==='Returned tests'));
 j=submit(j,a,'NASSER');a=act(j,'1.01','PVT');assert.equal(a.files.length,2);assert.equal(a.files[0].status,'Changes Requested','earlier version and comment kept');
});

test('QC needs team-lead approval and a valid reviewer, records the exact version, and returns to the team lead',()=>{
 let j=released();const a0=act(j,'1.01','PVT');j=submit(assign(j,a0,'NASSER','SHEREIQI'),a0,'NASSER');
 assert.throws(()=>qc(j,a0),/Only team-lead-approved/);
 j=approve(j,a0,'SHEREIQI');assert.equal(labStatus(act(j,'1.01','PVT')),'Awaiting QC');
 assert.throws(()=>step(j,{type:'qc-review',id:a0.id,decision:'approve',target:'',comments:''},'RANJITH',{roles:{...roles,qcReviewer:''}}),/QC review is not configured/);
 // An inactive QC holder is treated as unassigned: nobody can approve in their place.
 assert.throws(()=>step(j,{type:'qc-review',id:a0.id,decision:'approve',target:'',comments:''},'SHEREIQI',{employees:employees.map(e=>e.id==='RANJITH'?{...e,active:false}:e)}),/QC review is not configured/);
 assert.throws(()=>step(j,{type:'qc-review',id:a0.id,decision:'approve',target:'',comments:''},'RANJITH',{policy:{...policy,analysis:policy.analysis.filter(id=>id!=='RANJITH')}}),/not assigned/,'QC holder without lab permission cannot approve');
 assert.throws(()=>step(j,{type:'qc-review',id:a0.id,decision:'approve',target:'',comments:''},'SHEREIQI'),/not assigned/,'a team lead cannot QC approve');
 assert.ok(pendingActions(j,actor('RANJITH')).some(p=>p.label==='QC review'));
 assert.ok(pendingActions(j,actor('SHEREIQI',{roles:{...roles,qcReviewer:''}})).some(p=>p.label==='QC not configured'));
 const back=step(j,{type:'qc-review',id:a0.id,decision:'return',target:'Sheet Results',comments:'Units for density are missing in the summary.'},'RANJITH');
 let a=act(back,'1.01','PVT');assert.equal(a.status,'QC Returned');assert.equal(labStatus(a),'Under team-lead review');assert.ok(pendingActions(back,actor('SHEREIQI')).some(p=>p.label==='PVT QC returns'));
 assert.throws(()=>approve(back,a,'SHEREIQI'),/Return it to the employee/);
 let k=step(back,{type:'lead-review',id:a.id,decision:'return',target:'Sheet Results',comments:'Add density units as QC requested.'},'SHEREIQI');
 k=submit(k,act(k,'1.01','PVT'),'NASSER');assert.equal(act(k,'1.01','PVT').status,'Workbook Submitted','corrected work passes team-lead review again');
 k=qc(approve(k,act(k,'1.01','PVT'),'SHEREIQI'),act(k,'1.01','PVT'));
 a=act(k,'1.01','PVT');assert.equal(a.status,'Completed');assert.equal(a.files.length,2);assert.equal(a.files[1].qcApprovedBy,'RANJITH');assert.equal(a.files[0].qcApprovedBy,undefined,'approval is tied to version 2');
 assert.deepEqual(a.history.map(h=>h.action),['assigned','submitted','lead-approved','qc-returned','lead-returned','submitted','lead-approved','qc-approved']);
});

test('final reporting waits for every QC approval; Ahmed prepares and Wilfred approves separately',()=>{
 let j=released();j=step(j,{type:'handover-send',sampleIds:['1.01','1.02','1.03','1.04'],notes:''},'ALI');
 assert.throws(()=>step(j,{type:'handover-receive',notes:''},'SHEREIQI',{roles:{...roles,labReceipt:''}}),/Laboratory receipt is not configured/);
 assert.throws(()=>step(j,{type:'handover-receive',notes:''},'SALIM'),/not assigned/,'the scope selector is not the receipt owner');
 j=step(j,{type:'handover-receive',notes:'All received'},'SHEREIQI');assert.equal(operationsFor(j).handover.receivedBy,'SHEREIQI');
 const all=()=>operationsFor(j).activities;
 for(const a of all()){const lead=a.stream==='PVT'?'SHEREIQI':'BAHRI',owner=a.stream==='PVT'?'NASSER':'YAQEEN';j=submit(assign(j,a,owner,lead),a,owner);j=approve(j,a,lead);}
 assert.equal(qcPending(j),true);assert.equal(finalReady(j),false);
 const file={id:'final',name:'final.pdf',size:10,type:'application/pdf',version:1,submittedBy:'SHEREIQI',submittedAt:at(),status:'Available',comments:''};
 let d=step(j,{type:'report-draft',kind:'final',text:'Final',checker:'SHEREIQI',file},'SHEREIQI');
 assert.throws(()=>step(d,{type:'report-action',kind:'final',action:'submit',comments:''},'SHEREIQI'),/4 required test\(s\) are not yet QC approved/);
 for(const a of all())j=qc(j,a);
 assert.equal(finalReady(j),true);
 assert.throws(()=>step(j,{type:'report-draft',kind:'final',text:'Final',checker:'',file},'WILFRED'),/not assigned/,'Wilfred does not prepare');
 j=step(j,{type:'report-draft',kind:'final',text:'Final',checker:'SHEREIQI',file},'SHEREIQI');j=step(j,{type:'report-action',kind:'final',action:'submit',comments:''},'SHEREIQI');
 assert.throws(()=>step(j,{type:'report-action',kind:'final',action:'approve',comments:''},'SHEREIQI'),/named approver/);
 j=step(j,{type:'report-action',kind:'final',action:'approve',comments:''},'WILFRED');
 assert.equal(operationComplete(j),true);assert.equal(operationsFor(j).finalReports.at(-1).approvedBy,'WILFRED');assert.equal(samplingApproved(j),true);
});

test('settings: receipt starts unassigned, teams start empty and are validated; completed history stays complete',()=>{
 assert.equal(defaultResponsibilities.labReceipt,'');assert.equal(readResponsibilities(JSON.stringify({scopeSelector:'SALIM'})).labReceipt,'');
 assert.deepEqual(readLabTeams(null,['NASSER']),emptyLabTeams());
 assert.deepEqual(readLabTeams(JSON.stringify({PVT:['NASSER','NASSER']}),['NASSER']),{PVT:['NASSER'],Chemical:[]});
 for(const raw of ['bad','[]',JSON.stringify({PVT:['GHOST']}),JSON.stringify({Chemical:'YAQEEN'})])assert.throws(()=>readLabTeams(raw,['NASSER','YAQEEN']));
 const legacy={...base(),status:'Completed',operations:{...operationsFor(base()),scopeConfirmedAt:'2026-08-01T00:00:00Z',activities:[{id:'old',scopeId:'original:x',sampleId:'1.01',title:'Old test',stream:'PVT',owner:'NASSER',start:'',due:'',conditions:'',notes:'',status:'Completed',files:[{id:'x',name:'x.xlsx',size:1,type:'',version:1,submittedBy:'NASSER',submittedAt:'2026-08-01T00:00:00Z',status:'Available',comments:''}],required:true}]}};
 assert.equal(qcPending(legacy),false,'work completed before QC is not asked for QC');assert.equal(labStatus(legacy.operations.activities[0]),'QC approved');
});
