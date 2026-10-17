const DATABASE_NAME = "/libsdl";
const DATABASE_VERSION = 21;
const STORE_NAME = "FILE_DATA";
const SAVE_PATH = "/libsdl/Celeste/Saves/settings.celeste";
const DIRECTORY_MODE = 16877;
const FILE_MODE = 33206;

export default {
  id: "celeste_config",
  name: "Celeste config",
  description: "Celeste config data",
  version: 1,
  fileName: "settings.celeste",

  async exportSave() {
    const db = await openSaveDatabase();
    try {
      const entry = await readEntry(db, SAVE_PATH);
      return entry?.contents ? new Uint8Array(entry.contents) : null;
    } finally {
      db.close();
    }
  },

  async importSave(bytes) {
    const db = await openSaveDatabase();
    try {
      await writeSave(db, bytes);
    } finally {
      db.close();
    }
  }
};

function openSaveDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME);
      if (!store.indexNames.contains("timestamp")) {
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.close();
        reject(new Error(`Celeste IndexedDB store ${STORE_NAME} is missing.`));
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

function readEntry(db, path) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(path);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function writeSave(db, bytes) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const timestamp = new Date();

    store.put({ timestamp, mode: DIRECTORY_MODE }, "/libsdl/Celeste");
    store.put({ timestamp, mode: DIRECTORY_MODE }, "/libsdl/Celeste/Saves");
    store.put({
      timestamp,
      mode: FILE_MODE,
      contents: new Uint8Array(bytes)
    }, SAVE_PATH);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
