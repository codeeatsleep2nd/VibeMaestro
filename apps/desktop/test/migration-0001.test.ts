import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Migration boot test. This is the test that would have caught the bootstrap
 * crash plan #11 shipped with — under production conditions:
 *   - `PRAGMA foreign_keys = ON` (per sqlite-init.ts).
 *   - Multi-statement migration split by `--> statement-breakpoint`.
 *   - `runs.task_id REFERENCES tasks(id)` survives the 12-step rebuild.
 *
 * NOTE: bun:test cannot load better-sqlite3 (known limitation:
 * https://github.com/oven-sh/bun/issues/4290 — same gap that skips 4 PTY tests).
 * Drizzle's migrator wraps each file in a transaction; we replicate that here
 * with a manual BEGIN/COMMIT around the chunked statements so the test stays
 * faithful to the production execution. The Drizzle-wrapper-specific failure
 * surface (e.g. statement-breakpoint splitting) is covered by the boot
 * smoke-test (Stop hook running `bun desktop:dev` for ~10s); this test covers
 * the SQL content.
 */

function fixturesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../../packages/db/migrations/sqlite");
}

function readMigration(filename: string): string {
  return readFileSync(resolve(fixturesDir(), filename), "utf8");
}

/**
 * Run a migration file the way Drizzle's better-sqlite3 migrator would: open a
 * transaction, split on `--> statement-breakpoint`, run each chunk via `db.run()`,
 * commit. Comments are tolerated; empty chunks are skipped.
 */
function runMigrationFile(db: Database, sql: string): void {
  const chunks = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.split("\n").every((line) => line.trim().startsWith("--")));

  db.exec("BEGIN");
  try {
    for (const chunk of chunks) db.exec(chunk);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors — the original is what we want to surface.
    }
    throw err;
  }
}

function applyProductionPragmas(db: Database): void {
  // Mirror packages/db/src/dialects/sqlite-init.ts so tests reproduce prod state.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = NORMAL");
}

