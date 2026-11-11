import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};globalThis.localStorage=window.localStorage;
const {applyOperation,operationsFor,operationComplete,additionalWorkPending,labScopeProblems,unplannedValidation,allWorkDone,externalStage}=await bundle('app/operations-model.ts');
const {workItems}=await bundle('app/work-items.ts');
const {testCards,needsReview,allowedTeams,defaultTeam}=await bundle('app/scope-catalogue.ts');
const {defaultAuthorization,defaultResponsibilities}=await bundle('app/authorization.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');

const employees=initialDirectory().employees,policy=defaultAuthorization(employees.map(e=>e.id));
const routing={'Black Oil — DL':'PVT','Gas Condensates (GC) — CCE':'PVT','Others — Water Analysis':'Chemical'};
const roles={...defaultResponsibilities,qcReviewer:'AHAD'};
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
const finish=(j,a)=>{const lead=a.stream==='PVT'?'SHEREIQI':'BAHRI';if(a.external){j=step(j,{type:'external-dispatch',id:a.id,sentOn:'2026-11-02',expectedReturn:'2026-11-10',notes:''},a.owner);j=step(j,{type:'external-results',id:a.id,receivedOn:'2026-11-09',notes:'',file:file(a.id)},a.owner);j=step(j,{type:'external-submit',id:a.id,notes:''},a.owner);}else j=step(j,{type:'workbook',id:a.id,file:file(a.id)},a.owner);j=step(j,{type:'lead-review',id:a.id,decision:'approve',target:'',comments:''},lead);return step(j,{type:'qc-review',id:a.id,decision:'approve',target:'',comments:''},'AHAD');};

test('each test appears once per fluid type; Validation is never a test card; Other shows each test once with its methods',()=>{
 for(const fluid of ['Black Oil','Gas Condensate','Other',undefined]){const keys=testCards(fluid).map(c=>c.key);assert.equal(new Set(keys).size,keys.length,'no duplicate card for '+fluid);assert.ok(!keys.includes('Validation'));}
 assert.deepEqual(testCards('Black Oil').filter(c=>c.section==='Fluid tests').map(c=>c.ids[0]),['Black Oil — Recombination','Black Oil — DL','Black Oil — Sep Test','Black Oil — Viscosity']);
 assert.deepEqual(testCards('Other').find(c=>c.key==='Recombination').ids,['Black Oil — Recombination','Gas Condensates (GC) — Recombination'],'catalogue identities are preserved, not merged');
 assert.deepEqual(needsReview(['Black Oil — DL','Black Oil — Sep Test','Others — Water Analysis'],'Gas Condensate'),['Black Oil — DL','Black Oil — Sep Test'],'a fluid change flags, never deletes');
 assert.deepEqual(allowedTeams('Others — Water Analysis','PVT',routing),[],'a Settings classification is respected');
 assert.equal(defaultTeam('Specialised Analysis — SARA','Both',routing),'Both','unclassified tests follow the sample destination');
 assert.equal(defaultTeam('Black Oil — DL','Both',routing),'PVT');
});

test('samples in one job keep their own fluid type; Other needs a description; old records without fluid type stay readable',()=>{
 const j=approved();
 const samples=[e('1.01',{fluidType:'Black Oil',pvtTests:['Black Oil — DL']}),e('1.02',{fluidType:'Other',destination:'Chemical',chemicalTests:['Others — Water Analysis']}),e('1.03',{fluidType:'Gas Condensate',pvtTests:['Gas Condensates (GC) — CCE']})];
 assert.ok(labScopeProblems(j,samples,conditions,routing,roles,undefined).some(p=>/1\.02: describe the fluid/.test(p)));
 samples[1].fluidDescription='Produced water with emulsion';samples[1].fluidNotes='Collected at separator drain';
 const r=release(j,samples);const v=operationsFor(r).labScopes[0];
 assert.deepEqual(v.samples.map(x=>x.fluidType),['Black Oil','Other','Gas Condensate']);assert.equal(v.samples[1].fluidDescription,'Produced water with emulsion');
 assert.ok(labScopeProblems(j,[e('1.01',{pvtTests:['Black Oil — DL']}),...samples.slice(1)],conditions,routing,roles).some(p=>/1\.01: select the fluid type/.test(p)),'missing fluid type is requested on the next edit');
});

