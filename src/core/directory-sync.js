const FORMAT = "webports-save-manager";
const FORMAT_VERSION = 2;
const SUPPORTED_FORMAT_VERSIONS = new Set([1, FORMAT_VERSION]);

export class DirectorySync {
  async exportAll(root, adapters, log = () => {}) {
    const manifest = {
      format: FORMAT,
      version: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      games: {}
    };
    let ok = 0;
    let failed = 0;

    for (const adapter of adapters) {
      try {
        const payload = await adapter.exportSave();
        if (payload == null) {
          log(`${adapter.id}: no save found; skipped.`);
          continue;
        }

        const folder = await root.getDirectoryHandle(adapter.id, { create: true });
        const files = await normalizeExportFiles(payload, adapter);
        const fileNames = new Set();
        for (const file of files) {
          const path = safeRelativePath(file.path);
          if (fileNames.has(path)) {
            throw new Error(`Duplicate exported file path: ${path}`);
          }
          fileNames.add(path);
        }

        const manifestFiles = [];
        for (const file of files) {
          const bytes = await toBytes(file.data);
          await writeFile(folder, file.path, bytes);
          manifestFiles.push({
            path: file.path,
            file: `${adapter.id}/${file.path}`,
            contentType: file.contentType || contentTypeFor(file.data),
            byteLength: bytes.byteLength
          });
          log(`${adapter.id}/${file.path}: exported ${bytes.byteLength} bytes.`);
        }

        if (manifestFiles.length === 0) {
          log(`${adapter.id}: no save found; skipped.`);
          continue;
        }
        manifest.games[adapter.id] = {
          adapterVersion: adapter.version ?? 1,
          ...(manifestFiles.length === 1
            ? {
                path: manifestFiles[0].path,
                file: manifestFiles[0].file,
                contentType: manifestFiles[0].contentType,
                byteLength: manifestFiles[0].byteLength
              }
            : { files: manifestFiles })
        };
        ok++;
      } catch (error) {
        failed++;
        log(`${adapter.id}: export failed: ${error.message}`);
      }
    }

    manifest.updatedAt = new Date().toISOString();
    await writeFile(root, "manifest.json", new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
    log("Updated manifest.json.");
    return { ok, failed };
  }

  async importAll(root, adapters, log = () => {}) {
    const manifest = await readJson(root, "manifest.json");
    if (manifest.format !== FORMAT || !SUPPORTED_FORMAT_VERSIONS.has(manifest.version) ||
        !manifest.games || typeof manifest.games !== "object") {
      throw new Error("Invalid or unsupported manifest.");
    }

    const byId = new Map();
    for (const adapter of adapters) {
      byId.set(adapter.id, adapter);
      for (const legacyId of adapter.legacyIds || []) byId.set(legacyId, adapter);
    }
    let ok = 0;
    let failed = 0;

    for (const [id, entry] of Object.entries(manifest.games)) {
      try {
        const adapter = byId.get(id);
        if (!adapter) {
          log(`${id}: adapter not installed; skipped.`);
          continue;
        }
        if (!entry || typeof entry !== "object") throw new Error("Invalid manifest entry.");
        const manifestFiles = Array.isArray(entry.files)
          ? entry.files
          : typeof entry.file === "string"
            ? [{ file: entry.file, fileName: entry.fileName, path: entry.path }]
            : null;
        if (!manifestFiles || manifestFiles.length === 0) throw new Error("Invalid manifest entry.");

        const files = [];
        for (const file of manifestFiles) {
          if (!file || typeof file.file !== "string") throw new Error("Invalid manifest file entry.");
          const parts = file.file.split("/");
          if (parts.length < 2 || parts[0] !== id) throw new Error("Unsafe save path in manifest.");
          const archivePath = safeRelativePath(parts.slice(1).join("/"));
          const folder = await root.getDirectoryHandle(id);
          files.push({
            path: typeof file.path === "string"
              ? safeRelativePath(file.path)
              : legacyPath(id, adapter, file),
            contentType: file.contentType || entry.contentType || "application/octet-stream",
            data: await readFile(folder, archivePath)
          });
        }
        await adapter.importSave(files, {
          sourceAdapterId: id,
          adapterVersion: entry.adapterVersion ?? 1
        });
        ok++;
        log(`${id}: restored ${files.length} file(s).`);
      } catch (error) {
        failed++;
        log(`${id}: restore failed: ${error.message}`);
      }
    }
    return { ok, failed };
  }
}

async function normalizeExportFiles(payload, adapter) {
  const files = Array.isArray(payload)
    ? payload
    : [{ path: adapter.fileName || "save.json", data: payload }];
  return files.map((file, index) => {
    if (!file || typeof file !== "object" || file.data == null) {
      throw new Error(`Invalid exported file at index ${index}.`);
    }
    return {
      path: safeRelativePath(file.path || adapter.fileName || `file-${index + 1}.bin`),
      contentType: file.contentType,
      data: file.data
    };
  });
}

function contentTypeFor(data) {
  return data instanceof Blob ? (data.type || "application/octet-stream") : "application/octet-stream";
}

function legacyPath(id, adapter, file) {
  if (id === "celeste_config") return "Saves/settings.celeste";
  if (id === "ac-gamecube-a") return "card_a/DobutsunomoriP_MURA.gci";
  if (id === "ac-gamecube-b") return "card_b/DobutsunomoriP_MURA.gci";
  if (adapter.id === "celeste") {
    if (file.key === "config" || file.fileName === "settings.celeste") return "Saves/settings.celeste";
    return `Saves/${file.fileName || "0.celeste"}`;
  }
  if (adapter.id === "ac-gamecube") {
    if (file.key === "slot-a") return "card_a/DobutsunomoriP_MURA.gci";
    if (file.key === "slot-b") return "card_b/DobutsunomoriP_MURA.gci";
  }
  return safeRelativePath(file.fileName || file.file.split("/").at(-1));
}

function safeRelativePath(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`Unsafe save path: ${String(path)}`);
  }
  const parts = path.split("/");
  if (parts.some((part) => !/^[a-zA-Z0-9._-]+$/.test(part) || part === "." || part === "..")) {
    throw new Error(`Unsafe save path: ${path}`);
  }
  return parts.join("/");
}

async function toBytes(value) {
  if (value instanceof Blob) return value.arrayBuffer();
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return new TextEncoder().encode(JSON.stringify(value, null, 2)).buffer;
}

async function writeFile(directory, path, data) {
  const parts = safeRelativePath(path).split("/");
  const name = parts.pop();
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try { await writable.write(data); } finally { await writable.close(); }
}

async function readFile(directory, path) {
  const parts = safeRelativePath(path).split("/");
  const name = parts.pop();
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part);
  }
  return (await (await directory.getFileHandle(name)).getFile()).arrayBuffer();
}

async function readJson(directory, name) {
  try { return JSON.parse(new TextDecoder().decode(await readFile(directory, name))); }
  catch { throw new Error(`${name} is missing or invalid JSON.`); }
}
