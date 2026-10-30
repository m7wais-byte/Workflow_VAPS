import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { buildInboxJobs, inboxRoles, inboxTeams, inboxRouting } from './fixtures/inbox-jobs.mjs';
const bundle=async entry=>{const out=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};
const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}};globalThis.localStorage=window.localStorage;
const {applyOperation,trashJob,restoreJob,isTrashed}=await bundle('app/operations-model.ts');
const {workItems,inboxRows}=await bundle('app/work-items.ts');
const {defaultAuthorization,defaultResponsibilities,readAuthorization,allowed}=await bundle('app/authorization.ts');
const {initialDirectory}=await bundle('app/employee-directory.ts');
const {addDays}=await bundle('app/local-date.ts');
const {nextJobSequence}=await bundle('app/job-numbering.ts');
const {getShare,pauseShare,resumeShare}=await bundle('app/job-sharing.ts');

const employees=initialDirectory().employees,ids=employees.map(e=>e.id),policy=defaultAuthorization(ids),roles=inboxRoles(defaultResponsibilities),today='2026-10-29';
const jobs=buildInboxJobs({applyOperation,employees,policy,roles,today,addDays});
const actor=(id,p=policy)=>({id,employees,policy:p,roles,teams:inboxTeams,routing:inboxRouting});
const at='2026-10-30T08:00:00.000Z',later='2026-10-30T09:30:00.000Z';
const find=n=>jobs.find(j=>j.jobNumber==='OM-P-26-'+n);
// The page shows only jobs that are not in Trash; this mirrors that filter.
const rows=(list,id)=>{const active=list.filter(j=>!isTrashed(j)),a=actor(id);return inboxRows(workItems(active,a,today),active,a,today,{isNew:()=>false,isClosed:()=>false,stage:()=>'Stage'});};

test('Delete jobs is configurable and enabled only for the administrator by default',()=>{
 assert.deepEqual(policy.deleteJobs,['MA001']);
 for(const id of ids.filter(i=>i!=='MA001'))assert.equal(allowed(policy,id,'deleteJobs'),false,id);
 const saved={...policy};delete saved.deleteJobs;
 const migrated=readAuthorization(JSON.stringify(saved),ids);
 assert.deepEqual(migrated.deleteJobs,['MA001'],'missing setting receives the default');
 for(const key of Object.keys(saved))assert.deepEqual(migrated[key],saved[key],key+' unchanged');
 assert.deepEqual(readAuthorization(JSON.stringify({...policy,deleteJobs:[]}),ids).deleteJobs,[],'a saved empty selection stays empty');
 assert.deepEqual(readAuthorization(JSON.stringify({...policy,deleteJobs:['SALIM']}),ids).deleteJobs,['SALIM']);
});

test('unauthorized deletion and restoration are refused in the action itself',()=>{
 for(const id of ['SALIM','NASSER','SHEREIQI','WILFRED'])assert.throws(()=>trashJob(find(105),actor(id),at),/permission to delete/,id);
 const binned=trashJob(find(105),actor('MA001'),at);
 assert.throws(()=>restoreJob(binned,actor('SALIM'),later),/permission to restore/);
 const granted={...policy,deleteJobs:['SALIM']};
 assert.equal(trashJob(find(105),actor('SALIM',granted),at).trash.deletedBy,'SALIM','a granted employee may delete');
 const inactive=employees.map(e=>e.id==='SALIM'?{...e,active:false}:e);
 assert.throws(()=>trashJob(find(105),{...actor('SALIM',granted),employees:inactive},at),'inactive employees cannot use the permission');
});

test('a deleted job leaves every queue and count, and cannot be changed until restored',()=>{
 const before={salim:rows(jobs,'SALIM'),nasser:rows(jobs,'NASSER'),mohsin:rows(jobs,'MOHSIN')};
 const list=jobs.map(j=>['OM-P-26-105','OM-P-26-116'].includes(j.jobNumber)?trashJob(j,actor('MA001'),at):j);
 const after={salim:rows(list,'SALIM'),nasser:rows(list,'NASSER'),mohsin:rows(list,'MOHSIN')};
 assert.ok(!after.salim.some(r=>r.jobNumber==='OM-P-26-105'));assert.equal(after.salim.filter(r=>r.state==='action').length,before.salim.filter(r=>r.state==='action').length-1);
 assert.ok(!after.mohsin.some(r=>r.jobNumber==='OM-P-26-105'),'waiting item gone too');
 assert.ok(!after.nasser.some(r=>r.jobNumber==='OM-P-26-116'));assert.equal(after.nasser.length,before.nasser.length-1);
 assert.throws(()=>applyOperation(list.find(j=>j.jobNumber==='OM-P-26-105'),{type:'data-approve'},actor('SALIM'),later),/in Trash/);
 assert.throws(()=>trashJob(list.find(j=>j.jobNumber==='OM-P-26-105'),actor('MA001'),later),/already in Trash/);
 assert.equal(nextJobSequence(0,list,'26'),nextJobSequence(0,jobs,'26'),'deleting non-trailing jobs leaves the highest active sequence unchanged');
});

