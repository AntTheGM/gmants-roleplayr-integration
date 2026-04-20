import { dnd5eAdapter } from "./dnd5e.js";
import { pf2eAdapter } from "./pf2e.js";

/**
 * Select the adapter matching the active Foundry system. Falls back to the
 * D&D 5e shape if the system isn't one we've mapped — it's the closest
 * common subset (HP + level + abilities live at well-known paths).
 */
export function adapterForSystem(systemId) {
  switch (systemId) {
    case "dnd5e":
      return dnd5eAdapter;
    case "pf2e":
      return pf2eAdapter;
    default:
      return dnd5eAdapter;
  }
}

export function currentAdapter() {
  return adapterForSystem(game.system?.id ?? "dnd5e");
}
