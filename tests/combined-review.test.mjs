import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};globalThis.localStorage=window.localStorage;
const {applyOperation,operationsFor,labScopeProblems,unplannedValidation}=await bundle('app/operations-model.ts');
const {workItems}=await bundle('app/work-items.ts');
const {defaultAuthorization,defaultResponsibilities}=await bundle('app/authorization.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');

const employees=initialDirectory().employees,policy=defaultAuthorization(employees.map(e=>e.id));
const routing={'Black Oil — DL':'PVT','Gas Condensates (GC) — CCE':'PVT','Others — Water Analysis':'Chemical'};
const roles={...defaultResponsibilities,qcReviewer:'AHAD',labReceipt:'SHEREIQI'};
const teams={PVT:['NASSER','RANJITH'],Chemical:['YAQEEN']};
const actor=(id,extra={})=>({id,employees,policy,roles,routing,teams,...extra});
let tick=0;const at=()=>new Date(Date.UTC(2026,10,2,6,0,tick++)).toISOString();const today='2026-11-02';
const step=(job,c,id,extra)=>applyOperation(job,c,actor(id,extra),at());
const s=(id,extra={})=>({id,bottle:'PDS',bottleSerial:'B-'+id,dataComplete:true,fieldData:{sampleNature:'WHS'},...extra});
const base=()=>({id:'OM-P-26-701',jobNumber:'OM-P-26-701',clientCode:'P',clientName:'Client S',fieldArea:'F',well:'W',samplingSource:'Wellhead Sampling',samplingInstructions:'Three samples.',status:'Draft',createdById:'SALIM',dueDate:'2026-11-30',stages:[{name:'Sampling Preparation',status:'Completed'}],events:[],samples:[s('1.01'),s('1.02',{containerType:'Glass container',containerId:'G-07',bottle:'',bottleSerial:''}),s('1.03')]});
const conditions={pressure:'2100',pressureUnit:'psi',temperature:'88',temperatureUnit:'°C',notes:''};
const e=(sampleId,more={})=>({sampleId,destination:'PVT',pvtTests:[],chemicalTests:[],notes:'',excluded:false,exclusionReason:'',...more});
function approved(){let j=step(base(),{type:'dispatch',engineer:'MOHSIN',driver:'ALI'},'SALIM');j=step(j,{type:'data-submit',note:''},'MOHSIN');j=step(j,{type:'data-approve'},'SALIM');j=step(j,{type:'report-draft',kind:'sampling',text:'S',checker:''},'MOHSIN');j=step(step(j,{type:'report-action',kind:'sampling',action:'checking',comments:''},'MOHSIN'),{type:'report-action',kind:'sampling',action:'submit',comments:''},'SALIM');j=step(j,{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');return step(step(j,{type:'handover-send',sampleIds:['1.01','1.02','1.03'],notes:''},'ALI'),{type:'handover-receive',notes:''},'SHEREIQI');}
const release=(j,samples,reason='')=>step(j,{type:'lab-scope',action:'release',reason,conditions,samples},'SALIM');
const acts=j=>operationsFor(j).activities;
const view=(jobs,id,extra)=>workItems(jobs,actor(id,extra),today);
const file=n=>({id:'f'+n+tick,name:`wb-${n}.xlsx`,size:10,type:''});
const assign=(j,a,owner,start='2026-11-02',due='2026-11-06')=>step(j,{type:'schedule',id:a.id,owner,start,due,conditions:'',notes:'Use cell 2'},a.stream==='PVT'?'SHEREIQI':'BAHRI');

const {scheduleOverlaps,formatRange}=await bundle('app/schedule-overlap.ts');
const {catalogueTests,newCatalogueTest,testCatalogueKey}=await bundle('app/test-catalogue.ts');
const cat=await bundle('app/scope-catalogue.ts');
const routingMod=await bundle('app/test-routing.ts');
const {readAuthorization,allowed}=await bundle('app/authorization.ts');
const wb=await bundle('app/workbook-storage.ts');

// Combined review (Nov 2026): catalogue, routing, cross-department assignment, overlap, job details, workbook access.

test('catalogue: Sulphur tests are separate Required tests; EOR is under Other tests; IDs unchanged',()=>{
 const t=catalogueTests([]);const byId=id=>t.find(x=>x.id===id);
 assert.equal(byId('Specialised Analysis — Sulphur Content').section,'Specialised analysis');
 assert.equal(byId('Specialised Analysis — Sulphur Asphaltene').section,'Specialised analysis');
 assert.equal(byId('Specialised Analysis — EOR').section,'Other tests','EOR keeps its ID, shown under Other tests');
 assert.ok(byId('Black Oil — DL')&&byId('Specialised Analysis — SARA'),'existing IDs unchanged');
 const cards=cat.testCards('Black Oil');assert.ok(cards.some(c=>c.section==='Other tests'&&c.ids[0]==='Specialised Analysis — EOR'));
});

test('catalogue: a test added in Settings appears in Scope automatically and can be routed',()=>{
 const added=newCatalogueTest('Mercury Content','Specialised analysis',undefined,catalogueTests([]));
 assert.equal(added.id,'Specialised Analysis — Mercury Content');
 assert.throws(()=>newCatalogueTest('sara','Specialised analysis',undefined,catalogueTests([])),/already/);
 assert.throws(()=>newCatalogueTest('Validation','Other tests',undefined,catalogueTests([])),/Validation/);
 store.set(testCatalogueKey,JSON.stringify({tests:[{id:added.id,name:added.name,group:added.group,section:added.section}]}));
 assert.ok(cat.testCards('Black Oil').some(c=>c.ids.includes(added.id)),'new test shown in Scope of Work');
 store.set(routingMod.testRoutingKey,JSON.stringify({[added.id]:'Chemical'}));
 assert.equal(routingMod.storedTestRouting()[added.id],'Chemical');
 const job=approved();
 assert.ok(!labScopeProblems(job,[e('1.01',{fluidType:'Black Oil',destination:'Chemical',chemicalTests:[added.id]}),e('1.02',{excluded:true,exclusionReason:'n/a'}),e('1.03',{excluded:true,exclusionReason:'n/a'})],conditions,routingMod.storedTestRouting(),roles,undefined,actor('SALIM')).some(p=>/not in the test catalog/.test(p)));
 store.delete(testCatalogueKey);store.delete(routingMod.testRoutingKey);
});

test('routing: changing a default later keeps released work where it was released',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',destination:'Both',pvtTests:['Specialised Analysis — EOR'],chemicalTests:[]}),e('1.02',{excluded:true,exclusionReason:'n/a'}),e('1.03',{excluded:true,exclusionReason:'n/a'})]);
 const eor=acts(j).find(a=>a.title==='Specialised Analysis — EOR');assert.equal(eor.stream,'PVT','EOR routed manually to PVT');
 const later={...routing,'Specialised Analysis — EOR':'Chemical'};
 const v1=operationsFor(j).labScopes.at(-1);
 const problems=labScopeProblems(j,v1.samples.map(x=>{const y={...x,notes:'changed'};delete y.containerType;delete y.containerLabel;return y;}),conditions,later,roles,v1,actor('SALIM',{routing:later}));
 assert.ok(!problems.some(p=>/routed to Chemical/.test(p)),'released placement is kept after the default changes');
});

test('assignment: leads assign any department and themselves; the assignee sees and acts on it in My Work',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',pvtTests:['Black Oil — DL']}),e('1.02',{fluidType:'Water',destination:'Chemical',chemicalTests:['Others — Water Analysis']}),e('1.03',{excluded:true,exclusionReason:'n/a'})]);
 const dl=acts(j).find(a=>a.title==='Black Oil — DL'),water=acts(j).find(a=>a.stream==='Chemical');
 j=assign(j,dl,'HUSSEINI');j=assign(j,water,'BAHRI');
 const restricted={...policy,analysis:policy.analysis.filter(id=>id!=='HUSSEINI')};
 const mine=view([j],'HUSSEINI',{policy:restricted});
 assert.ok(mine.actions.some(i=>i.test==='Black Oil — DL'),'a sampling-department employee without laboratory access sees the task');
 j=step(j,{type:'progress',id:dl.id,status:'In Progress',notes:'go'},'HUSSEINI',{policy:restricted});
 j=step(j,{type:'workbook',id:dl.id,file:file('x')},'HUSSEINI',{policy:restricted});
 assert.equal(acts(j).find(a=>a.id===dl.id).status,'Workbook Submitted');
 assert.ok(view([j],'BAHRI').actions.some(i=>i.test==='Others — Water Analysis'),'the Chemical lead assigned to themselves sees it');
 assert.throws(()=>step(j,{type:'lead-review',id:dl.id,decision:'approve',target:'',comments:''},'BAHRI'),/not assigned/,'approval stays with the PVT lead');
});

test('Validation: Ahmed assigns each selected step separately; Restoration values become the job conditions',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',validation:true}),e('1.02',{excluded:true,exclusionReason:'n/a'}),e('1.03',{excluded:true,exclusionReason:'n/a'})]);
 j={...j,operations:{...j.operations,conditions:{...j.operations.conditions,pressure:'',temperature:''}}};
 const scopeId=unplannedValidation(j)[0].id;
 assert.throws(()=>step(j,{type:'validation-plan',scopeId,steps:[{title:'Restoration'}],restoration:{pressure:'',pressureUnit:'psi',temperature:'',temperatureUnit:'°C'}},'SHEREIQI'),/reservoir pressure and temperature/);
 j=step(j,{type:'validation-plan',scopeId,steps:[{title:'Opening Pressure'},{title:'Restoration'}],restoration:{pressure:'350',pressureUnit:'bar',temperature:'110',temperatureUnit:'°C'}},'SHEREIQI');
 assert.deepEqual([operationsFor(j).conditions.pressure,operationsFor(j).conditions.pressureUnit,operationsFor(j).conditions.temperature],['350','bar','110']);
 const [op,rest]=['Opening Pressure','Restoration'].map(t=>acts(j).find(a=>a.title===t));
 j=assign(j,op,'MOHSIN','2026-11-03','2026-11-04');j=assign(j,rest,'SHEREIQI','2026-11-05','2026-11-07');
 assert.deepEqual(['Opening Pressure','Restoration'].map(t=>acts(j).find(a=>a.title===t).owner),['MOHSIN','SHEREIQI']);
});