test('Validation Yes creates one planning item for Ahmed; he chooses steps, assigns different engineers, no sequence blocking, no duplicates',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',validation:true,pvtTests:['Black Oil — DL']}),e('1.02',{fluidType:'Black Oil',destination:'Chemical',chemicalTests:['Others — Water Analysis']}),e('1.03',{excluded:true,exclusionReason:'Leaked'})]);
 assert.equal(acts(j).filter(a=>a.kind==='validation').length,0,'no step is created or assigned automatically');
 assert.equal(unplannedValidation(j).length,1);assert.equal(allWorkDone(j),false);
 const ahmed=view([j],'SHEREIQI');const plan=ahmed.actions.find(i=>i.key.startsWith('plan-validation:'));
 assert.ok(plan,'planning task in My work');assert.equal(plan.sample,'1.01');assert.match(plan.open.tab,/laboratory\?stream=PVT&plan=/);
 const al=ahmed.alerts.find(a=>a.headline.startsWith('Validation requested'));assert.ok(al);assert.equal(al.button,'Plan Validation');
 assert.deepEqual(view([j],'SHEREIQI').alerts.map(a=>a.key),ahmed.alerts.map(a=>a.key),'stable on refresh');
 assert.ok(!view([j],'BAHRI').actions.some(i=>i.key.startsWith('plan-validation:')),'the Chemical lead does not plan Validation');
 assert.throws(()=>step(j,{type:'validation-plan',scopeId:unplannedValidation(j)[0].id,steps:[{title:'Flash'}]},'SALIM'),/not assigned|PVT Team Lead/);
 const scopeId=unplannedValidation(j)[0].id;
 j=step(j,{type:'validation-plan',scopeId,steps:[{title:'Sample Transfer'},{title:'Opening Pressure'},{title:'PV'}],instructions:'Low-shrinkage sample'},'SHEREIQI');
 assert.deepEqual(acts(j).filter(a=>a.kind==='validation').map(a=>[a.title,a.status,a.owner]),[['Sample Transfer','Unassigned',''],['Opening Pressure','Unassigned',''],['PV','Unassigned','']]);
 assert.equal(unplannedValidation(j).length,0);assert.ok(!view([j],'SHEREIQI').actions.some(i=>i.key.startsWith('plan-validation:')),'resolved once planned');
 const [,op,pv]=acts(j).filter(a=>a.kind==='validation');
 j=assign(j,op,'NASSER');j=assign(j,pv,'RANJITH');
 assert.equal(acts(j).find(a=>a.id===op.id).owner,'NASSER');assert.equal(acts(j).find(a=>a.id===pv.id).owner,'RANJITH');
 j=step(j,{type:'workbook',id:pv.id,file:file('pv')},'RANJITH');assert.equal(acts(j).find(a=>a.id===pv.id).status,'Workbook Submitted','PV runs before Opening Pressure: no hard sequence');
 // Reopening the plan: started work is kept, untouched steps can be dropped, nothing is duplicated.
 j=step(j,{type:'validation-plan',scopeId,steps:[{title:'Opening Pressure'},{title:'PV'},{title:'Flash'}]},'SHEREIQI');
 const titles=acts(j).filter(a=>a.kind==='validation').map(a=>a.title);
 assert.deepEqual(titles.sort(),['Flash','Opening Pressure','PV'],'untouched Sample Transfer removed by the lead; others reused');
 assert.equal(acts(j).filter(a=>a.title==='PV').length,1);assert.equal(acts(j).find(a=>a.id===pv.id).files.length,1);
 j=step(j,{type:'validation-plan',scopeId,steps:[{title:'Flash'}]},'SHEREIQI');
 assert.ok(['Opening Pressure','PV'].every(t=>acts(j).some(a=>a.title===t)),'assigned/started steps are kept even when unselected');
});

test('Recombination as a Validation step is not silently duplicated with a separate Recombination test',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',validation:true,pvtTests:['Black Oil — Recombination']}),e('1.02',{excluded:true,exclusionReason:'n/a'}),e('1.03',{excluded:true,exclusionReason:'n/a'})]);
 const scopeId=unplannedValidation(j)[0].id;
 assert.throws(()=>step(j,{type:'validation-plan',scopeId,steps:[{title:'Recombination'}]},'SHEREIQI'),/already requested as a separate test/);
 j=step(j,{type:'validation-plan',scopeId,steps:[{title:'Recombination'}],confirmRecombination:true},'SHEREIQI');
 assert.equal(acts(j).filter(a=>a.title.endsWith('Recombination')).length,2,'deliberately separate work is kept');
});

