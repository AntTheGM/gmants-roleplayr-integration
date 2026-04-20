import { MODULE_ID, SETTINGS, DEFAULT_BASE_URL } from "./const.js";
import { logger } from "./util/logger.js";

/**
 * Thin wrapper over the Roleplayr public API (`/api/v1/*`).
 * One instance per session; reads baseUrl and apiKey from world settings.
 *
 * Uses plain JS because the module is installed unbuilt — adding a TS
 * toolchain would complicate Foundry's "drop in and go" workflow. The spec
 * at /openapi.json is still the source of truth; this file is a convenience
 * layer that mirrors its operation names.
 */
export class RoleplayrApi {
  constructor() {
    this._refresh();
  }

  /** Re-read settings (called after user edits in Config dialog). */
  _refresh() {
    this.apiKey = game.settings.get(MODULE_ID, SETTINGS.API_KEY) ?? "";
    this.baseUrl = (game.settings.get(MODULE_ID, SETTINGS.BASE_URL) || DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  get isConfigured() {
    return Boolean(this.apiKey && this.baseUrl);
  }

  async _fetch(path, init = {}) {
    if (!this.isConfigured) {
      throw new Error("Roleplayr API is not configured (missing key or base URL).");
    }
    const url = `${this.baseUrl}/api/v1${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const rateLimit = {
      limit: Number(response.headers.get("X-RateLimit-Limit") ?? 60),
      remaining: Number(response.headers.get("X-RateLimit-Remaining") ?? 0),
      reset: Number(response.headers.get("X-RateLimit-Reset") ?? 0),
    };

    const bodyText = await response.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText;
    }

    if (!response.ok) {
      const message = body?.error?.message ?? response.statusText ?? "Request failed";
      const err = new Error(`[${response.status}] ${message}`);
      err.status = response.status;
      err.code = body?.error?.code ?? null;
      err.details = body?.error?.details ?? null;
      err.rateLimit = rateLimit;
      throw err;
    }
    return { body, rateLimit };
  }

  // --- Reads ---------------------------------------------------------------

  /** @returns {Promise<{ user_id, campaign_id, campaign_name, world_id, world_name, rate_limit }>} */
  async getMe() {
    const { body } = await this._fetch("/me");
    return body;
  }

  async getCampaign() {
    const { body } = await this._fetch("/campaign");
    return body;
  }

  async getWorld() {
    const { body } = await this._fetch("/world");
    return body;
  }

  /**
   * @param {{ type?: string; cursor?: string; limit?: number }} [opts]
   */
  async listEntities(opts = {}) {
    const query = new URLSearchParams();
    if (opts.type) query.set("type", opts.type);
    if (opts.cursor) query.set("cursor", opts.cursor);
    if (opts.limit) query.set("limit", String(opts.limit));
    const suffix = query.toString() ? `?${query}` : "";
    const { body } = await this._fetch(`/entities${suffix}`);
    return body;
  }

  async getEntity(id) {
    const { body } = await this._fetch(`/entities/${id}`);
    return body;
  }

  // --- Writes --------------------------------------------------------------

  /**
   * @param {string} entityId
   * @param {Array<{ element_type_key: string; value: string | number | boolean | null }>} elements
   * @param {{ idempotencyKey?: string }} [opts]
   */
  async patchEntity(entityId, elements, { idempotencyKey } = {}) {
    const headers = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const { body } = await this._fetch(`/entities/${entityId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ elements }),
    });
    return body;
  }

  /**
   * @param {object} state — see FoundryStateRequest in the OpenAPI spec
   */
  async putFoundryState(state) {
    try {
      const { body } = await this._fetch("/foundry/state", {
        method: "PUT",
        body: JSON.stringify(state),
      });
      return { ok: true, body };
    } catch (err) {
      // 409 CAMPAIGN_SYNC_DISABLED and 429 RATE_LIMITED are expected in
      // normal operation — surface them distinctly so the caller can decide
      // whether to retry or silently drop.
      if (err.status === 409 || err.status === 429) {
        logger.debug(`Foundry state push soft-rejected: ${err.code ?? err.status}`);
        return { ok: false, status: err.status, code: err.code, error: err };
      }
      throw err;
    }
  }
}
