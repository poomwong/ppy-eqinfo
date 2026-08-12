// Persists the File System Access API's FileSystemFileHandle across page
// loads via IndexedDB (handles can't be stored in localStorage/cookies -
// they're not serializable to a string), so the .sqlite file only needs to
// be picked once instead of every session.

const HANDLE_DB_NAME = "eqinfo-app";
const HANDLE_STORE_NAME = "handles";
const HANDLE_KEY = "sqlite-file-handle";

function openHandleStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HANDLE_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle) {
  const db = await openHandleStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
    tx.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle() {
  const db = await openHandleStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
    const req = tx.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

window.HandleStore = { saveHandle, loadHandle };