test('Validation is not restricted by fluid or sampling type, needs a PVT destination, and can be added later to a completed job',()=>{
 const j0=approved();
 
 let j=release(j0,[e('1.01',{fluidType:'Black Oil',pvtTests:['Black Oil — DL']}),e('1.02',{fluidType:'Black Oil',excluded:true,exclusionReason:'Broken'}),e('1.03',{fluidType:'Gas Condensate',destination:'Chemical',chemicalTests:['Others — Water Analysis']})]);
 for(const a of acts(j))j=assign(j,a,a.stream==='PVT'?'NASSER':'YAQEEN');for(const a of acts(j))j=finish(j,acts(j).find(x=>x.id===a.id));
 j=step(j,{type:'report-draft',kind:'final',text:'F',checker:'SHEREIQI',file:{...file('final'),version:1,submittedBy:'SHEREIQI',submittedAt:at(),status:'Available',comments:''}},'SHEREIQI');
 j=step(j,{type:'report-action',kind:'final',action:'submit',comments:''},'SHEREIQI');j=step(j,{type:'report-action',kind:'final',action:'approve',comments:''},'WILFRED');
 assert.equal(operationComplete(j),true);const before=JSON.stringify(acts(j));const v1=operationsFor(j).labScopes.at(-1);
 assert.ok(labScopeProblems(j,v1.samples,conditions,routing,roles,v1).some(p=>/Nothing has changed/.test(p)),'saving unchanged scope never re-releases');
 const rev=v1.samples.map(x=>x.sampleId==='1.03'?{...x,destination:'Both',validation:true}:x);
 j=release(j,rev,'Client asked for Validation of 1.03');
 assert.equal(JSON.stringify(acts(j)),before,'completed tests, files and QC approvals are unchanged');
 const o=operationsFor(j);assert.equal(o.finalReports[0].status,'Approved');assert.equal(o.finalReports.at(-1).status,'Changes Requested');
 assert.equal(additionalWorkPending(j),true);assert.equal(unplannedValidation(j)[0].sampleIds[0],'1.03');
 // Older job shapes: Validation requested with no steps goes to the same planning item.
 const legacy=step(approved(),{type:'add-validation',sampleIds:['1.02'],steps:[],reason:'Requested later'},'SALIM');
 assert.equal(unplannedValidation(legacy).length,1);assert.equal(acts(legacy).length,0);
 assert.throws(()=>step(legacy,{type:'add-validation',sampleIds:['1.02'],steps:[],reason:'again'},'SALIM'),/already requested/);
});

test('custom tests become normal tracked work with stable IDs, routing, review and history; not added to the catalogue',()=>{
 const custom=[{id:'ct-a',name:'H2S content',notes:'Use Draeger tubes',team:'Chemical'},{id:'ct-b',name:'Mercury',notes:'',team:'Both'}];
 let j=release(approved(),[e('1.01',{fluidType:'Gas Condensate',destination:'Both',customTests:custom}),e('1.02',{excluded:true,exclusionReason:'x'}),e('1.03',{excluded:true,exclusionReason:'x'})]);
 const c=acts(j).filter(a=>a.custom);
 assert.deepEqual(c.map(a=>[a.title,a.stream,a.id]),[['H2S content','Chemical','labscope:1.01:Chemical:custom:ct-a'],['Mercury','PVT','labscope:1.01:PVT:custom:ct-b'],['Mercury','Chemical','labscope:1.01:Chemical:custom:ct-b']]);
 assert.ok(view([j],'BAHRI').alerts.some(a=>/H2S content \(custom test\)/.test(a.scope)));
 j=assign(j,c[0],'YAQEEN');j=finish(j,acts(j).find(a=>a.id===c[0].id));
 const done=acts(j).find(a=>a.id===c[0].id);assert.equal(done.status,'Completed');assert.ok(done.history.length>=3);
 const v=operationsFor(j).labScopes.at(-1);
 assert.ok(labScopeProblems(j,v.samples.map(x=>x.sampleId==='1.01'?{...x,customTests:[x.customTests[1]]}:x),conditions,routing,roles,v).some(p=>/released custom test “H2S content” cannot be removed/.test(p)));
 assert.ok(labScopeProblems(approved(),[e('1.01',{fluidType:'Black Oil',customTests:[{id:'x',name:' ',notes:'',team:'PVT'}]}),e('1.02',{excluded:true,exclusionReason:'x'}),e('1.03',{excluded:true,exclusionReason:'x'})],conditions,routing,roles).some(p=>/enter a name/.test(p)));
});