test('restoration brings back the identical record and logs who did what and when',()=>{
 const original=find(119);
 const binned=trashJob(original,actor('MA001'),at);
 assert.deepEqual(binned.trash,{deletedBy:'MA001',deletedAt:at});
 const restored=restoreJob(binned,actor('MA001'),later);
 assert.equal(isTrashed(restored),false);
 const {trashLog,...rest}=restored;
 assert.deepEqual(rest,original,'samples, workbooks, reports, signatures and history unchanged');
 assert.deepEqual(trashLog,[{action:'deleted',by:'MA001',at},{action:'restored',by:'MA001',at:later}]);
 assert.ok(rows(jobs.map(j=>j.id===original.id?restored:j),'NASSER').some(r=>r.jobNumber==='OM-P-26-119'),'back in the queue');
 assert.throws(()=>restoreJob(restored,actor('MA001'),later),/not in Trash/);
});

test('drafts in Trash stay limited to people who may see the draft',()=>{
 const draft=find(101);assert.equal(draft.status,'Draft');
 const granted={...policy,deleteJobs:['MA001','NASSER']};
 assert.throws(()=>trashJob(draft,actor('NASSER',granted),at),/permission/,'a draft the employee cannot see cannot be deleted by them');
 assert.equal(trashJob(draft,actor('MA001'),at).trash.deletedBy,'MA001');
});

test('Delete and restore jobs follows the saved setting for the administrator too',()=>{
 assert.equal(allowed(policy,'MA001','deleteJobs'),true,'enabled for MA001 by default');
 const removed=readAuthorization(JSON.stringify({...policy,deleteJobs:[]}),ids);
 assert.equal(allowed(removed,'MA001','deleteJobs'),false,'an explicit saved removal is not overridden');
 assert.throws(()=>trashJob(find(105),actor('MA001',removed),at),/permission to delete/);
 assert.throws(()=>restoreJob(trashJob(find(105),actor('MA001'),at),actor('MA001',removed),later),/permission to restore/);
 assert.equal(allowed(removed,'MA001','settings'),true,'other administrator permissions stay automatic');
 assert.equal(allowed(removed,'MA001','companyOverview'),true);
});

test('restoring reactivates a shared link only if it was active before deletion',async()=>{
 const calls=[];globalThis.fetch=async(url,init)=>{calls.push([init.method,url,JSON.parse(init.body||'null')?.revision]);return new Response(JSON.stringify(init.method==='PUT'?{revision:1}:{stopped:true}),{status:200});};
 const links=k=>JSON.parse(localStorage.getItem('vaps-job-summary-links-v1')||'{}')[k];
 const put=(jobId,record)=>{const all=JSON.parse(localStorage.getItem('vaps-job-summary-links-v1')||'{}');all[jobId]=record;localStorage.setItem('vaps-job-summary-links-v1',JSON.stringify(all));};
 const active=find(113),inactive=find(114),none=find(115);
 const id='11111111-1111-4111-8111-111111111111',key='a'.repeat(64);
 put(active.id,{id,key,revision:3,audience:'link',enabled:true,fingerprint:'x'});
 put(inactive.id,{id:'22222222-2222-4222-8222-222222222222',key:'b'.repeat(64),revision:0,audience:'signed-in',enabled:false});
 // Delete: only the active link is withdrawn, keeping its address.
 for(const job of [active,inactive,none])await pauseShare(job.id);
 assert.deepEqual(calls,[['DELETE','/api/job-summary/'+id,undefined]]);
 assert.deepEqual({...links(active.id),fingerprint:links(active.id).fingerprint},{id,key,revision:0,audience:'link',enabled:false,fingerprint:undefined,paused:true});
 assert.equal(links(inactive.id).paused,undefined);assert.equal(links(none.id),undefined);
 // Restore: only the paused link is republished, to the same id and key.
 calls.length=0;
 for(const job of [active,inactive,none])await resumeShare(job);
 assert.deepEqual(calls,[['PUT','/api/job-summary/'+id,0]]);
 assert.equal(getShare(active.id).enabled,true);assert.equal(getShare(active.id).id,id);assert.equal(getShare(active.id).key,key);assert.equal(getShare(active.id).paused,false);
 assert.equal(getShare(inactive.id).enabled,false,'a previously inactive link stays inactive');assert.equal(getShare(none.id),undefined,'no link is created');
 // Restoring again does not republish.
 calls.length=0;await resumeShare(active);assert.equal(calls.length,0);
});

test('a link that cannot be paused keeps the job out of Trash (pause error surfaces)',async()=>{
 globalThis.fetch=async()=>new Response('{}',{status:503});
 const all=JSON.parse(localStorage.getItem('vaps-job-summary-links-v1')||'{}');all[find(117).id]={id:'33333333-3333-4333-8333-333333333333',key:'c'.repeat(64),revision:2,audience:'link',enabled:true};localStorage.setItem('vaps-job-summary-links-v1',JSON.stringify(all));
 await assert.rejects(()=>pauseShare(find(117).id),/could not be paused/);
 assert.equal(getShare(find(117).id).enabled,true,'the link stays active');
});
