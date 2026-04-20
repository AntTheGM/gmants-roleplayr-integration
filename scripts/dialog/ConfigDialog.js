import { MODULE_ID, SETTINGS, DEFAULT_BASE_URL } from "../const.js";
import { RoleplayrApi } from "../api-client.js";
import { logger } from "../util/logger.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Paste-key-and-test config dialog.
 *
 * Flow:
 *   1. User pastes key + optional base URL
 *   2. "Test connection" → GET /api/v1/me, store binding on success
 *   3. Stored binding shown inline so the GM knows which campaign the key
 *      is bound to without clicking Save.
 */
export class ConfigDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "gmants-roleplayr-config",
    classes: ["gmants-roleplayr"],
    window: {
      title: "GMANTS_ROLEPLAYR.Config.Title",
      icon: "fas fa-link",
      resizable: false,
    },
    position: { width: 480, height: "auto" },
    actions: {
      test: ConfigDialog.#onTest,
      save: ConfigDialog.#onSave,
      cancel: ConfigDialog.#onCancel,
    },
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/config-dialog.hbs`,
    },
  };

  constructor(options = {}) {
    super(options);
    this.formState = {
      apiKey: game.settings.get(MODULE_ID, SETTINGS.API_KEY) ?? "",
      baseUrl: game.settings.get(MODULE_ID, SETTINGS.BASE_URL) || DEFAULT_BASE_URL,
      binding: game.settings.get(MODULE_ID, SETTINGS.BINDING) ?? null,
      testResult: null,
      isTesting: false,
    };
  }

  async _prepareContext() {
    return {
      apiKey: this.formState.apiKey,
      baseUrl: this.formState.baseUrl,
      binding: this.formState.binding,
      testResult: this.formState.testResult,
      isTesting: this.formState.isTesting,
      showBinding: Boolean(this.formState.binding),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#injectBranding();
    this.#wireInputs();
  }

  #injectBranding() {
    const header = this.element.querySelector(".window-header");
    if (!header || header.querySelector(".gmants-roleplayr-branding")) return;
    const brand = document.createElement("a");
    brand.className = "gmants-roleplayr-branding";
    brand.textContent = "VTTools by GM Ant";
    brand.href = "https://roleplayr.com/gmant";
    brand.target = "_blank";
    brand.rel = "noopener";
    header.insertBefore(brand, header.lastElementChild);
  }

  #wireInputs() {
    const keyInput = this.element.querySelector('[name="apiKey"]');
    const urlInput = this.element.querySelector('[name="baseUrl"]');
    keyInput?.addEventListener("input", (e) => {
      this.formState.apiKey = e.target.value.trim();
      this.formState.testResult = null;
    });
    urlInput?.addEventListener("input", (e) => {
      this.formState.baseUrl = e.target.value.trim();
      this.formState.testResult = null;
    });
  }

  static async #onTest(_event, _target) {
    this.formState.isTesting = true;
    this.formState.testResult = null;
    this.render();

    // Use a transient client so we don't clobber the saved settings yet.
    const client = new RoleplayrApi();
    client.apiKey = this.formState.apiKey;
    client.baseUrl = (this.formState.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");

    try {
      const me = await client.getMe();
      this.formState.binding = {
        user_id: me.user_id,
        campaign_id: me.campaign_id,
        campaign_name: me.campaign_name,
        world_id: me.world_id,
        world_name: me.world_name,
      };
      this.formState.testResult = {
        ok: true,
        message: `Connected to "${me.campaign_name}" (${me.world_name}).`,
      };
    } catch (err) {
      logger.warn("Config test failed", err);
      this.formState.testResult = {
        ok: false,
        message: err.message ?? "Test failed — check your key and base URL.",
      };
    } finally {
      this.formState.isTesting = false;
      this.render();
    }
  }

  static async #onSave(_event, _target) {
    if (!this.formState.apiKey) {
      ui.notifications.warn("Paste your Roleplayr API key first.");
      return;
    }
    await game.settings.set(MODULE_ID, SETTINGS.API_KEY, this.formState.apiKey);
    await game.settings.set(MODULE_ID, SETTINGS.BASE_URL, this.formState.baseUrl || DEFAULT_BASE_URL);
    await game.settings.set(MODULE_ID, SETTINGS.BINDING, this.formState.binding);

    // Refresh the global client so subsequent hook calls use the new creds.
    game.gmantsRoleplayr?.api?._refresh();

    ui.notifications.info("Roleplayr integration saved.");
    this.close();
  }

  static async #onCancel(_event, _target) {
    this.close();
  }
}
