import { MODULE_ID, SETTINGS, COMBAT_SYNC_MIN_INTERVAL_MS } from "../const.js";
import { logger } from "../util/logger.js";

/**
 * Streams Foundry combat state to PUT /api/v1/foundry/state so the Roleplayr
 * Player Portal can show it live.
 *
 * Triggers: combatStart, combatRound, combatTurn, updateCombat, and a
 * canvas-change fallback for the "exploration" scene name. Rate-limited
 * client-side to the same 1/sec the server enforces — avoids getting
 * 429'd under combat animation bursts.
 */
export class CombatSync {
  static register() {
    const instance = new CombatSync();

    Hooks.on("combatStart", (combat) => instance._push(combat, { inCombat: true }));
    Hooks.on("combatRound", (combat) => instance._push(combat, { inCombat: true }));
    Hooks.on("combatTurn", (combat) => instance._push(combat, { inCombat: true }));
    Hooks.on("updateCombat", (combat) => instance._push(combat, { inCombat: true }));
    Hooks.on("deleteCombat", () => instance._pushIdle());
    Hooks.on("canvasReady", () => instance._pushIdle());
  }

  constructor() {
    this._lastSentAt = 0;
    this._pending = null;
  }

  _isEnabled() {
    return game.user.isGM && game.settings.get(MODULE_ID, SETTINGS.COMBAT_SYNC_ENABLED);
  }

  _combatantSnapshot(combatant) {
    if (!combatant) return null;
    const actor = combatant.actor;
    const hp = actor?.system?.attributes?.hp;
    return {
      name: combatant.name ?? actor?.name ?? "Unknown",
      entity_id: actor?.flags?.[MODULE_ID]?.roleplayr_id ?? null,
      initiative: combatant.initiative ?? null,
      hp: hp?.max != null && hp?.value != null ? { current: hp.value, max: hp.max } : undefined,
    };
  }

  _partySnapshot() {
    const party = [];
    const playerOwned = game.actors?.filter?.((a) => a.hasPlayerOwner && a.type === "character") ?? [];
    for (const actor of playerOwned) {
      const hp = actor.system?.attributes?.hp;
      party.push({
        name: actor.name,
        entity_id: actor.flags?.[MODULE_ID]?.roleplayr_id ?? null,
        hp: hp?.max != null && hp?.value != null ? { current: hp.value, max: hp.max } : undefined,
        conditions: this._actorConditions(actor),
      });
    }
    return party;
  }

  _actorConditions(actor) {
    const effects = actor.effects?.contents ?? [];
    return effects
      .filter((e) => e.statuses?.size > 0 && !e.disabled)
      .flatMap((e) => [...e.statuses])
      .filter(Boolean);
  }

  _buildPayload(combat, { inCombat }) {
    const activeCombatant = combat?.combatant ? this._combatantSnapshot(combat.combatant) : null;
    const initiativeOrder = combat?.turns
      ?.map((t) => this._combatantSnapshot(t))
      .filter(Boolean) ?? [];

    return {
      is_in_combat: Boolean(inCombat && combat?.started),
      current_scene: canvas.scene?.name ?? null,
      active_combatant: activeCombatant,
      initiative_order: initiativeOrder,
      party_status: this._partySnapshot(),
      foundry_world_id: game.world?.id ?? null,
    };
  }

  _push(combat, opts) {
    if (!this._isEnabled()) return;
    const payload = this._buildPayload(combat, opts);
    this._sendWithRateLimit(payload);
  }

  _pushIdle() {
    if (!this._isEnabled()) return;
    this._sendWithRateLimit({
      is_in_combat: false,
      current_scene: canvas.scene?.name ?? null,
      active_combatant: null,
      initiative_order: [],
      party_status: this._partySnapshot(),
      foundry_world_id: game.world?.id ?? null,
    });
  }

  _sendWithRateLimit(payload) {
    const now = Date.now();
    const since = now - this._lastSentAt;
    if (since < COMBAT_SYNC_MIN_INTERVAL_MS) {
      // Coalesce: store the latest payload and send it when the window reopens.
      this._pending = payload;
      if (!this._pendingTimer) {
        this._pendingTimer = setTimeout(() => {
          this._pendingTimer = null;
          const p = this._pending;
          this._pending = null;
          if (p) void this._send(p);
        }, COMBAT_SYNC_MIN_INTERVAL_MS - since);
      }
      return;
    }
    void this._send(payload);
  }

  async _send(payload) {
    const api = game.gmantsRoleplayr?.api;
    if (!api?.isConfigured) return;
    this._lastSentAt = Date.now();
    const result = await api.putFoundryState(payload);
    if (!result.ok) {
      if (result.code === "CAMPAIGN_SYNC_DISABLED") {
        // One-shot warning so we don't spam the GM.
        if (!this._warnedSyncDisabled) {
          this._warnedSyncDisabled = true;
          ui.notifications.warn(
            "Foundry sync is disabled on the Roleplayr campaign. Enable it in campaign settings to stream state to the Player Portal."
          );
        }
        return;
      }
      logger.debug("Combat state push rejected", result);
    }
  }
}
