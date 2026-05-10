import { app, BrowserWindow } from "electron";
import { closeDb, initDb } from "./db.js";
import { registerTrpcIpc } from "./ipc.js";
import { logger } from "./lib/logger.js";
import { seedIfEmpty } from "./seed.js";
import { createMainWindow } from "./window.js";

async function bootstrap() {
  initDb();
  seedIfEmpty();
  registerTrpcIpc();

  await app.whenReady();
  logger.info({ platform: process.platform, electron: process.versions.electron }, "app ready");
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  closeDb();
  logger.info("shutdown");
});

bootstrap().catch((err) => {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  process.stderr.write(`bootstrap failed: ${message}\n`);
  logger.error({ err: message }, "bootstrap failed");
  app.exit(1);
});

export type { AppRouter } from "./routers/_app.js";
