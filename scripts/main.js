import { MODULE_ID } from "./const.js";
import { registerSettings, registerSettingsPromo } from "./settings.js";
import { RoleplayrApi } from "./api-client.js";
import { ConfigDialog } from "./dialog/ConfigDialog.js";
import { ImportDialog } from "./dialog/ImportDialog.js";
import { ActorSync } from "./sync/ActorSync.js";
import { CombatSync } from "./sync/CombatSync.js";
import { logger } from "./util/logger.js";

Hooks.once("init", () => {
  registerSettings();
  registerSettingsPromo();
  logger.info("Roleplayr integration initialized.");
});

Hooks.once("ready", async () => {
  game.gmantsRoleplayr = {
    api: new RoleplayrApi(),
    openConfig: () => new ConfigDialog().render(true),
    openImport: () => new ImportDialog().render(true),
  };

  ActorSync.register();
  CombatSync.register();

  registerImportMacroButton();
  logger.info("Roleplayr integration ready.");
});

/**
 * Add a button to the Game Settings sidebar that opens the Import dialog.
 * Foundry doesn't have a built-in menu slot for module tools outside the
 * settings panel, so we hang it off the sidebar render hook.
 */
function registerImportMacroButton() {
  Hooks.on("renderSettings", (_app, html) => {
    const root = html[0] ?? html;
    if (!root || root.querySelector?.(`.${MODULE_ID}-import-btn`)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${MODULE_ID}-import-btn`;
    btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Import from Roleplayr';
    btn.addEventListener("click", () => new ImportDialog().render(true));

    // Inject near the Module Settings section. Different Foundry versions
    // have slightly different sidebar layouts, so try a few anchors.
    const anchor =
      root.querySelector?.('[data-action="modules"]') ??
      root.querySelector?.("section.settings") ??
      root.querySelector?.("#settings");
    if (!anchor) return;
    anchor.parentElement?.insertBefore(btn, anchor.nextSibling);
  });
}
