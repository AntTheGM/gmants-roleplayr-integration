import { MODULE_ID } from "../const.js";
import { currentAdapter } from "../adapters/index.js";
import { logger } from "../util/logger.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * "Import from Roleplayr" dialog. Pulls the first page of each entity type
 * and lets the GM pick which to create as Foundry Actors/Items.
 *
 * Keeps things simple for v1: no search, no multi-page pagination in the UI —
 * we just load up to 100 per type and note in the footer if there are more.
 */
export class ImportDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "gmants-roleplayr-import",
    classes: ["gmants-roleplayr"],
    window: {
      title: "GMANTS_ROLEPLAYR.Import.Title",
      icon: "fas fa-cloud-download-alt",
      resizable: true,
    },
    position: { width: 600, height: 640 },
    actions: {
      selectType: ImportDialog.#onSelectType,
      importEntity: ImportDialog.#onImportEntity,
      refresh: ImportDialog.#onRefresh,
      close: ImportDialog.#onClose,
    },
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/import-dialog.hbs`,
    },
  };

  constructor(options = {}) {
    super(options);
    this.selectedType = "character";
    this.isLoading = false;
    this.entities = [];
    this.hasMore = false;
    this.loadError = null;
  }

  async _prepareContext() {
    return {
      types: [
        { key: "character", label: "Characters" },
        { key: "adversary", label: "Adversaries" },
        { key: "item", label: "Items" },
        { key: "location", label: "Locations" },
        { key: "event", label: "Events" },
      ].map((t) => ({ ...t, active: t.key === this.selectedType })),
      entities: this.entities.map((e) => {
        const defaultTargetType = e.entity_type === "adversary" ? "npc" : "character";
        return {
          ...e,
          defaultTargetType,
          isDefaultCharacter: defaultTargetType === "character",
          isDefaultNpc: defaultTargetType === "npc",
        };
      }),
      isLoading: this.isLoading,
      hasMore: this.hasMore,
      loadError: this.loadError,
      isEmpty: !this.isLoading && this.entities.length === 0 && !this.loadError,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#injectBranding();
    if (this.entities.length === 0 && !this.isLoading && !this.loadError) {
      void this.#loadEntities();
    }
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

  async #loadEntities() {
    const api = game.gmantsRoleplayr?.api;
    if (!api?.isConfigured) {
      this.loadError = "Configure your Roleplayr API key first (Module Settings → Roleplayr Integration).";
      this.render();
      return;
    }
    this.isLoading = true;
    this.loadError = null;
    this.render();

    try {
      const response = await api.listEntities({ type: this.selectedType, limit: 100 });
      this.entities = response.data ?? [];
      this.hasMore = response.pagination?.has_more ?? false;
    } catch (err) {
      logger.error("listEntities failed", err);
      this.loadError = err.message ?? "Failed to load entities from Roleplayr.";
      this.entities = [];
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  static async #onSelectType(event, target) {
    const type = target?.dataset?.type;
    if (!type || type === this.selectedType) return;
    this.selectedType = type;
    this.entities = [];
    await this.#loadEntities();
  }

  static async #onRefresh(_event, _target) {
    this.entities = [];
    await this.#loadEntities();
  }

  static async #onImportEntity(event, target) {
    const entityId = target?.dataset?.entityId;
    if (!entityId) return;
    const api = game.gmantsRoleplayr?.api;
    if (!api?.isConfigured) return;

    // Read the row's target-type select (if present) so the GM can override
    // the default adversary→npc / character→character mapping per entity.
    const row = target.closest(".gmants-roleplayr-entity-row");
    const targetType = row?.querySelector('[name="targetType"]')?.value || undefined;

    try {
      const entity = await api.getEntity(entityId);
      const spec = currentAdapter().toFoundry(entity, { targetType });
      const documentClass = CONFIG[spec.documentType]?.documentClass ?? Actor;
      const created = await documentClass.create(spec.data);
      ui.notifications.info(`Imported "${entity.name}" to ${spec.documentType}.`);
      logger.info("Imported entity", {
        roleplayr_id: entity.id,
        foundry_id: created?.id,
        target_type: targetType,
      });
    } catch (err) {
      logger.error("Import failed", err);
      ui.notifications.error(`Import failed: ${err.message ?? err}`);
    }
  }

  static async #onClose(_event, _target) {
    this.close();
  }
}
