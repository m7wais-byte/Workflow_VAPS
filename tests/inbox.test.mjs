import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { buildInboxJobs, inboxRoles, inboxTeams, inboxRouting } from './fixtures/inbox-jobs.mjs';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}};globalThis.localStorage=window.localStorage;
const {applyOperation}=await bundle('app/operations-model.ts');
const {workItems,inboxRows,rowSearchText}=await bundle('app/work-items.ts');
const {defaultAuthorization,defaultResponsibilities,readAuthorization,allowed}=await bundle('app/authorization.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');
const {addDays}=await bundle('app/local-date.ts');

const employees=initialDirectory().employees,ids=employees.map(e=>e.id),policy=defaultAuthorization(ids),roles=inboxRoles(defaultResponsibilities),today='2026-10-29';
const jobs=buildInboxJobs({applyOperation,employees,policy,roles,today,addDays});
const actor=id=>({id,employees,policy,roles,teams:inboxTeams,routing:inboxRouting});
const view=id=>{const a=actor(id),w=workItems(jobs,a,today);return {w,rows:inboxRows(w,jobs,a,today,{isNew:()=>false,isClosed:()=>false,stage:()=>'Stage'})};};
const row=(rows,n)=>rows.find(r=>r.jobNumber==='OM-P-26-'+n);
const count=rows=>({action:rows.filter(r=>r.state==='action').length,waiting:rows.filter(r=>r.state==='waiting'||r.state==='blocked').length,all:rows.length});

test('the fixture holds at least 25 jobs reached through the real workflow commands',()=>{assert.ok(jobs.length>=25);});

test('every employee sees one row per job, never the same job twice',()=>{
 for(const id of ['SALIM','NASSER','SHEREIQI','BAHRI','MOHSIN','HUSSEINI','ALI','WILFRED','MA001']){const {rows}=view(id);assert.equal(new Set(rows.map(r=>r.jobId)).size,rows.length,id);}
});

test('Salim sees his sequential coordination actions and waits on work he returned or dispatched',()=>{
 const {rows}=view('SALIM');
 assert.ok(rows.every(r=>r.actions.length<=1),'one available action per job for the coordinator');
 assert.equal(row(rows,104).actions[0].action,'Review sampling data');assert.equal(row(rows,104).overdue,true);
 assert.equal(row(rows,107).actions[0].action,'Review sampling report');
 assert.equal(row(rows,109).actions[0].action,'Define and release laboratory scope');
 assert.match(row(rows,111).actions[0].action,/additional-work/);
 assert.equal(row(rows,101).actions[0].button,'Continue draft');
 const returned=row(rows,106);assert.equal(returned.state,'waiting');assert.equal(returned.returned,false,'work Salim returned is not counted as returned to him');
 assert.equal(returned.waiting[0].label,'Waiting for Mohsin Al Dhuhli to correct sampling data');assert.match(returned.waiting[0].comment,/Wellhead temperature/);
 assert.equal(row(rows,108).waiting[0].label,'Waiting for Mohsin Al Dhuhli to correct the sampling report');
 assert.equal(row(rows,102).waiting[0].label,'Waiting for Mohsin Al Dhuhli to complete sampling');
 assert.equal(rows.filter(r=>r.returned).length,0);
 assert.ok(!rows.some(r=>r.actions.some(i=>/workbook|test/i.test(i.action))),'no laboratory test actions for the coordinator');
 assert.deepEqual(count(rows),{action:8,waiting:4,all:jobs.length});
});

