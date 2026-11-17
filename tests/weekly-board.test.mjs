import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const GS={id:'gs',name:'G-sheet.xlsx',size:1,type:'',version:1,submittedBy:'MOHSIN',submittedAt:'',status:'Available',comments:''};
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};globalThis.localStorage=window.localStorage;
const {applyOperation,operationsFor,labScopeProblems,unplannedValidation,allWorkDone,phase2Ready,phase2Undecided,phasedScope,interimReport}=await bundle('app/operations-model.ts');
const {workItems}=await bundle('app/work-items.ts');
const {normalizeFluid,fluidTypes}=await bundle('app/scope-catalogue.ts');
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
function approved(){let j=step(base(),{type:'dispatch',engineer:'MOHSIN',driver:'ALI'},'SALIM');j=step(j,{type:'data-submit',note:''},'MOHSIN');j=step(j,{type:'data-approve'},'SALIM');j=step(j,{type:'report-draft',kind:'sampling',text:'S',checker:'',file:GS},'MOHSIN');j=step(j,{type:'report-action',kind:'sampling',action:'submit',comments:''},'MOHSIN');j=step(j,{type:'report-action',kind:'sampling',action:'approve',comments:''},'SALIM');return step(step(j,{type:'handover-send',sampleIds:['1.01','1.02','1.03'],notes:''},'ALI'),{type:'handover-receive',notes:''},'SHEREIQI');}
const release=(j,samples,reason='')=>step(j,{type:'lab-scope',action:'release',reason,conditions,samples},'SALIM');
const acts=j=>operationsFor(j).activities;
const view=(jobs,id,extra)=>workItems(jobs,actor(id,extra),today);
const file=n=>({id:'f'+n+tick,name:`wb-${n}.xlsx`,size:10,type:''});
const assign=(j,a,owner,start='2026-11-02',due='2026-11-06')=>step(j,{type:'schedule',id:a.id,owner,start,due,conditions:'',notes:'Use cell 2'},a.stream==='PVT'?'SHEREIQI':'BAHRI');
const finish=(j,a)=>{const lead=a.stream==='PVT'?'SHEREIQI':'BAHRI';if(a.external){j=step(j,{type:'external-dispatch',id:a.id,sentOn:'2026-11-02',expectedReturn:'2026-11-10',notes:''},a.owner);j=step(j,{type:'external-results',id:a.id,receivedOn:'2026-11-09',notes:'',file:file(a.id)},a.owner);j=step(j,{type:'external-submit',id:a.id,notes:''},a.owner);}else j=step(j,{type:'workbook',id:a.id,file:file(a.id)},a.owner);j=step(j,{type:'lead-review',id:a.id,decision:'approve',target:'',comments:''},lead);return step(j,{type:'qc-review',id:a.id,decision:'approve',target:'',comments:''},'AHAD');};


const p1=(j,samples,cond=conditions,reason='')=>step(j,{type:'lab-scope',action:'release',reason,conditions:cond,samples,phase:1},'SALIM');
const p2=(j,samples,reason='')=>step(j,{type:'lab-scope',action:'release',reason,conditions,samples,phase:2},'SALIM');
const released=j=>operationsFor(j).labScopes.filter(v=>v.status==='Released').at(-1);
const strip=s=>{const y={...s};delete y.containerType;delete y.containerLabel;return y;};

const {weeklyBoard,equipmentClashes,weekStart,isWeekend,reportDate}=await bundle('app/weekly-board.ts');
const {jobProgressView,clientProgress}=await bundle('app/job-progress.ts');
const scoped=()=>p1(approved(),[e('1.01',{fluidType:'Black Oil',validation:true,validationSteps:['Opening Pressure','Restoration','GC']}),e('1.02',{fluidType:'STO',destination:'Chemical'}),e('1.03',{fluidType:'Black Oil',validation:true,validationSteps:['Opening Pressure']})]);
const sched=(j,a,more,by='SHEREIQI')=>step(j,{type:'schedule',id:a.id,owner:'NASSER',start:'2026-11-02',due:'2026-11-04',conditions:'',notes:'',...more},by);

test('equipment: the PVT Team Lead assigns it per PVT test; it is validated, kept when not sent, and never set on Chemistry tests',()=>{
 let j=scoped();const pvt=acts(j).filter(a=>a.stream==='PVT'),gc=acts(j).find(a=>a.stream==='Chemical');assert.ok(pvt.length>=3&&gc);
 j=sched(j,pvt[0],{equipment:'bo-sys-7'});assert.equal(acts(j).find(a=>a.id===pvt[0].id).equipment,'bo-sys-7');
 j=sched(j,pvt[0],{due:'2026-11-05'});assert.equal(acts(j).find(a=>a.id===pvt[0].id).equipment,'bo-sys-7','kept when the command does not carry equipment');
 j=sched(j,pvt[0],{equipment:''});assert.equal(acts(j).find(a=>a.id===pvt[0].id).equipment,undefined,'cleared');
 assert.throws(()=>sched(j,pvt[0],{equipment:'unknown-cell'}),/equipment list/);
 assert.throws(()=>sched(j,gc,{owner:'YAQEEN',equipment:'bo-sys-7'},'BAHRI'),/PVT tests only/);
});

