import { MODULE_ID, SETTINGS, ACTOR_SYNC_DEBOUNCE_MS } from "../const.js";
import { currentAdapter } from "../adapters/index.js";
import { logger } from "../util/logger.js";

/**
 * Writes Foundry Actor changes back to the bound Roleplayr campaign.
 *
 * We listen to `updateActor` (post-commit) rather than `preUpdateActor` so
 * we PATCH the final, merged state — never an intermediate one. A 2-second
 * debounce per actor coalesces bursty edits (combat damage rolls often fire
 * multiple updates in < 100ms) before we send.
 *
 * Only actors created from Roleplayr imports (identified by our module flag)
 * are synced. Free-standing Foundry actors are left alone.
 */
export class ActorSync {
  static register() {
    const instance = new ActorSync();
    Hooks.on("updateActor", (actor, _changes, _options, userId) => {
      if (userId !== game.user.id) return;
      instance._schedule(actor);
    });
    Hooks.on("deleteActor", (actor) => {
      instance._cancel(actor.id);
    });
  }

  constructor() {
    this._timers = new Map();
    this._lastSnapshot = new Map();
  }

  _isEnabled() {
    return game.settings.get(MODULE_ID, SETTINGS.ACTOR_SYNC_ENABLED);
  }

  _roleplayrId(actor) {
    return actor.flags?.[MODULE_ID]?.roleplayr_id ?? null;
  }

  _schedule(actor) {
    if (!this._isEnabled()) return;
    const roleplayrId = this._roleplayrId(actor);
    if (!roleplayrId) return;

    const existing = this._timers.get(actor.id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this._timers.delete(actor.id);
      void this._flush(actor, roleplayrId);
    }, ACTOR_SYNC_DEBOUNCE_MS);
    this._timers.set(actor.id, timer);
  }

  _cancel(actorId) {
    const existing = this._timers.get(actorId);
    if (existing) {
      clearTimeout(existing);
      this._timers.delete(actorId);
    }
  }

  async _flush(actor, roleplayrId) {
    const api = game.gmantsRoleplayr?.api;
    if (!api?.isConfigured) return;

    // Diff against the previous snapshot so we only PATCH changed fields.
    // First push sends everything; subsequent pushes skip no-ops.
    const adapter = currentAdapter();
    const fields = adapter.fromActor(actor);
    const previous = this._lastSnapshot.get(actor.id) ?? {};
    const elements = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      if (previous[key] === value) continue;
      elements.push({ element_type_key: key, value: String(value) });
    }

    if (elements.length === 0) return;

    const idempotencyKey = `actor-${actor.id}-${Date.now()}`;
    try {
      await api.patchEntity(roleplayrId, elements, { idempotencyKey });
      this._lastSnapshot.set(actor.id, { ...previous, ...fields });
      logger.debug("Synced actor", { actorId: actor.id, roleplayrId, fields });
    } catch (err) {
      // Don't block the GM's session on a failed sync — surface a toast and
      // keep the previous snapshot so the next update diffs cleanly.
      logger.warn("Actor sync PATCH failed", err);
      if (err.status === 429) {
        ui.notifications.warn("Roleplayr rate limit hit — actor sync paused for a moment.");
      }
    }
  }
}
