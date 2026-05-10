import { app } from "electron";
import { closeDb } from "./db.js";
import { childLogger } from "./lib/logger.js";
import { runDispatcher } from "./services/run-dispatcher.js";

const log = childLogger({ module: "lifecycle" });

/**
 * Cleanup hooks for the app shutdown path. Call once after `app.whenReady()`.
 *
 * Any future long-lived resource (sockets, file watchers, IPC subscribers)
 * registers its cleanup here so we don't leave orphaned children when the
 * user quits via ⌘Q.
 */
export function registerLifecycleHooks(): void {
  app.on("before-quit", () => {
    const orphans = runDispatcher.killAll();
    closeDb();
    log.info({ orphans_killed: orphans }, "shutdown complete");
  });
}