test('overlap: 12 Nov end and 11 Nov start overlap on 11–12 November; own assignment excluded; missing dates not checked',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',pvtTests:['Black Oil — DL','Black Oil — Viscosity']}),e('1.02',{excluded:true,exclusionReason:'n/a'}),e('1.03',{excluded:true,exclusionReason:'n/a'})]);
 const dl=acts(j).find(a=>a.title==='Black Oil — DL');j=assign(j,dl,'NASSER','2026-11-08','2026-11-12');
 const o=scheduleOverlaps([j],'NASSER','2026-11-11','2026-11-14');
 assert.equal(o.length,1);assert.equal(o[0].jobNumber,'OM-P-26-701');assert.deepEqual([o[0].start,o[0].end,o[0].from,o[0].to],['2026-11-08','2026-11-12','2026-11-11','2026-11-12']);
 assert.equal(formatRange(o[0].from,o[0].to),'11–12 November 2026');
 assert.deepEqual(scheduleOverlaps([j],'NASSER','2026-11-11','2026-11-14',['activity:'+dl.id]),[],'editing excludes the assignment itself');
 assert.equal(scheduleOverlaps([j],'NASSER','2026-11-11',''),null,'missing dates cannot be checked');
 const vis=acts(j).find(a=>a.title==='Black Oil — Viscosity');
 assert.doesNotThrow(()=>assign(j,vis,'NASSER','2026-11-11','2026-11-14'),'overlap is advisory: the assignment still saves');
});

