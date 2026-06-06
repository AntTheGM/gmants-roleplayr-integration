import { MODULE_ID } from "../const.js";
import { currentAdapter } from "../adapters/index.js";
import { logger } from "../util/logger.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Which Foundry document kind a Roleplayr entity_type imports to. Items become
 * Items, locations/events become JournalEntries, everything else (character /
 * adversary) becomes an Actor. Drives both the "As:" dropdown options and which
 * adapter method we call.
 */
function importKindFor(entityType) {
  switch (entityType) {
    case "item":
      return "item";
    case "location":
    case "event":
      return "journal";
    default:
      return "actor";
  }
}

/** Build the "As:" target-type options for a given entity_type. */
function targetOptionsFor(entityType) {
  const L = (k) => game.i18n.localize(`GMANTS_ROLEPLAYR.Import.${k}`);
  switch (importKindFor(entityType)) {
    case "item":
      return [{ value: "item", label: L("AsItem"), selected: true }];
    case "journal":
      return [{ value: "journal", label: L("AsJournal"), selected: true }];
    default: {
      const isNpc = entityType === "adversary";
      return [
        { value: "character", label: L("AsCharacter"), selected: !isNpc },
        { value: "npc", label: L("AsNPC"), selected: isNpc },
      ];
    }
  }
}

/**
 * "Import from Roleplayr" dialog. Server-side search via the public
 * /api/v1/entities/search endpoint — alpha-sort by default, relevance
 * when the GM types a query, keyset-cursor pagination via "Load more".
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
      loadMore: ImportDialog.#onLoadMore,
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
    this.query = "";
    this.selectedType = "character";
    this.sortMode = "name_asc";
    this.entities = [];
    this.nextCursor = null;
    this.hasMore = false;
    this.isLoading = false;
    this.isLoadingMore = false;
    this.loadError = null;
    this._searchDebounce = null;
  }

  async _prepareContext() {
    const sortOptions = [
      { key: "name_asc", label: "Name (A→Z)" },
      { key: "name_desc", label: "Name (Z→A)" },
      { key: "updated_at_desc", label: "Most recent" },
      { key: "relevance", label: "Relevance", disabled: !this.query.trim() },
    ].map((o) => ({ ...o, selected: o.key === this.sortMode }));

    return {
      query: this.query,
      types: [
        { key: "character", label: "Characters" },
        { key: "adversary", label: "Adversaries" },
        { key: "item", label: "Items" },
        { key: "location", label: "Locations" },
        { key: "event", label: "Events" },
      ].map((t) => ({ ...t, active: t.key === this.selectedType })),
      sortOptions,
      entities: this.entities.map((e) => ({
        ...e,
        name: e.name || "(unnamed)",
        targetOptions: targetOptionsFor(e.entity_type),
      })),
      isLoading: this.isLoading,
      isLoadingMore: this.isLoadingMore,
      hasMore: this.hasMore,
      loadError: this.loadError,
      isEmpty: !this.isLoading && this.entities.length === 0 && !this.loadError,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#injectBranding();
    this.#bindSearchInput();
    this.#bindSortSelect();
    if (this.entities.length === 0 && !this.isLoading && !this.loadError) {
      void this.#load({ reset: true });
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

  #bindSearchInput() {
    const input = this.element.querySelector('[name="searchQuery"]');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = "1";
    input.addEventListener("input", (evt) => {
      const value = evt.target.value;
      if (this._searchDebounce) clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => {
        this.query = value;
        // When the user clears the query, fall back to the default alpha sort.
        if (!value.trim() && this.sortMode === "relevance") {
          this.sortMode = "name_asc";
        }
        void this.#load({ reset: true });
      }, 300);
    });
    input.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter") return;
      evt.preventDefault();
      if (this._searchDebounce) clearTimeout(this._searchDebounce);
      this.query = input.value;
      void this.#load({ reset: true });
    });
  }

  #bindSortSelect() {
    const select = this.element.querySelector('[name="sortMode"]');
    if (!select || select.dataset.bound) return;
    select.dataset.bound = "1";
    select.addEventListener("change", (evt) => {
      this.sortMode = evt.target.value;
      void this.#load({ reset: true });
    });
  }

  async #load({ reset = false } = {}) {
    const api = game.gmantsRoleplayr?.api;
    if (!api?.isConfigured) {
      this.loadError = "Configure your Roleplayr API key first (Module Settings → GMAnt's Roleplayr Integration).";
      this.render();
      return;
    }

    if (reset) {
      this.entities = [];
      this.nextCursor = null;
      this.hasMore = false;
      this.isLoading = true;
      this.isLoadingMore = false;
    } else {
      this.isLoadingMore = true;
    }
    this.loadError = null;
    this.render();

    try {
      const response = await api.searchEntities({
        q: this.query.trim() || undefined,
        type: this.selectedType,
        sort: this.sortMode,
        cursor: reset ? undefined : this.nextCursor ?? undefined,
        limit: 50,
      });
      const page = response.data ?? [];
      this.entities = reset ? page : this.entities.concat(page);
      this.nextCursor = response.pagination?.next_cursor ?? null;
      this.hasMore = Boolean(response.pagination?.has_more);
    } catch (err) {
      logger.error("searchEntities failed", err);
      this.loadError = err.message ?? "Failed to load entities from Roleplayr.";
      if (reset) this.entities = [];
    } finally {
      this.isLoading = false;
      this.isLoadingMore = false;
      this.render();
    }
  }

  static async #onSelectType(event, target) {
    const type = target?.dataset?.type;
    if (!type || type === this.selectedType) return;
    this.selectedType = type;
    await this.#load({ reset: true });
  }

  static async #onRefresh(_event, _target) {
    await this.#load({ reset: true });
  }

  static async #onLoadMore(_event, _target) {
    if (!this.hasMore || !this.nextCursor) return;
    await this.#load({ reset: false });
  }

  static async #onImportEntity(event, target) {
    const entityId = target?.dataset?.entityId;
    if (!entityId) return;
    const api = game.gmantsRoleplayr?.api;
    if (!api?.isConfigured) return;

    const row = target.closest(".gmants-roleplayr-entity-row");
    const targetType = row?.querySelector('[name="targetType"]')?.value || undefined;

    try {
      const entity = await api.getEntity(entityId);
      const adapter = currentAdapter();
      // Route to the adapter method that matches the entity's kind — items
      // become Items, locations/events become JournalEntries, the rest Actors.
      const kind = importKindFor(entity.entity_type);
      let spec;
      if (kind === "item") {
        spec = adapter.toFoundryItem(entity, { targetType });
      } else if (kind === "journal") {
        spec = adapter.toFoundryJournal(entity, { targetType });
      } else {
        spec = adapter.toFoundryActor(entity, { targetType });
      }
      const documentClass = CONFIG[spec.documentType]?.documentClass ?? Actor;
      const created = await documentClass.create(spec.data);
      if (created && spec.update) await created.update(spec.update);
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
