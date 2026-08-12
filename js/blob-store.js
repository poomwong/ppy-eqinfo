// Persists the sqlite database as a binary blob in IndexedDB, so earthquake
// data survives page reloads without needing a real file on disk. The app
// loads/saves this blob automatically on every change, with no file picker
// or user gesture required - works identically under file:// and http(s)
// hosting (e.g. GitHub Pages), unlike the File System Access API this
// replaced (which only worked in Chromium and needed a manual file pick).

const BLOB_DB_NAME = "eqinfo-blob-store";
const BLOB_STORE_NAME = "sqlite-blob";
const BLOB_KEY = "eqinfo-db";

function openBlobStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BLOB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(BLOB_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBlob(bytes) {
  const db = await openBlobStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE_NAME, "readwrite");
    tx.objectStore(BLOB_STORE_NAME).put(bytes, BLOB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadBlob() {
  const db = await openBlobStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE_NAME, "readonly");
    const req = tx.objectStore(BLOB_STORE_NAME).get(BLOB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

window.BlobStore = { saveBlob, loadBlob };