test('workbook access: only Ahmed by default; permissions are separate and admin does not get them automatically',()=>{
 const ids=employees.map(x=>x.id);const p=readAuthorization(null,ids);
 assert.deepEqual(p.viewWorkbook,['SHEREIQI']);assert.deepEqual(p.downloadWorkbook,['SHEREIQI']);
 assert.equal(allowed(p,'MA001','viewWorkbook'),false);
 const saved=readAuthorization(JSON.stringify({...defaultAuthorization(ids),viewWorkbook:['SHEREIQI','BAHRI'],downloadWorkbook:['SHEREIQI']}),ids);
 assert.equal(allowed(saved,'BAHRI','viewWorkbook'),true);assert.equal(allowed(saved,'BAHRI','downloadWorkbook'),false);
 const older=JSON.parse(JSON.stringify(defaultAuthorization(ids)));delete older.viewWorkbook;delete older.downloadWorkbook;
 assert.deepEqual(readAuthorization(JSON.stringify(older),ids).viewWorkbook,['SHEREIQI'],'older saved settings get the default');
});

test('workbook access: the storage layer refuses a direct read without permission, before touching storage',async()=>{
 const session=new Map();globalThis.window.sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v)};
 store.delete('vaps-authorization-v1');
 session.set('vaps-demo-session-v1','NASSER');
 assert.equal(wb.canAccessWorkbook('view'),false);assert.equal(wb.canAccessWorkbook('download'),false);
 let touched=false;globalThis.indexedDB={open(){touched=true;throw Error('should not open');}};
 await assert.rejects(()=>wb.downloadWorkbook('any-id','x.csv'),/Download workbook permission/);
 await assert.rejects(()=>wb.openWorkbook('any-id'),/View workbook permission/);
 assert.equal(touched,false,'no file is read for an unauthorised profile');
 session.set('vaps-demo-session-v1','SHEREIQI');
 assert.equal(wb.canAccessWorkbook('view'),true);assert.equal(wb.canAccessWorkbook('download'),true);
 delete globalThis.indexedDB;delete globalThis.window.sessionStorage;
});
