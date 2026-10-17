const FORMAT = "webports-save-manager";
const FORMAT_VERSION = 1;

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
        const fileName = safeFileName(adapter.fileName || "save.json");
        const bytes = await toBytes(payload);
        await writeFile(folder, fileName, bytes);

        manifest.games[adapter.id] = {
          adapterVersion: adapter.version ?? 1,
          file: `${adapter.id}/${fileName}`,
          contentType: payload instanceof Blob ? (payload.type || "application/octet-stream") : "application/json",
          byteLength: bytes.byteLength
        };
        ok++;
        log(`${adapter.id}: exported ${bytes.byteLength} bytes.`);
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
    if (manifest.format !== FORMAT || manifest.version !== FORMAT_VERSION ||
        !manifest.games || typeof manifest.games !== "object") {
      throw new Error("Invalid or unsupported manifest.");
    }

    const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
    let ok = 0;
    let failed = 0;

    for (const [id, entry] of Object.entries(manifest.games)) {
      try {
        const adapter = byId.get(id);
        if (!adapter) {
          log(`${id}: adapter not installed; skipped.`);
          continue;
        }
        if (!entry || typeof entry.file !== "string") throw new Error("Invalid manifest entry.");
        const parts = entry.file.split("/");
        if (parts.length !== 2 || parts[0] !== id) throw new Error("Unsafe save path in manifest.");
        const folder = await root.getDirectoryHandle(id);
        const bytes = await readFile(folder, safeFileName(parts[1]));
        await adapter.importSave(bytes, {
          fileName: parts[1],
          contentType: entry.contentType || "application/octet-stream",
          adapterVersion: entry.adapterVersion ?? 1
        });
        ok++;
        log(`${id}: restored ${bytes.byteLength} bytes.`);
      } catch (error) {
        failed++;
        log(`${id}: restore failed: ${error.message}`);
      }
    }
    return { ok, failed };
  }
}

function safeFileName(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9._-]+$/.test(name) || name === "." || name === "..") {
    throw new Error(`Unsafe file name: ${String(name)}`);
  }
  return name;
}

async function toBytes(value) {
  if (value instanceof Blob) return value.arrayBuffer();
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return new TextEncoder().encode(JSON.stringify(value, null, 2)).buffer;
}

async function writeFile(directory, name, data) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try { await writable.write(data); } finally { await writable.close(); }
}

async function readFile(directory, name) {
  return (await (await directory.getFileHandle(name)).getFile()).arrayBuffer();
}

async function readJson(directory, name) {
  try { return JSON.parse(new TextDecoder().decode(await readFile(directory, name))); }
  catch { throw new Error(`${name} is missing or invalid JSON.`); }
}