test('weekly board: PVT tests only, grouped by fluid, bars by equipment and dates, Sunday start with Fri/Sat weekend',()=>{
 assert.equal(weekStart('2026-11-04'),'2026-11-01');assert.ok(isWeekend('2026-11-06')&&isWeekend('2026-11-07')&&!isWeekend('2026-11-08'));
 let j=scoped();const pvt=acts(j).filter(a=>a.stream==='PVT'),gc=acts(j).find(a=>a.stream==='Chemical');
 const s1=pvt.filter(a=>a.sampleId==='1.01'),s3=pvt.filter(a=>a.sampleId==='1.03');
 for(const a of s1)j=sched(j,a,{equipment:'bo-vaps-1'});
 j=sched(j,s3[0],{start:'2026-11-03',due:'2026-11-20',equipment:'bo-sys-16'});
 j=sched(j,gc,{owner:'YAQEEN'},'BAHRI');
 const b=weeklyBoard([{job:j,closed:false}],'2026-11-01');
 assert.equal(b.days.length,14);assert.equal(b.end,'2026-11-14');assert.deepEqual(b.groups.map(g=>g.name),['Black Oil']);
 const row=b.groups[0].rows[0];assert.equal(row.jobNumber,'OM-P-26-701');assert.match(row.sampleDetails,/^2 samples/);
 assert.ok(!row.all.some(a=>a.title==='GC'),'Chemistry tests are not shown');
 assert.equal(row.bars.length,2);
 const v=row.bars.find(x=>x.equipment==='bo-vaps-1');assert.equal(v.label,'Validation');assert.equal(v.activities.length,s1.length);assert.deepEqual([v.from,v.to],[1,3]);
 const long=row.bars.find(x=>x.equipment==='bo-sys-16');assert.equal(long.label,'Opening Pressure','test name as written in the scope');assert.deepEqual([long.from,long.to,long.clippedEnd],[2,13,true]);
 assert.notEqual(v.lane,long.lane,'overlapping bars take separate lanes');assert.equal(row.lanes,2);
 assert.equal(weeklyBoard([{job:j,closed:false}],'2026-12-06').groups[0].rows[0].bars.length,0,'open job stays listed with no bars outside its dates');
});

test('equipment clash is advisory: other tests on the same equipment in the dates, not the same sample',()=>{
 let j=scoped();const pvt=acts(j).filter(a=>a.stream==='PVT');const a1=pvt.find(a=>a.sampleId==='1.01'),a3=pvt.find(a=>a.sampleId==='1.03');
 j=sched(j,a1,{equipment:'bo-sys-7'});
 assert.equal(equipmentClashes([j],'bo-sys-7','2026-11-04','2026-11-06',{jobId:j.id,sampleId:'1.03'}).length,1);
 assert.equal(equipmentClashes([j],'bo-sys-7','2026-11-04','2026-11-06',{jobId:j.id,sampleId:'1.01'}).length,0);
 assert.equal(equipmentClashes([j],'bo-sys-7','2026-11-05','2026-11-06',{jobId:j.id,sampleId:'1.03'}).length,0);
 assert.equal(equipmentClashes([j],'','2026-11-04','2026-11-06',{jobId:j.id,sampleId:'1.03'}),null);
 j=sched(j,a3,{equipment:'bo-sys-7'});assert.equal(acts(j).find(a=>a.id===a3.id).equipment,'bo-sys-7','a clash never blocks the assignment');
});

test('report date: one date for the weekly plan (R) and the client view',()=>{
 let j=scoped();
 assert.equal(reportDate(j,false),undefined);assert.equal(weeklyBoard([{job:j,closed:false}],'2026-11-08').reports.length,0);
 j=step(j,{type:'estimate',key:'report',start:'',days:'',finish:'2026-11-12',clientVisible:false},'SALIM');
 const b=weeklyBoard([{job:j,closed:false}],'2026-11-08');
 assert.equal(b.reports.length,1);assert.deepEqual([b.reports[0].report.date,b.reports[0].report.kind,b.reports[0].col],['2026-11-12','planned',4]);
 const client=clientProgress(jobProgressView(j,{roles,employees,today,audience:'client'}));
 assert.equal(client.expected.date,'2026-11-12','the client sees the same report date');
 assert.equal(weeklyBoard([{job:j,closed:false}],'2026-11-15').reports.length,0);
});
