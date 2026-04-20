import { MODULE_ID, SETTINGS, DEFAULT_BASE_URL } from "./const.js";

/**
 * Settings lifecycle: `init` for world-scoped values, `ready` for anything
 * that touches `game.settings`. The Config dialog (menu entry) is registered
 * here so it shows up under Module Settings.
 */
export function registerSettings() {
  game.settings.registerMenu(MODULE_ID, "configMenu", {
    name: "GMANTS_ROLEPLAYR.Settings.ConfigMenu.Name",
    label: "GMANTS_ROLEPLAYR.Settings.ConfigMenu.Label",
    hint: "GMANTS_ROLEPLAYR.Settings.ConfigMenu.Hint",
    icon: "fas fa-link",
    type: window.gmantsRoleplayr?.ConfigDialog,
    restricted: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.API_KEY, {
    name: "GMANTS_ROLEPLAYR.Settings.ApiKey.Name",
    hint: "GMANTS_ROLEPLAYR.Settings.ApiKey.Hint",
    scope: "world",
    config: false,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, SETTINGS.BASE_URL, {
    name: "GMANTS_ROLEPLAYR.Settings.BaseUrl.Name",
    hint: "GMANTS_ROLEPLAYR.Settings.BaseUrl.Hint",
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_BASE_URL,
  });

  game.settings.register(MODULE_ID, SETTINGS.BINDING, {
    scope: "world",
    config: false,
    type: Object,
    default: null,
  });

  game.settings.register(MODULE_ID, SETTINGS.ACTOR_SYNC_ENABLED, {
    name: "GMANTS_ROLEPLAYR.Settings.ActorSync.Name",
    hint: "GMANTS_ROLEPLAYR.Settings.ActorSync.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.COMBAT_SYNC_ENABLED, {
    name: "GMANTS_ROLEPLAYR.Settings.CombatSync.Name",
    hint: "GMANTS_ROLEPLAYR.Settings.CombatSync.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
}

/** Settings-page promo note — matches the VTTools module guidelines pattern. */
export function registerSettingsPromo() {
  Hooks.on("renderSettingsConfig", (_app, html) => {
    const root = html[0] ?? html;
    const tab = root.querySelector?.(`.tab[data-tab="${MODULE_ID}"]`);
    if (!tab || tab.querySelector(".gmants-roleplayr-settings-promo")) return;
    const note = document.createElement("p");
    note.className = "gmants-roleplayr-settings-promo";
    note.style.cssText =
      "text-align:center; font-style:italic; opacity:0.6; font-size:0.8rem; margin-top:0.5rem;";
    note.innerHTML =
      'Visit <a href="https://roleplayr.com/gmant" target="_blank" rel="noopener">roleplayr.com/gmant</a> for updates, more virtual tabletop tools, and online RPG tools.';
    tab.appendChild(note);
  });
}
