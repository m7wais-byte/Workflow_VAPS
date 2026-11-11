import { baseNumber, draftRecords, groupKey, nextBase, stageNumbers, type RequestDraft, type RequestRecord } from './request-book';

// Request records stay in this browser's IndexedDB (the register grows past what localStorage can hold beside the
// jobs). Like the rest of the workspace there is no shared server yet, so another computer keeps its own register.
const databaseName = 'vaps-request-book', storeName = 'requests';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'no' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('The request book could not be opened in this browser.'));
  });
}
/** Runs `work` in one transaction; everything in it is saved together or not at all. */
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, done: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let result: T, failure: Error | undefined;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(failure || tx.error || Error('The request book could not be saved.'));
      work(tx.objectStore(storeName), (value) => { result = value; }, (error) => { failure = error; tx.abort(); });
    });
  } finally { db.close(); }
}

export const loadRequests = () => transaction<RequestRecord[]>('readonly', (store, done) => { const all = store.getAll(); all.onsuccess = () => done(all.result as RequestRecord[]); });

/**
 * Saves a new or edited request with all its stages. The request numbers are worked out inside the transaction from
 * the numbers stored at that moment, so two tabs can never be given the same number.
 */
export function saveRequest(draft: RequestDraft, savedBy: string, today: string): Promise<RequestRecord[]> {
  return transaction<RequestRecord[]>('readwrite', (store, done, fail) => {
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const numbers = (keys.result as string[]).map(String);
      const own = draft.group === undefined ? [] : numbers.filter((no) => groupKey(no) === draft.group);
      if (draft.group !== undefined && !own.length) return fail(Error('This request no longer exists. Another employee may have changed it; open it again from the list.'));
      const base = draft.group === undefined ? nextBase(numbers) : baseNumber(own[0]);
      if (base === null && draft.stages.length > 1) return fail(Error('Stages cannot be added to this historical request number. Create a new request for the extra stages.'));
      const assigned = stageNumbers(base ?? 0, draft.stages.map((stage) => stage.no));
      const taken = assigned.find((no) => !own.includes(no) && numbers.includes(no));
      if (taken) return fail(Error(`Request number ${taken} is already in use. Nothing was saved.`));
      const records = draftRecords(draft, assigned, savedBy, today);
      own.filter((no) => !assigned.includes(no)).forEach((no) => store.delete(no));
      records.forEach((record) => store.put(record));
      done(records);
    };
  });
}

/** Replaces one stored record (status buttons in Open items). */
export const putRequest = (record: RequestRecord) => transaction<RequestRecord>('readwrite', (store, done) => { store.put(record); done(record); });

/** Adds imported records. Request numbers already in the register are left untouched and counted as skipped. */
export function importRequests(records: RequestRecord[]): Promise<{ added: number; skipped: number }> {
  return transaction('readwrite', (store, done) => {
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const existing = new Set((keys.result as string[]).map(String));
      const fresh = records.filter((record) => !existing.has(record.no));
      fresh.forEach((record) => store.put(record));
      done({ added: fresh.length, skipped: records.length - fresh.length });
    };
  });
}
