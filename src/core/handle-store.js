const DB_NAME = "webports-save-manager";
const STORE_NAME = "settings";
const KEY = "directory-handle";

export class HandleStore {
  get available() { return typeof indexedDB !== "undefined"; }

  async save(handle) {
    const db = await openDb();
    await runTransaction(db, "readwrite", (store) => store.put(handle, KEY));
    db.close();
  }

  async load() {
    const db = await openDb();
    const value = await runTransaction(db, "readonly", (store) => store.get(KEY));
    db.close();
    return value || null;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open IndexedDB."));
  });
}

function runTransaction(db, mode, makeRequest) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = makeRequest(tx.objectStore(STORE_NAME));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}
