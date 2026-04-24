import {
  asNumber,
  elementValue,
  primaryImage,
  toFoundryJournalDefault,
} from "./common.js";

const MODULE_ID = "gmants-roleplayr-integration";

/**
 * D&D 5e adapter. Mapping table (Roleplayr element_type_key → dnd5e path):
 *
 * | Roleplayr              | Foundry (dnd5e Actor.system)     |
 * |------------------------|----------------------------------|
 * | hp_max                 | attributes.hp.max                |
 * | hp_current             | attributes.hp.value              |
 * | ac                     | attributes.ac.value              |
 * | level                  | details.level                    |
 * | xp                     | details.xp.value                 |
 * | class                  | details.class                    |
 * | stats.str / dex / ...  | abilities.{str,dex,...}.value    |
 *
 * We only round-trip HP and XP on the sync-back path for v1. Import covers a
 * wider surface because it's one-shot.
 */
export const dnd5eAdapter = {
  toFoundryActor(entity, { targetType } = {}) {
    const elements = new Map(entity.elements.map((e) => [e.element_type_key, e.value]));
    const actorType = targetType ?? (entity.entity_type === "adversary" ? "npc" : "character");

    const hpMax = asNumber(elements.get("hp_max")) ?? 10;
    const hpCurrent = asNumber(elements.get("hp_current")) ?? hpMax;
    const ac = asNumber(elements.get("ac")) ?? 10;
    const level = asNumber(elements.get("level")) ?? 1;
    const xp = asNumber(elements.get("xp")) ?? 0;
    const className = elements.get("class") ?? "";

    let statsJson = elements.get("stats");
    if (typeof statsJson === "string") {
      try {
        statsJson = JSON.parse(statsJson);
      } catch {
        statsJson = null;
      }
    }
    const abilities = {};
    for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
      const value = statsJson?.[key];
      if (typeof value === "number") {
        abilities[key] = { value };
      }
    }

    return {
      documentType: "Actor",
      data: {
        name: entity.name || "Unnamed",
        type: actorType,
        img: primaryImage(entity) ?? undefined,
        system: {
          attributes: {
            hp: { value: hpCurrent, max: hpMax },
            ac: { value: ac },
          },
          details: {
            level,
            xp: { value: xp },
            class: className,
          },
          abilities,
        },
        flags: {
          "gmants-roleplayr-integration": {
            roleplayr_id: entity.id,
            roleplayr_type: entity.entity_type,
            synced_at: new Date().toISOString(),
          },
        },
      },
    };
  },

  /**
   * Item adapter — maps Roleplayr `item` entity_type_keys to dnd5e Item.system.
   * Supported `item_type` values map to Foundry Item `type`:
   *   weapon -> "weapon"
   *   armor / shield -> "equipment"
   *   consumable / potion / scroll -> "consumable"
   *   anything else -> "loot"
   */
  toFoundryItem(entity) {
    const itemType = String(elementValue(entity, "item_type") ?? "")
      .toLowerCase()
      .trim();
    const foundryType = mapDnd5eItemType(itemType);

    const description = String(elementValue(entity, "description") ?? "");
    const weight = asNumber(elementValue(entity, "weight")) ?? 0;
    const price = asNumber(elementValue(entity, "price")) ?? 0;
    const rarity = String(
      elementValue(entity, "rarity") ?? "common"
    ).toLowerCase();
    const quantity = asNumber(elementValue(entity, "quantity")) ?? 1;

    return {
      documentType: "Item",
      data: {
        name: entity.name || "Unnamed Item",
        type: foundryType,
        img: primaryImage(entity) ?? undefined,
        system: {
          description: { value: description, chat: "" },
          weight: { value: weight, units: "lb" },
          price: { value: price, denomination: "gp" },
          rarity,
          quantity,
        },
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

  toFoundryJournal(entity) {
    return toFoundryJournalDefault(entity);
  },

  fromActor(actor) {
    const sys = actor.system ?? {};
    return {
      hp_current: sys.attributes?.hp?.value ?? null,
      hp_max: sys.attributes?.hp?.max ?? null,
      xp: sys.details?.xp?.value ?? null,
    };
  },
};

// Backwards-compatible alias so existing ImportDialog code that calls
// `adapter.toFoundry(entity)` keeps working during the transition.
dnd5eAdapter.toFoundry = dnd5eAdapter.toFoundryActor;

function mapDnd5eItemType(itemType) {
  if (!itemType) return "loot";
  if (itemType.includes("weapon")) return "weapon";
  if (
    itemType.includes("armor") ||
    itemType.includes("shield") ||
    itemType.includes("equipment")
  ) {
    return "equipment";
  }
  if (
    itemType.includes("potion") ||
    itemType.includes("scroll") ||
    itemType.includes("consumable")
  ) {
    return "consumable";
  }
  return "loot";
}
