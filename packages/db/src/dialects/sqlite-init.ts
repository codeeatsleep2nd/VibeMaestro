import type Database from "better-sqlite3";

/**
 * SQLite-specific initialization. v1 ships SQLite. The repository pattern
 * keeps a future Postgres swap to a driver replacement, not a multi-week refactor:
 * just create a `dialects/postgres-init.ts` and switch the import in client.ts.
 *
 * - WAL mode: concurrent readers + one writer; survives crashes
 * - foreign_keys: enforce ON DELETE CASCADE on runs → tasks
 * - synchronous = NORMAL: WAL-safe; ~3x faster than FULL
 * - wal_autocheckpoint: prevents WAL from growing unbounded
 */
export function applySqlitePragmas(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("wal_autocheckpoint = 1000");
}
