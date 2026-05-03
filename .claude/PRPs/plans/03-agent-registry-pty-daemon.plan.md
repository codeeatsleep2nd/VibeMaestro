# Plan 03: Agent Registry & PTY Daemon

## Summary
Land the `Agent` resource (`API.md §5.3`) and turn the parked `Run` rows from plan #2 into real agent processes spawned in a PTY. Implements `@vibemaestro/pty-daemon`: per-run PTY lifecycle, transcript capture to disk, throttled byte counting, agent registry CRUD with a probe action, and the seam that flips `running → reviewing/error` based on the agent's exit code.

## User Story
As a developer running VibeMaestro,
I want my local Claude Code (or Codex) process to actually start when I press Run, capture its output, and report success/failure back to the board,
So that the lifecycle modeled in plan #2 is no longer hypothetical.

## Problem → Solution
- **Current state (after plan #2):** `tasks.run` creates a `Run` row in `running` state. Nothing happens. `runService_internal.markFinished` exists but no caller exists.
- **Desired state:** `tasks.run` spawns the configured agent in a PTY, streams its output to a transcript file under `~/.vibemaestro/runs/<run_id>.transcript`, increments `runs.bytes_emitted` on a 250ms tick, and on process exit calls `runService_internal.markFinished(runId, …)` — flipping the task to `reviewing` (exit 0) or `error` (non-zero). `tasks.cancel` kills the process. `runs.getTranscript` returns the captured file. `runs.getDiff` remains a stub (real diff needs a project-root concept; v1.5 TODO).

## Metadata
- **Complexity:** Large
- **Source PRD:** N/A — derived from `API.md §5.3`, `§7` (terminal proto preview), `DESIGN.md §5`
- **PRD Phase:** N/A — plan 3 of 8
- **Estimated Files:** ~30
- **Confidence Score:** 7/10 — main risks are `node-pty` ABI rebuild (already addressed in plan #1) and PATH resolution for the spawn target on macOS GUI launches

---

## UX Design

N/A — backend/runtime layer. Plan #6 surfaces these mechanics in the board UI; plan #7 surfaces the live PTY in the detail panel via plan #5's bridge.

---

## Mandatory Reading

| Priority | File | Section/Lines | Why |
|---|---|---|---|
| **P0** | `API.md` | §5.3 (Agent schema + adapter contract), §11 (TODOs) | Defines what an "agent" is and how it's spawned |
| **P0** | `.claude/PRPs/plans/02-task-run-resources.plan.md` | "Plan-#2 → Plan-#3 contract" Notes section | The four hooks this plan must wire (`markFinished`, `incrementBytes`, dispatcher, kill-on-cancel) |
| **P0** | `apps/desktop/src/main/services/{task-service.ts,run-service-internal.ts}` | full | The existing seam this plan plugs into |
| **P0** | `packages/db/src/schema.ts` | full | The schema this plan extends with the `agents` table |
| **P1** | `DESIGN.md` | §5 (agent identity), §10 (status states + agent chip) | Informs the seed data shape (label, monogram, hue, tier) |
| **P2** | `apps/desktop/src/main/config/paths.ts` | full | Path-resolver pattern to extend with `transcriptPath()` and `runDir()` |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| **node-pty** | `github.com/microsoft/node-pty` | `^1.0` | `pty.spawn(file, args, opts)` returns an `IPty` with `onData`, `onExit`, `write`, `kill`, `resize`. Works in Electron's main process with the standard ABI rebuild. |
| **node-pty + Electron** | `github.com/microsoft/node-pty#electron` | — | The `electron-builder install-app-deps` from plan #1 handles the rebuild. No extra config needed. |
| **fix-path / shell-env** | `github.com/sindresorhus/shell-path` | `^7` | macOS GUI Electron launches with a stripped PATH (just `/usr/bin:/bin`). To find `claude`, `codex`, etc. that the user installed via `brew` or in `~/.local/bin`, we resolve the user's login-shell PATH on first launch. |
| **better-sqlite3 INSERT OR IGNORE** | `sqlite.org/lang_insert.html` | — | Idempotent seed inserts for default agents — re-running the migration on a DB that already has Claude Code registered is a no-op. |
| **Node fs.createWriteStream** | `nodejs.org/api/fs.html#fscreatewritestreampath-options` | Node 20+ | Append-mode write stream for transcripts. Backpressure-aware via `.write()` returning false; we don't need to honor backpressure for v1 (PTY rates are well under stream throughput) but document the assumption. |

```
KEY_INSIGHT: Electron on macOS launched from the Dock or Finder inherits a minimal PATH
            (typically /usr/bin:/bin), NOT the user's interactive shell PATH.
APPLIES_TO: lib/path-helper.ts — resolve and cache the shell PATH on first agent spawn
GOTCHA:     Calling `claude` directly will fail with ENOENT for users who installed it
            via brew/asdf/mise/etc. Use the resolved PATH or accept absolute commands only.

KEY_INSIGHT: node-pty + Electron require the binary to be rebuilt against Electron's
            Node ABI. Plan #1 added `electron-builder install-app-deps` to postinstall.
APPLIES_TO: apps/desktop/package.json — add node-pty to dependencies and trustedDependencies.
GOTCHA:     If you skip this, the app crashes at first spawn with NODE_MODULE_VERSION
            mismatch. Test locally after every fresh `bun install`.

KEY_INSIGHT: PTY data chunks arrive frequently (every few ms during interactive output).
            Updating runs.bytes_emitted on every chunk overwhelms SQLite with writes.
APPLIES_TO: pty-daemon/src/byte-throttle.ts
GOTCHA:     Buffer chunks; flush every 250ms or every 4 KB. On PTY exit, flush
            once more before calling markFinished so the final count is accurate.

KEY_INSIGHT: node-pty's onExit gives you both exit code AND signal. We treat
            signal !== 0 as a non-clean exit (the PTY was killed) which maps
            to either "cancelled" (we sent the signal) or "failed" (something else).
APPLIES_TO: dispatcher's exit handler
GOTCHA:     Distinguish "we cancelled it" (set a flag in the registry before kill)
            from "it crashed" (no flag set) so the run.outcome is correct.
```

---

## Patterns to Establish

> Plan #3 establishes the runtime/process-lifecycle patterns that plans #5 (terminal IPC bridge) and #6+ (renderer wiring) will mirror.

### AGENT_REGISTRY_PATTERN — agents are data, not code

```ts
// packages/core/src/schemas/agent.ts
import { z } from "zod";

export const agentTierSchema = z.enum(["v1", "future"]);
export const promptViaSchema = z.enum(["stdin", "arg"]);

export const agentSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),  // kebab id
  label: z.string().min(1).max(80),
  monogram: z.string().regex(/^[A-Z0-9]{2}$/),
  hue: z.string().regex(/^oklch\(/),                         // matches design-tokens.json
  tier: agentTierSchema,
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  cwd: z.string().nullable(),
  prompt_via: promptViaSchema,
  available: z.boolean(),
  version: z.string().nullable(),
  registered_at: z.string().datetime(),
});
export type Agent = z.infer<typeof agentSchema>;

export const createAgentInput = agentSchema.pick({
  id: true, label: true, monogram: true, hue: true, tier: true,
  command: true, args: true, env: true, cwd: true, prompt_via: true,
});
export const updateAgentInput = createAgentInput.partial().extend({ id: z.string() });
```

**Rule:** new agents are added by inserting a row, not by writing code. Plan #3 ships Claude Code and Codex via migration seed; users add Cursor/Aider/etc. through `agents.create`.

### PTY_SPAWN_PATTERN — one entry, returns a handle

```ts
// packages/pty-daemon/src/spawn.ts
import * as pty from "node-pty";
import type { Agent } from "@vibemaestro/core";

export type SpawnedRun = {
  runId: string;
  pid: number;
  startedAt: Date;
  ipty: pty.IPty;
  cancelled: boolean;       // set true by cancel() before we issue the kill
};

export type SpawnOptions = {
  runId: string;
  agent: Agent;
  prompt: string;
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
};

export function spawnAgent(opts: SpawnOptions): SpawnedRun {
  const args = opts.agent.prompt_via === "arg"
    ? opts.agent.args.map((a) => a.replace("{{prompt}}", opts.prompt))
    : opts.agent.args;
  const ipty = pty.spawn(opts.agent.command, args, {
    name: "xterm-color",
    cols: opts.cols ?? 120,
    rows: opts.rows ?? 30,
    cwd: opts.cwd,
    env: { ...opts.env, ...opts.agent.env },
  });
  if (opts.agent.prompt_via === "stdin") ipty.write(opts.prompt + "\n");
  return { runId: opts.runId, pid: ipty.pid, startedAt: new Date(), ipty, cancelled: false };
}
```

**Rule:** `spawnAgent` is the **only** code in the codebase that calls `pty.spawn`. Everywhere else passes through `dispatcher`.

### WORK_DISPATCH_PATTERN — interim until plan #4's event bus

```ts
// apps/desktop/src/main/services/run-dispatcher.ts
import { spawnAgent, type SpawnedRun } from "@vibemaestro/pty-daemon";
import { runService_internal } from "./run-service-internal";
import { agentService } from "./agent-service";
import { transcriptWriter } from "@vibemaestro/pty-daemon/transcript-writer";
import { byteThrottle } from "@vibemaestro/pty-daemon/byte-throttle";
import { runDir, transcriptPath } from "../config/paths";
import { resolveShellPath } from "../lib/path-helper";
import { logger } from "../lib/logger";
import { mkdirSync } from "node:fs";

const live = new Map<string, SpawnedRun>();

export const runDispatcher = {
  async start(runId: string, taskPrompt: string, agentId: string): Promise<void> {
    const agent = await agentService.requireById(agentId);
    if (!agent.available) throw new AppError("agent_unavailable", `${agent.label} is not on PATH`);
    const cwd = agent.cwd ?? process.env.HOME!;
    mkdirSync(runDir(runId), { recursive: true, mode: 0o700 });
    const writer = transcriptWriter(transcriptPath(runId));
    const flush = byteThrottle(250, (n) => runService_internal.incrementBytes(runId, n));
    const env = { ...process.env, PATH: await resolveShellPath() };

    const handle = spawnAgent({ runId, agent, prompt: taskPrompt, cwd, env: env as Record<string, string> });
    live.set(runId, handle);

    handle.ipty.onData((chunk) => { writer.write(chunk); flush.add(chunk.length); });
    handle.ipty.onExit(({ exitCode, signal }) => {
      flush.flushNow();
      writer.close();
      live.delete(runId);
      const outcome = handle.cancelled ? "cancelled" : exitCode === 0 ? "succeeded" : "failed";
      runService_internal.markFinished(runId, { outcome, exit_code: exitCode, bytes_emitted: writer.bytesWritten });
      logger.info({ run_id: runId, exit_code: exitCode, signal, outcome }, "run ended");
    });
  },

  cancel(runId: string): void {
    const h = live.get(runId);
    if (!h) return;
    h.cancelled = true;
    h.ipty.kill("SIGTERM");
    setTimeout(() => { if (live.has(runId)) live.get(runId)!.ipty.kill("SIGKILL"); }, 2000);
  },

  killAll(): void {
    for (const h of live.values()) { h.cancelled = true; h.ipty.kill("SIGKILL"); }
    live.clear();
  },

  isRunning(runId: string): boolean { return live.has(runId); },
};
```

**Rule:** `taskService.run` calls `runDispatcher.start` (out of transaction); `taskService.cancel`/`discardRun` call `runDispatcher.cancel`. Plan #4 will replace the direct call from `taskService` with an event-bus subscription, but the dispatcher's surface stays identical.

### TRANSCRIPT_CAPTURE_PATTERN — append-only file with a byte counter

```ts
// packages/pty-daemon/src/transcript-writer.ts
import { createWriteStream, type WriteStream } from "node:fs";

export function transcriptWriter(path: string) {
  const stream: WriteStream = createWriteStream(path, { flags: "a", mode: 0o600 });
  let bytesWritten = 0;
  return {
    write(chunk: string) {
      const buf = Buffer.from(chunk, "utf8");
      stream.write(buf);
      bytesWritten += buf.byteLength;
    },
    close() { stream.end(); },
    get bytesWritten() { return bytesWritten; },
  };
}
```

**Rule:** transcripts are flat UTF-8 text on disk. No structured logs. The terminal IPC bridge (plan #5) reads from the same stream.

### PROCESS_LIFECYCLE_PATTERN — kill on app quit

```ts
// apps/desktop/src/main/lifecycle.ts
import { app } from "electron";
import { runDispatcher } from "./services/run-dispatcher";
import { closeDb } from "@vibemaestro/db";
import { logger } from "./lib/logger";

export function registerLifecycleHooks() {
  app.on("before-quit", () => {
    const count = runDispatcher.killAll();
    closeDb();
    logger.info({ orphans_killed: count }, "shutdown complete");
  });
}
```

**Rule:** any future long-lived resource (sockets, file watchers, etc.) registers its cleanup here.

### FAKE_AGENT_FIXTURE_PATTERN — tests don't spawn real LLMs

```bash
# apps/desktop/test/fixtures/fake-agents/echo-success.sh
#!/usr/bin/env bash
read -r prompt
printf 'received: %s\n' "$prompt"
exit 0
```

```ts
// apps/desktop/test/pty-spawn.test.ts (excerpt)
const fakeAgent = {
  id: "fake-success", label: "Fake Success", monogram: "FS",
  hue: "oklch(72% 0.13 145)", tier: "v1" as const,
  command: join(__dirname, "fixtures/fake-agents/echo-success.sh"),
  args: [], env: {}, cwd: null, prompt_via: "stdin" as const,
  available: true, version: "1.0.0",
  registered_at: new Date().toISOString(),
};
```

**Rule:** tests use shell scripts with deterministic exit codes and output. Never invoke real Claude Code / Codex in tests.

---

## Files to Change

### `@vibemaestro/core`

| File | Action | Justification |
|---|---|---|
| `packages/core/src/schemas/agent.ts` | CREATE | `agentSchema`, `createAgentInput`, `updateAgentInput`, `agentTierSchema`, `promptViaSchema` (canonical pattern) |
| `packages/core/src/index.ts` | UPDATE | Re-export from `./schemas/agent` |

### `@vibemaestro/db`

| File | Action | Justification |
|---|---|---|
| `packages/db/src/schema.ts` | UPDATE | Add `agents` table |
| `packages/db/src/migrations/0002_agents.sql` | CREATE | Generated by drizzle-kit; **manually augmented** with CHECK on `tier` and `prompt_via`, and seed `INSERT OR IGNORE` for Claude Code + Codex |
| `packages/db/src/migrations/meta/0002_snapshot.json` | CREATE | drizzle-kit auto-emits |
| `packages/db/src/migrations/meta/_journal.json` | UPDATE | drizzle-kit auto-updates |
| `packages/db/src/repositories/agent-repo.ts` | CREATE | `agentRepo(db)`: `findById`, `list`, `insert`, `patch`, `delete`, `markProbed(id, available, version)` |
| `packages/db/src/index.ts` | UPDATE | Export agent-repo |

### `@vibemaestro/pty-daemon` — replaces the placeholder from plan #1

| File | Action | Justification |
|---|---|---|
| `packages/pty-daemon/package.json` | UPDATE | Add `node-pty@^1.0` dep; declare `engines: { electron: ">=33" }` for clarity |
| `packages/pty-daemon/src/index.ts` | REPLACE | Re-export `spawnAgent`, `transcriptWriter`, `byteThrottle`, `probeAgent`, types |
| `packages/pty-daemon/src/spawn.ts` | CREATE | Canonical pattern above |
| `packages/pty-daemon/src/transcript-writer.ts` | CREATE | Canonical pattern above |
| `packages/pty-daemon/src/byte-throttle.ts` | CREATE | 250ms / 4KB throttle helper (see Task 9) |
| `packages/pty-daemon/src/probe.ts` | CREATE | `probeAgent(agent)` — runs `command --version`, captures first stdout line, 2s timeout |
| `packages/pty-daemon/src/types.ts` | CREATE | `SpawnedRun`, `SpawnOptions`, `ProbeResult` |

### `apps/desktop` (main process)

| File | Action | Justification |
|---|---|---|
| `apps/desktop/package.json` | UPDATE | Add `@vibemaestro/pty-daemon` dep (already a workspace placeholder); add `node-pty` to `trustedDependencies` for native rebuild |
| `apps/desktop/src/main/config/paths.ts` | UPDATE | Add `runDir(runId)`, `transcriptPath(runId)` (both rooted at `~/.vibemaestro/runs/`) |
| `apps/desktop/src/main/lib/path-helper.ts` | CREATE | `resolveShellPath()` — runs `/bin/zsh -lc 'echo $PATH'` (or `$SHELL -lc`) once per process, caches result. Cross-platform: returns `process.env.PATH` on Windows. |
| `apps/desktop/src/main/services/agent-service.ts` | CREATE | CRUD + `probe(id)` (calls `probeAgent` from pty-daemon, persists result via `agentRepo.markProbed`) |
| `apps/desktop/src/main/services/run-dispatcher.ts` | CREATE | Canonical pattern above |
| `apps/desktop/src/main/services/task-service.ts` | UPDATE | After `db.transaction()` returns from `run()`/`retry()`, call `runDispatcher.start(runId, task.prompt, task.agent_id)` (NOT in the transaction). In `cancel()`/`discardRun()`, call `runDispatcher.cancel(runId)` after the transaction. |
| `apps/desktop/src/main/services/run-service.ts` | UPDATE | Implement real `getTranscript(taskId, runId)` — reads from `transcriptPath(runId)` if file exists, returns `not_found` envelope otherwise. `getDiff` remains stubbed (see "NOT Building"). |
| `apps/desktop/src/main/lifecycle.ts` | CREATE | Canonical pattern above |
| `apps/desktop/src/main/index.ts` | UPDATE | Call `registerLifecycleHooks()` after `whenReady()` |
| `apps/desktop/src/main/routers/agents.ts` | CREATE | tRPC router: `list`, `get`, `create`, `update`, `delete`, `probe` |
| `apps/desktop/src/main/routers/_app.ts` | UPDATE | Compose `agentsRouter` |

### Tests

| File | Action | Justification |
|---|---|---|
| `apps/desktop/test/fixtures/fake-agents/echo-success.sh` | CREATE | Reads stdin, prints, exits 0 |
| `apps/desktop/test/fixtures/fake-agents/echo-fail.sh` | CREATE | Reads stdin, prints, exits 1 |
| `apps/desktop/test/fixtures/fake-agents/long-running.sh` | CREATE | Reads stdin, sleeps 30s; used for cancel tests (test sends SIGTERM ≤ 1s in) |
| `apps/desktop/test/fixtures/fake-agents/uses-arg.sh` | CREATE | Reads $1; for `prompt_via: "arg"` test |
| `apps/desktop/test/agents.test.ts` | CREATE | CRUD + probe (probes a fake agent script that prints `1.2.3` and exits 0) + delete-conflict when a task references the agent |
| `apps/desktop/test/pty-spawn.test.ts` | CREATE | `spawnAgent` happy path (echo-success); `prompt_via: "arg"`; cwd; env |
| `apps/desktop/test/transcript.test.ts` | CREATE | `transcriptWriter` writes UTF-8 with byte counter; concurrent writes preserve order; `getTranscript` returns content |
| `apps/desktop/test/byte-throttle.test.ts` | CREATE | Pure-function test: chunks aggregated, flushed at 250ms boundary or 4KB threshold |
| `apps/desktop/test/run-dispatcher.test.ts` | CREATE | Full lifecycle: `tasks.run` → fake-agent runs → exit 0 → task is `reviewing`. Same with `echo-fail.sh` → task is `error`. Same with `long-running.sh` + `tasks.cancel` → task is `blocked`, run `cancelled`. |
| `apps/desktop/test/path-helper.test.ts` | CREATE | Mock `process.env.SHELL`; verify shell PATH is captured; verify cache is reused |

### Documentation

| File | Action | Justification |
|---|---|---|
| `API.md` | UPDATE §5.2 + §5.3 | §5.2: replace plan #2's "stub" note for `getTranscript` with "available after plan #3"; keep `getDiff` stub note. §5.3: cross-reference plan #3 as the implementation. |

---

## NOT Building

- **Real diff computation.** `runs.getDiff` stays stubbed (returns `not_found`). Real diff requires:
  1. A "project root" concept on Task (which directory the agent operates in).
  2. Either git awareness or before/after file snapshotting.
  Both are non-trivial product decisions; track as a v1.5 TODO. Document in `API.md §11`.
- **Live PTY in the renderer.** Plan #5 ships the IPC binary channel that pipes PTY bytes to xterm.js. Plan #3 only writes to the transcript file.
- **SSE / IPC event channels for activity.** Plan #4. Plan #3's dispatcher writes state changes to the DB silently; the renderer (plan #6) polls until plan #4 lands.
- **Per-run sandbox / isolation.** Agents run in the same process tree as Electron, with the user's full PATH and HOME access. v2 may add containerization; flagged as `API.md §11` TODO.
- **Cost / model / tool-call metrics.** Requires structured agent events (v2 TODO from `API.md §11`).
- **Project-aware cwd.** v1 uses `agent.cwd ?? process.env.HOME`. Real project selection lands in plan #5+ (or earlier if the v1.5 TODO is pulled forward).
- **Renderer code.** Zero changes in `apps/desktop/src/renderer/`.

---

## Step-by-Step Tasks

### Task 1: Agent Zod schemas in `@vibemaestro/core`

- **ACTION:** Create `packages/core/src/schemas/agent.ts`. Update `packages/core/src/index.ts`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** ZOD_SCHEMA_PATTERN (plan #2).
- **GOTCHA:** `monogram` regex is exactly `^[A-Z0-9]{2}$` — DESIGN.md §5 dictates 2-char uppercase mono. Don't allow 3+.
- **VALIDATE:** `bun --filter @vibemaestro/core typecheck`.

### Task 2: Drizzle schema — `agents` table

- **ACTION:** Add `agents` table to `packages/db/src/schema.ts`.
- **IMPLEMENT:**
  ```ts
  export const agents = sqliteTable("agents", {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    monogram: text("monogram").notNull(),
    hue: text("hue").notNull(),
    tier: text("tier").notNull(),
    command: text("command").notNull(),
    args: text("args", { mode: "json" }).notNull().default(sql`'[]'`),
    env: text("env", { mode: "json" }).notNull().default(sql`'{}'`),
    cwd: text("cwd"),
    prompt_via: text("prompt_via").notNull(),
    available: integer("available", { mode: "boolean" }).notNull().default(false),
    version: text("version"),
    registered_at: integer("registered_at", { mode: "timestamp_ms" }).notNull(),
  });
  ```
- **MIRROR:** Schema pattern from plan #2.
- **GOTCHA:** SQLite has no native boolean — `mode: "boolean"` stores 0/1 as INTEGER. Drizzle handles the conversion.
- **VALIDATE:** `bunx drizzle-kit check` (after Task 3 generates the migration) reports no drift.

### Task 3: Generate + augment migration

- **ACTION:** `cd packages/db && bunx --bun drizzle-kit generate`. Edit the generated `0002_*.sql`.
- **IMPLEMENT:** After generation, edit the `CREATE TABLE agents` statement to add inline CHECK constraints for `tier` and `prompt_via`. Append the seed:
  ```sql
  INSERT OR IGNORE INTO agents (id, label, monogram, hue, tier, command, args, env, cwd, prompt_via, available, version, registered_at)
  VALUES
    ('claude-code', 'Claude Code', 'CC', 'oklch(74% 0.13 50)',  'v1', 'claude', '[]', '{}', NULL, 'stdin', 0, NULL, unixepoch() * 1000),
    ('codex',       'Codex',       'CX', 'oklch(72% 0.12 235)', 'v1', 'codex',  '[]', '{}', NULL, 'stdin', 0, NULL, unixepoch() * 1000);
  CREATE INDEX idx_agents_tier ON agents(tier);
  ```
- **MIRROR:** MIGRATION_PATTERN from plan #2 — manual augmentation.
- **GOTCHA:** `INSERT OR IGNORE` makes the seed re-run-safe. `unixepoch() * 1000` matches Drizzle's `timestamp_ms` mode (ms since epoch).
- **VALIDATE:** Run migrations on a fresh `:memory:` DB; verify `SELECT count(*) FROM agents` returns 2.

### Task 4: Agent repository

- **ACTION:** Create `packages/db/src/repositories/agent-repo.ts`. Update `packages/db/src/index.ts`.
- **IMPLEMENT:**
  ```ts
  export const agentRepo = (db: Db) => ({
    findById(id: string) { return db.select().from(agents).where(eq(agents.id, id)).get(); },
    list(filters?: { tier?: AgentTier }) { ... },
    insert(a: Agent) { db.insert(agents).values(rowFromAgent(a)).run(); },
    patch(id: string, fields: Partial<Agent>) { db.update(agents).set(rowFromAgent(fields)).where(eq(agents.id, id)).run(); },
    delete(id: string) { db.delete(agents).where(eq(agents.id, id)).run(); },
    markProbed(id: string, available: boolean, version: string | null) {
      db.update(agents).set({ available, version }).where(eq(agents.id, id)).run();
    },
    referencingTaskCount(id: string): number {
      const r = db.select({ n: sql<number>`count(*)` }).from(tasks).where(eq(tasks.agent_id, id)).get();
      return r?.n ?? 0;
    },
  });
  ```
- **MIRROR:** REPOSITORY_PATTERN from plan #2.
- **GOTCHA:** `referencingTaskCount` lives here (not in task-repo) because it's a "delete-safety" check used by the agent service.
- **VALIDATE:** `bun --filter @vibemaestro/db typecheck`.

### Task 5: `pty-daemon` package — node-pty setup

- **ACTION:** Update `packages/pty-daemon/package.json`. Replace `src/index.ts`. Create `src/types.ts`.
- **IMPLEMENT:**
  - `package.json`: `"dependencies": { "node-pty": "^1.0", "@vibemaestro/core": "workspace:*" }`. `"main": "./src/index.ts"`. `"types": "./src/index.ts"`.
  - `types.ts`: `SpawnedRun`, `SpawnOptions`, `ProbeResult`.
  - `index.ts`: `export * from "./spawn"; export * from "./transcript-writer"; export * from "./byte-throttle"; export * from "./probe"; export * from "./types";`
- **MIRROR:** Workspace package pattern.
- **GOTCHA:** Add `"node-pty"` to root `apps/desktop/package.json` `trustedDependencies` so Bun rebuilds it for Electron's ABI via `electron-builder install-app-deps`.
- **VALIDATE:** `bun install` rebuilds node-pty without error; `bun --filter @vibemaestro/pty-daemon typecheck` passes.

### Task 6: `spawnAgent`

- **ACTION:** Create `packages/pty-daemon/src/spawn.ts`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** PTY_SPAWN_PATTERN.
- **IMPORTS:** `import * as pty from "node-pty"; import type { Agent } from "@vibemaestro/core";`
- **GOTCHA:** Default `cols: 120, rows: 30`. The renderer's xterm.js will call `resize` (plan #5) once it knows its viewport; until then, agents see a 120-col PTY which is sane for most CLIs.
- **VALIDATE:** `pty-spawn.test.ts` (Task 17) covers happy path + arg-substitution.

### Task 7: Transcript writer

- **ACTION:** Create `packages/pty-daemon/src/transcript-writer.ts`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** TRANSCRIPT_CAPTURE_PATTERN.
- **GOTCHA:** Use `flags: "a"` (append) so a re-attached writer doesn't truncate. `mode: 0o600` keeps the transcript readable only by the user.
- **VALIDATE:** `transcript.test.ts` (Task 19) verifies UTF-8 round-trip, byte counter, file mode.

### Task 8: Byte throttle

- **ACTION:** Create `packages/pty-daemon/src/byte-throttle.ts`.
- **IMPLEMENT:**
  ```ts
  export function byteThrottle(intervalMs: number, flush: (n: number) => void) {
    let pending = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const FLUSH_BYTES = 4096;
    const fire = () => { if (pending > 0) { flush(pending); pending = 0; } if (timer) { clearTimeout(timer); timer = null; } };
    return {
      add(n: number) {
        pending += n;
        if (pending >= FLUSH_BYTES) { fire(); return; }
        if (!timer) timer = setTimeout(fire, intervalMs);
      },
      flushNow: fire,
    };
  }
  ```
- **MIRROR:** Establishes throttle pattern; plans #4/#5 will reuse this for event throttling.
- **GOTCHA:** Always call `flushNow()` on PTY exit — otherwise the last few bytes since the last interval boundary are lost from the count.
- **VALIDATE:** `byte-throttle.test.ts` (Task 18) covers small chunks + threshold + flushNow.

### Task 9: Agent probe

- **ACTION:** Create `packages/pty-daemon/src/probe.ts`.
- **IMPLEMENT:**
  ```ts
  import * as pty from "node-pty";
  import type { Agent } from "@vibemaestro/core";
  export type ProbeResult = { available: boolean; version: string | null; error?: string };

  export async function probeAgent(agent: Agent, env: Record<string, string>, timeoutMs = 2000): Promise<ProbeResult> {
    return new Promise((resolve) => {
      let output = "";
      const ipty = pty.spawn(agent.command, ["--version"], { cwd: process.env.HOME!, env, name: "xterm-color", cols: 80, rows: 24 });
      const timer = setTimeout(() => { ipty.kill("SIGKILL"); resolve({ available: false, version: null, error: "timeout" }); }, timeoutMs);
      ipty.onData((c) => { output += c; });
      ipty.onExit(({ exitCode }) => {
        clearTimeout(timer);
        if (exitCode !== 0) return resolve({ available: false, version: null, error: `exit ${exitCode}` });
        const firstLine = output.split(/\r?\n/).find(Boolean)?.trim() ?? null;
        resolve({ available: true, version: firstLine });
      });
    });
  }
  ```
- **MIRROR:** Probe pattern.
- **GOTCHA:** Some agents ignore `--version` and emit help (large output). The 2s timeout caps it. The first non-empty line is the heuristic. Document this is approximate.
- **VALIDATE:** `agents.test.ts` (Task 16) probes a fake agent that prints `1.2.3` + exits 0; verify `available: true, version: "1.2.3"`.

### Task 10: Path helper

- **ACTION:** Create `apps/desktop/src/main/lib/path-helper.ts`.
- **IMPLEMENT:**
  ```ts
  import { exec } from "node:child_process";
  import { promisify } from "node:util";
  const execP = promisify(exec);
  let cached: string | null = null;
  export async function resolveShellPath(): Promise<string> {
    if (cached) return cached;
    if (process.platform === "win32") return (cached = process.env.PATH ?? "");
    const shell = process.env.SHELL ?? "/bin/zsh";
    try {
      const { stdout } = await execP(`${shell} -lc 'echo $PATH'`, { timeout: 1500 });
      cached = stdout.trim();
    } catch {
      cached = process.env.PATH ?? "/usr/bin:/bin";
    }
    return cached;
  }
  ```
- **MIRROR:** Cached resolver pattern.
- **GOTCHA:** Some users' `.zshrc` is slow (loads nvm, mise, etc.). The 1.5s timeout protects boot time. If it expires, fall back to whatever PATH Electron got.
- **VALIDATE:** `path-helper.test.ts` (Task 21) mocks `SHELL`, verifies cache.

### Task 11: Path config additions

- **ACTION:** Update `apps/desktop/src/main/config/paths.ts`.
- **IMPLEMENT:** Add `runDir(runId)` (returns `~/.vibemaestro/runs/<runId>`) and `transcriptPath(runId)` (returns `~/.vibemaestro/runs/<runId>/transcript.txt`).
- **MIRROR:** Path-resolver pattern from plan #1.
- **GOTCHA:** Don't `mkdirSync` here — callers do that explicitly so paths is a pure resolver. The dispatcher creates the dir before spawning.
- **VALIDATE:** Unit test: `runDir("run_X").endsWith("/runs/run_X")`.

### Task 12: Agent service

- **ACTION:** Create `apps/desktop/src/main/services/agent-service.ts`.
- **IMPLEMENT:**
  - `list(filters?)`, `get(id)`, `requireById(id)` (throws `not_found`)
  - `create(input)` — Zod-parsed input + `available: false, version: null, registered_at: now`. Inserts via `agentRepo`. Then asynchronously calls `probe` and persists via `markProbed` (don't block the create response).
  - `update(input)` — patch fields; if `command` changed, re-probe.
  - `delete(id)` — calls `agentRepo.referencingTaskCount(id)`; throws `conflict` with `details: { tasks_referencing: n }` if > 0.
  - `probe(id)` — calls `probeAgent`, persists, returns `{ available, version }`.
- **MIRROR:** SERVICE_PATTERN from plan #2.
- **IMPORTS:** `agentRepo` from `@vibemaestro/db`; `probeAgent` from `@vibemaestro/pty-daemon`; `resolveShellPath` from `../lib/path-helper`.
- **GOTCHA:** The async probe-after-create can race with a quick `agents.get`; that's acceptable — the renderer will see `available: false` initially and `true` after the next list refresh. Plan #4 will turn this into a real event.
- **VALIDATE:** `agents.test.ts` (Task 16).

### Task 13: Run dispatcher

- **ACTION:** Create `apps/desktop/src/main/services/run-dispatcher.ts`.
- **IMPLEMENT:** Canonical pattern above. Add a `markCancelled` path: when cancel is called, in the exit handler, the `cancelled` flag flips the outcome to `"cancelled"` so `markFinished` skips the `agent_exit_0`/`agent_fail` transition (the task already moved to `blocked` via `taskService.cancel`).
- **MIRROR:** WORK_DISPATCH_PATTERN.
- **IMPORTS:** as the canonical pattern.
- **GOTCHA:** The `runService_internal.markFinished` from plan #2 must handle `outcome: "cancelled"` as a no-op on the task status (because `cancel` already moved task to `blocked`). Verify plan #2's implementation; if it doesn't, add a Task here to update it.
- **VALIDATE:** `run-dispatcher.test.ts` (Task 20) covers all three exit paths.

### Task 14: Wire `task-service` into the dispatcher

- **ACTION:** Update `apps/desktop/src/main/services/task-service.ts`.
- **IMPLEMENT:**
  - `run(id)` and `retry(id)`: after the `db.transaction` returns `{ run_id }`, call `runDispatcher.start(runId, task.prompt, task.agent_id).catch(err => { logger.error({err}, "dispatch failed"); runService_internal.markFinished(runId, { outcome: "failed", exit_code: -1, bytes_emitted: 0 }); })`. The catch is critical: if PATH resolution or spawn throws, we don't leave the task stuck in `running`.
  - `cancel(id)` and `discardRun(id)`: after the transaction, call `runDispatcher.cancel(runId)`.
- **MIRROR:** Service-orchestrates-side-effects pattern.
- **GOTCHA:** Don't `await` the dispatcher's `start` — it's a fire-and-forget. The PTY's exit handler will eventually call `markFinished`. Awaiting would block the tRPC response on the agent's runtime, which is wrong.
- **VALIDATE:** `run-dispatcher.test.ts` end-to-end.

### Task 15: Update `run-service.getTranscript`

- **ACTION:** Update `apps/desktop/src/main/services/run-service.ts`.
- **IMPLEMENT:**
  ```ts
  async getTranscript(taskId: string, runId: string): Promise<{ data: { transcript: string } }> {
    const run = this.requireBelongs(taskId, runId);
    if (run.status === "running") throw new AppError("invalid_state", "Transcript still streaming; subscribe via plan #5 terminal channel");
    const path = transcriptPath(runId);
    try {
      const text = await readFile(path, "utf8");
      return { data: { transcript: text } };
    } catch (err: any) {
      if (err.code === "ENOENT") throw new AppError("not_found", "Transcript file not found");
      throw err;
    }
  },
  ```
- **MIRROR:** Service stays thin; transcripts live on disk.
- **GOTCHA:** Fail with `invalid_state` (not `not_found`) when run is still running — this distinguishes "completed but no output" from "still streaming."
- **VALIDATE:** `transcript.test.ts` covers all three cases.

### Task 16: Lifecycle hooks

- **ACTION:** Create `apps/desktop/src/main/lifecycle.ts`. Update `apps/desktop/src/main/index.ts` to call `registerLifecycleHooks()`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** PROCESS_LIFECYCLE_PATTERN.
- **GOTCHA:** `app.on("before-quit", …)` may fire during force-quit; keep the cleanup synchronous (signal-only kill) so we don't deadlock the quit.
- **VALIDATE:** Manual: launch app, start a `long-running.sh` task, quit the app, verify the bash process is gone (`pgrep -f long-running.sh` returns nothing within 3s).

### Task 17: Agents tRPC router

- **ACTION:** Create `apps/desktop/src/main/routers/agents.ts`. Update `_app.ts`.
- **IMPLEMENT:**
  ```ts
  export const agentsRouter = router({
    list: procedure.query(() => agentService.list()),
    get: procedure.input(z.object({ id: z.string() })).query(({ input }) => ({ data: agentService.requireById(input.id) })),
    create: procedure.input(createAgentInput).mutation(({ input }) => ({ data: agentService.create(input) })),
    update: procedure.input(updateAgentInput).mutation(({ input }) => ({ data: agentService.update(input) })),
    delete: procedure.input(z.object({ id: z.string() })).mutation(({ input }) => { agentService.delete(input.id); return null; }),
    probe: procedure.input(z.object({ id: z.string() })).mutation(({ input }) => agentService.probe(input.id)),
  });
  ```
- **MIRROR:** ROUTER_THIN_PATTERN from plan #2.
- **GOTCHA:** `probe` is a mutation, not a query — it persists the result.
- **VALIDATE:** `agents.test.ts`.

### Task 18: Tests — fake-agent fixtures

- **ACTION:** Create `apps/desktop/test/fixtures/fake-agents/{echo-success.sh,echo-fail.sh,long-running.sh,uses-arg.sh}` and chmod +x.
- **IMPLEMENT:** Trivial bash scripts (see FAKE_AGENT_FIXTURE_PATTERN above).
- **MIRROR:** FAKE_AGENT_FIXTURE_PATTERN.
- **GOTCHA:** Scripts must be executable (`chmod +x`). Add a postinstall step or a test-setup hook to chmod them on first run if needed (Bun preserves mode bits on git checkout, so this is mostly belt-and-suspenders).
- **VALIDATE:** Manual: `./apps/desktop/test/fixtures/fake-agents/echo-success.sh < <(echo hi)` prints `received: hi`.

### Task 19: Tests — pty-daemon units

- **ACTION:** Create `pty-spawn.test.ts`, `transcript.test.ts`, `byte-throttle.test.ts`.
- **IMPLEMENT:**
  - `pty-spawn`: spawn echo-success.sh with prompt "hello"; collect onData; verify "received: hello"; verify exit 0; spawn uses-arg.sh with `prompt_via:"arg"` and `args:["{{prompt}}"]`; verify args were substituted.
  - `transcript`: open writer, write "abc", close; readFile returns "abc"; bytesWritten === 3; concurrent writes preserve order (write 100 chunks of "x"; expect 100 chars in file).
  - `byte-throttle`: add 100; assert flush not called yet; tick 250ms; assert flush(100) called once. Add 5000 (over 4KB threshold); assert flush(5000) called immediately. flushNow() flushes pending.
- **MIRROR:** INTEGRATION_TEST_PATTERN + pure-function tests.
- **GOTCHA:** Bun test's fake timers are needed for the throttle test. Use `Bun.sleep` or `vi.useFakeTimers`-equivalent.
- **VALIDATE:** All three suites pass < 1s.

### Task 20: Tests — run dispatcher (full integration)

- **ACTION:** Create `run-dispatcher.test.ts`.
- **IMPLEMENT:** Three flows:
  1. **Success:** insert fake-success agent → create task → tasks.run → wait for `runs.get(...).status === "succeeded"` (poll up to 3s) → assert task is `reviewing` and bytes_emitted > 0.
  2. **Failure:** insert fake-fail agent → run → wait for `failed` → assert task is `error`, exit_code === 1.
  3. **Cancel:** insert long-running agent → run → after 200ms call `tasks.cancel` → wait for `cancelled` → assert task is `blocked`, run is `cancelled`.
- **MIRROR:** INTEGRATION_TEST_PATTERN.
- **GOTCHA:** Don't sleep arbitrarily — poll. PTY exit propagation through the dispatcher takes ~ tens of ms; a fixed 100ms sleep will be flaky on CI.
- **VALIDATE:** All three flows pass; total < 5s.

### Task 21: Tests — agents + path helper

- **ACTION:** Create `agents.test.ts`, `path-helper.test.ts`.
- **IMPLEMENT:**
  - `agents`: list returns the seeded `claude-code` and `codex`; get; create custom agent; update label; delete with no referencing task succeeds; create a task referencing the agent + delete throws `conflict`; probe a fake-version agent.
  - `path-helper`: mock `process.env.SHELL = "/bin/sh"`; first call resolves; second call returns from cache; on timeout, falls back to `process.env.PATH`.
- **MIRROR:** INTEGRATION_TEST_PATTERN + unit tests.
- **GOTCHA:** Reset path-helper's module-level cache between tests (export a `__resetCacheForTesting` gated by `VIBEMAESTRO_TEST`).
- **VALIDATE:** Both suites pass.

### Task 22: API.md updates

- **ACTION:** Edit `API.md` §5.2 (`getTranscript` available since plan #3, `getDiff` still stubbed) and §11 (add v1.5 TODOs: project-root concept, real diff, per-run sandbox).
- **IMPLEMENT:** One paragraph each.
- **VALIDATE:** Manual re-read.

### Task 23: Final validation

- **ACTION:** Run all validation commands.
- **VALIDATE:** Per "Validation Commands" below.

---

## Testing Strategy

### Unit / pure-function

| Test | Input | Expected |
|---|---|---|
| `byteThrottle` accumulates | 100, 100, 100; tick 250ms | `flush(300)` once |
| `byteThrottle` threshold | 5000 | `flush(5000)` immediately |
| `byteThrottle` flushNow | 100, then flushNow | `flush(100)`, no further flush after tick |
| `transcriptWriter` UTF-8 | "héllo" | file contents = "héllo", bytesWritten = 6 |
| `state-machine` (regression) | (still applies from plan #2) | unchanged |

### Integration

- Agent CRUD + probe + delete-conflict
- Spawn fake-success → success path → task reviewing
- Spawn fake-fail → error path → task error
- Spawn long-running + cancel → cancelled path → task blocked
- `tasks.run` for unavailable agent throws `agent_unavailable`
- `runs.getTranscript` returns content after success; throws `invalid_state` while running; throws `not_found` if file is missing

### Edge cases

- [ ] Agent with `prompt_via: "arg"` and no `{{prompt}}` placeholder: prompt is silently dropped (document this)
- [ ] Two concurrent runs (different tasks) don't collide on transcript files
- [ ] `app.on("before-quit")` kills running PTYs (manual)
- [ ] `delete` on an agent referenced by a task throws `conflict` with `details.tasks_referencing > 0`
- [ ] Probe timeout: agent that hangs → `available: false, error: "timeout"` after 2s
- [ ] `markFinished` arriving after `cancel`: task stays `blocked`, run becomes `cancelled` (regression of plan #2)

---

## Validation Commands

### Static
```bash
bun lint
bun typecheck
```

### Tests
```bash
bun test
```
**EXPECT:** all suites pass; total < 15s (the run-dispatcher tests poll for PTY exit).

### Migration check
```bash
cd packages/db && bunx --bun drizzle-kit check
```

### Manual smoke (real agent if available)
```bash
bun dev
# In renderer DevTools console (after seeding a real claude on PATH):
const agent = await window.vmBridge.trpcInvoke({ id: "1", path: "agents.probe", type: "mutation", input: { id: "claude-code" } });
// Expect { ok: true, data: { available: true, version: "<some version>" } }
const t = await window.vmBridge.trpcInvoke({ id: "2", path: "tasks.create", type: "mutation", input: { title: "say hi", prompt: "Just print 'hi' and exit", agent_id: "claude-code" } });
const r = await window.vmBridge.trpcInvoke({ id: "3", path: "tasks.run", type: "mutation", input: { id: t.data.data.id } });
// Wait a few seconds, then:
await window.vmBridge.trpcInvoke({ id: "4", path: "runs.getTranscript", type: "query", input: { task_id: t.data.data.id, run_id: r.data.run_id } });
// Expect { ok: true, data: { data: { transcript: "<actual claude output>" } } }
```

---

## Acceptance Criteria
- [ ] `agents.*` router complete; seed inserts Claude Code + Codex on first migration
- [ ] `tasks.run` actually spawns the agent process in a PTY
- [ ] PTY data streams to disk at `~/.vibemaestro/runs/<run_id>/transcript.txt`
- [ ] `runs.bytes_emitted` advances during the run (250ms throttle)
- [ ] On exit 0: task → `reviewing`, run → `succeeded`
- [ ] On exit ≠ 0: task → `error`, run → `failed`
- [ ] On `tasks.cancel`: task → `blocked`, run → `cancelled`, PTY is killed (SIGTERM → SIGKILL after 2s)
- [ ] `runs.getTranscript` returns the captured output once the run ends
- [ ] `runs.getDiff` still returns `not_found` (deferred to v1.5)
- [ ] `app.on("before-quit")` kills all live PTYs
- [ ] No real Anthropic / OpenAI calls in tests (only fake-agent fixtures)
- [ ] All 23 tasks completed; `bun test`, `bun lint`, `bun typecheck`, `drizzle-kit check` all green

## Completion Checklist
- [ ] Code follows AGENT_REGISTRY_PATTERN, PTY_SPAWN_PATTERN, WORK_DISPATCH_PATTERN, TRANSCRIPT_CAPTURE_PATTERN, PROCESS_LIFECYCLE_PATTERN
- [ ] No `pty.spawn(...)` outside `packages/pty-daemon/src/spawn.ts`
- [ ] `taskService` calls dispatcher AFTER transactions, never inside
- [ ] Errors leaving the dispatcher land in `runService_internal.markFinished({outcome:"failed"})` so tasks never get stuck in `running`
- [ ] `node-pty` rebuilds successfully against Electron's ABI on `bun install`
- [ ] No fake-agent script invokes the network
- [ ] Tests poll, never sleep
- [ ] Self-contained — no questions during implementation

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `node-pty` ABI mismatch on Electron | Medium | High | Plan #1's `electron-builder install-app-deps` hook handles it; Task 5 GOTCHA flags the trust list addition |
| macOS GUI launch has stripped PATH; `claude` / `codex` not found | High (on first launch from Finder) | High (no agents work) | Task 10 `resolveShellPath()` runs the user's login shell to recover their full PATH |
| Slow `.zshrc` (mise, nvm) blows the 1.5s timeout | Medium | Medium | Cache + fallback to `process.env.PATH`; users can configure absolute commands via `agents.update` |
| PTY exit handler races with cancel: outcome ambiguous | Medium | Low | The `cancelled` flag set before kill is the single source of truth; covered by run-dispatcher.test.ts |
| Transcript file grows unbounded for long-running agents | Medium | Low (disk) | v1 acceptable; v1.5 TODO: log rotation when transcript > 50 MB |
| Concurrent runs collide on disk (two runs in same dir) | Low (run IDs are unique ULIDs) | High if it happens | runDir is `runs/<runId>` — uniqueness from ULID; verified in dispatcher test |
| Plan #4's event bus changes the dispatcher's caller shape | Medium | Low | Plan #4 plans to keep `runDispatcher.start/cancel` as the call surface; only the trigger source changes (event bus instead of direct call from `taskService`) |

## Notes

### Plan-#3 → Plan-#4 contract

Plan #4 will:
1. Introduce an in-process event bus (`mitt` or hand-rolled).
2. Move the `taskService.run` → `runDispatcher.start` direct call to: `taskService.run` emits `run.created`, dispatcher subscribes.
3. Add an `event:activity` IPC channel that fans the same events out to the renderer.
4. Replace the renderer's polling (plan #6 interim) with subscriptions.

Plan #3's dispatcher already exposes the right surface (`start`, `cancel`, `killAll`, `isRunning`); plan #4 only changes the caller, not the API.

### Plan-#3 → Plan-#5 contract

Plan #5 will:
1. Add an "attach" path on the dispatcher: subscribe to a live PTY's data stream from the renderer.
2. Implement scrollback ring per `runId` so reopening the panel replays recent output.
3. Add a binary IPC channel `term:output:<run_id>` that pipes PTY bytes to xterm.js.

Plan #3's dispatcher must expose `getLive(runId): SpawnedRun | undefined` so plan #5 can hook into the existing `ipty.onData` stream. Add this method as part of Task 13.

### v1.5 TODOs surfaced by plan #3

- Project-root concept on Task (currently `agent.cwd ?? $HOME`)
- Real diff computation (needs project-root + git or snapshot)
- Per-run sandbox (currently shares Electron's privileges)
- Log rotation for transcripts

These are added to `API.md §11` in Task 22.

### Self-contained guarantee

Every pattern, snippet, file path, and gotcha needed to implement plan #3 is captured here. Subsequent plans (#4, #5) reference plan #3 sections by name; do not duplicate.
