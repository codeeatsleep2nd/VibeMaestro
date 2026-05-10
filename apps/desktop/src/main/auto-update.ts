import { app } from "electron";
import { childLogger } from "./lib/logger.js";

const log = childLogger({ module: "auto-update" });

/**
 * electron-updater wiring. Activated only in packaged builds — in dev the
 * import would fail because the publisher metadata isn't present. Plan #9
 * keeps this thin; the GitHub Releases provider in `electron-builder.yml`
 * is what tells the updater where to look.
 */
export async function initAutoUpdater(): Promise<void> {
  if (!app.isPackaged) {
    log.info("auto-updater skipped — not a packaged build");
    return;
  }
  // Lazy-import so dev runs don't fail when electron-updater isn't installed.
  try {
    const mod = await import("electron-updater");
    const { autoUpdater } = mod;
    autoUpdater.logger = {
      // electron-updater's logger interface mirrors `console`.
      info: (msg: unknown) => log.info({ msg }),
      warn: (msg: unknown) => log.warn({ msg }),
      error: (msg: unknown) => log.error({ msg }),
      debug: (msg: unknown) => log.debug({ msg }),
    } as unknown as typeof autoUpdater.logger;

    autoUpdater.on("update-available", (info: unknown) => {
      log.info({ info }, "update available");
    });
    autoUpdater.on("update-downloaded", (info: unknown) => {
      log.info({ info }, "update downloaded — will install on quit");
    });
    autoUpdater.on("error", (err: Error) => {
      log.warn({ err: err.message }, "auto-updater error");
    });

    await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "electron-updater not available — skipping",
    );
  }
}