describe("migration 0001_workspaces", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProductionPragmas(db);
    runMigrationFile(db, readMigration("0000_init.sql"));
  });

  test("0001 runs cleanly with PRAGMA foreign_keys = ON", () => {
    expect(() => runMigrationFile(db, readMigration("0001_workspaces.sql"))).not.toThrow();
  });

  test("ws_local row exists with the lazy-fill sentinel (path='', default_agent_id=NULL)", () => {
    runMigrationFile(db, readMigration("0001_workspaces.sql"));
    const row = db
      .prepare("SELECT id, label, path, default_agent_id FROM workspaces WHERE id = 'ws_local'")
      .get() as { id: string; label: string; path: string; default_agent_id: string | null };
    expect(row.id).toBe("ws_local");
    expect(row.label).toBe("Local");
    expect(row.path).toBe(""); // sentinel; workspace-service lazy-fills with os.homedir()
    expect(row.default_agent_id).toBeNull(); // D22 — service lazy-fills
  });

  test("REV-S1: both agents at prompt_via='arg' with new args after migration", () => {
    runMigrationFile(db, readMigration("0001_workspaces.sql"));
    const rows = db
      .prepare("SELECT id, command, args, prompt_via FROM agents ORDER BY id")
      .all() as Array<{ id: string; command: string; args: string; prompt_via: string }>;
    expect(rows).toHaveLength(2);
    const claude = rows.find((r) => r.id === "claude-code");
    const codex = rows.find((r) => r.id === "codex");
    expect(claude?.prompt_via).toBe("arg");
    expect(JSON.parse(claude?.args ?? "[]")).toEqual(["--print", "{{prompt}}"]);
    expect(codex?.prompt_via).toBe("arg");
    expect(JSON.parse(codex?.args ?? "[]")).toEqual(["exec", "{{prompt}}"]);
  });

  test("agents.skills column rehydrates as empty JSON array after migration (pre-seed)", () => {
    runMigrationFile(db, readMigration("0001_workspaces.sql"));
    const row = db.prepare("SELECT skills FROM agents WHERE id = 'claude-code'").get() as {
      skills: string;
    };
    expect(JSON.parse(row.skills)).toEqual([]);
  });

  test("pre-existing tasks are backfilled to workspace_id = ws_local", () => {
    // Seed a pre-plan-11 task via the legacy schema (0000 didn't have workspace_id).
    db.exec(
      `INSERT INTO tasks (id,title,prompt,status,agent_id,current_run_id,created_at,updated_at,metadata)
       VALUES ('VM-LEGACY','legacy task','legacy prompt','complete','claude-code',NULL,
               '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','{}')`,
    );

    runMigrationFile(db, readMigration("0001_workspaces.sql"));

    const row = db
      .prepare("SELECT id, workspace_id, phase_skills_override FROM tasks WHERE id = 'VM-LEGACY'")
      .get() as {
      id: string;
      workspace_id: string;
      phase_skills_override: string | null;
    };
    expect(row.workspace_id).toBe("ws_local");
    expect(row.phase_skills_override).toBeNull();
  });

  test("schema has workspaces_label_idx + tasks_workspace_idx after migration", () => {
    runMigrationFile(db, readMigration("0001_workspaces.sql"));
    const indices = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((i) => i.name);
    expect(indices).toContain("tasks_workspace_idx");
    expect(indices).toContain("workspaces_label_idx");
    expect(indices).toContain("status_agent_idx");
  });

  test("foreign_keys is still ON after migration (defer_foreign_keys is per-transaction)", () => {
    runMigrationFile(db, readMigration("0001_workspaces.sql"));
    const result = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(result.foreign_keys).toBe(1);
  });

  test("FK integrity holds — INSERT with bogus workspace_id fails", () => {
    runMigrationFile(db, readMigration("0001_workspaces.sql"));
    expect(() =>
      db.exec(
        `INSERT INTO tasks (id,title,prompt,status,agent_id,workspace_id,current_run_id,phase_skills_override,created_at,updated_at,metadata)
         VALUES ('VM-9002','x','x','backlog','claude-code','ws_does_not_exist',NULL,NULL,
                 '2026-05-11T00:00:00.000Z','2026-05-11T00:00:00.000Z','{}')`,
      ),
    ).toThrow(/FOREIGN KEY constraint failed/i);
  });

  test("UNIQUE label index — duplicate workspace label is rejected (D10)", () => {
    runMigrationFile(db, readMigration("0001_workspaces.sql"));
    db.exec(
      `INSERT INTO workspaces (id,label,path,default_agent_id,phase_skills,created_at,updated_at)
       VALUES ('ws_a','acme-web','/tmp/a','claude-code',
               '{"planning":[],"running":[],"reviewing":[],"complete":[]}',
               '2026-05-11T00:00:00.000Z','2026-05-11T00:00:00.000Z')`,
    );
    expect(() =>
      db.exec(
        `INSERT INTO workspaces (id,label,path,default_agent_id,phase_skills,created_at,updated_at)
         VALUES ('ws_b','acme-web','/tmp/b','claude-code',
                 '{"planning":[],"running":[],"reviewing":[],"complete":[]}',
                 '2026-05-11T00:00:00.000Z','2026-05-11T00:00:00.000Z')`,
      ),
    ).toThrow(/UNIQUE constraint failed: workspaces\.label/i);
  });

  test("ARCH-E2 / GAP-E3 partial-failure rollback: throwing mid-migration leaves 0000 schema intact", () => {
    // Inject a guaranteed-to-fail statement at the end of 0001 to simulate a
    // crash mid-rebuild after tasks_new is built but before the rename. The
    // outer transaction must roll the whole thing back so the original `tasks`
    // table is still present.
    const sql = `${readMigration("0001_workspaces.sql")}\n--> statement-breakpoint\nSELECT * FROM nope_does_not_exist;`;
    expect(() => runMigrationFile(db, sql)).toThrow();
    // After rollback: workspaces table should NOT exist, original tasks SHOULD.
    const tablesRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'")
      .get();
    expect(tablesRow).toBeNull();
    // Original tasks table is intact (it has no workspace_id column).
    const tasksCol = (db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>).map(
      (r) => r.name,
    );
    expect(tasksCol).toContain("agent_id");
    expect(tasksCol).not.toContain("workspace_id"); // proof that the rebuild did not commit
  });
});
