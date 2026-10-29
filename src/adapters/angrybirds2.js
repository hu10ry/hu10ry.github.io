const DATABASE_NAME = "/idbfs";
const DATABASE_VERSION = 21;
const STORE_NAME = "FILE_DATA";
const DATA_PATH = "d2012bf5c11dd39a1b759b4c429f9085";
const SAVE_PATHS = [
  `${DATA_PATH}/PlayerPrefs`,
  `${DATA_PATH}/save/CombinedPlayerData`,
  `${DATA_PATH}/save/OfferControllerActiveOffer`,
  `${DATA_PATH}/save/Session_ID`
];
const DIRECTORY_MODE = 16877;
const FILE_MODE = 33206;

export default {
  id: "angrybirds2",
  name: "Angry Birds 2",
  description: "Angry Birds 2 save data and player preferences",
  version: 1,

  async exportSave() {
    const db = await openSaveDatabase();
    try {
      const files = [];
      for (const path of SAVE_PATHS) {
        const entry = await readEntry(db, `/idbfs/${path}`);
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

  async importSave(files) {
    const filesToWrite = files.map((file) => {
      if (!SAVE_PATHS.includes(file.path)) {
        throw new Error(`Unknown Angry Birds 2 save path: ${file.path}`);
      }
      return { path: `/idbfs/${file.path}`, data: file.data };
    });

    const db = await openSaveDatabase();
    try {
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
        reject(new Error(`Angry Birds 2 IndexedDB store ${STORE_NAME} is missing.`));
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

    store.put({ timestamp, mode: DIRECTORY_MODE }, "/idbfs");
    store.put({ timestamp, mode: DIRECTORY_MODE }, `/idbfs/${DATA_PATH}`);
    store.put({ timestamp, mode: DIRECTORY_MODE }, `/idbfs/${DATA_PATH}/save`);
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
