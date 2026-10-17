# LARGE PORTIONS OF THIS WEBSITE WERE GENERATED WITH AI
I am not claiming that I created any of these ports unless otherwise specified, 

# Webports Save Manager

A minimal black/grey static website with directory-based save backup and restore. It runs entirely in the browser and can be hosted on GitHub Pages.

## Layout

- `index.html` — page layout.
- `games.json` — game links displayed on the home page.
- `styles.css` — plain black/grey styling.
- `src/app.js` — UI actions and directory permission handling.
- `src/core/directory-sync.js` — writes and restores save files and the manifest.
- `src/core/handle-store.js` — remembers the chosen directory handle in this site's IndexedDB.
- `src/core/adapter-loader.js` — explicit adapter registry.
- `src/adapters/` — one adapter module per game.

## Edit the game list

Edit `games.json` to add or change games:

```json
[
  {
    "name": "My Game",
    "url": "./my-game/",
    "note": "Web port"
  }
]
```

Each entry requires `name` and `url`; `note` is optional. The list is independent of the save adapters. Adding a link does not automatically create save support; adapters are registered separately. Save-manager activity is written to the browser console.

## Run locally / deploy

Directory picker support requires a secure context: HTTPS or localhost. For local testing:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in a recent desktop Chromium-based browser. `showDirectoryPicker()` is not supported by all browsers, and this project does not include a fallback picker.

For GitHub Pages, publish the files from your chosen branch/folder. The project uses relative paths, so it can live at a project URL such as `https://OWNER.github.io/REPOSITORY/`.

## Add a new adapter

Create one new file in `src/adapters/`, for example `src/adapters/fez.js`:

```js
export default {
  id: "fez",
  name: "FEZ",
  description: "FEZ browser port saves",
  version: 1,
  fileName: "save.dat",

  async exportSave() {
    // Read the game's actual save data.
    // Return Blob, ArrayBuffer, typed array, JSON-compatible object, or null.
  },

  async importSave(bytes, metadata) {
    // Validate bytes and restore them using the game's actual save mechanism.
  }
};
```

Then register it in `src/core/adapter-loader.js`:

```js
import fez from "../adapters/fez.js";

const adapters = [
  exampleLocalStorage,
  exampleJsonFile,
  fez
];
```

Reload the page. The adapter's `id` becomes the folder name under the selected save directory. Keep it stable so old backups continue to match.

### Adapter contract

- `id`: stable lowercase ID, matching `^[a-z0-9][a-z0-9-_]*$`.
- `name`: display name.
- `description`: short explanation.
- `version`: adapter/save format version.
- `fileName`: one filename without slashes; defaults to `save.json`.
- `exportSave()`: returns JSON-compatible data, `Blob`, `ArrayBuffer`, typed-array view, or `null` if no save exists.
- `importSave(bytes, metadata)`: receives an `ArrayBuffer` and metadata.

The sync engine handles the directory and manifest. Each adapter must handle the game's storage format. Do not blindly copy browser databases; their schemas and internal files may not be portable.

## How to find where a game's save data is stored

Because all game paths share your site origin, their browser storage is shared by origin, not isolated by URL path. A save key used by one game can therefore be visible to other pages on the same origin. IndexedDB databases are also origin-scoped. This makes inspection convenient but means you should identify each game's exact keys/database rather than exporting everything indiscriminately.

1. Open the game on your site in a Chromium-based browser.
2. Open DevTools (`F12`).
3. Open **Application → Storage**.
4. Inspect **Local Storage**, **IndexedDB**, and **Storage → File System / OPFS** if shown. Names and panels vary by browser version.
5. Play long enough to create a save, then check which values or records change.
6. Refresh the game and confirm the data persists. For better confidence, compare before/after values and use a test profile or test save.
7. Search the port's source code for `localStorage`, `indexedDB`, `OPFS`, `IDBFS`, `FS.syncfs`, `save`, `persistent`, or the engine's filesystem APIs.

You can also run this in the DevTools Console on the same origin:

```js
console.log("Origin:", location.origin);
console.log("Local Storage:", Object.keys(localStorage));
console.log("IndexedDB databases:", await indexedDB.databases());
console.log("OPFS API available:", Boolean(navigator.storage?.getDirectory));
```

This lists Local Storage key names and IndexedDB database names. It does not list every OPFS file, inspect IndexedDB records, or reveal data kept only in a game's in-memory virtual filesystem. The existence of an API does not prove a particular game uses it.

### Finding Local Storage keys

In DevTools, expand **Application → Local Storage → your site's origin**. Look for values that appear or change after saving. Local Storage values are strings, often JSON, but they may be encoded or compressed. Use only the exact keys belonging to the game in its adapter.

### Finding IndexedDB saves

Expand **Application → IndexedDB** and inspect databases and object stores. Look at record names, key paths, and values before and after creating a test save. A proper adapter should read/write the relevant object stores using the database schema, usually through IndexedDB transactions. Do not replace or delete the entire database unless you fully understand its schema and migration behavior.

### Finding Emscripten / WebAssembly saves

Some ports use a virtual filesystem (often Emscripten's `FS`) and persist selected files to browser storage. Search source files for `IDBFS`, `FS.syncfs`, `FS.writeFile`, `FS.readFile`, `Module`, `preRun`, or `postRun`. A save may exist in the virtual filesystem before it is flushed to persistent browser storage.

Best option: integrate with the port's own save API or expose a deliberate export/import hook. If the filesystem is accessible, export only the real save files. Flush persistence before export and reinitialize/reload the game after import so stale in-memory state does not overwrite restored data.

### General debugging

- Check the browser Console and Network/Sources panels for errors and game code.
- Inspect the port's upstream repository and README.
- Create a backup before experimenting with import.
- Close game tabs before restoring.
- Avoid sharing save files if they may contain account/session tokens or other private information.

## How export and restore work

The chosen folder will look like this:

```text
WebportsSaves/
├── manifest.json
├── fez/
│   └── save.dat
└── celeste/
    └── save.json
```

- **Export saves** calls each registered adapter and writes its result into `<directory>/<adapter-id>/<fileName>`.
- `manifest.json` records the format version, adapter ID, relative file path, and adapter version.
- **Restore saves** reads the manifest and calls the matching adapter's `importSave()`.
- If a backup has an adapter ID not currently registered, it is skipped and reported.
- The manager does not automatically delete old files if a game has no current save.

## Important behavior and safety

- This is a starter framework. The two included adapters are examples, not integrations for Angry Birds 2, FEZ, or Celeste.
- Restore can overwrite progress. Keep a second backup and close game tabs first.
- Browser storage APIs are scoped to the origin, not to the path, and do not provide a universal way to export arbitrary game state.
- Directory handles are stored in this website's IndexedDB. The browser may require permission again later.
- No save data is uploaded to a server by this project.
- Use adapter-specific validation and restore only known save fields/files.
