import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { applySqlitePragmas } from "./dialects/sqlite-init.js";
import * as schema from "./schema.js";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;
export type DbHandle = { db: DbClient; raw: Database.Database; close: () => void };

export function openDb(filePath: string): DbHandle {
  if (filePath !== ":memory:") {
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  }
  const raw = new Database(filePath);
  applySqlitePragmas(raw);
  const db = drizzle(raw, { schema });
  return {
    db,
    raw,
    close: () => raw.close(),
  };
}
