// Register one adapter per game. Keep IDs and legacy IDs stable so old backups
// continue to match after adapters are consolidated.

import celeste from "../adapters/celeste.js";
import acGamecube from "../adapters/ac-gamecube.js";

const adapters = [celeste, acGamecube];

export async function discoverAdapters() {
  const ids = new Set();
  for (const adapter of adapters) {
    if (!adapter || typeof adapter.id !== "string" ||
        !/^[a-z0-9][a-z0-9-_]*$/.test(adapter.id)) {
      throw new Error("Every adapter needs a stable lowercase id.");
    }
    if (!adapter.name || typeof adapter.exportSave !== "function" ||
        typeof adapter.importSave !== "function") {
      throw new Error(`Adapter ${adapter.id} needs name, exportSave(), and importSave().`);
    }
    if (ids.has(adapter.id)) throw new Error(`Duplicate adapter id: ${adapter.id}`);
    ids.add(adapter.id);
    for (const legacyId of adapter.legacyIds || []) {
      if (typeof legacyId !== "string" || !/^[a-z0-9][a-z0-9-_]*$/.test(legacyId)) {
        throw new Error(`Adapter ${adapter.id} has an invalid legacy id.`);
      }
      if (ids.has(legacyId)) throw new Error(`Duplicate adapter id: ${legacyId}`);
      ids.add(legacyId);
    }
  }
  return adapters;
}
