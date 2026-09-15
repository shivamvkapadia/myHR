// Small IndexedDB blob store used by Demo mode for uploaded files.
const DB = "myhr-files";
const STORE = "blobs";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const idbPut = (key, blob) => tx("readwrite", (s) => s.put(blob, key));
export const idbGet = (key) => tx("readonly", (s) => s.get(key));
export const idbDel = (key) => tx("readwrite", (s) => s.delete(key));
export const idbClear = () => tx("readwrite", (s) => s.clear());
