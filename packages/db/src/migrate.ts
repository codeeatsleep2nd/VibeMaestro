import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { DbHandle } from "./client.js";

/**
 * Run all pending migrations against the open DB. Idempotent — Drizzle tracks
 * applied migrations in `__drizzle_migrations`. Safe to call on every app start.
 */
export function runMigrations(handle: DbHandle, migrationsFolder: string): void {
  migrate(handle.db, { migrationsFolder });
}
