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
 * routes each pushed entity to the right Foundry Item type. ve_types wired:
 *   - "achievement" → `achievement` Item. Schema:
 *       `20260601000000_add_virtualepic_achievement_fields.sql` (keys
 *       prefixed `virtualepic_*`, two nested blocks stored as JSON).
 *       Foundry target: `module/data/item/achievement.mjs` +
 *       `applyAchievementReward` on grant.
 *   - "class" → `class` Item (full class-definition bundle). Schema:
 *       `20260602000000_add_virtualepic_class_fields.sql` (keys prefixed
 *       `virtualepic_class_*`, nested bundle blocks stored as JSON).
 *       Foundry target: `module/data/item/class.mjs`; the bundle is applied
 *       to a crawler later, on SELECTION, via `applyClassBundle()`.
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
function veJson(entity, key, dflt = {}) {
  const raw = elementValue(entity, key);
  if (raw === null || raw === undefined || raw === "") return dflt;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(
      `[virtualepic adapter] element "${key}" is not valid JSON; defaulting to ${JSON.stringify(dflt)}`
    );
    return dflt;
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
 * ve_type "class" → Foundry `class` Item (the full class-definition bundle).
 * Maps the 19 `virtualepic_class_*` element keys onto ClassData.system,
 * JSON.parsing the nested bundle blocks back into objects/arrays. Same pattern
 * as the achievement adapter; the heavy lifting (embedding skills/spells,
 * stat/immunity carrier, auto-achievements) happens later, when the crawler
 * SELECTS the option via `applyClassBundle()` — the adapter only materializes
 * the reviewable bundle Item. `applied` is left to the DataModel default (false).
 *
 * Contract: Roleplayr migration `20260602000000_add_virtualepic_class_fields.sql`.
 * Foundry target: `module/data/item/class.mjs` (ClassData).
 */
function toClassItem(entity) {
  return {
    documentType: "Item",
    data: {
      name: entity.name || "Unnamed Class",
      type: "class",
      img: primaryImage(entity) ?? undefined,
      system: {
        // ── Overview ──────────────────────────────────────────────────────
        tier: veStr(entity, "virtualepic_class_tier", "base").toLowerCase(),
        acquisitionFloor:
          asNumber(elementValue(entity, "virtualepic_class_acquisition_floor")) ?? 3,
        parentOnly: veBool(entity, "virtualepic_class_parent_only"),
        // JSON array of parent-class names; [] for base classes.
        parentClass: veJson(entity, "virtualepic_class_parent_class", []),
        // ── Lore ──────────────────────────────────────────────────────────
        description: veStr(entity, "virtualepic_class_description"),
        canonSource: veStr(entity, "virtualepic_class_canon_source"),
        // ── Mechanics — LIVE grant bundle ─────────────────────────────────
        grantedSkills: veJson(entity, "virtualepic_class_granted_skills", []),
        grantedSpells: veJson(entity, "virtualepic_class_granted_spells", []),
        statBonuses: veJson(entity, "virtualepic_class_stat_bonuses", []),
        immunities: veJson(entity, "virtualepic_class_immunities", []),
        autoAchievements: veJson(entity, "virtualepic_class_auto_achievements", []),
        extraPerks: veJson(entity, "virtualepic_class_extra_perks", []),
        acquisitionRequirements: veJson(entity, "virtualepic_class_acquisition_requirements", {}),
        // ── Mechanics — store-only at MVP ─────────────────────────────────
        trainingCapRaises: veJson(entity, "virtualepic_class_training_cap_raises", []),
        xpRateModifiers: veJson(entity, "virtualepic_class_xp_rate_modifiers", []),
        // manaPool is nullable on the DataModel — preserve null when absent.
        manaPool: veJson(entity, "virtualepic_class_mana_pool", null),
        factionMemberships: veJson(entity, "virtualepic_class_faction_memberships", []),
        // ── Specialization/endorsement gates (stored, out of MVP scope) ────
        specializationTrack: veJson(entity, "virtualepic_class_specialization_track", {}),
        endorsementOptions: veJson(entity, "virtualepic_class_endorsement_options", {}),
      },
      flags: {
        [MODULE_ID]: {
          roleplayr_id: entity.id,
          roleplayr_type: entity.entity_type,
          ve_type: "class",
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
      case "class":
        return toClassItem(entity);
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
