import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};globalThis.localStorage=window.localStorage;
const {applyOperation,operationsFor,labScopeProblems,unplannedValidation,allWorkDone,phase2Ready,phase2Undecided,phasedScope}=await bundle('app/operations-model.ts');
const {workItems}=await bundle('app/work-items.ts');
const {normalizeFluid,fluidTypes}=await bundle('app/scope-catalogue.ts');
const {defaultAuthorization,defaultResponsibilities}=await bundle('app/authorization.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');

const employees=initialDirectory().employees,policy=defaultAuthorization(employees.map(e=>e.id));
const routing={'Black Oil — DL':'PVT','Gas Condensates (GC) — CCE':'PVT','Others — Water Analysis':'Chemical'};
const roles={...defaultResponsibilities,labReceipt:'SHEREIQI'};
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
const finish=(j,a)=>{const lead=a.stream==='PVT'?'SHEREIQI':'BAHRI';if(a.external){j=step(j,{type:'external-dispatch',id:a.id,sentOn:'2026-11-02',expectedReturn:'2026-11-10',notes:''},a.owner);j=step(j,{type:'external-results',id:a.id,receivedOn:'2026-11-09',notes:'',file:file(a.id)},a.owner);j=step(j,{type:'external-submit',id:a.id,notes:''},a.owner);}else j=step(j,{type:'workbook',id:a.id,file:file(a.id)},a.owner);return step(j,{type:'lead-review',id:a.id,decision:'approve',target:'',comments:''},lead);};


const p1=(j,samples,cond=conditions,reason='')=>step(j,{type:'lab-scope',action:'release',reason,conditions:cond,samples,phase:1},'SALIM');
const p2=(j,samples,reason='')=>step(j,{type:'lab-scope',action:'release',reason,conditions,samples,phase:2},'SALIM');
const released=j=>operationsFor(j).labScopes.filter(v=>v.status==='Released').at(-1);
const strip=s=>{const y={...s};delete y.containerType;delete y.containerLabel;return y;};

test('fluid types: Chemistry and STO; older Chemical reads as Chemistry',()=>{
 assert.deepEqual(fluidTypes,['Black Oil','Gas Condensate','Water','Chemistry','STO','OBM','Other']);
 assert.equal(normalizeFluid('Chemical'),'Chemistry');assert.equal(normalizeFluid('STO'),'STO');
});

test('Phase 1: Salim chooses Validation steps per sample; release creates them for Ahmed to assign; no-Validation samples go to Phase 2',()=>{
 let j=approved();assert.ok(phasedScope(j));
 const samples=[e('1.01',{fluidType:'Black Oil',validation:true,validationSteps:['Opening Pressure','Restoration','PV']}),e('1.02',{fluidType:'STO',destination:'Chemical'}),e('1.03',{fluidType:'Gas Condensate',validation:true,validationSteps:[]})];
 assert.ok(labScopeProblems(j,samples,conditions,routing,roles,undefined,undefined,1).some(p=>/1\.03: select the Validation steps/.test(p)));
 assert.ok(labScopeProblems(j,[samples[0],samples[1],e('1.03',{fluidType:'Black Oil',pvtTests:['Black Oil — DL']})],conditions,routing,roles,undefined,undefined,1).some(p=>/detailed tests are selected in Phase 2/.test(p)));
 assert.ok(labScopeProblems(j,samples.slice(0,2).concat(e('1.03',{fluidType:'Black Oil'})),{...conditions,pressure:''},routing,roles,undefined,undefined,1).some(p=>/reservoir pressure and temperature/.test(p)),'P and T go to Ahmed with Validation');
 assert.ok(labScopeProblems(j,samples.slice(0,2).concat(e('1.03',{fluidType:'Black Oil',validation:true,validationSteps:['Sample Transfer']})),conditions,routing,roles,undefined,undefined,1).some(p=>/Sample Transfer is no longer a Validation step/.test(p)));
 samples[2].validationSteps=['Opening Pressure','PV'];
 j=p1(j,samples);
 const v=released(j);assert.equal(v.phase,1);
 const val=acts(j).filter(a=>a.kind==='validation');
 assert.deepEqual(val.map(a=>[a.sampleId,a.title,a.status]),[['1.01','Opening Pressure','Unassigned'],['1.01','Restoration','Unassigned'],['1.01','PV','Unassigned'],['1.03','Opening Pressure','Unassigned'],['1.03','PV','Unassigned']]);
 assert.equal(val.find(a=>a.title==='Restoration').conditions,'2100 psi; 88 °C');
 assert.equal(unplannedValidation(j).length,0,'already planned by the scope selector');
 assert.ok(!acts(j).some(a=>a.kind!=='validation'),'no tests in Phase 1');
 assert.ok(view([j],'SHEREIQI').actions.some(i=>/assign/i.test(i.button+i.action)),'Ahmed is asked to assign');
 assert.deepEqual(phase2Undecided(j),['1.01','1.02','1.03']);assert.equal(phase2Ready(j,'1.02'),true);assert.equal(phase2Ready(j,'1.01'),false);
 const salim=view([j],'SALIM').actions.find(i=>i.key.startsWith('phase2:'));assert.ok(salim,'Salim gets the Phase 2 task for the sample without Validation');assert.match(salim.action,/Sample 1\.02$/);
 assert.equal(allWorkDone(j),false,'the job cannot finish before the Phase 2 decision');
 // Ahmed may still remove an unstarted step and add another.
 const r=operationsFor(j).scope.find(x=>x.id==='labscope:1.01:PVT:Validation');
 j=step(j,{type:'validation-plan',scopeId:r.id,steps:[{title:'Opening Pressure'},{title:'PV'},{title:'Flash'}]},'SHEREIQI');
 assert.deepEqual(acts(j).filter(a=>a.sampleId==='1.01').map(a=>a.title),['Opening Pressure','PV','Flash']);
});