test('one outsourced test alongside internal tests: coordinator actions, waiting on the provider, results never self-approve, lead review alert',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',pvtTests:['Black Oil — DL','Black Oil — Viscosity'],execution:{'Black Oil — Viscosity':{by:'Third-party',provider:'Core Lab Muscat',notes:'Send 50 cc',expectedReturn:'2026-11-12',coordinator:'NASSER'}}}),e('1.02',{excluded:true,exclusionReason:'x'}),e('1.03',{excluded:true,exclusionReason:'x'})]);
 const dl=acts(j).find(a=>a.title==='Black Oil — DL'),visc=acts(j).find(a=>a.title==='Black Oil — Viscosity');
 assert.equal(dl.external,undefined,'outsourcing one test does not mark the others external');
 assert.equal(visc.external.provider,'Core Lab Muscat');assert.equal(visc.owner,'NASSER','coordinator chosen in the scope is assigned on release');assert.equal(externalStage(visc),'Awaiting dispatch');
 const nas=view([j],'NASSER');assert.ok(nas.actions.some(i=>i.action==='Dispatch to Core Lab Muscat (third-party)'));assert.ok(nas.alerts.some(a=>/External coordination assigned to you · Core Lab Muscat/.test(a.headline)));
 assert.throws(()=>step(j,{type:'workbook',id:visc.id,file:file('v')},'NASSER'),/third-party laboratory/);
 assert.throws(()=>step(j,{type:'external-results',id:visc.id,receivedOn:'2026-11-09',notes:'',file:file('v')},'NASSER'),/dispatch/);
 j=step(j,{type:'external-dispatch',id:visc.id,sentOn:'2026-11-02',expectedReturn:'2026-11-12',notes:'Courier ref 77'},'NASSER');
 let w=view([j],'NASSER');assert.ok(!w.actions.some(i=>i.test==='Black Oil — Viscosity'));const wait=w.waiting.find(x=>x.key.startsWith('w-ext:'));
 assert.equal(wait.waitingOn,'Core Lab Muscat (third party)');assert.match(wait.what,/expected back 2026-11-12/);
 j=step(j,{type:'external-results',id:visc.id,receivedOn:'2026-11-10',notes:'Report CL-55',file:file('cl')},'NASSER');
 assert.equal(acts(j).find(a=>a.id===visc.id).status,'In Progress','uploading results does not approve or complete');
 assert.ok(view([j],'NASSER').actions.some(i=>i.action==='Submit Core Lab Muscat results for internal review'));
 assert.ok(!view([j],'SHEREIQI').actions.some(i=>i.key.startsWith('review:'+visc.id)),'no review before submission');
 j=step(j,{type:'external-submit',id:visc.id,notes:''},'NASSER');
 const lead=view([j],'SHEREIQI');assert.ok(lead.actions.some(i=>i.action.startsWith('Review external results v1')));assert.ok(lead.alerts.some(a=>a.kind==='external'&&a.headline==='External results submitted for review'));
 j=step(j,{type:'lead-review',id:visc.id,decision:'approve',target:'',comments:''},'SHEREIQI');assert.equal(acts(j).find(a=>a.id===visc.id).status,'Awaiting QC');
 j=step(j,{type:'qc-review',id:visc.id,decision:'approve',target:'',comments:''},'AHAD');assert.equal(acts(j).find(a=>a.id===visc.id).status,'Completed');
 assert.deepEqual(acts(j).find(a=>a.id===visc.id).history.map(h=>h.action),['assigned','dispatched','results-received','submitted','lead-approved','qc-approved']);
});

