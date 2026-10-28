import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}};globalThis.localStorage=window.localStorage;
const {applyOperation,pendingActions,samplingApproved,samplingStatus,latestData,samplingDataLocked,operationsFor}=await bundle('app/operations-model.ts');
const {defaultAuthorization,defaultResponsibilities}=await bundle('app/authorization.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');
const {samplingIssues,reviewTargets,standardSheetErrors}=await bundle('app/sampling-validation.ts');

const employees=initialDirectory().employees,policy=defaultAuthorization(employees.map(e=>e.id));
const actor=(id,extra={})=>({id,employees,policy,roles:defaultResponsibilities,routing:{},...extra});
let tick=0;const at=()=>new Date(Date.UTC(2026,9,29,8,0,tick++)).toISOString();
const step=(job,c,id,extra)=>applyOperation(job,c,actor(id,extra),at());
const sample=(id,extra={})=>({id,bottle:'PDS',bottleSerial:'B-'+id,dataComplete:true,fieldData:{sampleNature:'WHS'},...extra});
const job=(samples=[sample('1.01'),sample('1.02',{containerType:'Glass container',containerId:'G-07',bottle:'',bottleSerial:''})],stages=[{name:'Sampling Preparation',status:'Completed'}])=>({id:'OM-P-26-201',jobNumber:'OM-P-26-201',clientCode:'P',clientName:'Test',fieldArea:'F',well:'W',samplingSource:'Wellhead Sampling',samplingInstructions:'Collect two samples.',status:'Draft',createdById:'SALIM',samples,stages,events:[]});
const sent=(j=job())=>step(j,{type:'dispatch',engineer:'MOHSIN',driver:'ALI',team:['HUSSEINI']},'SALIM');
const submitted=()=>step(sent(),{type:'data-submit',note:'All done'},'MOHSIN');
const comment=(target,text='Record the opening pressure for this sample.')=>({target,label:target,text});
const reported=()=>{let j=step(submitted(),{type:'data-approve'},'SALIM');j=step(j,{type:'report-draft',kind:'sampling',text:'Summary',checker:''},'MOHSIN');return step(j,{type:'report-action',kind:'sampling',action:'submit',comments:''},'MOHSIN');};

test('only the accountable employee submits; supporting employees, drivers and others cannot',()=>{
 const j=sent();
 assert.equal(samplingStatus(j).key,'data');
 assert.throws(()=>step(j,{type:'data-submit',note:''},'HUSSEINI'),/Only the accountable sampling employee/);
 assert.throws(()=>step(j,{type:'data-submit',note:''},'ALI'),/Only the accountable sampling employee/);
 assert.throws(()=>step(j,{type:'data-submit',note:''},'HUMAID'),/not assigned/);
 const s=step(j,{type:'data-submit',note:'All done'},'MOHSIN');
 assert.equal(latestData(s).status,'Submitted');assert.equal(latestData(s).submittedBy,'MOHSIN');assert.equal(samplingDataLocked(s),true);
 assert.throws(()=>step(s,{type:'data-submit',note:''},'MOHSIN'),/already waiting for review/);
 assert.ok(pendingActions(j,actor('HUSSEINI')).some(a=>a.id==='sampling'),'a supporting employee can help with data entry');
 assert.match(pendingActions(j,actor('HUSSEINI')).find(a=>a.id==='sampling').next,/Mohsin.*submits/);
});