test('Phase 2: samples open after their Validation; selected samples need tests; not selected need none; job finishes after all decisions',()=>{
 let j=p1(approved(),[e('1.01',{fluidType:'Black Oil',validation:true,validationSteps:['PV']}),e('1.02',{fluidType:'Water',destination:'Chemical'}),e('1.03',{excluded:true,exclusionReason:'Leaked'})]);
 const base2=()=>released(j).samples.map(strip);
 const tooEarly=base2().map(s=>s.sampleId==='1.01'?{...s,furtherStudy:true,pvtTests:['Black Oil — DL']}:s);
 assert.throws(()=>p2(j,tooEarly),/Validation is not complete yet/);
 const withTests=base2().map(s=>s.sampleId==='1.02'?{...s,furtherStudy:true}:s);
 assert.throws(()=>p2(j,withTests),/selected for further study but has no tests/);
 j=p2(j,base2().map(s=>s.sampleId==='1.02'?{...s,furtherStudy:true,chemicalTests:['Others — Water Analysis']}:s));
 assert.equal(released(j).phase,2);assert.ok(acts(j).some(a=>a.sampleId==='1.02'&&a.title==='Others — Water Analysis'));
 assert.deepEqual(phase2Undecided(j),['1.01']);
 const pv=acts(j).find(a=>a.kind==='validation');j=assign(j,pv,'NASSER');j=finish(j,acts(j).find(a=>a.id===pv.id));
 assert.equal(phase2Ready(j,'1.01'),true);
 assert.ok(view([j],'SALIM').actions.some(i=>i.key.startsWith('phase2:')&&/1\.01/.test(i.action)),'Salim is told when Validation is complete');
 j=p2(j,released(j).samples.map(strip).map(s=>s.sampleId==='1.01'?{...s,furtherStudy:false}:s),'Client: no further study for 1.01');
 assert.deepEqual(phase2Undecided(j),[]);
 assert.ok(!view([j],'SALIM').actions.some(i=>i.key.startsWith('phase2:')));
});

test('older single-phase scopes keep their view and cannot be released as phases',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',pvtTests:['Black Oil — DL']}),e('1.02',{excluded:true,exclusionReason:'x'}),e('1.03',{excluded:true,exclusionReason:'x'})]);
 assert.equal(phasedScope(j),false);assert.deepEqual(phase2Undecided(j),[]);
 assert.throws(()=>p1(j,released(j).samples.map(strip)),/released in one step/);
});
