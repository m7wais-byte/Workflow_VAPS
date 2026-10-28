// Files stay in this browser's IndexedDB; job records contain immutable file references.
const database='vaps-workbooks-v1';
function openStore():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Workbook storage is unavailable. No submission was recorded.'));});}
export async function storeWorkbook(file:File){
 if(!/\.(xlsx?|xlsm|csv|pdf|docx?|ods)$/i.test(file.name)||file.size===0||file.size>20*1024*1024)throw Error('Choose a non-empty Excel, CSV, PDF, Word or ODS workbook up to 20 MB.');
 const db=await openStore();const id=crypto.randomUUID();
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').add(file,id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('File could not be stored. Check browser storage space and retry.'));tx.onabort=()=>reject(Error('File storage was interrupted.'));});db.close();
 return {id,name:file.name,size:file.size,type:file.type};
}
export async function downloadWorkbook(id:string,name:string){const db=await openStore();const file=await new Promise<Blob>((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get(id);r.onsuccess=()=>r.result?resolve(r.result):reject(Error('This file is not available in this browser. Ask the submitter for the original; its metadata has been retained.'));r.onerror=()=>reject(Error('Could not read the stored file.'));});db.close();const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