test('several or all tests outsourced; a third-party test needs a provider and an internal team coordinator',()=>{
 const ext={by:'Third-party',provider:'Intertek',notes:'',expectedReturn:'2026-11-20'};
 const all=[e('1.01',{fluidType:'Black Oil',destination:'Both',pvtTests:['Black Oil — DL'],chemicalTests:['Others — Water Analysis'],execution:{'Black Oil — DL':ext,'Others — Water Analysis':ext}}),e('1.02',{fluidType:'Gas Condensate',pvtTests:['Gas Condensates (GC) — CCE'],execution:{'Gas Condensates (GC) — CCE':ext}}),e('1.03',{excluded:true,exclusionReason:'x'})];
 assert.ok(labScopeProblems(approved(),[{...all[0],execution:{'Black Oil — DL':{...ext,provider:''}}},...all.slice(1)],conditions,routing,roles).some(p=>/enter the provider/.test(p)));
 assert.ok(!labScopeProblems(approved(),[{...all[0],execution:{'Black Oil — DL':{...ext,coordinator:'YAQEEN'}}},...all.slice(1)],conditions,routing,roles,undefined,actor('SALIM')).some(p=>/internal coordinator/.test(p)),'any active employee can coordinate third-party work');
 assert.ok(labScopeProblems(approved(),[{...all[0],execution:{'Black Oil — DL':{...ext,coordinator:'NOBODY'}}},...all.slice(1)],conditions,routing,roles,undefined,actor('SALIM')).some(p=>/internal coordinator/.test(p)),'an unknown coordinator is refused');
 let j=release(approved(),all);assert.ok(acts(j).every(a=>a.external?.provider==='Intertek'&&!a.owner));
 assert.ok(view([j],'SHEREIQI').actions.some(i=>i.key.startsWith('coord:')&&i.stream==='PVT'),'the team lead gets a coordinator-assignment task');
 j=assign(j,acts(j).find(a=>a.stream==='Chemical'),'YAQEEN');assert.equal(externalStage(acts(j).find(a=>a.stream==='Chemical')),'Awaiting dispatch');
});

test('the Validation alert changes from "choose the steps" to planned once Ahmed saves the steps, and stays while steps are unassigned',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',validation:true}),e('1.02',{excluded:true,exclusionReason:'x'}),e('1.03',{excluded:true,exclusionReason:'x'})]);
 const key=view([j],'SHEREIQI').alerts.find(a=>a.headline.startsWith('Validation requested')).key;
 j=step(j,{type:'validation-plan',scopeId:unplannedValidation(j)[0].id,steps:[{title:'Flash'},{title:'PV'}]},'SHEREIQI');
 const al=view([j],'SHEREIQI').alerts.find(a=>a.key===key);
 assert.equal(al.headline,'Validation steps planned');assert.equal(al.scope,'Validation: Flash, PV');assert.equal(al.button,'Assign 2');
});

test('Validation on a Chemical-only sample: no team change needed, PVT planning added, Chemical scope and assignments kept',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Gas Condensate',destination:'Chemical',chemicalTests:['Others — Water Analysis']}),e('1.02',{excluded:true,exclusionReason:'x'}),e('1.03',{excluded:true,exclusionReason:'x'})]);
 const water=acts(j)[0];j=assign(j,water,'YAQEEN');
 const v1=operationsFor(j).labScopes.at(-1);const rev=v1.samples.map(x=>x.sampleId==='1.01'?{...x,validation:true}:x);
 assert.deepEqual(labScopeProblems(j,rev,conditions,routing,roles,v1),[],'no destination change is required');
 j=release(j,rev,'Client asked for Validation');
 const req=unplannedValidation(j);assert.equal(req.length,1);assert.equal(req[0].stream,'PVT');assert.equal(req[0].sampleIds[0],'1.01');
 assert.equal(operationsFor(j).labScopes.at(-1).samples[0].destination,'Chemical','the sample team is not rewritten');
 const w=acts(j).find(a=>a.id===water.id);assert.equal(w.owner,'YAQEEN');assert.equal(w.stream,'Chemical');
 assert.ok(view([j],'SHEREIQI').actions.some(i=>i.key.startsWith('plan-validation:')),'planning routed to the PVT Team Lead');
 assert.ok(!view([j],'BAHRI').actions.some(i=>i.key.startsWith('plan-validation:')));
 j=step(j,{type:'validation-plan',scopeId:req[0].id,steps:[{title:'Opening Pressure'}]},'SHEREIQI');
 assert.equal(acts(j).find(a=>a.title==='Opening Pressure').stream,'PVT');
});

