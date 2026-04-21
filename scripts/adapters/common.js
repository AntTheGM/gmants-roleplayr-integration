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
