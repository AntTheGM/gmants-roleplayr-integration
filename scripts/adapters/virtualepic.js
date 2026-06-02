import {
  asNumber,
  elementValue,
  primaryImage,
  toFoundryJournalDefault,
} from "./common.js";

const MODULE_ID = "gmants-roleplayr-integration";

/**
 * Virtual Epic adapter.
 *
 * VE rides Roleplayr's existing `item` entity_type (id 5), scoped to the
 * `virtualepic` game_system, with a `virtualepic_ve_type` discriminator that
 * routes each pushed entity to the right Foundry Item type. For the first
 * integration slice the only ve_type is "achievement" — its element schema is
 * registered by Roleplayr migration `20260601000000_add_virtualepic_achievement_fields.sql`
 * (keys prefixed `virtualepic_*`, two nested blocks stored as JSON).
 *
 * Foundry-side delivery target: the `achievement` Item DataModel
 * (`module/data/item/achievement.mjs`) + `applyAchievementReward` on grant.
 */

// ── value coercers (Roleplayr stores every element value as text) ───────────
function veStr(entity, key, dflt = "") {
  const v = elementValue(entity, key);
  return v === null || v === undefined ? dflt : String(v);
}
function veBool(entity, key) {
  const v = elementValue(entity, key);
  return v === true || String(v).toLowerCase() === "true";
}
function veJson(entity, key) {
  const raw = elementValue(entity, key);
  if (raw === null || raw === undefined || raw === "") return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`[virtualepic adapter] element "${key}" is not valid JSON; defaulting to {}`);
    return {};
  }
}

/**
 * ve_type "achievement" → Foundry `achievement` Item.
 * Maps the 20 `virtualepic_*` element keys onto AchievementData.system,
 * parsing the two json-typed blocks back into objects.
 */
function toAchievementItem(entity) {
  return {
    documentType: "Item",
    data: {
      name: entity.name || "Unnamed Achievement",
      type: "achievement",
      img: primaryImage(entity) ?? undefined,
      system: {
        description: veStr(entity, "virtualepic_description"),
        flavorText: veStr(entity, "virtualepic_flavor_text"),
        rewardText: veStr(entity, "virtualepic_reward_text"),
        rarity: veStr(entity, "virtualepic_rarity", "common").toLowerCase(),
        category: veStr(entity, "virtualepic_category", "combat"),
        // visibility is camelCase enum (hiddenUntilStarted, …) — do NOT lowercase
        visibility: veStr(entity, "virtualepic_visibility", "public"),
        repeatable: veBool(entity, "virtualepic_repeatable"),
        trigger: {
          type: veStr(entity, "virtualepic_trigger_type"),
          event: veStr(entity, "virtualepic_trigger_event"),
          condition: veJson(entity, "virtualepic_trigger_condition"),
        },
        progress: {
          requiredValue:
            asNumber(elementValue(entity, "virtualepic_progress_required_value")) ?? 1,
          currentValueSource: veStr(entity, "virtualepic_progress_source"),
        },
        reward: {
          type: veStr(entity, "virtualepic_reward_type", "xp"),
          value: asNumber(elementValue(entity, "virtualepic_reward_value")) ?? 0,
          lootBox: veStr(entity, "virtualepic_reward_loot_box"),
          statBonus: veJson(entity, "virtualepic_reward_stat_bonus"),
          reputationBonus:
            asNumber(elementValue(entity, "virtualepic_reward_reputation_bonus")) ?? 0,
        },
        ai: {
          generationAllowed: veBool(entity, "virtualepic_ai_generation_allowed"),
          flavorPromptKey: veStr(entity, "virtualepic_ai_flavor_prompt_key"),
        },
      },
      flags: {
        [MODULE_ID]: {
          roleplayr_id: entity.id,
          roleplayr_type: entity.entity_type,
          ve_type: "achievement",
          synced_at: new Date().toISOString(),
        },
      },
    },
  };
}

/**
 * Fallback for an unknown/absent ve_type. Creates a bare `gear` Item so the
 * push still lands something editable, with DataModel defaults filling the
 * rest. Future VE item kinds (weapon / lootBox / consumable) get their own
 * `case` here as their element contracts are registered.
 */
function toGenericItem(entity, veType) {
  console.warn(
    `[virtualepic adapter] unknown ve_type "${veType}" — creating a generic gear Item`
  );
  return {
    documentType: "Item",
    data: {
      name: entity.name || "Unnamed Item",
      type: "gear",
      img: primaryImage(entity) ?? undefined,
      system: {},
      flags: {
        [MODULE_ID]: {
          roleplayr_id: entity.id,
          roleplayr_type: entity.entity_type,
          ve_type: veType || "",
          synced_at: new Date().toISOString(),
        },
      },
    },
  };
}

export const virtualepicAdapter = {
  /**
   * VE crawler/monster import is a later slice. Minimal builder so the adapter
   * contract is satisfied if a character/adversary push arrives — name + flags
   * only; DataModel defaults fill the rest.
   */
  toFoundryActor(entity, { targetType } = {}) {
    const actorType =
      targetType ?? (entity.entity_type === "adversary" ? "monster" : "crawler");
    return {
      documentType: "Actor",
      data: {
        name: entity.name || "Unnamed",
        type: actorType,
        img: primaryImage(entity) ?? undefined,
        system: {},
        flags: {
          [MODULE_ID]: {
            roleplayr_id: entity.id,
            roleplayr_type: entity.entity_type,
            synced_at: new Date().toISOString(),
          },
        },
      },
    };
  },

  toFoundryItem(entity) {
    const veType = String(elementValue(entity, "virtualepic_ve_type") ?? "achievement")
      .toLowerCase()
      .trim();
    switch (veType) {
      case "achievement":
        return toAchievementItem(entity);
      default:
        return toGenericItem(entity, veType);
    }
  },

  toFoundryJournal(entity) {
    return toFoundryJournalDefault(entity);
  },

  /**
   * No state writeback for this slice — achievements don't push HP/XP back, and
   * VE crawler writeback is a later slice. Empty → the writeback path has
   * nothing to apply.
   */
  fromActor() {
    return {};
  },
};

// Backwards-compatible alias (ImportDialog/older callers use `toFoundry`).
virtualepicAdapter.toFoundry = virtualepicAdapter.toFoundryActor;
