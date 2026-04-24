import { MODULE_ID } from "../const.js";
import { currentAdapter } from "../adapters/index.js";
import { logger } from "../util/logger.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Review dialog for pending Roleplayr -> Foundry pushes. Groups each push into
 * "new" (no existing Foundry document with matching roleplayr_id) or "conflict"
 * (one already exists), lets the GM resolve conflicts per-row, then executes
 * the create/update and ACKs each row back to Roleplayr.
 */
export class PushReviewDialog extends HandlebarsApplicationMixin(
  ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "gmants-roleplayr-push-review",
    classes: ["gmants-roleplayr"],
    window: {
      title: "GMANTS_ROLEPLAYR.Push.ReviewTitle",
      icon: "fas fa-cloud-upload-alt",
      resizable: true,
    },
    position: { width: 620, height: 640 },
    actions: {
      applyAll: PushReviewDialog.#onApplyAll,
      close: PushReviewDialog.#onClose,
    },
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/push-review-dialog.hbs`,
    },
  };

  /**
   * @param {{ pending: Array<object>, entitiesByPushId: Map<string, object>,
   *           onDone: () => void }} options
   */
  constructor({ pending, entitiesByPushId, onDone, ...options } = {}) {
    super(options);
    this.pending = pending ?? [];
    this.entitiesByPushId = entitiesByPushId ?? new Map();
    this.onDone = onDone ?? (() => {});
    // Per-row resolution: "update" | "create_new" | "skip". Conflict rows
    // default to "update"; new rows default to "create_new" implicitly.
    this.resolutionByPushId = new Map();
    this.applying = false;
  }

  /**
   * Merge in additional pending rows that arrived while this dialog was open
   * (e.g., GM clicked Pull again). Deduplicates by push id.
   */
  mergePending(rows, entitiesByPushId) {
    const existing = new Set(this.pending.map((r) => r.id));
    for (const row of rows) {
      if (!existing.has(row.id)) this.pending.push(row);
    }
    for (const [id, entity] of entitiesByPushId.entries()) {
      if (!this.entitiesByPushId.has(id)) this.entitiesByPushId.set(id, entity);
    }
    this.render();
  }

  async _prepareContext() {
    const rows = this.pending.map((row) => {
      const entity = this.entitiesByPushId.get(row.id);
      const targetDocumentType = targetDocumentFor(row.entity_type);
      const existing = findExistingDocument(row.entity_id, targetDocumentType);
      const conflict = Boolean(existing);
      const resolution =
        this.resolutionByPushId.get(row.id) ??
        (conflict ? "update" : "create_new");

      return {
        pushId: row.id,
        entityId: row.entity_id,
        entityType: row.entity_type,
        name: entity?.name ?? "(unknown)",
        targetDocumentType,
        conflict,
        existingName: existing?.name ?? null,
        existingId: existing?.id ?? null,
        resolution,
        isResolutionUpdate: resolution === "update",
        isResolutionCreateNew: resolution === "create_new",
        isResolutionSkip: resolution === "skip",
        missingEntity: !entity,
      };
    });

    const newCount = rows.filter((r) => !r.conflict).length;
    const conflictCount = rows.filter((r) => r.conflict).length;

    return {
      rows,
      newCount,
      conflictCount,
      totalCount: rows.length,
      applying: this.applying,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#bindRowControls();
  }

  #bindRowControls() {
    const root = this.element;
    if (!root) return;
    for (const select of root.querySelectorAll(
      "select[data-push-resolution]"
    )) {
      select.addEventListener("change", (ev) => {
        const pushId = ev.currentTarget.dataset.pushId;
        const value = ev.currentTarget.value;
        if (pushId) this.resolutionByPushId.set(pushId, value);
      });
    }
  }

  static async #onApplyAll(_event, _target) {
    if (this.applying) return;
    this.applying = true;
    this.render();

    const api = game.gmantsRoleplayr?.api;
    if (!api) {
      ui.notifications.error("Roleplayr API not initialized.");
      this.applying = false;
      this.render();
      return;
    }

    const results = { created: 0, updated: 0, skipped: 0, failed: 0 };

    for (const row of [...this.pending]) {
      const entity = this.entitiesByPushId.get(row.id);
      const targetDocumentType = targetDocumentFor(row.entity_type);
      const resolution =
        this.resolutionByPushId.get(row.id) ??
        (findExistingDocument(row.entity_id, targetDocumentType)
          ? "update"
          : "create_new");

      const idempotencyKey = makeIdempotencyKey(row.id);

      try {
        if (!entity) {
          await api.ackFoundryPush(
            row.id,
            {
              status: "failed",
              error: "Entity payload could not be fetched from Roleplayr.",
            },
            { idempotencyKey }
          );
          results.failed += 1;
          continue;
        }

        if (resolution === "skip") {
          await api.ackFoundryPush(
            row.id,
            { status: "skipped" },
            { idempotencyKey }
          );
          results.skipped += 1;
          continue;
        }

        const spec = buildSpec({
          entity,
          entityType: row.entity_type,
          targetActorType: row.target_actor_type,
        });
        if (!spec) {
          await api.ackFoundryPush(
            row.id,
            {
              status: "failed",
              error: `No adapter available for entity_type ${row.entity_type}`,
            },
            { idempotencyKey }
          );
          results.failed += 1;
          continue;
        }

        const documentClass =
          CONFIG[spec.documentType]?.documentClass ??
          collectionFor(spec.documentType)?.documentClass;
        if (!documentClass) {
          await api.ackFoundryPush(
            row.id,
            {
              status: "failed",
              error: `Foundry document class not available: ${spec.documentType}`,
            },
            { idempotencyKey }
          );
          results.failed += 1;
          continue;
        }

        if (resolution === "update") {
          const existing = findExistingDocument(
            row.entity_id,
            spec.documentType
          );
          if (existing) {
            await existing.update(stripFlagsForUpdate(spec.data));
            await api.ackFoundryPush(
              row.id,
              {
                status: "updated",
                foundry_document_type: spec.documentType,
                foundry_document_id: existing.id,
              },
              { idempotencyKey }
            );
            results.updated += 1;
            continue;
          }
          // Fall through to create if the existing document disappeared.
        }

        const created = await documentClass.create(spec.data);
        await api.ackFoundryPush(
          row.id,
          {
            status: "created",
            foundry_document_type: spec.documentType,
            foundry_document_id: created?.id ?? "",
          },
          { idempotencyKey }
        );
        results.created += 1;
      } catch (err) {
        logger.error("Push apply failed", { pushId: row.id, err });
        try {
          await api.ackFoundryPush(
            row.id,
            {
              status: "failed",
              error: err?.message ?? String(err),
            },
            { idempotencyKey }
          );
        } catch (ackErr) {
          logger.error("Failed to ACK failed push", {
            pushId: row.id,
            ackErr,
          });
        }
        results.failed += 1;
      }
    }

    const summary = [
      results.created > 0 ? `${results.created} created` : null,
      results.updated > 0 ? `${results.updated} updated` : null,
      results.skipped > 0 ? `${results.skipped} skipped` : null,
      results.failed > 0 ? `${results.failed} failed` : null,
    ]
      .filter(Boolean)
      .join(", ");

    if (results.failed > 0) {
      ui.notifications.warn(`Push complete: ${summary}`);
    } else {
      ui.notifications.info(`Push complete: ${summary}`);
    }

    this.applying = false;
    this.pending = [];
    this.entitiesByPushId.clear();
    this.resolutionByPushId.clear();
    this.onDone();
    this.close();
  }

  static async #onClose(_event, _target) {
    this.onDone();
    this.close();
  }

  async close(options) {
    this.onDone?.();
    return super.close(options);
  }
}

// ---- Helpers -------------------------------------------------------------

function targetDocumentFor(entityType) {
  switch (entityType) {
    case "character":
    case "adversary":
      return "Actor";
    case "item":
      return "Item";
    case "location":
    case "event":
      return "JournalEntry";
    default:
      return "Actor";
  }
}

function collectionFor(documentType) {
  switch (documentType) {
    case "Actor":
      return game.actors;
    case "Item":
      return game.items;
    case "JournalEntry":
      return game.journal;
    default:
      return null;
  }
}

function findExistingDocument(entityId, documentType) {
  const collection = collectionFor(documentType);
  if (!collection) return null;
  return (
    collection.find(
      (d) => d.flags?.[MODULE_ID]?.roleplayr_id === entityId
    ) ?? null
  );
}

/**
 * Build a Foundry-ready spec for a pending push. v1 only handles Actors
 * (characters + adversaries); Item / JournalEntry adapters arrive in Phase 4.
 */
function buildSpec({ entity, entityType, targetActorType }) {
  const adapter = currentAdapter();

  if (entityType === "character" || entityType === "adversary") {
    const toActor = adapter.toFoundryActor ?? adapter.toFoundry;
    if (!toActor) return null;
    return toActor(entity, { targetType: targetActorType ?? undefined });
  }

  if (entityType === "item" && adapter.toFoundryItem) {
    return adapter.toFoundryItem(entity);
  }

  if (
    (entityType === "location" || entityType === "event") &&
    adapter.toFoundryJournal
  ) {
    return adapter.toFoundryJournal(entity);
  }

  return null;
}

/**
 * When updating an existing document, we don't want to clobber the user's
 * flags on other modules. Keep our module flag update in sight but drop
 * anything that would nuke a foreign key.
 */
function stripFlagsForUpdate(data) {
  if (!data?.flags) return data;
  const ourFlags = data.flags[MODULE_ID];
  const next = { ...data };
  next.flags = ourFlags ? { [MODULE_ID]: ourFlags } : undefined;
  return next;
}

function makeIdempotencyKey(pushId) {
  // A stable key per (push row, this dialog instance) — retries on a
  // transient network blip replay the same ACK.
  return `push-${pushId}-${Date.now()}`;
}