test('submission catches missing preparation, containers and data sheets; bottles and glass both pass',()=>{
 assert.throws(()=>step(sent(job(undefined,[{name:'Sampling Preparation',status:'In Progress'}])),{type:'data-submit',note:''},'MOHSIN'),/complete the preparation step/);
 assert.throws(()=>step(sent(job([sample('1.01'),sample('1.02',{containerType:'Glass container',containerId:' ',bottle:'',bottleSerial:''})])),{type:'data-submit',note:''},'MOHSIN'),/container for sample 1.02/);
 assert.throws(()=>step(sent(job([sample('1.01',{bottle:''})])),{type:'data-submit',note:''},'MOHSIN'),/container for sample 1.01/,'a bottle still needs its type');
 assert.throws(()=>step(sent(job([sample('1.01',{dataComplete:false})])),{type:'data-submit',note:''},'MOHSIN'),/data sheet for sample 1.01/);
 assert.equal(latestData(submitted()).status,'Submitted','bottle and glass container records submit');
 const issues=samplingIssues({samplingSource:'Wellhead Sampling',samples:[sample('1.02',{containerType:'Glass container',containerId:'G-1',bottle:'',bottleSerial:'',fieldData:{}})],stages:[]});
 assert.ok(issues.some(i=>i.target==='sample:1.02:data'));assert.equal(issues.some(i=>i.target==='sample:1.02:container'),false,'glass needs no bottle inventory fields');
 assert.equal(standardSheetErrors({id:'x',containerType:'Glass container',containerId:'G',fieldData:{}}).some(e=>/Bottle Type/.test(e)),false);
 assert.ok(reviewTargets({samples:[sample('1.01')]}).some(t=>t.target==='sample:1.01:container'));
});

test('returning needs specific comments; returned work is distinct and resubmitted by the accountable employee',()=>{
 const s=submitted();
 assert.equal(samplingStatus(s).key,'data-review');assert.equal(samplingStatus(s).owner,'SALIM');
 assert.ok(pendingActions(s,actor('SALIM')).some(a=>a.id==='sampling-report'),'the approver receives the review');
 for(const id of ['MOHSIN','HUSSEINI','SHEREIQI','ALI'])assert.throws(()=>step(s,{type:'data-return',general:'Please correct the data.',comments:[comment('sample:1.01')]},id),/not assigned|not configured/);
 assert.throws(()=>step(s,{type:'data-return',general:'Fix it',comments:[comment('sample:1.01')]},'SALIM'),/at least a sentence/);
 assert.throws(()=>step(s,{type:'data-return',general:'Please correct the data.',comments:[]},'SALIM'),/names the affected section/);
 assert.throws(()=>step(s,{type:'data-return',general:'Please correct the data.',comments:[comment('','Opening pressure missing here.')]},'SALIM'),/section or sample/);
 const r=step(s,{type:'data-return',general:'Opening pressures are missing.',comments:[comment('sample:1.01'),comment('preparation','Calibration status is not recorded.')]},'SALIM');
 assert.equal(latestData(r).status,'Returned');assert.equal(latestData(r).comments.length,2);assert.equal(samplingDataLocked(r),false,'returned data can be corrected');
 assert.equal(samplingStatus(r).key,'returned');assert.equal(samplingStatus(r).owner,'MOHSIN');
 assert.ok(pendingActions(r,actor('HUSSEINI')).some(a=>a.id==='sampling'),'supporting employee may help correct');
 assert.throws(()=>step(r,{type:'data-submit',note:''},'HUSSEINI'),/Only the accountable/);
 const again=step(r,{type:'data-submit',note:'Corrected'},'MOHSIN');
 assert.equal(operationsFor(again).samplingData.length,2,'submission history is kept');assert.equal(operationsFor(again).samplingData[0].comments.length,2,'earlier comments are kept');
});

