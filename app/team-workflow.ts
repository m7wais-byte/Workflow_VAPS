import type { JobRecord } from './page';
import { labComplete, labRequested } from './lab-work';
import { seedPeople, loadDirectory } from './employee-directory';
import { readAuthorization, authorizationKey, allowed } from './authorization';
export const people = seedPeople.filter(p=>p[0]!=='MA001');
export function workflowPeople() {
 if(typeof window==='undefined') return people;
 try { const d=loadDirectory(); return d.employees.map(e=>[e.id,e.name,e.role,e.active?'active':'inactive']); } catch { return []; }
}
export function eligibleForTeam(id:string,team:string) {
 if(typeof window==='undefined') return people.some(p=>p[0]===id&&p[2]===team);
 try { const d=loadDirectory(); const e=d.employees.find(e=>e.id===id&&e.active); if(!e)return false; const policy=readAuthorization(localStorage.getItem(authorizationKey),d.employees.map(e=>e.id)); const permission=team==='analysis'?'analysis':team==='coordination'?'createJob':'sampling'; return allowed(policy,id,permission) && (e.role===team || !e.password); } catch {return false;}
}
export type Task = {owner?:string;acceptedAt?:string;completedAt?:string};
export type TeamWork = Record<string,Task>;
export const coordinator=(id?:string)=>!!id && eligibleForTeam(id,'coordination');
export const route=(job:JobRecord)=>job.samplingRequired===false?['transport','analysis']:['sampling','transport','analysis'];
export const activeTeam=(job:JobRecord)=>route(job).find(t=>!job.teamWork?.[t]?.completedAt);
export const canWork=(job:JobRecord,team:string,id?:string)=>activeTeam(job)===team && !!id && job.teamWork?.[team]?.owner===id;
export function handoff(job:JobRecord,team:string,id:string,action:string,at:string):JobRecord {
 if(activeTeam(job)!==team || !eligibleForTeam(id,team)) throw Error('This handoff is not available to you.');
 const old=job.teamWork?.[team]||{};
 if(action==='accept'&&old.owner) throw Error('A team member already accepted ownership.');
 if(action==='complete'&&old.owner!==id) throw Error('Only the accepted owner can complete this handoff.');
 if(action==='complete'&&team==='sampling'&&!job.stages.some(s=>s.name==='Sampling Data'&&s.status==='Completed')) throw Error('Complete sampling data before handing over to the driver.');
 if(action==='complete'&&team==='analysis'&&(!labRequested(job)||!labComplete(job))) throw Error('Complete all assigned lab work first.');
 return {...job,teamWork:{...job.teamWork,[team]:action==='accept'?{owner:id,acceptedAt:at}:{...old,completedAt:at}},...(team==='sampling'&&action==='accept'?{assignedEngineerId:id,responsibleId:id}:{}),...(team==='transport'&&action==='accept'?{assignedDriverId:id}:{}),lastUpdatedAt:at,lastUpdatedById:id};
}
