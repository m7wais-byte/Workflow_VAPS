import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};globalThis.localStorage=window.localStorage;
const {applyOperation,operationsFor,operationComplete,additionalWorkPending,validationCatalogue}=await bundle('app/operations-model.ts');
const {workItems,inboxRows,sortItems,jobsNeedingAction,streamsFor}=await bundle('app/work-items.ts');
const {defaultAuthorization,defaultResponsibilities,storedResponsibilities,responsibilitiesKey}=await bundle('app/authorization.ts');
const {storedLabTeams,labTeamsKey}=await bundle('app/lab-teams.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');
const {handoff}=await bundle('app/team-workflow.ts');

const employees=initialDirectory().employees,policy=defaultAuthorization(employees.map(e=>e.id));
const routing={'Black Oil — DL':'PVT','Others — Water Analysis':'Chemical','Black Oil — Validation':'PVT'};
const roles={...defaultResponsibilities,qcReviewer:'AHAD',labReceipt:'SHEREIQI'};
const teams={PVT:['NASSER','RANJITH'],Chemical:['YAQEEN']};
const actor=(id,extra={})=>({id,employees,policy,roles,routing,teams,...extra});
let tick=0;const at=()=>new Date(Date.UTC(2026,10,1,6,0,tick++)).toISOString();const today='2026-11-01';
const step=(job,c,id,extra)=>applyOperation(job,c,actor(id,extra),at());
const s=(id,extra={})=>({id,bottle:'PDS',bottleSerial:'B-'+id,dataComplete:true,fieldData:{sampleNature:'WHS'},...extra});
const base=(source='Wellhead Sampling')=>({id:'OM-P-26-501',jobNumber:'OM-P-26-501',clientCode:'P',clientName:'Client U',fieldArea:'F',well:'W',samplingSource:source,samplingInstructions:'Two samples.',status:'Draft',createdById:'SALIM',dueDate:'2026-11-20',stages:[{name:'Sampling Preparation',status:'Completed'}],events:[],samples:[s('1.01'),s('1.02',{containerType:'Glass container',containerId:'G-07',bottle:'',bottleSerial:''})]});
const conditions={pressure:'2100',pressureUnit:'psi',temperature:'88',temperatureUnit:'°C',notes:''};
const entry=(sampleId,destination,pvtTests=[],chemicalTests=[])=>({sampleId,destination,pvtTests,chemicalTests,notes:'',excluded:false,exclusionReason:'',fluidType:'Black Oil'});
function approved(source){let j=step(base(source),{type:'dispatch',engineer:'MOHSIN',driver:'ALI'},'SALIM');j=step(j,{type:'data-submit',note:''},'MOHSIN');j=step(j,{type:'data-approve'},'SALIM');j=step(j,{type:'report-draft',kind:'sampling',text:'S',checker:''},'MOHSIN');j=step(step(j,{type:'report-action',kind:'sampling',action:'checking',comments:''},'MOHSIN'),{type:'report-action',kind:'sampling',action:'submit',comments:''},'SALIM');return step(j,{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');}
const received=j=>step(step(j,{type:'handover-send',sampleIds:['1.01','1.02'],notes:''},'ALI'),{type:'handover-receive',notes:''},'SHEREIQI');
const released=()=>step(received(approved()),{type:'lab-scope',action:'release',reason:'',conditions,samples:[entry('1.01','PVT',['Black Oil — DL']),entry('1.02','Both',['Black Oil — DL'],['Others — Water Analysis'])]},'SALIM');
const file=n=>({id:'f'+n+tick,name:`wb-${n}.xlsx`,size:10,type:''});
const assign=(j,a,owner,start='2026-10-30',due='2026-11-03')=>step(j,{type:'schedule',id:a.id,owner,start,due,conditions:'',notes:''},a.stream==='PVT'?'SHEREIQI':'BAHRI');
const finish=(j,a)=>{j=step(j,{type:'workbook',id:a.id,file:file(a.id)},a.owner);j=step(j,{type:'lead-review',id:a.id,decision:'approve',target:'',comments:''},a.stream==='PVT'?'SHEREIQI':'BAHRI');return step(j,{type:'qc-review',id:a.id,decision:'approve',target:'',comments:''},'AHAD');};
const acts=j=>operationsFor(j).activities;
const view=(jobs,id,extra)=>workItems(jobs,actor(id,extra),today);

test('Both scope reaches each team lead once, as linked work items; no duplicate tests or alerts',()=>{
 const j=released();
 assert.deepEqual(acts(j).map(a=>[a.sampleId,a.stream]),[['1.01','PVT'],['1.02','PVT'],['1.02','Chemical']]);
 const pvt=view([j],'SHEREIQI').alerts,chem=view([j],'BAHRI').alerts;
 assert.equal(pvt.length,1);assert.equal(pvt[0].headline,'New PVT scope added');assert.equal(pvt[0].destination,'Both');assert.match(pvt[0].samples,/Sample 1\.01 · PDS · B-1\.01; Sample 1\.02 · Glass container · G-07/);assert.equal(pvt[0].planner,'SHEREIQI');assert.equal(pvt[0].button,'Assign 2');
 assert.equal(chem.length,1);assert.equal(chem[0].headline,'New Chemistry scope added');assert.equal(chem[0].scope,'Others — Water Analysis');
 for(const id of ['NASSER','YAQEEN','WILFRED','MOHSIN'])assert.equal(view([j],id).alerts.length,0,id+' gets no scope alert');
 assert.deepEqual(view([j],'SHEREIQI').alerts.map(a=>a.key),pvt.map(a=>a.key),'alert keys are stable across refresh');
});

test('an assignment alerts only the assignee, links to the task, and reading it changes nothing',()=>{
 let j=released();const a=acts(j)[0];j=assign(j,a,'NASSER');
 const al=view([j],'NASSER').alerts;assert.equal(al.length,1);assert.equal(al[0].kind,'assignment');assert.equal(al[0].open.tab,'laboratory?activity='+encodeURIComponent(a.id));assert.equal(al[0].by,'SHEREIQI');
 assert.ok(view([j],'NASSER').actions.some(i=>i.test==='Black Oil — DL'&&i.sample==='1.01'),'the task is in his My work');
 assert.equal(view([j],'RANJITH').alerts.length,0);
 j=step(j,{type:'schedule',id:a.id,owner:'RANJITH',start:'2026-10-30',due:'2026-11-03',conditions:'',notes:''},'SHEREIQI');
 assert.equal(view([j],'RANJITH').alerts[0].headline,'PVT test reassigned to you');assert.equal(view([j],'NASSER').alerts[0].kind,'moved');
 assert.equal(acts(j)[0].history.length,2,'assignment changes stay in the history');
});

test('new scope with no configured team lead is saved, shown Unassigned, and blocked for an administrator',()=>{
 const j=released();const noLead={roles:{...roles,chemicalTeamLead:''}};
 assert.ok(acts(j).some(a=>a.stream==='Chemical'&&!a.owner),'the scope is kept');
 const admin=view([j],'MA001',noLead);assert.ok(admin.blocked.some(b=>b.setting==='chemicalTeamLead'&&b.jobs.includes('OM-P-26-501')));
 for(const e of employees)assert.ok(!view([j],e.id,noLead).alerts.some(a=>/Chemical/.test(a.headline)),'not routed to an arbitrary employee: '+e.id);
});

test('Validation can be added to any job — even completed, or of an unsupported sampling type — without overwriting earlier work',()=>{
 let j=released();for(const a of acts(j))j=assign(j,a,a.stream==='PVT'?'NASSER':'YAQEEN');for(const a of acts(j))j=finish(j,a);
 j=step(j,{type:'report-draft',kind:'final',text:'Final',checker:'SHEREIQI',file:{...file('final'),version:1,submittedBy:'SHEREIQI',submittedAt:at(),status:'Available',comments:''}},'SHEREIQI');
 j=step(j,{type:'report-action',kind:'final',action:'submit',comments:''},'SHEREIQI');j=step(j,{type:'report-action',kind:'final',action:'approve',comments:''},'WILFRED');
 assert.equal(operationComplete(j),true);const before=JSON.stringify(acts(j));
 assert.throws(()=>step(j,{type:'add-validation',sampleIds:['1.02'],steps:['Flash'],reason:'Repeat'},'SHEREIQI'),/not assigned|Scope selection/,'only the configured scope selector adds scope');
 j=step(j,{type:'add-validation',sampleIds:['1.02'],steps:['PV','Opening Pressure','Flash'],reason:'Client asked to validate the glass container.'},'SALIM');
 const added=acts(j).filter(a=>a.id.startsWith('addval:'));
 assert.deepEqual(added.map(a=>a.title),['Opening Pressure','Flash','PV'],'catalogue order, for guidance');
 assert.ok(added.every(a=>a.kind==='validation'&&a.stream==='PVT'&&a.status==='Unassigned'&&a.sampleId==='1.02'));
 assert.equal(JSON.stringify(acts(j).filter(a=>!a.id.startsWith('addval:'))),before,'completed tests, files and QC approvals are unchanged');
 const o=operationsFor(j);assert.equal(o.finalReports[0].status,'Approved','the approved report version is kept');assert.equal(o.finalReports.at(-1).status,'Changes Requested','a new revision is needed');
 assert.equal(operationComplete(j),false);assert.equal(additionalWorkPending(j),true);
 assert.ok(view([j],'SHEREIQI').alerts.some(a=>a.headline==='Validation added'&&/Opening Pressure, Flash, PV/.test(a.scope)));
 assert.ok(!view([j],'SHEREIQI').actions.some(i=>i.area==='Final report'),'no final-report action before the new work is QC approved');
 // Repeating Validation on the same sample creates distinct, additional activities.
 j=step(j,{type:'add-validation',sampleIds:['1.02'],steps:['Flash'],reason:'Second repeat.'},'SALIM');
 assert.equal(acts(j).filter(a=>a.id.startsWith('addval:')&&a.title==='Flash').length,2);
 // Any sampling type, and the full catalogue is available.
 const other=step(approved('Other'),{type:'add-validation',sampleIds:['1.01'],steps:[...validationCatalogue],reason:'Requested.'},'SALIM');
 assert.equal(acts(other).length,validationCatalogue.length);
 assert.throws(()=>step(other,{type:'add-validation',sampleIds:['1.01'],steps:['Not a step'],reason:'x'},'SALIM'),/catalogue/);
});

test('Validation activities never block each other: a later step can be submitted before an earlier one starts',()=>{
 let j=step(approved(),{type:'add-validation',sampleIds:['1.01'],steps:['Opening Pressure','Restoration','Flash'],reason:'Requested.'},'SALIM');
 const [first,,last]=acts(j);j=assign(j,first,'NASSER');j=assign(j,last,'RANJITH');
 j=step(j,{type:'workbook',id:last.id,file:file('flash')},'RANJITH');
 assert.equal(acts(j).find(a=>a.id===last.id).status,'Workbook Submitted');assert.equal(acts(j).find(a=>a.id===first.id).status,'Scheduled');
 assert.ok(view([j],'SHEREIQI').actions.some(i=>i.action==='Review workbook v1'&&i.test==='Flash'),'review still required');
});

test('each row shows its own task deadline; overdue and due-today work outranks unopened New items',()=>{
 let j=released();const [a,b]=acts(j);
 j=assign(j,a,'NASSER','2026-10-25','2026-11-01');j=assign(j,b,'NASSER','2026-10-25','2026-11-06');
 const w=view([j],'NASSER');const isNew=i=>i.test===undefined||i.due==='2026-11-06';
 const sorted=sortItems(w.actions,isNew);assert.equal(sorted[0].due,'2026-11-01');assert.equal(sorted[0].dueToday,true);assert.equal(sorted[0].dueKind,'Test due');assert.equal(sorted[0].jobDue,'2026-11-20');
 const row=inboxRows(w,[j],actor('NASSER'),today,{isNew,isClosed:()=>false,stage:()=>''})[0];assert.equal(row.due,row.actions[0].due,'the row deadline belongs to the task shown');
 assert.deepEqual([...jobsNeedingAction(w)],['OM-P-26-501'],'one action count for My work and Jobs');
});

test('an unrelated employee does not see the job; reviewers, approvers and drivers see what is coming up',()=>{
 const j=step(base(),{type:'dispatch',engineer:'MOHSIN',driver:'HUMAID'},'SALIM');
 const rows=id=>{const w=view([j],id);return inboxRows(w,[j],actor(id),today,{isNew:()=>false,isClosed:()=>false,stage:()=>''});};
 for(const id of ['NASSER','YAQEEN','RANJITH','AHAD','ALI','HUSSEINI'])assert.equal(rows(id).length,0,id+' has no responsibility here');
 assert.ok(view([j],'HUMAID').upcoming.some(u=>u.area==='Transport'));assert.equal(view([j],'HUMAID').actions.length,0);
 assert.ok(view([j],'SALIM').upcoming.some(u=>u.role==='Sampling approval'));
 const done=released();assert.ok(view([done],'WILFRED').upcoming.some(u=>u.role==='Final report approval'));assert.equal(view([done],'WILFRED').actions.length,0,'no approve button before its prerequisites');
 assert.ok(view([done],'AHAD').upcoming.some(u=>u.role==='QC review'));
});

test('employees land on their own laboratory team',()=>{
 const j=released();
 assert.deepEqual(streamsFor(actor('BAHRI'),[j]),['Chemical']);assert.deepEqual(streamsFor(actor('SHEREIQI'),[j]),['PVT']);
 assert.deepEqual(streamsFor(actor('YAQEEN'),[j]),['Chemical'],'team membership');
 const both=streamsFor(actor('SHEREIQI',{roles:{...roles,chemicalTeamLead:'SHEREIQI'}}),[j]);assert.deepEqual(both,['PVT','Chemical']);
});

test('the retired team handoff refuses current jobs, so it cannot overwrite the assigned engineer or driver',()=>{
 const j=step(base(),{type:'dispatch',engineer:'MOHSIN',driver:'ALI'},'SALIM');
 assert.throws(()=>handoff(j,'sampling','HUSSEINI','accept',at()),/current workflow/);
 assert.ok(!fs.existsSync('app/team-inbox.tsx'),'the Profile Team inbox is removed');
 assert.ok(!fs.readFileSync('app/page.tsx','utf8').includes('Trial identity'),'one demo selector only');
});

test('the demo setup is isolated: it never changes saved Settings and switches off cleanly',()=>{
 store.set(responsibilitiesKey,JSON.stringify({...defaultResponsibilities,qcReviewer:''}));store.set(labTeamsKey,JSON.stringify({PVT:['NASSER'],Chemical:[]}));
 const savedRoles=store.get(responsibilitiesKey),savedTeams=store.get(labTeamsKey),ids=employees.map(e=>e.id);
 store.set('vaps-demo-setup-v1',JSON.stringify({enabled:true,roles:{qcReviewer:'AHAD'},teams:{PVT:['RANJITH'],Chemical:['YAQEEN']},routing:{},loadedAt:at()}));
 assert.equal(storedResponsibilities().qcReviewer,'AHAD');assert.equal(storedResponsibilities().pvtTeamLead,'SHEREIQI','unlisted duties keep the saved value');assert.deepEqual(storedLabTeams(ids),{PVT:['RANJITH'],Chemical:['YAQEEN']});
 store.set('vaps-demo-setup-v1',JSON.stringify({enabled:false,roles:{qcReviewer:'AHAD'},teams:{PVT:['RANJITH'],Chemical:['YAQEEN']},routing:{},loadedAt:at()}));
 assert.equal(storedResponsibilities().qcReviewer,'');assert.deepEqual(storedLabTeams(ids),{PVT:['NASSER'],Chemical:[]});
 assert.equal(store.get(responsibilitiesKey),savedRoles);assert.equal(store.get(labTeamsKey),savedTeams);
 store.clear();
});

test('visible text uses PVT and PV terminology',()=>{
 for(const f of ['app/page.tsx','app/operations-workspace.tsx','app/dashboard.tsx','app/work-items.ts']){const text=fs.readFileSync(f,'utf8');assert.ok(!/\bBVT\b|\bBV\b|\bDVT\b/.test(text),f);}
 const model=fs.readFileSync('app/operations-model.ts','utf8').replace(/\/\*\*[^]*?\*\/|'BVT'|"BVT"/g,'');assert.ok(!/\bBV\b|\bDVT\b/.test(model));
});

test('PVT Supervisor: no workflow command requires the duty, so supervisor-only gives no action; real duties still appear',()=>{
 const model=fs.readFileSync('app/operations-model.ts','utf8');
 assert.ok(!/requireRole\([^)]*pvtSupervisor/.test(model)&&!/holder\(actor,'pvtSupervisor'\)/.test(model),'no review or approval is gated on the PVT Supervisor duty');
 // Supervisor-only (final approval held by someone else): nothing actionable is hidden from them.
 const supOnly={roles:{...roles,pvtSupervisor:'WILFRED',finalApproval:'SALIM'}};
 let j=released();for(const a of acts(j))j=assign(j,a,a.stream==='PVT'?'NASSER':'YAQEEN');
 j=step(j,{type:'workbook',id:acts(j)[0].id,file:file('w')},'NASSER');
 assert.equal(view([j],'WILFRED',supOnly).actions.length,0);assert.ok(view([j],'SHEREIQI',supOnly).actions.some(i=>/^Review workbook/.test(i.action)),'team-lead review stays with the team lead');
 assert.throws(()=>step(j,{type:'lead-review',id:acts(j)[0].id,decision:'approve',target:'',comments:''},'WILFRED',supOnly),/not assigned|Team Lead/,'the supervisor cannot take over team-lead review');
 // With the default final-approval duty, Wilfred's approval appears as soon as it is actionable.
 for(const a of acts(j).slice(1))j=step(j,{type:'workbook',id:a.id,file:file(a.id)},a.owner);
 for(const a of acts(j)){j=step(j,{type:'lead-review',id:a.id,decision:'approve',target:'',comments:''},a.stream==='PVT'?'SHEREIQI':'BAHRI');j=step(j,{type:'qc-review',id:a.id,decision:'approve',target:'',comments:''},'AHAD');}
 j=step(j,{type:'report-draft',kind:'final',text:'Final',checker:'SHEREIQI',file:{...file('final'),version:1,submittedBy:'SHEREIQI',submittedAt:at(),status:'Available',comments:''}},'SHEREIQI');
 assert.equal(view([j],'WILFRED').actions.length,0,'no approve button before submission');
 j=step(j,{type:'report-action',kind:'final',action:'submit',comments:''},'SHEREIQI');
 assert.deepEqual(view([j],'WILFRED').actions.map(i=>i.action),['Approve final laboratory report v1']);
});

test('unassigned scope never disappears: ageing or reading the alert leaves the planner action in My work',()=>{
 const j=released();const later='2026-12-31';
 const w=workItems([j],actor('SHEREIQI'),later);
 assert.equal(w.alerts.filter(a=>a.kind==='scope').length,1,'alert still shown two months later while work is unassigned');
 assert.ok(w.actions.some(i=>i.key.startsWith('assign:')&&i.action==='Assign 2 PVT test(s)'),'the assignment task is in Do now regardless of alerts');
 const seen=new Set(w.alerts.flatMap(a=>a.keys));
 const rows=inboxRows(w,[j],actor('SHEREIQI'),later,{isNew:i=>!i.events.every(k=>seen.has(k)),isClosed:()=>false,stage:()=>''});
 assert.equal(rows[0].state,'action','reading the alert does not change the work');
 // Empty team: the lead can still assign themselves.
 const emptyTeam={teams:{PVT:[],Chemical:['YAQEEN']}};
 const b=inboxRows(workItems([j],actor('SHEREIQI',emptyTeam),later),[j],actor('SHEREIQI',emptyTeam),later,{isNew:()=>false,isClosed:()=>false,stage:()=>''});
 assert.ok(b[0].actions.some(i=>i.key.startsWith('assign:')));
 assert.ok(!b[0].blockedActions.some(i=>i.key.startsWith('assign:')));
 // Once everything is assigned, the alert ages out after two days; the assigned work stays with the employees.
 let k=j;for(const a of acts(k))k=assign(k,a,a.stream==='PVT'?'NASSER':'YAQEEN');
 assert.equal(workItems([k],actor('SHEREIQI'),later).alerts.filter(a=>a.kind==='scope').length,0);
 assert.equal(workItems([k],actor('SHEREIQI'),today).alerts.filter(a=>a.kind==='scope').length,1,'shown for two days after release even when fully assigned');
});
