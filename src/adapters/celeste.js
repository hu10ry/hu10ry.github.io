const DATABASE_NAME = "/libsdl";
const DATABASE_VERSION = 21;
const STORE_NAME = "FILE_DATA";
const SAVE_PATHS = ["Saves/0.celeste", "Saves/settings.celeste"];
const DIRECTORY_MODE = 16877;
const FILE_MODE = 33206;

export default {
  id: "celeste",
  name: "Celeste",
  legacyIds: ["celeste_config"],
  description: "Celeste save and config data",
  version: 1,

  async exportSave() {
    const db = await openSaveDatabase();
    try {
      const files = [];
      for (const path of SAVE_PATHS) {
        const entry = await readEntry(db, `/libsdl/Celeste/${path}`);
        if (entry?.contents != null) {
          files.push({
            path,
            data: new Uint8Array(entry.contents)
          });
        }
      }
      return files.length > 0 ? files : null;
    } finally {
      db.close();
    }
  },

  async importSave(files, { sourceAdapterId } = {}) {
    const db = await openSaveDatabase();
    try {
      const filesToWrite = files.map((file) => {
        const path = sourceAdapterId === "celeste_config"
          ? "Saves/settings.celeste"
          : file.path;
        if (!SAVE_PATHS.includes(path)) throw new Error(`Unknown Celeste save file: ${path}`);
        return { path: `/libsdl/Celeste/${path}`, data: file.data };
      });
      await writeSaveFiles(db, filesToWrite);
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

function writeSaveFiles(db, files) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const timestamp = new Date();

    store.put({ timestamp, mode: DIRECTORY_MODE }, "/libsdl/Celeste");
    store.put({ timestamp, mode: DIRECTORY_MODE }, "/libsdl/Celeste/Saves");
    for (const file of files) {
      store.put({
        timestamp,
        mode: FILE_MODE,
        contents: new Uint8Array(file.data)
      }, file.path);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
