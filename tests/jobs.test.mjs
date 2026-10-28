import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}};globalThis.localStorage=window.localStorage;
const {applyOperation,pendingActions,canSeeDraft,isDraft,finalReady,qcPending,labScopeProblems,operationMilestones}=await bundle('app/operations-model.ts');
const {defaultAuthorization,defaultResponsibilities}=await bundle('app/authorization.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');
const {readTestRouting,storedTestRouting,testRoutingKey,testsFor,unclassifiedTests}=await bundle('app/test-routing.ts');
const {nextJobSequence}=await bundle('app/job-numbering.ts');

const employees=initialDirectory().employees,policy=defaultAuthorization(employees.map(e=>e.id));
const routing={'Black Oil — DL':'PVT','Black Oil — Validation':'PVT','Others — Water Analysis':'Chemical','Specialised Analysis — SARA':'Both'};
const actor=(id,extra={})=>({id,employees,policy,roles:defaultResponsibilities,routing,teams:{PVT:['NASSER','AHAD','RANJITH'],Chemical:['NASSER','YAQEEN']},...extra});
let tick=0;const at=()=>new Date(Date.UTC(2026,9,28,8,0,tick++)).toISOString();
const step=(job,c,id,extra)=>applyOperation(job,c,actor(id,extra),at());
const draft=(extra={})=>({id:'OM-P-26-101',jobNumber:'OM-P-26-101',globalSequence:101,clientCode:'P',clientName:'Test',fieldArea:'Field',well:'W-1',samplingSource:'Wellhead Sampling',status:'Draft',currentStage:'Job Setup',nextAction:'',dueDate:'2026-11-05',ownerId:'SALIM',responsibleId:'MOHSIN',assignedEngineerId:'MOHSIN',assignedDriverId:'HUMAID',createdById:'SALIM',createdAt:at(),lastUpdatedById:'SALIM',lastUpdatedAt:at(),stages:[],samplingInstructions:'Collect three wellhead samples; confirm choke with the client.',
 samples:[{id:'1.01',bottle:'PDS',bottleSerial:'B-11',dataComplete:true,fieldData:{sampleNature:'WHS'}},{id:'1.02',containerType:'Glass container',containerId:'G-07',bottle:'',bottleSerial:'',dataComplete:true,fieldData:{sampleNature:'WHS'}},{id:'1.03',bottle:'SPS',bottleSerial:'B-13',dataComplete:true,fieldData:{sampleNature:'WHS'}}],...extra});
