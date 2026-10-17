// Register adapters here. Each game adapter is a separate file in src/adapters/.
// Keep adapter IDs stable so old backup folders continue to match.

import celeste from "../adapters/celeste.js"
import celeste_config from "../adapters/celeste-config.js"
import acGamecubeA from "../adapters/ac-gamecube-a.js";
import acGamecubeB from "../adapters/ac-gamecube-b.js"

const adapters = [
  celeste,
  celeste_config,
  acGamecubeA,
  acGamecubeB
];

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
  }
  return adapters;
}
