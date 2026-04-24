/**
 * Adapter contract — one per Foundry game system.
 *
 * Each adapter converts a Roleplayr entity (`{ id, entity_type, name,
 * elements[], images[], tags[] }`) into the shape Foundry expects when
 * creating an Actor/Item, and reverse-maps Foundry Actor changes into the
 * element-level PATCH payload Roleplayr accepts.
 *
 * @typedef {object} RoleplayrElement
 * @property {string} element_type_key
 * @property {string | null} data_type
 * @property {string | number | boolean | null} value
 *
 * @typedef {object} RoleplayrEntity
 * @property {string} id
 * @property {string} entity_type
 * @property {string} name
 * @property {RoleplayrElement[]} elements
 * @property {Array<{ url: string; is_primary: boolean }>} images
 * @property {string[]} tags
 *
 * @typedef {object} FoundryImportSpec
 * @property {"Actor" | "Item" | "JournalEntry"} documentType
 * @property {object} data — passed directly to `Actor.create(data)` etc.
 *
 * @typedef {object} SyncableFields
 * @property {number=} hp_current
 * @property {number=} hp_max
 * @property {number=} xp
 *
 * @typedef {object} ToFoundryOptions
 * @property {"character" | "npc"=} targetType — override actor sheet type
 *   regardless of the Roleplayr entity_type. Defaults to adversary→npc,
 *   everything else→character.
 *
 * @typedef {object} SystemAdapter
 * @property {(entity: RoleplayrEntity, options?: ToFoundryOptions) => FoundryImportSpec} toFoundry
 * @property {(actor: Actor) => SyncableFields} fromActor
 */

export function pickElement(entity, key) {
  return entity.elements?.find((e) => e.element_type_key === key) ?? null;
}

export function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function primaryImage(entity) {
  const primary = entity.images?.find((i) => i.is_primary);
  return primary?.url ?? entity.images?.[0]?.url ?? null;
}

/** Convenience: pull a single element_type_key value off the entity. */
export function elementValue(entity, key) {
  return entity.elements?.find((e) => e.element_type_key === key)?.value ?? null;
}

/**
 * Shared JournalEntry builder for locations and events. System-agnostic —
 * JournalEntry is a base Foundry document, not system-specific, so both
 * dnd5e and pf2e delegate here.
 *
 * The element_type_keys vary slightly across entity types; we try a handful
 * of common description-shaped keys in priority order. The resulting page
 * is HTML-format with the primary image inlined at the top when present.
 */
export function toFoundryJournalDefault(entity) {
  const MODULE_ID = "gmants-roleplayr-integration";

  const descriptionKeys = [
    "description",
    "overview",
    "summary",
    "details",
    "notes",
    "recap",
    "session_recap",
  ];
  let description = "";
  for (const key of descriptionKeys) {
    const value = elementValue(entity, key);
    if (typeof value === "string" && value.trim()) {
      description = value;
      break;
    }
  }

  const img = primaryImage(entity);
  const imageHtml = img ? `<p><img src="${img}" /></p>` : "";
  const content =
    imageHtml + (description || "<p><em>No description provided.</em></p>");

  return {
    documentType: "JournalEntry",
    data: {
      name: entity.name || "Unnamed",
      pages: [
        {
          name: entity.name || "Overview",
          type: "text",
          text: {
            format: 1, // 1 = HTML
            content,
          },
        },
      ],
      flags: {
        [MODULE_ID]: {
          roleplayr_id: entity.id,
          roleplayr_type: entity.entity_type,
          synced_at: new Date().toISOString(),
        },
      },
    },
  };
}
