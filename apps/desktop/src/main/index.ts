import { app, BrowserWindow } from "electron";
import { initDb } from "./db.js";
import { registerTrpcIpc } from "./ipc.js";
import { logger } from "./lib/logger.js";
import { registerLifecycleHooks } from "./lifecycle.js";
import { seedIfEmpty } from "./seed.js";
import { createAgentService } from "./services/agent-service.js";
import { createMainWindow } from "./window.js";

async function bootstrap() {
  initDb();
  seedIfEmpty();
  registerTrpcIpc();
  registerLifecycleHooks();

  await app.whenReady();
  logger.info({ platform: process.platform, electron: process.versions.electron }, "app ready");
  createMainWindow();

  // Probe agents in the background after the window is up so the empty-state
  // copy and conductor strip can show real availability without forcing the
  // user to trigger probes manually. Failure is non-fatal — the agent stays
  // marked unavailable until the user retries via agents.probe.
  void createAgentService()
    .probeAll()
    .catch((err) =>
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "probeAll failed"),
    );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

bootstrap().catch((err) => {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  process.stderr.write(`bootstrap failed: ${message}\n`);
  logger.error({ err: message }, "bootstrap failed");
  app.exit(1);
});

export type { AppRouter } from "./routers/_app.js";