test('Nasser sees only his own tests, with identifiers, several actions in one row, waiting and blocked work',()=>{
 const {rows}=view('NASSER');
 assert.ok(!rows.some(r=>r.actions.some(i=>/scope|draft|sampling|approve|assign/i.test(i.action))));
 assert.ok(!rows.some(r=>['OM-P-26-101','OM-P-26-127'].includes(r.jobNumber)),'drafts stay with their creator');
 assert.ok(!row(rows,120),'jobs whose tests belong to others are not his');
 assert.equal(rows[0].returned,true,'returned work first');
 const multi=row(rows,116);assert.equal(multi.actions.length,3);assert.deepEqual(multi.actions.map(i=>[i.test,i.sample]),[['Black Oil — DL','1.01'],['Black Oil — DL','1.02'],['Black Oil — Sep Test','1.01']]);assert.equal(multi.overdue,true);
 const mixed=row(rows,119);assert.equal(mixed.actions[0].kind,'returned');assert.equal(mixed.actions[0].sample,'1.01');assert.match(mixed.actions[0].comment,/base temperature/);assert.equal(mixed.actions[1].sample,'1.02');
 const blocked=row(rows,118);assert.equal(blocked.state,'blocked');assert.equal(blocked.waiting[0].blocked,'qcReviewer');assert.ok(blocked.blocked.some(b=>b.setting==='qcReviewer'));
 const waiting=row(rows,117);assert.equal(waiting.state,'waiting');assert.equal(waiting.waiting[0].waitingOn,'Ahmed Al Shereiqi (team lead)');assert.equal(waiting.waiting[0].test,'Black Oil — DL');
 assert.equal(row(rows,113).actions[0].comment,'Use the 700 cc transfer cylinder.');
 assert.deepEqual(count(rows),{action:11,waiting:2,all:13});
 assert.ok(rows.length>10,'more than one page');
});

test('future steps never appear as actions',()=>{
 assert.ok(!row(view('ALI').rows,107)?.actions.length,'no handover before the sampling report is approved');
 assert.equal(row(view('ALI').rows,109).actions[0].button,'Hand over samples');
 assert.ok(!row(view('SHEREIQI').rows,109)?.actions.length,'no receipt before the samples are sent');
 assert.equal(row(view('SHEREIQI').rows,110).actions[0].button,'Confirm receipt');
 assert.ok(!view('NASSER').rows.some(r=>r.jobNumber==='OM-P-26-112'),'no test work before assignment');
 assert.ok(!view('WILFRED').rows.some(r=>r.actions.length),'no final approval before a final report exists');
});

test('team leads wait on workbooks they returned; the support view stays personal',()=>{
 const {rows}=view('SHEREIQI');
 assert.equal(row(rows,115).waiting[0].label,'Waiting for Nasser Al Saqri to correct workbook');
 assert.equal(row(rows,117).actions[0].button,'Review workbook');
 const mohsin=view('MOHSIN').rows;assert.equal(row(mohsin,106).actions[0].kind,'returned');assert.equal(row(mohsin,105).state,'waiting');
});

test('the administrator gets no company-wide rows, only the list of missing settings',()=>{
 const {w,rows}=view('MA001');assert.equal(rows.length,0);assert.ok(w.blocked.some(b=>b.setting==='qcReviewer'));
});

test('search covers job, client, test and sample',()=>{
 const {rows}=view('NASSER');
 assert.ok(rowSearchText(row(rows,119)).includes('1.02'));assert.ok(rowSearchText(row(rows,116)).includes('black oil — sep test'));
 assert.equal(rows.filter(r=>rowSearchText(r).includes('heavy oil')).length,rows.filter(r=>r.client.includes('Heavy Oil')).length);
});

test('company overview has its own permission; defaults apply only when the setting is missing',()=>{
 assert.deepEqual(policy.companyOverview,['MA001','SALIM','WILFRED']);
 for(const id of ['NASSER','SHEREIQI','MOHSIN','ALI'])assert.equal(allowed(policy,id,'companyOverview'),false,id+' has job details but not company overview');
 const saved={...policy};delete saved.companyOverview;
 assert.deepEqual(readAuthorization(JSON.stringify(saved),ids).companyOverview,['MA001','SALIM','WILFRED'],'missing setting receives defaults');
 assert.deepEqual(readAuthorization(JSON.stringify({...policy,companyOverview:[]}),ids).companyOverview,[],'an explicitly empty selection stays empty');
 assert.deepEqual(readAuthorization(JSON.stringify({...policy,companyOverview:['NASSER']}),ids).companyOverview,['NASSER']);
 const page=fs.readFileSync('app/page.tsx','utf8');
 assert.match(page,/if \(view === "overview"\) return hasPermission\("companyOverview"\)/);
 assert.doesNotMatch(page,/Team and company overview|Needs Attention|cockpit-job-list/,'legacy dashboard sections are gone');
});