test('outsourced work without a coordinator: draft allowed, team-lead task and blocker after release, dispatch needs a coordinator, never untracked',()=>{
 const ext={by:'Third-party',provider:'Intertek',notes:'',expectedReturn:'2026-11-20',coordinator:''};
 const samples=[e('1.01',{fluidType:'Black Oil',destination:'Both',pvtTests:['Black Oil — DL'],chemicalTests:['Others — Water Analysis'],execution:{'Others — Water Analysis':ext}}),e('1.02',{excluded:true,exclusionReason:'x'}),e('1.03',{excluded:true,exclusionReason:'x'})];
 let j=step(approved(),{type:'lab-scope',action:'save',reason:'',conditions,samples},'SALIM');
 assert.equal(operationsFor(j).labScopes[0].status,'Draft','a draft keeps the coordinator unassigned');
 j=release(j,samples);const w=acts(j).find(a=>a.external);
 assert.equal(w.owner,'');assert.equal(externalStage(w),'Awaiting coordinator');
 const lead=view([j],'BAHRI');const task=lead.actions.find(i=>i.key.startsWith('coord:'));
 assert.ok(task,'the Chemical Team Lead gets an assignment task');assert.match(task.action,/Assign an internal coordinator · 1 outsourced Chemistry test \(Intertek\)/);
 assert.ok(!lead.actions.some(i=>i.key.startsWith('assign:')&&i.stream==='Chemical'),'not hidden inside the generic assignment count');
 assert.throws(()=>step(j,{type:'external-dispatch',id:w.id,sentOn:'2026-11-02',expectedReturn:'',notes:''},'BAHRI'),/Assign an internal coordinator first/);
 assert.ok(view([j],'MA001',{roles:{...roles,chemicalTeamLead:''}}).blocked.some(b=>b.setting==='chemicalTeamLead'),'no lead configured: an administrator blocker');
 j=assign(j,w,'YAQEEN');assert.ok(!view([j],'BAHRI').actions.some(i=>i.key.startsWith('coord:')),'resolved once assigned');
 assert.ok(view([j],'YAQEEN').actions.some(i=>/Dispatch to Intertek/.test(i.action)));
 j=step(j,{type:'external-dispatch',id:w.id,sentOn:'2026-11-02',expectedReturn:'',notes:''},'YAQEEN');assert.equal(externalStage(acts(j).find(a=>a.id===w.id)),'Sent to third party · Awaiting results');
});

test('Water, Chemistry, STO, OBM (and older Chemical) are saved as fluid types and custom fluids keep their description',()=>{
 for(const fluidType of ['Water','Chemistry','STO','Chemical','OBM','Other']){
  const j=release(approved(),[e('1.01',{fluidType,fluidDescription:fluidType==='Other'?'Custom brine':'',destination:'Chemical',chemicalTests:['Others — Water Analysis']}),e('1.02',{excluded:true,exclusionReason:'n/a'}),e('1.03',{excluded:true,exclusionReason:'n/a'})]);
  assert.equal(operationsFor(j).labScopes.at(-1).samples[0].fluidType,fluidType);
 }
});
test('multiple additional requests route independently; Both creates work for both team leads',()=>{
 let j=approved();
 const requests=[{title:'Extra analysis',reason:'Check water',destination:'Chemical'},{title:'Extra analysis',reason:'Check fluid',destination:'PVT'},{title:'Joint analysis',reason:'Both teams required',destination:'Both'}];
 j=step(j,{type:'request-addition',title:'',reason:'',requests},'SALIM');
 const additions=operationsFor(j).additions;
 assert.equal(additions.length,3);assert.equal(new Set(additions.map(a=>a.id)).size,3);
 assert.deepEqual(additions.map(a=>a.destination),['Chemical','PVT','Both']);
 const confirm=(job,a,streams)=>step(job,{type:'scope',additionId:a.id,items:streams.map(stream=>({title:a.title,stream,sampleIds:['1.01']})),conditions,reason:'Confirmed client request'},'SALIM');
 assert.throws(()=>confirm(j,additions[0],['PVT']),/requested teams/);
 assert.throws(()=>confirm(j,additions[2],['PVT']),/requested teams/);
 j=confirm(j,additions[0],['Chemical']);
 assert.ok(view([j],'BAHRI').actions.some(a=>a.key.startsWith('assign:')&&a.stream==='Chemical'));
 assert.ok(!view([j],'SHEREIQI').actions.some(a=>a.key.startsWith('assign:')));
 j=confirm(j,additions[1],['PVT']);j=confirm(j,additions[2],['PVT','Chemical']);
 assert.equal(acts(j).length,4);assert.equal(new Set(acts(j).map(a=>a.id)).size,4);
 assert.deepEqual(acts(j).filter(a=>a.title==='Joint analysis').map(a=>a.stream),['PVT','Chemical']);
 for(const [lead,stream] of [['SHEREIQI','PVT'],['BAHRI','Chemical']])assert.ok(view([j],lead).actions.some(a=>a.key.startsWith('assign:')&&a.stream===stream));
 assert.ok(operationsFor(j).additions.every(a=>a.confirmedAt));
 assert.throws(()=>confirm(j,additions[2],['PVT','Chemical']),/already confirmed/);
 const before=JSON.stringify(operationsFor(j));
 assert.throws(()=>step(j,{type:'request-addition',title:'',reason:'',requests:[requests[0],{title:'',reason:'Missing title',destination:'PVT'}]},'SALIM'),/Requested work/);
 assert.equal(JSON.stringify(operationsFor(j)),before,'invalid batch leaves all stored work unchanged');
});

