const DATABASE_NAME = "/save";
const DATABASE_VERSION = 21;
const STORE_NAME = "FILE_DATA";
const SAVE_PATHS = [
  "card_a/DobutsunomoriP_MURA.gci",
  "card_b/DobutsunomoriP_MURA.gci"
];
const DIRECTORY_MODE = 16877;
const FILE_MODE = 33206;

export default {
  id: "ac-gamecube",
  legacyIds: ["ac-gamecube-a", "ac-gamecube-b"],
  name: "Animal Crossing (Dobutsu no Mori+)",
  description: "Animal Crossing memory card save slots A and B",
  version: 1,

  async exportSave() {
    const db = await openSaveDatabase();
    try {
      const files = [];
      for (const path of SAVE_PATHS) {
        const entry = await readEntry(db, `/save/${path}`);
        if (entry?.contents != null) {
          files.push({
            path,
            data: new Uint8Array(entry.contents)
          });
        }
      }
      return files.length ? files : null;
    } finally {
      db.close();
    }
  },

  async importSave(files, { sourceAdapterId } = {}) {
    const db = await openSaveDatabase();
    try {
      const selectedFiles = files.map((file) => {
        const path = sourceAdapterId === "ac-gamecube-a"
          ? SAVE_PATHS[0]
          : sourceAdapterId === "ac-gamecube-b"
            ? SAVE_PATHS[1]
            : legacySavePath(file);
        if (!SAVE_PATHS.includes(path)) throw new Error(`Unknown Animal Crossing save path: ${path}`);
        return { path: `/save/${path}`, bytes: file.data };
      });
      await writeFiles(db, selectedFiles);
    } finally {
      db.close();
    }
  }
};

function legacySavePath(file) {
  if (file.path === "slot-a" || file.key === "slot-a") return SAVE_PATHS[0];
  if (file.path === "slot-b" || file.key === "slot-b") return SAVE_PATHS[1];
  if (file.path) return file.path;
  throw new Error("Animal Crossing save entry is missing its path.");
}

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
        reject(new Error(`Animal Crossing IndexedDB store ${STORE_NAME} is missing.`));
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

function writeFiles(db, files) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const timestamp = new Date();

    store.put({ timestamp, mode: DIRECTORY_MODE }, "/save/card_a");
    store.put({ timestamp, mode: DIRECTORY_MODE }, "/save/card_b");
    for (const { path, bytes } of files) {
      store.put({
        timestamp,
        mode: FILE_MODE,
        contents: new Uint8Array(bytes)
      }, path);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
