import { discoverAdapters } from "./core/adapter-loader.js";
import { DirectorySync } from "./core/directory-sync.js";
import { HandleStore } from "./core/handle-store.js";

const $ = (selector) => document.querySelector(selector);
const sync = new DirectorySync();
const handleStore = new HandleStore();
let directoryHandle = null;
let adapters = [];

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function updateControls() {
  const ready = Boolean(directoryHandle);
  const exportButton = $("#export-all");
  const importButton = $("#import-all");
  if (exportButton) exportButton.disabled = !ready || adapters.length === 0;
  if (importButton) importButton.disabled = !ready || adapters.length === 0;
  $("#reconnect-directory").disabled = !handleStore.available;
}

async function requestPermission(handle) {
  const options = { mode: "readwrite" };
  if (await handle.queryPermission(options) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

async function setDirectory(handle) {
  directoryHandle = handle;
  $("#directory-status").textContent = `Directory: ${handle.name}`;
  try {
    await handleStore.save(handle);
  } catch (error) {
    log(`Could not remember directory handle: ${error.message}`);
  }
  log(`Selected directory: ${handle.name}`);
  updateControls();
}

async function loadAdapters() {
  try {
    adapters = await discoverAdapters();
    $("#adapter-count").textContent = `${adapters.length} save adapter${adapters.length === 1 ? "" : "s"}`;
    log(`Loaded ${adapters.length} adapter(s).`);
  } catch (error) {
    $("#adapter-count").textContent = "Adapter load failed";
    log(`Could not load adapters: ${error.message}`);
  }
  updateControls();
}

$("#choose-directory")?.addEventListener("click", async () => {
  try {
    if (!("showDirectoryPicker" in window)) {
      throw new Error("Directory access is not supported in this browser. Try a recent desktop Chromium browser.");
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!(await requestPermission(handle))) throw new Error("Read/write permission was not granted.");
    await setDirectory(handle);
  } catch (error) {
    if (error.name !== "AbortError") log(`Directory selection failed: ${error.message}`);
  }
});

$("#reconnect-directory").addEventListener("click", async () => {
  try {
    const handle = await handleStore.load();
    if (!handle) {
      log("No saved directory handle. Choose the directory first.");
      return;
    }
    if (!(await requestPermission(handle))) {
      log("Permission denied. Use Choose directory to select it again.");
      return;
    }
    await setDirectory(handle);
  } catch (error) {
    log(`Could not reconnect: ${error.message}`);
  }
});

$("#export-all")?.addEventListener("click", async () => {
  try {
    if (!(await requestPermission(directoryHandle))) throw new Error("Read/write permission denied.");
    const result = await sync.exportAll(directoryHandle, adapters, log);
    log(`Export complete: ${result.ok} succeeded, ${result.failed} failed.`);
  } catch (error) {
    log(`Export failed: ${error.message}`);
  }
});

$("#import-all")?.addEventListener("click", async () => {
  if (!window.confirm("Restore saves from this directory? This may overwrite game progress. Back up first and close game tabs before restoring.")) return;
  try {
    if (!(await requestPermission(directoryHandle))) throw new Error("Read/write permission denied.");
    const result = await sync.importAll(directoryHandle, adapters, log);
    log(`Restore complete: ${result.ok} succeeded, ${result.failed} failed.`);
  } catch (error) {
    log(`Restore failed: ${error.message}`);
  }
});

async function loadGames() {
  const gameList = $("#game-list");
  try {
    const response = await fetch(new URL("../games.json", import.meta.url));
    if (!response.ok) throw new Error(`Could not load games.json: ${response.status}`);

    const games = await response.json();
    if (!Array.isArray(games)) throw new Error("games.json must contain an array.");

    for (const game of games) {
      if (!game || typeof game.name !== "string" || typeof game.url !== "string" ||
          (game.image_url !== undefined && typeof game.image_url !== "string") ||
          (game.interpolate !== undefined && typeof game.interpolate !== "boolean")) {
        throw new Error("Each game needs string name and url values; image_url must be a string and interpolate a boolean when provided.");
      }

      const column = document.createElement("div");
      column.className = "column";
      const link = document.createElement("a");
      link.className = "game-card";
      link.href = game.url;
      link.setAttribute("aria-label", game.name);

      if (game.image_url) {
        const image = document.createElement("img");
        image.src = game.image_url;
        image.alt = game.name;
        image.loading = "lazy";
        image.classList.toggle("no-interpolation", game.interpolate === false);
        link.append(image);
      }

      const name = document.createElement("h2");
      name.textContent = game.name;
      link.append(name);
      column.append(link);

      if (typeof game.note === "string" && game.note) {
        const note = document.createElement("span");
        note.className = "game-note";
        note.textContent = game.note;
        column.append(note);
      }
      gameList.append(column);
    }
    $("#game-count").textContent = `${games.length} entr${games.length === 1 ? "y" : "ies"}`;
  } catch (error) {
    $("#game-count").textContent = "Unavailable";
    console.error("Could not load game list:", error);
  }
}

if (!window.isSecureContext) log("Warning: directory access generally requires HTTPS or localhost.");
if (!("showDirectoryPicker" in window)) log("This browser may not support directory access.");
await loadGames();
await loadAdapters();
