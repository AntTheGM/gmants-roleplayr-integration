import { MODULE_ID, SETTINGS, PUSH_POLL_INTERVAL_MS } from "../const.js";
import { logger } from "../util/logger.js";
import { PushReviewDialog } from "../dialog/PushReviewDialog.js";

/**
 * Pull-based delivery of queued pushes from Roleplayr.
 *
 * Primary trigger: GM invokes `pullNow()` via the sidebar button or a hotbar
 * macro. Secondary: a 5-minute background timer catches anything the GM
 * forgot to manually pull. No adaptive intervals, no rate-limit plumbing —
 * the worst-case traffic (12 polls/hour + a handful of manual pulls) is
 * well under the 60/min key quota.
 */
export class PushSync {
  static instance = null;

  static register() {
    if (!game.user?.isGM) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.PUSH_SYNC_ENABLED)) return;
    PushSync.instance = new PushSync();
    PushSync.instance.startBackgroundPoll();
    return PushSync.instance;
  }

  constructor() {
    this.timer = null;
    this.openDialog = null;
    this.inFlight = false;
  }

  startBackgroundPoll() {
    if (this.timer) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.PUSH_BACKGROUND_POLL_ENABLED)) return;
    this.timer = setInterval(
      () => void this.pullNow({ silent: true }),
      PUSH_POLL_INTERVAL_MS
    );
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Called by:
   *   - the sidebar "Pull from Roleplayr" button
   *   - GM-bound hotbar macros via `game.gmantsRoleplayr.pullPushes()`
   *   - the 5-minute background timer (with { silent: true })
   *
   * `silent` suppresses the "No pending pushes" toast so the background
   * poll doesn't spam the notification area.
   */
  async pullNow({ silent = false } = {}) {
    if (this.inFlight) {
      if (!silent) ui.notifications.info("Already pulling from Roleplayr…");
      return;
    }
    this.inFlight = true;
    try {
      const api = game.gmantsRoleplayr?.api;
      if (!api?.isConfigured) {
        if (!silent) {
          ui.notifications.warn(
            "Roleplayr API key not configured. Open Module Settings → GMAnt's Roleplayr Integration → Configure Roleplayr."
          );
        }
        return;
      }

      const response = await api.listFoundryPushes({ limit: 50 });
      const pending = response.data ?? [];

      if (pending.length === 0) {
        if (!silent) ui.notifications.info("No pending pushes from Roleplayr.");
        return;
      }

      await this.#presentPushes(pending);
    } catch (err) {
      logger.warn("Pull from Roleplayr failed", err);
      if (!silent) {
        ui.notifications.error(
          `Pull from Roleplayr failed: ${err.message ?? err}`
        );
      }
    } finally {
      this.inFlight = false;
    }
  }

  async #presentPushes(rows) {
    // Fetch full entity payloads in parallel. Cache by push-row id so the
    // review dialog can show names/images without a second round trip.
    const api = game.gmantsRoleplayr.api;
    const entitiesByPushId = new Map();
    await Promise.all(
      rows.map(async (row) => {
        try {
          const entity = await api.getEntity(row.entity_id);
          entitiesByPushId.set(row.id, entity);
        } catch (err) {
          logger.warn("Failed to fetch entity for push", {
            push: row.id,
            err,
          });
        }
      })
    );

    if (this.openDialog) {
      this.openDialog.mergePending(rows, entitiesByPushId);
      return;
    }

    this.openDialog = new PushReviewDialog({
      pending: rows,
      entitiesByPushId,
      onDone: () => {
        this.openDialog = null;
      },
    });
    await this.openDialog.render(true);
  }
}