const sent=(job=draft())=>step(job,{type:'dispatch',engineer:'MOHSIN',driver:'HUMAID',team:['HUSSEINI']},'SALIM');
const approved=()=>{let job=sent();job=step(job,{type:'data-submit',note:''},'MOHSIN');job=step(job,{type:'data-approve'},'SALIM');job=step(job,{type:'report-draft',kind:'sampling',text:'Report',checker:''},'MOHSIN');job=step(job,{type:'report-action',kind:'sampling',action:'submit',comments:''},'MOHSIN');return step(job,{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');};
const conditions={pressure:'2100',pressureUnit:'psi',temperature:'88',temperatureUnit:'°C',notes:''};
const entry=(sampleId,destination,pvtTests=[],chemicalTests=[],more={})=>({sampleId,destination,pvtTests,chemicalTests,notes:'',excluded:false,exclusionReason:'',...more});
const mixed=()=>[entry('1.01','PVT',['Black Oil — DL','Black Oil — Validation']),entry('1.02','Chemical',[],['Others — Water Analysis']),entry('1.03','Both',['Specialised Analysis — SARA','Specialised Analysis — Pour Point'],['Specialised Analysis — SARA','Specialised Analysis — Pour Point'])];
const release=(job,samples=mixed(),id='SALIM',extra,reason='')=>step(job,{type:'lab-scope',action:'release',samples,conditions,reason},id,extra);

test('job creation is limited to createJob holders and needs instructions and valid assignments',()=>{
 assert.throws(()=>step(draft(),{type:'dispatch',engineer:'MOHSIN',driver:'ALI'},'SHEREIQI'),/not assigned/);
 assert.throws(()=>step(draft(),{type:'dispatch',engineer:'MOHSIN',driver:'ALI'},'MA001'),/not assigned/,'the administrator does not create jobs');
 assert.throws(()=>step(draft({samplingInstructions:'  '}),{type:'dispatch',engineer:'MOHSIN',driver:'ALI'},'SALIM'),/Sampling instructions are required/);
 assert.throws(()=>step(draft(),{type:'dispatch',engineer:'',driver:'ALI'},'SALIM'),/accountable sampling employee/);
 assert.throws(()=>step(draft(),{type:'dispatch',engineer:'MOHSIN',driver:''},'SALIM'),/driver/);
 assert.throws(()=>step(draft(),{type:'dispatch',engineer:'MOHSIN',driver:'ALI',team:['HUMAID']},'SALIM'),/needs sampling access/,'a driver-only profile cannot be a sampler');
 const inactive=employees.map(e=>e.id==='HUSSEINI'?{...e,active:false}:e);
 assert.throws(()=>step(draft(),{type:'dispatch',engineer:'MOHSIN',driver:'ALI',team:['HUSSEINI']},'SALIM',{employees:inactive}),/active employee/);
 const job=sent();
 assert.equal(job.status,'Job Created');assert.equal(isDraft(job),false);assert.equal(job.assignedEngineerId,'MOHSIN');assert.deepEqual(job.samplingTeamIds,['HUSSEINI']);
 assert.equal(job.assignedDriverId,'HUMAID');assert.equal(job.teamWork.sampling.owner,'MOHSIN','one accountable owner');
 assert.throws(()=>sent(job),/already been dispatched/);
});

test('drafts stay with their creator; sent jobs reach every assigned sampling employee',()=>{
 const d=draft();
 assert.equal(isDraft(d),true);
 assert.equal(canSeeDraft(d,actor('SALIM')),true);assert.equal(canSeeDraft(d,actor('MA001')),true,'administrator keeps access');
 for(const id of ['MOHSIN','HUSSEINI','SHEREIQI','ALI'])assert.equal(canSeeDraft(d,actor(id)),false,id+' cannot see a draft');
 assert.deepEqual(pendingActions(d,actor('SALIM')).map(a=>a.id),['overview']);
 assert.equal(pendingActions(d,actor('MOHSIN')).length,0,'an assignee gets nothing before sending');
 const job=sent(draft({samples:draft().samples.map(x=>({...x,dataComplete:false}))}));
 for(const id of ['MOHSIN','HUSSEINI'])assert.ok(pendingActions(job,actor(id)).some(a=>a.id==='sampling'),id+' receives the sampling work');
 assert.equal(pendingActions(job,actor('SHEREIQI')).some(a=>a.id==='sampling'),false,'the PVT Team Lead is not a sampler on this job');
 assert.equal(canSeeDraft(job,actor('MOHSIN')),true);
});

test('job numbers never reuse an ID already recorded',()=>{
 const jobs=[{id:'OM-P-26-007',globalSequence:7},{id:'OM-Q-26-009',globalSequence:9},{id:'OM-P-25-040',globalSequence:40}];
 assert.equal(nextJobSequence(3,jobs,'26'),10,'a stale counter cannot reissue 004–009');
 assert.equal(nextJobSequence(12,jobs,'26'),13);
 assert.equal(nextJobSequence(0,[],'26'),1);
});

test('laboratory scope opens only after sampling approval and only for the configured scope selector',()=>{
 assert.throws(()=>release(sent()),/after the sampling report is approved/);
 assert.throws(()=>step(sent(),{type:'lab-scope',action:'save',samples:mixed(),conditions,reason:''},'SALIM'),/after the sampling report is approved/);
 const job=approved();
 assert.throws(()=>release(job,mixed(),'SHEREIQI'),/not assigned/);
 assert.throws(()=>release(job,mixed(),'SALIM',{roles:{...defaultResponsibilities,scopeSelector:''}}),/Scope selection is not configured/);
 assert.throws(()=>release(job,mixed(),'SALIM',{routing:null}),/routing settings cannot be read/);
});

test('PVT-only, Chemical-only and combined samples route to the configured team leads',()=>{
 const job=release(approved());const o=job.operations;
 const items=o.activities.filter(a=>a.id.startsWith('labscope:'));
 assert.ok(items.filter(a=>a.sampleId==='1.01').every(a=>a.stream==='PVT'));
 assert.equal(items.filter(a=>a.sampleId==='1.01'&&a.kind==='validation').length,8,'wellhead Validation sequence per sample');
 assert.deepEqual(items.filter(a=>a.sampleId==='1.02').map(a=>[a.stream,a.title]),[['Chemical','Others — Water Analysis']]);
 const sara=items.filter(a=>a.sampleId==='1.03'&&a.title==='Specialised Analysis — SARA');
 assert.deepEqual(sara.map(a=>a.stream).sort(),['Chemical','PVT'],'Both creates one item per section');
 assert.equal(new Set(sara.map(a=>a.linkId)).size,1,'the two items are linked');
 const pour=items.filter(a=>a.sampleId==='1.03'&&a.title==='Specialised Analysis — Pour Point');
 assert.deepEqual(pour.map(a=>a.stream).sort(),['Chemical','PVT'],'an unclassified test sent to both sections');
 assert.equal(new Set(items.map(a=>a.id)).size,items.length,'no duplicate within a section');
 assert.ok(o.scopeConfirmedAt);
 const queue=id=>pendingActions(job,actor(id)).map(a=>a.label);
 assert.ok(queue('SHEREIQI').includes('PVT planning'));assert.equal(queue('SHEREIQI').includes('Chemical planning'),false);
 assert.ok(queue('BAHRI').includes('Chemical planning'));assert.equal(queue('BAHRI').includes('PVT planning'),false);
 assert.equal(queue('WILFRED').includes('PVT planning'),false,'the PVT Supervisor does not receive test assignment');
 const moved={...defaultResponsibilities,pvtTeamLead:'NASSER'};
 assert.ok(pendingActions(job,actor('NASSER',{roles:moved})).some(a=>a.label==='PVT planning'),'routing follows the configured duty');
 assert.throws(()=>release(approved(),mixed(),'SALIM',{roles:{...defaultResponsibilities,chemicalTeamLead:''}}),/Chemical Team Lead is not configured/);
 const pvtOnly=release(approved(),[entry('1.01','PVT',['Black Oil — DL']),entry('1.02','PVT',['Black Oil — DL']),entry('1.03','PVT',['Black Oil — DL'])],'SALIM',{roles:{...defaultResponsibilities,chemicalTeamLead:''}});
 assert.ok(pvtOnly.operations.activities.every(a=>a.stream==='PVT'),'a PVT-only scope does not need the Chemical lead');
});

test('release refuses wrong routing, undecided samples and unsupported destinations',()=>{
 const job=approved();
 assert.throws(()=>release(job,[entry('1.01','Chemical',[],['Black Oil — DL']),...mixed().slice(1)]),/routed to PVT in Settings/);
 assert.throws(()=>release(job,[entry('1.01','PVT',[],['Others — Water Analysis']),...mixed().slice(1)]),/need the destination Chemical or Both/);
 assert.throws(()=>release(job,[entry('1.01','PVT'),...mixed().slice(1)]),/has no tests/);
 assert.throws(()=>release(job,[entry('1.01','PVT',[],[],{excluded:true}),...mixed().slice(1)]),/reason for excluding/);
 assert.throws(()=>release(job,mixed().slice(1)),/one scope entry/);
 assert.throws(()=>step(job,{type:'lab-scope',action:'release',samples:mixed(),conditions:{...conditions,pressure:''},reason:''},'SALIM'),/reservoir pressure and temperature/);
 const ok=release(job,[entry('1.01','PVT',[],[],{excluded:true,exclusionReason:'Leaked during transport'}),...mixed().slice(1)]);
 assert.equal(ok.operations.activities.some(a=>a.sampleId==='1.01'),false,'an excluded sample gets no work');
 assert.deepEqual(labScopeProblems(job,mixed(),conditions,routing,defaultResponsibilities),[]);
});

test('bottles and glass containers are snapshotted without bottle fields for glass',()=>{
 const v=release(approved()).operations.labScopes[0];
 assert.deepEqual(v.samples.map(s=>[s.sampleId,s.containerType,s.containerLabel]),[['1.01','Bottle','PDS · B-11'],['1.02','Glass container','Glass container · G-07'],['1.03','Bottle','SPS · B-13']]);
});

test('drafts carry no approval; released versions and routing never change after revision or settings changes',()=>{
 let job=step(approved(),{type:'lab-scope',action:'save',samples:mixed(),conditions,reason:''},'SALIM');
 let v=job.operations.labScopes;assert.equal(v.length,1);assert.equal(v[0].status,'Draft');assert.equal(v[0].releasedBy,undefined);assert.equal(v[0].releasedAt,undefined);
 assert.equal(job.operations.activities.length,0,'a draft creates no work');
 job=release(job);v=job.operations.labScopes;assert.equal(v.length,1,'the draft becomes version 1');assert.equal(v[0].status,'Released');assert.equal(v[0].releasedBy,'SALIM');
 const issued=JSON.stringify(v[0]);const work=job.operations.activities.length;
 const removed=mixed();removed[0].pvtTests=['Black Oil — Validation'];
 assert.throws(()=>release(job,removed,'SALIM',undefined,'Drop DL'),/cannot be removed or moved/);
 assert.throws(()=>release(job,[entry('1.01','PVT',[],[],{excluded:true,exclusionReason:'x'}),...mixed().slice(1)],'SALIM',undefined,'x'),/cannot be excluded/);
 const added=mixed();added[1]={...added[1],destination:'Both',pvtTests:['Black Oil — DL']};
 assert.throws(()=>release(job,added,'SALIM'),/Revision reason is required/);
 job=release(job,added,'SALIM',{routing:{...routing,'Specialised Analysis — Pour Point':'Chemical'}},'Client asked for DL on 1.02');
 v=job.operations.labScopes;assert.equal(v.length,2);assert.equal(JSON.stringify(v[0]),issued,'version 1 is unchanged');
 assert.equal(v[0].routing['Specialised Analysis — Pour Point'],undefined,'routing snapshot of version 1 kept');
 assert.equal(v[1].routing['Specialised Analysis — Pour Point'],'Chemical');
 assert.equal(job.operations.activities.length,work+1,'only the added test creates work');
 assert.ok(job.operations.activities.some(a=>a.sampleId==='1.02'&&a.stream==='PVT'&&a.title==='Black Oil — DL'));
 assert.ok(job.operations.activities.filter(a=>a.title==='Specialised Analysis — Pour Point').some(a=>a.stream==='PVT'),'existing work is not rerouted by later settings');
});

test('QC stays a required gate before final reporting for per-sample scopes',()=>{
 const job=release(approved());
 assert.equal(qcPending(job),true);assert.equal(finalReady(job),false);
 assert.equal(operationMilestones(job).find(m=>m.id==='completion').done,false);
 const drafted=step(job,{type:'report-draft',kind:'final',text:'Final',checker:'SHEREIQI'},'SHEREIQI');
 assert.throws(()=>step(drafted,{type:'report-action',kind:'final',action:'submit',comments:''},'SHEREIQI'),/not yet QC approved/);
 assert.equal(pendingActions(job,actor('SHEREIQI')).some(a=>a.id==='reporting'),false,'no final-report action while QC is pending');
});

test('test routing settings are validated and never assumed',()=>{
 assert.deepEqual(readTestRouting(null),{},'every test starts unclassified');
 assert.ok(unclassifiedTests({}).length>10);
 assert.deepEqual(testsFor('Chemical',routing),['Others — Water Analysis','Specialised Analysis — SARA']);
 for(const raw of ['bad','[]',JSON.stringify({'Not a test':'PVT'}),JSON.stringify({'Black Oil — DL':'Lab'})])assert.throws(()=>readTestRouting(raw));
 store.set(testRoutingKey,'corrupt');assert.equal(storedTestRouting(),null,'unreadable settings block release');store.delete(testRoutingKey);
});
