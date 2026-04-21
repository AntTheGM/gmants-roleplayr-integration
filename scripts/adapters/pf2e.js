import { asNumber, primaryImage } from "./common.js";

/**
 * Pathfinder 2e adapter. Pre-import only — PF2e actors are deeply nested,
 * and the reliable path for HP round-tripping is `system.attributes.hp.value`.
 *
 * | Roleplayr              | Foundry (pf2e Actor.system)      |
 * |------------------------|----------------------------------|
 * | hp_max                 | attributes.hp.max                |
 * | hp_current             | attributes.hp.value              |
 * | ac                     | attributes.ac.value              |
 * | level                  | details.level.value              |
 * | xp                     | details.xp.value                 |
 * | class                  | details.class.value              |
 * | stats.str / ...        | abilities.{str,dex,...}.mod       |
 */
export const pf2eAdapter = {
  toFoundry(entity, { targetType } = {}) {
    const elements = new Map(entity.elements.map((e) => [e.element_type_key, e.value]));
    const actorType = targetType ?? (entity.entity_type === "adversary" ? "npc" : "character");

    const hpMax = asNumber(elements.get("hp_max")) ?? 8;
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
        abilities[key] = { mod: value };
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
            level: { value: level },
            xp: { value: xp },
            class: { value: className },
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

  fromActor(actor) {
    const sys = actor.system ?? {};
    return {
      hp_current: sys.attributes?.hp?.value ?? null,
      hp_max: sys.attributes?.hp?.max ?? null,
      xp: sys.details?.xp?.value ?? null,
    };
  },
};
