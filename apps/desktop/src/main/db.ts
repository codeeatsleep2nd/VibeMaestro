import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type DbHandle, openDb, runMigrations } from "@vibemaestro/db";
import { dataSqlitePath } from "./config/paths.js";
import { logger } from "./lib/logger.js";

let handle: DbHandle | null = null;

function migrationsFolder(): string {
  // Source: packages/db/migrations/sqlite. Resolve from the bundled main entry —
  // dev: apps/desktop/out/main/index.js, prod (asar): resources/app.asar/out/main/index.js.
  // Rollup leaves a top-level `__dirname`/`__filename` undefined when bundling for ESM,
  // so we always build the path from `import.meta.url`.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../../../packages/db/migrations/sqlite");
}

export function initDb(): DbHandle {
  if (handle) return handle;
  const path = process.env.VM_DB_PATH ?? dataSqlitePath();
  logger.info({ path }, "opening sqlite database");
  handle = openDb(path);
  runMigrations(handle, migrationsFolder());
  logger.info("migrations applied");
  return handle;
}

export function getDb(): DbHandle {
  if (!handle) throw new Error("Database not initialized — call initDb() first");
  return handle;
}

export function closeDb(): void {
  if (handle) {
    handle.close();
    handle = null;
  }
}

/**
 * Test hook — open an in-memory DB and run migrations. Returns a fresh handle
 * each call so test files don't share state.
 */
export function resetDbForTesting(): DbHandle {
  if (handle) handle.close();
  handle = openDb(":memory:");
  runMigrations(handle, migrationsFolder());
  return handle;
}
