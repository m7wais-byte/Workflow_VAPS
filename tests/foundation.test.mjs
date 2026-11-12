import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}};globalThis.localStorage=window.localStorage;
const {applyOperation,operationsFor,pendingActions}=await bundle('app/operations-model.ts');
const auth=await bundle('app/authorization.ts');
const {initialDirectory,migrateDirectory,loadDirectory,directoryKey}=await bundle('app/employee-directory.ts');
const {eligibleForTeam}=await bundle('app/team-workflow.ts');
const {containerId,containerComplete,containerLabel,containerNoun,isAtmospheric}=await bundle('app/sample-container.ts');
const {defaultAuthorization,defaultResponsibilities,readResponsibilities,invalidResponsibilities,roleHolder,storedResponsibilities,responsibilitiesKey,migrateDriverAccess,authorizationKey}=auth;

const employees=initialDirectory().employees,policy=defaultAuthorization(employees.map(e=>e.id));
const actor=(id,extra={})=>({id,employees,policy,roles:defaultResponsibilities,teams:{PVT:['NASSER','AHAD','RANJITH'],Chemical:['NASSER','YAQEEN']},...extra});let tick=0;const at=()=>new Date(Date.UTC(2026,9,28,8,0,tick++)).toISOString();
const step=(job,c,id,extra)=>applyOperation(job,c,actor(id,extra),at());
const fixture=(samples=[{id:'S1',bottle:'PDS',bottleSerial:'B1',dataComplete:true,fieldData:{sampleNature:'WHS'}},{id:'S2',containerType:'Glass container',containerId:'G-07',bottle:'',bottleSerial:'',dataComplete:true,fieldData:{sampleNature:'SEP'}}])=>({id:'OM-F-26-1',samplingInstructions:'Collect as specified.',jobNumber:'OM-F-26-1',clientCode:'F',clientName:'Test',samplingSource:'Wellhead Sampling',requiredTests:['Black Oil — Validation','Others — Water Analysis'],samples,stages:[],status:'Job Created',createdById:'SALIM',events:[]});
const approvedSampling=(job,driver='ALI')=>{job=step(job,{type:'dispatch',engineer:'MOHSIN',driver},'SALIM');job=step(job,{type:'data-submit',note:''},'MOHSIN');job=step(job,{type:'data-approve'},'SALIM');job=step(job,{type:'report-draft',kind:'sampling',text:'Report',checker:''},'MOHSIN');job=step(step(job,{type:'report-action',kind:'sampling',action:'checking',comments:''},'MOHSIN'),{type:'report-action',kind:'sampling',action:'submit',comments:''},'SALIM');return step(job,{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');};
const scoped=()=>step(fixture(),{type:'scope',items:[{title:'Black Oil — Validation',sampleIds:['S1'],stream:'PVT'},{title:'Others — Water Analysis',sampleIds:['S1'],stream:'Chemical'}],conditions:{pressure:'2000',pressureUnit:'psi',temperature:'80',temperatureUnit:'°C',notes:''},reason:'Confirm'},'SALIM');
const schedule=a=>({type:'schedule',id:a.id,owner:'NASSER',start:'2026-10-28',due:'2026-10-29',conditions:'',notes:''});

test('responsibility defaults, saved changes, intentionally empty values and corrupt settings',()=>{
 assert.deepEqual(readResponsibilities(null),defaultResponsibilities);
 assert.equal(defaultResponsibilities.pvtSupervisor,'WILFRED');assert.equal(defaultResponsibilities.pvtTeamLead,'SHEREIQI');assert.equal(defaultResponsibilities.chemicalTeamLead,'BAHRI');assert.equal(defaultResponsibilities.qcReviewer,'');
 const saved=readResponsibilities(JSON.stringify({...defaultResponsibilities,pvtTeamLead:'NASSER',finalApproval:''}));
 assert.equal(saved.pvtTeamLead,'NASSER');assert.equal(saved.finalApproval,'','a cleared duty is not restored to its default');
 const {qcReviewer,...older}=defaultResponsibilities;assert.equal(readResponsibilities(JSON.stringify({...older,pvtTeamLead:''})).pvtTeamLead,'');assert.equal(qcReviewer,'');
 for(const raw of ['bad','null','[]',JSON.stringify({pvtTeamLead:7})])assert.throws(()=>readResponsibilities(raw));
 store.set(responsibilitiesKey,'corrupt');assert.ok(Object.values(storedResponsibilities()).every(v=>v===''),'unreadable settings block every duty');store.delete(responsibilitiesKey);
});
test('invalid employee references are flagged and never act',()=>{
 const roles={...defaultResponsibilities,pvtTeamLead:'GONE',chemicalTeamLead:'BAHRI'};const list=employees.map(e=>e.id==='BAHRI'?{...e,active:false}:e);
 assert.deepEqual(invalidResponsibilities(roles,list).sort(),['chemicalTeamLead','pvtTeamLead']);
 assert.equal(roleHolder(roles,'pvtTeamLead',list),'');
 const j=scoped(),pvt=j.operations.activities.find(a=>a.stream==='PVT');
 assert.throws(()=>step(j,schedule(pvt),'SHEREIQI',{roles}),/not configured/);
});
test('Ahmed Al Shereiqi is PVT Team Lead; Wilfred keeps supervision and final approval only',()=>{
 let j=scoped();const pvt=j.operations.activities.find(a=>a.stream==='PVT');
 assert.throws(()=>step(j,schedule(pvt),'WILFRED'));assert.throws(()=>step(j,schedule(pvt),'SALIM'));
 j=step(j,schedule(pvt),'SHEREIQI');assert.equal(j.operations.activities.find(a=>a.id===pvt.id).owner,'NASSER');
 j=step(j,{type:'workbook',id:pvt.id,file:{id:'w1',name:'w.xlsx',size:10,type:''}},'NASSER');
 assert.throws(()=>step(j,{type:'workbook-return',id:pvt.id,comments:'Fix'},'WILFRED'),/team lead/);
 j=step(j,{type:'workbook-return',id:pvt.id,comments:'Fix units on sheet 2'},'SHEREIQI');assert.equal(j.operations.activities.find(a=>a.id===pvt.id).status,'Changes Requested');
 assert.ok(pendingActions(scoped(),actor('SHEREIQI')).some(a=>a.label==='PVT planning'));
 assert.ok(!pendingActions(scoped(),actor('WILFRED')).some(a=>a.id==='laboratory'));
});
test('Al Yaqdhan Al Bahri leads Chemical only',()=>{
 const j=scoped(),chem=j.operations.activities.find(a=>a.stream==='Chemical'),pvt=j.operations.activities.find(a=>a.stream==='PVT');
 assert.equal(step(j,schedule(chem),'BAHRI').operations.activities.find(a=>a.id===chem.id).status,'Scheduled');
 assert.throws(()=>step(j,schedule(pvt),'BAHRI'));assert.throws(()=>step(j,schedule(chem),'SHEREIQI'));
 assert.ok(pendingActions(j,actor('BAHRI')).some(a=>a.label==='Chemical planning'));
});
test('a responsibility never replaces the permission it needs',()=>{
 const j=scoped(),pvt=j.operations.activities.find(a=>a.stream==='PVT');
 assert.throws(()=>step(j,schedule(pvt),'SHEREIQI',{policy:{...policy,analysis:policy.analysis.filter(id=>id!=='SHEREIQI')}}),/not assigned/);
 const roles={...defaultResponsibilities,pvtTeamLead:'NASSER'};
 assert.equal(step(j,schedule(pvt),'NASSER',{roles}).operations.activities.find(a=>a.id===pvt.id).status,'Scheduled');
 assert.throws(()=>step(j,schedule(pvt),'SHEREIQI',{roles}));
 assert.throws(()=>step(j,schedule(pvt),'MA001',{roles:{...roles,pvtTeamLead:''}}),/not configured/,'an unassigned duty blocks even the administrator');
});
test('legacy BVT records load as PVT and save as PVT',()=>{
 const legacy=scoped();legacy.operations=JSON.parse(JSON.stringify(legacy.operations).replaceAll('"stream":"PVT"','"stream":"BVT"'));
 const o=operationsFor(legacy);assert.ok(o.activities.length&&!o.activities.some(a=>a.stream==='BVT'));assert.ok(o.scope.some(s=>s.stream==='PVT'));
 const pvt=o.activities.find(a=>a.stream==='PVT');const saved=step(legacy,schedule(pvt),'SHEREIQI');
 assert.ok(!JSON.stringify(saved.operations).includes('"BVT"'));assert.equal(saved.operations.activities.length,legacy.operations.activities.length);
});
test('Humaid is added once without duplicates and receives job details only',()=>{
 const base=initialDirectory();base.employees=base.employees.filter(e=>e.id!=='HUMAID');
 const once=migrateDirectory(base);assert.equal(once.employees.filter(e=>e.id==='HUMAID').length,1);assert.equal(migrateDirectory(once),once);
 const named={...base,employees:[...base.employees,{...base.employees[0],id:'E-77',employeeCode:'E-77',name:'Humaid Al-Habsi'}]};assert.equal(migrateDirectory(named),named);
 store.set(directoryKey,JSON.stringify(base));assert.equal(loadDirectory().employees.filter(e=>e.id==='HUMAID').length,1);assert.equal(JSON.parse(store.get(directoryKey)).employees.filter(e=>e.id==='HUMAID').length,1);
 const ids=once.employees.map(e=>e.id);const old=defaultAuthorization(ids.filter(id=>id!=='HUMAID'));
 const migrated=migrateDriverAccess(old,ids);for(const [key,list] of Object.entries(migrated))assert.equal(list.includes('HUMAID'),key==='jobDetails',key);
 for(const key of Object.keys(old))assert.equal(migrated[key].includes('ALI'),old[key].includes('ALI'),'Ali unchanged: '+key);
 const removed={...migrated,jobDetails:migrated.jobDetails.filter(id=>id!=='HUMAID'),sampling:[...migrated.sampling,'HUMAID']};assert.deepEqual(migrateDriverAccess(removed,ids),removed,'later administrator edits are kept');
 for(const [key,list] of Object.entries(defaultAuthorization(ids)))assert.equal(list.includes('HUMAID'),key==='jobDetails',key);
});
test('Humaid is a driver only: cannot edit sampling data, run lab work or approve',()=>{
 const d=initialDirectory();store.set(directoryKey,JSON.stringify(d));store.set(authorizationKey,JSON.stringify(defaultAuthorization(d.employees.map(e=>e.id))));
 assert.equal(eligibleForTeam('HUMAID','transport'),true);assert.equal(eligibleForTeam('HUMAID','sampling'),false);assert.equal(eligibleForTeam('HUMAID','analysis'),false);assert.equal(eligibleForTeam('ALI','transport'),true);
 let j=approvedSampling(fixture(),'HUMAID');
 assert.throws(()=>step(j,{type:'report-draft',kind:'sampling',text:'x',checker:'HUSSEINI'},'HUMAID'));
 assert.throws(()=>step(j,{type:'report-action',kind:'sampling',action:'approve',comments:''},'HUMAID'));
 j=scoped();assert.throws(()=>step(j,schedule(j.operations.activities[0]),'HUMAID'));assert.throws(()=>step(j,{type:'request-addition',title:'x',reason:'y'},'HUMAID'));
});
test('legacy bottles and glass containers pass validation and labels',()=>{
 const legacy={bottle:'PDS',bottleSerial:'B1'},glass={containerType:'Glass container',containerId:'G-07',bottle:'',bottleSerial:''};
 assert.equal(containerId(legacy),'B1');assert.equal(containerComplete(legacy),true);assert.equal(containerLabel(legacy),'PDS · B1');
 assert.equal(containerId(glass),'G-07');assert.equal(containerComplete(glass),true,'no bottle type or serial needed');assert.equal(containerLabel(glass),'Glass bottle · G-07');
 assert.equal(containerComplete({containerType:'Glass container',containerId:' '}),false);assert.equal(containerComplete({bottleSerial:'B1'}),false,'bottles still need a type');
 // Glass bottles and IATA cans carry no serial or ID: selecting the volume completes them.
 const bottle={containerType:'Glass container',containerVolume:'500 mL'},can={containerType:'IATA can',containerVolume:'5 L'};
 assert.equal(containerComplete(bottle),true);assert.equal(containerId(bottle),'');assert.equal(containerLabel(bottle),'Glass bottle · 500 mL');
 assert.equal(containerComplete(can),true);assert.equal(isAtmospheric(can),true);assert.equal(containerNoun(can),'IATA can');assert.equal(containerLabel(can),'IATA can · 5 L');
 assert.equal(containerComplete({containerType:'IATA can'}),false,'an IATA can needs its volume');
 // A glass container without its ID is now caught when the sampling data is submitted, before any report.
 assert.throws(()=>approvedSampling(fixture([{id:'S1',bottle:'PDS',bottleSerial:'B1',dataComplete:true,fieldData:{}},{id:'S2',containerType:'Glass container',containerId:'',dataComplete:true,fieldData:{}}])),/record the container for sample S2/);
});