test('team leads assign themselves and Validation steps to different engineers without team membership changes',()=>{
 let j=release(approved(),[e('1.01',{fluidType:'Black Oil',validation:true,pvtTests:['Black Oil — DL']}),e('1.02',{fluidType:'Water',destination:'Chemical',chemicalTests:['Others — Water Analysis']}),e('1.03',{excluded:true,exclusionReason:'n/a'})]);
 const scopeId=unplannedValidation(j)[0].id;
 j=step(j,{type:'validation-plan',scopeId,steps:[{title:'Opening Pressure'},{title:'Flash'},{title:'PV'}]},'SHEREIQI');
 const targets={'Opening Pressure':'NASSER',Flash:'RANJITH',PV:'SHEREIQI'};
 for(const a of acts(j).filter(a=>a.kind==='validation'))j=assign(j,a,targets[a.title]);
 j=assign(j,acts(j).find(a=>a.title==='Black Oil — DL'),'SHEREIQI');
 j=assign(j,acts(j).find(a=>a.stream==='Chemical'),'BAHRI');
 assert.deepEqual(acts(j).filter(a=>a.kind==='validation').map(a=>a.owner),['NASSER','RANJITH','SHEREIQI']);
 assert.equal(acts(j).find(a=>a.stream==='Chemical').owner,'BAHRI');
 assert.ok(view([j],'SHEREIQI').actions.some(a=>a.open.tab.includes('activity=')));
 const chemical=acts(j).find(a=>a.stream==='Chemical');
 assert.equal(step(j,{type:'schedule',id:chemical.id,owner:'SHEREIQI',start:'2026-11-02',due:'2026-11-06',conditions:'',notes:''},'BAHRI').operations.activities.find(a=>a.id===chemical.id).owner,'SHEREIQI','the Chemical lead can assign a PVT engineer');
 assert.throws(()=>step(j,{type:'schedule',id:chemical.id,owner:'NASSER',start:'2026-11-02',due:'2026-11-06',conditions:'',notes:''},'SHEREIQI'),/not assigned/,'only the responsible lead assigns');
 assert.deepEqual(teams,{PVT:['NASSER','RANJITH'],Chemical:['YAQEEN']});
});

test('Validation release allows missing reservoir conditions and only Restoration planning requires them',()=>{
 const samples=[e('1.01',{fluidType:'Black Oil',validation:true}),e('1.02',{excluded:true,exclusionReason:'n/a'}),e('1.03',{excluded:true,exclusionReason:'n/a'})];
 const j=step(approved(),{type:'lab-scope',action:'release',reason:'',conditions:{...conditions,pressure:'',temperature:''},samples},'SALIM');
 const scopeId=unplannedValidation(j)[0].id;
 const plan={type:'validation-plan',scopeId,steps:[{title:'Restoration'}]};
 assert.throws(()=>step(j,plan,'SHEREIQI'),/reservoir pressure and temperature/);
 assert.ok(acts(step(j,{...plan,steps:[{title:'Flash'}]},'SHEREIQI')).some(a=>a.title==='Flash'));
 const planned=step(j,{...plan,restoration:conditions},'SHEREIQI');
 assert.equal(acts(planned).find(a=>a.title==='Restoration').conditions,'2100 psi; 88 °C');
 assert.equal(operationsFor(planned).conditions.pressure,'2100','values entered for Restoration become the job conditions shown in Job Details');
 assert.equal(operationsFor(planned).labScopes.at(-1).conditions.pressure,'','the released scope version is not rewritten');
});
