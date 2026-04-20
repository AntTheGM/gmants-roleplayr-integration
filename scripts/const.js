export const MODULE_ID = "gmants-roleplayr-integration";

/** Default production host for Roleplayr. Overridable via module settings. */
export const DEFAULT_BASE_URL = "https://www.roleplayr.net";

/**
 * Settings keys — using one const per key so a typo fails at lint time
 * instead of silently reading undefined.
 */
export const SETTINGS = Object.freeze({
  API_KEY: "apiKey",
  BASE_URL: "baseUrl",
  BINDING: "binding",
  ACTOR_SYNC_ENABLED: "actorSyncEnabled",
  COMBAT_SYNC_ENABLED: "combatSyncEnabled",
});

/**
 * Hook debounce — Foundry batches Actor updates during combat rolls, and we
 * don't want to hammer the Roleplayr rate limit (60/min). 2 seconds is a
 * comfortable middle ground.
 */
export const ACTOR_SYNC_DEBOUNCE_MS = 2000;

/** Combat state pushes are rate-limited server-side to 1/sec per campaign. */
export const COMBAT_SYNC_MIN_INTERVAL_MS = 1100;
