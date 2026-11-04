import { readAuthorization, authorizationKey, allowed, type Permission } from './authorization';
import { loadDirectory } from './employee-directory';

// Files stay in this browser's IndexedDB; job records contain immutable file references.
//
// Access: there is no server or authenticated file service in either edition (GitHub Pages is static; the Sites
// edition's only API is the job-summary route, which never serves files). Workbook bytes are therefore released only
// through this module, which checks the signed-in profile against the saved View workbook / Download workbook
// permissions at the moment of reading. No file URL exists until that check passes, and the temporary blob URL is
// revoked shortly after. This is a browser-side gate, not server-side security: someone with full control of this
// browser (developer tools) can still read its own storage.
const database='vaps-workbooks-v1';
const sessionKey='vaps-demo-session-v1';
export type WorkbookAccess='view'|'download';
const permissionFor:Record<WorkbookAccess,Permission>={view:'viewWorkbook',download:'downloadWorkbook'};
function openStore():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Workbook storage is unavailable. No submission was recorded.'));});}

/** Whether the signed-in profile may view or download workbooks, read from saved settings (never from the caller). */
export function canAccessWorkbook(kind:WorkbookAccess):boolean{
 if(typeof window==='undefined'||!window.localStorage||!window.sessionStorage)return false;
 try{
  const id=window.sessionStorage.getItem(sessionKey);const employees=loadDirectory().employees;
  if(!id||!employees.some(e=>e.id===id&&e.active))return false;
  const policy=readAuthorization(window.localStorage.getItem(authorizationKey),employees.map(e=>e.id));
  return allowed(policy,id,permissionFor[kind]);
 }catch{return false;}
}
export const workbookDenied=(kind:WorkbookAccess)=>kind==='view'?'You do not have the View workbook permission. Ask an administrator in Settings → Authorization.':'You do not have the Download workbook permission. Ask an administrator in Settings → Authorization.';

export async function storeWorkbook(file:File){
 if(!/\.(xlsx?|xlsm|csv|pdf|docx?|ods)$/i.test(file.name)||file.size===0||file.size>20*1024*1024)throw Error('Choose a non-empty Excel, CSV, PDF, Word or ODS workbook up to 20 MB.');
 const db=await openStore();const id=crypto.randomUUID();
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').add(file,id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('File could not be stored. Check browser storage space and retry.'));tx.onabort=()=>reject(Error('File storage was interrupted.'));});db.close();
 return {id,name:file.name,size:file.size,type:file.type};
}
/** The stored bytes, only after the permission check. Final report documents are read with `restricted: false`. */
async function readFile(id:string,kind:WorkbookAccess,restricted:boolean):Promise<Blob>{
 if(restricted&&!canAccessWorkbook(kind))throw Error(workbookDenied(kind));
 const db=await openStore();const file=await new Promise<Blob>((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get(id);r.onsuccess=()=>r.result?resolve(r.result):reject(Error('This file is not available in this browser. Ask the submitter for the original; its metadata has been retained.'));r.onerror=()=>reject(Error('Could not read the stored file.'));});db.close();
 return file;
}
export async function downloadWorkbook(id:string,name:string,restricted=true){const file=await readFile(id,'download',restricted);const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
/** Opens the file in a new tab (PDF and CSV preview in the browser; other formats download). */
export async function openWorkbook(id:string,restricted=true){if(restricted&&!canAccessWorkbook('view'))throw Error(workbookDenied('view'));const tab=window.open('','_blank');try{const file=await readFile(id,'view',restricted);const url=URL.createObjectURL(file);if(tab)tab.location.href=url;else window.location.assign(url);setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){tab?.close();throw e;}}