test('data approval is not report approval; the report goes straight to the approver and unlocks laboratory scope',()=>{
 const s=submitted();
 assert.throws(()=>step(s,{type:'report-draft',kind:'sampling',text:'Summary',checker:''},'MOHSIN'),/after the sampling data is approved/);
 const changed={...s,samples:s.samples.map(x=>({...x,bottleSerial:x.bottleSerial+'x'}))};
 assert.throws(()=>step(changed,{type:'data-approve'},'SALIM'),/changed after submission/);
 const a=step(s,{type:'data-approve'},'SALIM');
 assert.equal(latestData(a).reviewedBy,'SALIM');assert.equal(samplingApproved(a),false,'approved data alone does not approve the report');
 assert.equal(samplingStatus(a).key,'report-generation');
 assert.throws(()=>step(a,{type:'report-draft',kind:'sampling',text:'Summary',checker:''},'HUSSEINI'),/Only the accountable/);
 let j=step(a,{type:'report-draft',kind:'sampling',text:'Summary',checker:''},'MOHSIN');
 assert.equal(operationsFor(j).samplingReports[0].checker,'','no checker step');
 assert.throws(()=>step(j,{type:'report-action',kind:'sampling',action:'checking',comments:''},'MOHSIN'),/directly to the sampling approver/);
 j=step(j,{type:'report-action',kind:'sampling',action:'submit',comments:''},'MOHSIN');
 assert.equal(samplingStatus(j).key,'report-review');
 assert.throws(()=>step(j,{type:'report-action',kind:'sampling',action:'approve',comments:''},'WILFRED'),/named approver/);
 j=step(j,{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');
 assert.equal(samplingApproved(j),true);assert.equal(samplingStatus(j).key,'report-approved');assert.match(samplingStatus(j).label,/laboratory scope needed/);
});

test('approved data is corrected only through an explicit reopen that keeps history and re-locks the scope',()=>{
 let j=step(reported(),{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');
 const approvedVersion=JSON.stringify(operationsFor(j).samplingReports[0]);
 assert.throws(()=>step(j,{type:'data-reopen',reason:'Wrong serial'},'HUSSEINI'),/Only the accountable sampling employee or the sampling approver/);
 assert.throws(()=>step(j,{type:'data-reopen',reason:''},'MOHSIN'),/Reason/);
 const reopened=step(j,{type:'data-reopen',reason:'Bottle serial was mistyped'},'MOHSIN');
 assert.equal(samplingApproved(reopened),false,'the job is no longer released to laboratory scope');
 assert.equal(JSON.stringify(operationsFor(reopened).samplingReports[0]),approvedVersion,'the approved report version is preserved');
 assert.equal(operationsFor(reopened).samplingReports.at(-1).status,'Changes Requested');
 assert.equal(latestData(reopened).status,'Reopened');assert.equal(samplingDataLocked(reopened),false);
 const handed=step(j,{type:'handover-send',sampleIds:['1.01','1.02'],notes:''},'ALI');
 assert.throws(()=>step(handed,{type:'data-reopen',reason:'Late correction'},'MOHSIN'),/Needs clarification/);
});

test('a changed approver takes over pending work without rewriting past approvals',()=>{
 const roles={...defaultResponsibilities,samplingApproval:'WILFRED'};
 const done=step(reported(),{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');
 assert.equal(operationsFor(done).samplingReports[0].approvedBy,'SALIM');assert.equal(latestData(done).reviewedBy,'SALIM');
 assert.equal(samplingApproved(done),true,'past approval stays valid after the duty moves');
 const s=submitted();
 assert.equal(samplingStatus(s,roles).owner,'WILFRED');
 assert.throws(()=>step(s,{type:'data-approve'},'SALIM',{roles}),/not assigned/);
 assert.equal(latestData(step(s,{type:'data-approve'},'WILFRED',{roles})).reviewedBy,'WILFRED');
 assert.throws(()=>step(s,{type:'data-approve'},'SALIM',{roles:{...defaultResponsibilities,samplingApproval:''}}),/Sampling approval is not configured/);
});

test('legacy records keep their recorded approvals and in-flight reports keep their path',()=>{
 const legacy={...job(),status:'Completed',report:{reportStatus:'Completed',approvedBy:'SALIM',approvedAt:'2026-08-01T08:00:00Z'}};
 assert.equal(samplingApproved(legacy),true);assert.equal(samplingStatus(legacy).key,'report-approved');
 const inFlight={...sent(),operations:{...operationsFor(sent()),samplingReports:[{version:1,status:'Checking',text:'Old',preparedBy:'MOHSIN',preparedAt:at(),checker:'HUSSEINI',comments:'',snapshot:JSON.stringify({samples:sent().samples,events:[],source:'Wellhead Sampling',jobNumber:'OM-P-26-201',clientName:'Test',well:'W',fieldArea:'F'})}]}};
 assert.equal(samplingStatus(inFlight).key,'report-review');
 assert.throws(()=>step(inFlight,{type:'data-submit',note:''},'MOHSIN'),/started before data review/);
 const forwarded=step(inFlight,{type:'report-action',kind:'sampling',action:'submit',comments:''},'HUSSEINI');
 assert.equal(operationsFor(forwarded).samplingReports[0].status,'Awaiting Approval','the old checker path still completes');
});
