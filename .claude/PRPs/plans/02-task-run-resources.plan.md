# Plan 02: Task + Run Resources & State Machine

## Summary
Land the `Task` and `Run` resources from `API.md §5.1` and `§5.2`: Drizzle schema with foreign keys and a sequence-backed task-ID allocator, Zod schemas in `@vibemaestro/core`, repository + service layers in the main process, tRPC `tasks.*` and `runs.*` routers, and full server-enforced state-machine transitions. Plan #2 does **not** spawn agents — `tasks.run` creates a `Run` row in `running` state and parks it; plan #3's `pty-daemon` is the queue consumer.

## User Story
As a developer building VibeMaestro,
I want every task lifecycle transition enforced by the server with a typed tRPC surface,
So that the renderer (plan #6) and the agent runtime (plan #3) plug into the same state machine without re-deriving its rules.

## Problem → Solution
- **Current state (after plan #1):** Empty schema, only the `health` router exists. No way to create a task, no state machine, no run history.
- **Desired state:** `tasks.create` → `tasks.run` → (internal) `runService.markFinished` → `tasks.approve` cycles a task end-to-end through `backlog → running → reviewing → complete`. All invalid transitions throw `AppError("invalid_state")` with the envelope from plan #1. Multiple runs per task are tracked. Diff/Transcript endpoints exist but stub-respond until plan #3 produces real output.

## Metadata
- **Complexity:** Medium-Large
- **Source PRD:** N/A — derived from `API.md §5.1`, `§5.2`, `§8`, `DESIGN.md §1`
- **PRD Phase:** N/A — plan 2 of 8
- **Estimated Files:** ~28 (mostly small, several test files)
- **Confidence Score:** 8/10 — well-scoped; main risk is Drizzle migration ordering + SQLite cascade semantics

---

## UX Design

N/A — backend resources only. Plan #6 builds the board UI that consumes these procedures.

---

## Mandatory Reading

| Priority | File | Section/Lines | Why |
|---|---|---|---|
| **P0** | `API.md` | §4 (conventions), §5.1 (Task schema + state machine + endpoints), §5.2 (Run schema + diff schema), §8 (errors) | The contracts this plan implements |
| **P0** | `.claude/PRPs/plans/01-backend-skeleton.plan.md` | "Patterns to Establish" + "Roadmap" | Establishes naming, error envelope, logging, tRPC init, DB client — all reused here |
| **P0** | `apps/desktop/src/main/trpc.ts` | full | The `procedure`, `router`, `Context` types you'll attach to |
| **P0** | `apps/desktop/src/main/errors.ts` | full | `AppError` + `ErrorCode` |
| **P0** | `packages/db/src/{client.ts,schema.ts}` | full | The DB you'll extend |
| **P1** | `DESIGN.md` | §1 (product framing), §10 (task card states) | Informs which fields the UI needs visible per-state |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| **Drizzle schema (SQLite)** | `orm.drizzle.team/docs/sql-schema-declaration` | `drizzle-orm@^0.45` | `sqliteTable`, `$type<>()` for narrowing column types, `references()` for FKs with `onDelete` |
| **drizzle-kit migrations** | `orm.drizzle.team/docs/kit-migrations` | `drizzle-kit@^0.30` | `bunx drizzle-kit generate` reads schema diff and emits `.sql` + `meta/_journal.json`. Commit both. |
| **better-sqlite3 transactions** | `github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transaction-function---function` | `^11` | `db.transaction(fn)` is synchronous, atomic, supports `IMMEDIATE` mode for write-priority |
| **Zod ↔ TypeScript** | `zod.dev/?id=type-inference` | `^3.23` | `z.infer<typeof schema>` derives the TS type. Single source of truth: schema → type, never type → schema |
| **tRPC procedure inputs** | `trpc.io/docs/server/procedures` | `^11` | `.input(zodSchema)` runs validation before the resolver; failures land in `errorFormatter` as `ZodError` |
| **tRPC error handling** | `trpc.io/docs/server/error-handling` | `^11` | Throw plain `Error` or `AppError` from the resolver — never wrap in `TRPCError` unless overriding HTTP status (irrelevant for IPC v1) |

```
KEY_INSIGHT: Drizzle's $type<TaskStatus>() narrows the column type at the TS level
            but does NOT enforce a CHECK constraint at the SQL level.
APPLIES_TO: schema.ts — we add explicit CHECK constraints in the generated SQL
GOTCHA:     drizzle-kit will not emit CHECK from the TS schema; add them by editing the
            generated migration file (one-time, this plan).

KEY_INSIGHT: SQLite serializes write transactions; concurrent writes from two procedures
            will block but not corrupt — assuming we use db.transaction().
APPLIES_TO: task-service mutations
GOTCHA:     Avoid long-running work inside transactions. Plan #3 will spawn subprocesses
            outside the transaction; plan #2 only does in-memory state shaping.

KEY_INSIGHT: ULID is monotonic within a millisecond, sortable as a string.
APPLIES_TO: run IDs ("run_<ULID>") — list-by-id is chronological, no created_at index needed
GOTCHA:     ULID is 26 chars. Don't truncate to "look pretty"; preserve the full string.

KEY_INSIGHT: For the human-friendly task ID (VM-218), a single-row sequence table
            (read+update inside a transaction) avoids race conditions.
APPLIES_TO: lib/task-id.ts allocator
GOTCHA:     Don't use SQLite AUTOINCREMENT — its semantics around row-id reuse interact
            badly with deletes. Maintain our own counter row.
```

---

## Patterns to Establish

> Plan #1 established naming, errors, logging, tRPC init, IPC bridge, DB client, migration runner, test layout. Plan #2 builds on those and **establishes** the resource-shape patterns (#3–#8 mirror them).

### ZOD_SCHEMA_PATTERN — schemas live in `@vibemaestro/core`, types derive

```ts
// packages/core/src/schemas/task.ts
import { z } from "zod";

export const TASK_STATUSES = ["backlog", "running", "reviewing", "complete", "blocked", "error"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const taskSchema = z.object({
  id: z.string().regex(/^VM-\d+$/),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(8000),
  status: taskStatusSchema,
  agent_id: z.string().min(1).max(64),
  current_run_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});
export type Task = z.infer<typeof taskSchema>;

export const createTaskInput = z.object({
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(8000),
  agent_id: z.string().min(1).max(64),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

// Update is partial-and-narrow: only fields that are safe to edit when status === "backlog"
export const updateTaskInput = z.object({
  id: z.string(),
  title: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(8000).optional(),
  agent_id: z.string().min(1).max(64).optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

export const taskListInput = z.object({
  status: z.array(taskStatusSchema).optional(),
  agent_id: z.string().optional(),
  sort: z.enum(["-updated_at", "updated_at", "-created_at", "created_at"]).default("-updated_at"),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(20),
});
```

**Rule:** every resource gets `packages/core/src/schemas/<resource>.ts`. Types are `z.infer<>`-derived; never hand-written.

### STATE_MACHINE_GUARD — explicit transition table + helper

```ts
// packages/core/src/state-machine.ts
import { AppError } from "./errors";
import type { TaskStatus } from "./schemas/task";

export type Transition =
  | "run"          // backlog -> running
  | "agent_exit_0" // running -> reviewing
  | "agent_fail"   // running -> error
  | "cancel"       // running -> blocked
  | "approve"      // reviewing -> complete
  | "reject"       // reviewing -> backlog
  | "retry"        // error -> running
  | "discard_run"; // any -> backlog

const ALLOWED: Record<Transition, { from: ReadonlyArray<TaskStatus>; to: TaskStatus }> = {
  run:           { from: ["backlog"],            to: "running" },
  agent_exit_0:  { from: ["running"],            to: "reviewing" },
  agent_fail:    { from: ["running"],            to: "error" },
  cancel:        { from: ["running"],            to: "blocked" },
  approve:       { from: ["reviewing"],          to: "complete" },
  reject:        { from: ["reviewing"],          to: "backlog" },
  retry:         { from: ["error"],              to: "running" },
  discard_run:   { from: ["backlog","running","reviewing","complete","blocked","error"], to: "backlog" },
};

export function transition(current: TaskStatus, via: Transition): TaskStatus {
  const rule = ALLOWED[via];
  if (!rule.from.includes(current)) {
    throw new AppError(
      "invalid_state",
      `Cannot ${via} from status "${current}"`,
      { current, allowed_from: rule.from, transition: via },
    );
  }
  return rule.to;
}
```

**Rule:** action-endpoint resolvers call `transition(current, "<action>")` exactly once; the throw becomes the `invalid_state` envelope automatically.

### REPOSITORY_PATTERN — thin Drizzle data access, prepared statements

```ts
// packages/db/src/repositories/task-repo.ts
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import type { Db } from "../client";
import { tasks, taskSequence } from "../schema";
import type { Task, TaskStatus } from "@vibemaestro/core";

export const taskRepo = (db: Db) => ({
  findById(id: string): Task | undefined {
    const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
    return row ? rowToTask(row) : undefined;
  },

  list(filters: { status?: TaskStatus[]; agent_id?: string; sort: string; page: number; per_page: number }): { rows: Task[]; total: number } {
    const where = [
      filters.status ? inArray(tasks.status, filters.status) : undefined,
      filters.agent_id ? eq(tasks.agent_id, filters.agent_id) : undefined,
    ].filter(Boolean);
    const orderBy = sortToColumn(filters.sort);
    const rows = db.select().from(tasks).where(and(...where as any)).orderBy(orderBy)
      .limit(filters.per_page).offset((filters.page - 1) * filters.per_page).all();
    const totalRow = db.select({ count: sql<number>`count(*)` }).from(tasks).where(and(...where as any)).get();
    return { rows: rows.map(rowToTask), total: totalRow?.count ?? 0 };
  },

  insert(t: Task) { db.insert(tasks).values(taskToRow(t)).run(); },

  updateStatus(id: string, to: TaskStatus, current_run_id?: string | null) {
    db.update(tasks).set({ status: to, current_run_id, updated_at: new Date() }).where(eq(tasks.id, id)).run();
  },

  patch(id: string, fields: Partial<Pick<Task, "title" | "prompt" | "agent_id" | "metadata">>) {
    db.update(tasks).set({ ...fields, updated_at: new Date() }).where(eq(tasks.id, id)).run();
  },

  delete(id: string) { db.delete(tasks).where(eq(tasks.id, id)).run(); },

  // Sequence allocator: caller wraps in db.transaction() with the insert
  allocateNextId(): string {
    const row = db.select().from(taskSequence).where(eq(taskSequence.id, 1)).get();
    if (!row) throw new Error("task_sequence not seeded");
    db.update(taskSequence).set({ next_value: row.next_value + 1 }).where(eq(taskSequence.id, 1)).run();
    return `VM-${row.next_value}`;
  },
});
```

**Rule:** repositories are functions that take `db` and return method bags. **No business logic in repos** — just SQL shape. Services orchestrate.

### SERVICE_PATTERN — orchestrates state machine + repos within transactions

```ts
// apps/desktop/src/main/services/task-service.ts
import { transition, type Transition, taskSchema, type Task } from "@vibemaestro/core";
import { AppError } from "@vibemaestro/core";
import { runId } from "../lib/id";
import { getDb } from "../db";
import { taskRepo } from "@vibemaestro/db/repositories/task-repo";
import { runRepo } from "@vibemaestro/db/repositories/run-repo";

export const taskService = {
  create(input: { title: string; prompt: string; agent_id: string }): Task {
    const db = getDb();
    return db.transaction((tx) => {
      const repo = taskRepo(tx);
      const id = repo.allocateNextId();
      const now = new Date().toISOString();
      const task: Task = {
        id, title: input.title, prompt: input.prompt, agent_id: input.agent_id,
        status: "backlog", current_run_id: null, created_at: now, updated_at: now, metadata: {},
      };
      repo.insert(task);
      return task;
    });
  },

  run(id: string): { run_id: string } {
    const db = getDb();
    return db.transaction((tx) => {
      const tasks = taskRepo(tx);
      const runs = runRepo(tx);
      const task = tasks.findById(id);
      if (!task) throw new AppError("not_found", `Task ${id} not found`);
      const next = transition(task.status, "run"); // throws invalid_state if not backlog
      const newRunId = runId();
      runs.insert({
        id: newRunId, task_id: id, agent_id: task.agent_id,
        status: "running", started_at: new Date().toISOString(),
        ended_at: null, exit_code: null, bytes_emitted: 0, tool_calls_count: null,
      });
      tasks.updateStatus(id, next, newRunId);
      return { run_id: newRunId };
    });
  },

  // ... cancel, approve, reject, retry, discardRun follow the same shape:
  //     1) load, 2) transition() throws or returns, 3) DB update, all in one transaction.
};
```

**Rule:** service functions are **the only place** that calls `transition()` and writes to the DB.

### ROUTER_THIN_PATTERN — input/output schemas + service call, nothing else

```ts
// apps/desktop/src/main/routers/tasks.ts
import { router, procedure } from "../trpc";
import { taskService } from "../services/task-service";
import { taskSchema, taskListInput, createTaskInput, updateTaskInput } from "@vibemaestro/core";
import { z } from "zod";

const idInput = z.object({ id: z.string() });

export const tasksRouter = router({
  list: procedure
    .input(taskListInput)
    .query(({ input }) => taskService.list(input)),

  get: procedure
    .input(idInput)
    .output(z.object({ data: taskSchema }))
    .query(({ input }) => ({ data: taskService.requireById(input.id) })),

  create: procedure
    .input(createTaskInput)
    .output(z.object({ data: taskSchema }))
    .mutation(({ input }) => ({ data: taskService.create(input) })),

  update: procedure
    .input(updateTaskInput)
    .output(z.object({ data: taskSchema }))
    .mutation(({ input }) => ({ data: taskService.update(input) })),

  delete: procedure
    .input(idInput)
    .mutation(({ input }) => { taskService.delete(input.id); return null; }),

  run: procedure.input(idInput).output(z.object({ run_id: z.string() })).mutation(({ input }) => taskService.run(input.id)),
  cancel: procedure.input(idInput).mutation(({ input }) => { taskService.cancel(input.id); return null; }),
  approve: procedure.input(idInput).output(z.object({ data: taskSchema })).mutation(({ input }) => ({ data: taskService.approve(input.id) })),
  reject: procedure.input(idInput.extend({ feedback: z.string().max(2000).optional() })).output(z.object({ data: taskSchema })).mutation(({ input }) => ({ data: taskService.reject(input.id, input.feedback) })),
  retry: procedure.input(idInput).output(z.object({ run_id: z.string() })).mutation(({ input }) => taskService.retry(input.id)),
  discardRun: procedure.input(idInput).mutation(({ input }) => { taskService.discardRun(input.id); return null; }),
});
```

**Rule:** routers do `.input()`, `.output()`, and `service.method(input)`. No `db.` calls in routers. No `if (status === ...)` in routers.

### INTEGRATION_TEST_PATTERN — full lifecycle against an in-memory DB

```ts
// apps/desktop/test/tasks.lifecycle.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createCallerFactory } from "@trpc/server";
import { appRouter } from "../src/main/routers/_app";
import { authMiddleware } from "../src/main/middleware/auth";
import { logger } from "../src/main/lib/logger";
import { resetDbForTesting } from "../src/main/db";
import { runService_internal } from "../src/main/services/run-service";

const createCaller = createCallerFactory(appRouter);

beforeEach(() => resetDbForTesting()); // see Task 4

async function caller() {
  return createCaller({ auth: await authMiddleware(), requestId: "test", logger });
}

describe("task lifecycle", () => {
  it("backlog → running → reviewing → complete via the typed API", async () => {
    const c = await caller();
    const created = await c.tasks.create({ title: "x", prompt: "y", agent_id: "claude-code" });
    expect(created.data.status).toBe("backlog");

    const { run_id } = await c.tasks.run({ id: created.data.id });
    expect(await c.tasks.get({ id: created.data.id })).toMatchObject({ data: { status: "running", current_run_id: run_id } });

    // Plan #2 has no agent — simulate exit-0 via the internal-only seam plan #3 will use
    runService_internal.markFinished(run_id, { outcome: "succeeded", exit_code: 0, bytes_emitted: 0 });
    expect((await c.tasks.get({ id: created.data.id })).data.status).toBe("reviewing");

    const approved = await c.tasks.approve({ id: created.data.id });
    expect(approved.data.status).toBe("complete");
  });
});
```

**Rule:** every state-machine path has an integration test. Mocks are forbidden — the real DB (with `:memory:` URL or a fresh tempfile) is the cheapest correct fixture.

---

## Files to Change

### `@vibemaestro/core`

| File | Action | Justification |
|---|---|---|
| `packages/core/src/schemas/task.ts` | CREATE | Zod schemas + `Task`, `TaskStatus`, `CreateTaskInput`, `UpdateTaskInput`, `taskListInput` (canonical pattern above) |
| `packages/core/src/schemas/run.ts` | CREATE | Zod schemas + `Run`, `RunStatus`, `runListInput` |
| `packages/core/src/state-machine.ts` | CREATE | `transition()` + `Transition` type + `ALLOWED` table (canonical pattern above) |
| `packages/core/src/index.ts` | UPDATE | Re-export from `./schemas/task`, `./schemas/run`, `./state-machine` |

### `@vibemaestro/db`

| File | Action | Justification |
|---|---|---|
| `packages/db/src/schema.ts` | UPDATE | Replace `export {}` with `tasks`, `runs`, `task_sequence` table definitions |
| `packages/db/src/migrations/0001_tasks_runs.sql` | CREATE | `bunx drizzle-kit generate` output, **manually augmented** with CHECK constraints (Drizzle won't emit them — see GOTCHA in Task 5) and the seed `INSERT INTO task_sequence (id, next_value) VALUES (1, 1)` |
| `packages/db/src/migrations/meta/_journal.json` | UPDATE | drizzle-kit auto-updates |
| `packages/db/src/migrations/meta/0001_snapshot.json` | CREATE | drizzle-kit auto-emits |
| `packages/db/src/repositories/task-repo.ts` | CREATE | `taskRepo(db)` (canonical pattern above) |
| `packages/db/src/repositories/run-repo.ts` | CREATE | `runRepo(db)`: `findById`, `findByTaskId`, `insert`, `markFinished`, `incrementBytes` |
| `packages/db/src/index.ts` | CREATE | `export * from "./client"; export * from "./schema"; export * from "./repositories/task-repo"; export * from "./repositories/run-repo";` |
| `packages/db/package.json` | UPDATE | Add `"exports"` field for the new public surface |

### `apps/desktop` (main process)

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/main/db.ts` | UPDATE | Add `resetDbForTesting()` (drops + recreates DB, used only when `process.env.VIBEMAESTRO_TEST` is set) |
| `apps/desktop/src/main/lib/id.ts` | UPDATE | Already has `runId()` from plan #1; ensure it returns `"run_<26-char-ULID>"` |
| `apps/desktop/src/main/services/task-service.ts` | CREATE | Canonical pattern above; full state machine surface |
| `apps/desktop/src/main/services/run-service.ts` | CREATE | Public methods: `list(taskId)`, `get(taskId, runId)`, `getTranscript(...)`, `getDiff(...)` (last two return 404 in plan #2 — agent output lands in plan #3) |
| `apps/desktop/src/main/services/run-service-internal.ts` | CREATE | **Not exposed via tRPC.** Exports `runService_internal.markFinished(runId, { outcome, exit_code, bytes_emitted })` and `runService_internal.markCancelled(runId)`. Plan #3's PTY exit handler calls these. Plan #2 tests call them to drive the state machine end-to-end. |
| `apps/desktop/src/main/routers/tasks.ts` | CREATE | tRPC router (canonical pattern above) |
| `apps/desktop/src/main/routers/runs.ts` | CREATE | tRPC router for `runs.list`, `runs.get`, `runs.getTranscript`, `runs.getDiff` |
| `apps/desktop/src/main/routers/_app.ts` | UPDATE | Compose `tasksRouter` and `runsRouter` alongside `healthRouter` |

### Tests

| File | Action | Justification |
|---|---|---|
| `apps/desktop/test/state-machine.test.ts` | CREATE | Pure-function tests for `transition()` — every allowed transition + every disallowed one produces the right error |
| `apps/desktop/test/tasks.crud.test.ts` | CREATE | Create / list / get / update / delete; pagination; sort; filter by status/agent; `update` rejects when status ≠ backlog; `delete` rejects when status is `running` or `reviewing` |
| `apps/desktop/test/tasks.lifecycle.test.ts` | CREATE | Full cycle test (canonical pattern above) + retry path (`error → running → reviewing → complete`) + cancel path (`running → blocked`) + reject path (`reviewing → backlog`) + discard-run-from-each-state |
| `apps/desktop/test/runs.test.ts` | CREATE | Multiple runs per task; `runs.list` ordering by id descending = chronological; `getTranscript` and `getDiff` return `not_found` envelope when run not yet ended |
| `apps/desktop/test/task-id.test.ts` | CREATE | Sequence allocator is monotonic; concurrent allocations within a transaction don't collide |

### Documentation

| File | Action | Justification |
|---|---|---|
| `API.md` | UPDATE §5.2 | Clarify that `transcript_url` and `diff_url` return `404 not_found` when called before run end. Already implied; making it explicit prevents plan #6 from drawing skeleton states for a contract that will succeed. |
| `.claude/PRPs/plans/02-task-run-resources.plan.md` | CREATE | This file. |

---

## NOT Building

- **Spawning agents in a PTY.** `tasks.run` creates a Run row in `running` status and stops there. Plan #3 owns the queue consumer that picks up `running` runs and spawns the subprocess.
- **`agents.*` resource.** Plan #2 stores `agent_id` as a free-string FK without a real agents table. `taskService.create` does not validate that `agent_id` exists — that landing in plan #3.
- **Activity events / SSE / IPC streams.** Plan #4 owns the event bus. Plan #2 mutates state silently; the renderer (plan #6) will poll until plan #4 ships subscribe channels.
- **Diff parsing or transcript capture.** Real run output is a plan #3 concern; plan #2 stubs the endpoints to return `not_found` until output exists.
- **Optimistic concurrency / `If-Match` / version columns.** Single-user local — last-writer-wins is fine. Add when v2 introduces multi-user.
- **Cursor pagination.** Offset is fine for single-user task counts. v2 TODO.
- **Renderer code.** Zero changes in `apps/desktop/src/renderer/` for plan #2.

---

## Step-by-Step Tasks

### Task 1: Zod schemas in `@vibemaestro/core`

- **ACTION:** Create `packages/core/src/schemas/{task.ts,run.ts}` and update `packages/core/src/index.ts`.
- **IMPLEMENT:** Canonical `task.ts` pattern above. `run.ts` mirrors the structure with `runStatusSchema = z.enum(["running","succeeded","failed","cancelled"])`, `runSchema`, `runListInput = z.object({ task_id: z.string() })`.
- **MIRROR:** ZOD_SCHEMA_PATTERN.
- **IMPORTS:** `import { z } from "zod"`.
- **GOTCHA:** Keep numeric fields as numbers (not strings) — Drizzle stores `bytes_emitted` as `INTEGER`. Zod schema must match: `z.number().int().min(0)`.
- **VALIDATE:** `bun --filter @vibemaestro/core typecheck` is green; `z.infer<typeof taskSchema>` matches `Task` exactly.

### Task 2: State machine module in `@vibemaestro/core`

- **ACTION:** Create `packages/core/src/state-machine.ts`.
- **IMPLEMENT:** Canonical pattern above. Export `transition`, `Transition`, `ALLOWED`.
- **MIRROR:** STATE_MACHINE_GUARD.
- **IMPORTS:** `import { AppError } from "./errors"; import type { TaskStatus } from "./schemas/task";`
- **GOTCHA:** `discard_run` lists every status in its `from` array; if you add a new status later, the type system won't force an update. Add a `// TODO: keep ALLOWED.discard_run.from in sync with TASK_STATUSES` comment.
- **VALIDATE:** Tests in Task 12 cover every transition; passing those proves the table.

### Task 3: Drizzle schema update

- **ACTION:** Replace `packages/db/src/schema.ts`.
- **IMPLEMENT:**
  ```ts
  import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
  import { sql } from "drizzle-orm";

  export const tasks = sqliteTable("tasks", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    status: text("status").notNull().default("backlog"),
    agent_id: text("agent_id").notNull(),
    current_run_id: text("current_run_id"),
    metadata: text("metadata", { mode: "json" }).notNull().default(sql`'{}'`),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  });

  export const runs = sqliteTable("runs", {
    id: text("id").primaryKey(),
    task_id: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    agent_id: text("agent_id").notNull(),
    status: text("status").notNull(),
    started_at: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    ended_at: integer("ended_at", { mode: "timestamp_ms" }),
    exit_code: integer("exit_code"),
    bytes_emitted: integer("bytes_emitted").notNull().default(0),
    tool_calls_count: integer("tool_calls_count"),
  });

  export const taskSequence = sqliteTable("task_sequence", {
    id: integer("id").primaryKey(), // always 1
    next_value: integer("next_value").notNull(),
  });
  ```
- **MIRROR:** N/A — establishes resource-table pattern.
- **GOTCHA:** Drizzle's `mode: "timestamp_ms"` on `integer` columns auto-converts JS `Date` ↔ ms-since-epoch. Use `Date` everywhere in TS; never raw numbers.
- **VALIDATE:** `bunx drizzle-kit check` reports no schema drift after the next task generates the migration.

### Task 4: Generate migration + manual CHECK augmentation

- **ACTION:** Run `bunx --bun drizzle-kit generate` from `packages/db/`. Edit the generated `0001_*.sql` to add CHECK constraints and the sequence seed.
- **IMPLEMENT:** After generation, the file looks roughly like:
  ```sql
  CREATE TABLE `tasks` (...);
  CREATE TABLE `runs` (...);
  CREATE TABLE `task_sequence` (...);
  ```
  Append:
  ```sql
  -- CHECK constraints (Drizzle does not emit these from $type<>())
  -- Recreating tasks with status CHECK; runs with status CHECK
  -- (drizzle-kit emits CREATE TABLE without CHECK, so we add via ALTER pattern:
  --  for SQLite the simplest reliable approach is to recreate tables.
  --  Since this is the *initial* migration that creates them, we can edit the
  --  generated CREATE TABLE statements directly.)
  ```
  **Action:** edit the generated `CREATE TABLE tasks (...)` to insert
  `status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','running','reviewing','complete','blocked','error'))`
  and similarly for `runs.status`. Then append:
  ```sql
  INSERT INTO task_sequence (id, next_value) VALUES (1, 1);
  CREATE INDEX idx_runs_task_id ON runs(task_id);
  CREATE INDEX idx_tasks_status ON tasks(status);
  CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
  ```
- **MIRROR:** MIGRATION_PATTERN — manual SQL augmentation when Drizzle's emitter doesn't cover a constraint.
- **IMPORTS:** N/A — SQL file.
- **GOTCHA:** Once committed, **never** edit a migration in place after release. If a CHECK needs change post-merge, write `0002_alter_*.sql`. Plan #2 can edit `0001_*` because it ships as the initial release of the schema.
- **VALIDATE:** `bunx drizzle-kit check` reports no drift; running migrations on a fresh `:memory:` DB inserts the seed row.

### Task 5: Repositories

- **ACTION:** Create `packages/db/src/repositories/{task-repo.ts,run-repo.ts}` and `packages/db/src/index.ts`.
- **IMPLEMENT:** `task-repo.ts` (canonical pattern above). `run-repo.ts`:
  ```ts
  export const runRepo = (db: Db) => ({
    findById(id: string) { return db.select().from(runs).where(eq(runs.id, id)).get(); },
    findByTaskId(task_id: string) { return db.select().from(runs).where(eq(runs.task_id, task_id)).orderBy(desc(runs.id)).all(); },
    insert(r: { id: string; task_id: string; agent_id: string; status: RunStatus; started_at: string; ... }) { db.insert(runs).values(rowFromRun(r)).run(); },
    markFinished(id: string, fields: { status: RunStatus; ended_at: Date; exit_code: number | null; bytes_emitted: number }) {
      db.update(runs).set(fields).where(eq(runs.id, id)).run();
    },
    incrementBytes(id: string, delta: number) {
      db.update(runs).set({ bytes_emitted: sql`bytes_emitted + ${delta}` }).where(eq(runs.id, id)).run();
    },
  });
  ```
- **MIRROR:** REPOSITORY_PATTERN.
- **IMPORTS:** drizzle helpers (`eq`, `and`, `desc`, `inArray`, `sql`); types from `@vibemaestro/core`.
- **GOTCHA:** Don't accidentally use Drizzle's async API (`.all()` returns sync in better-sqlite3 driver, but `.execute()` returns a promise). Stay synchronous everywhere — the better-sqlite3 driver is sync by design.
- **VALIDATE:** `bun --filter @vibemaestro/db typecheck` passes; the db tests in Task 13 exercise every method.

### Task 6: Task ID allocator helper

- **ACTION:** Create `apps/desktop/src/main/lib/task-id.ts` (or inline into `task-repo.ts` — the repo already exposes `allocateNextId`; this task verifies it).
- **IMPLEMENT:** Already covered by `taskRepo.allocateNextId()` in Task 5. This task is **VALIDATE-only**: write a test that calls the allocator 100× inside a single transaction, asserts they're sequential and unique. Then 100× across separate transactions, same assertion.
- **MIRROR:** N/A.
- **GOTCHA:** Don't expose the sequence table outside the db package — it's an implementation detail.
- **VALIDATE:** `task-id.test.ts` (Task 16) verifies monotonicity.

### Task 7: `db.ts` test helper

- **ACTION:** Update `apps/desktop/src/main/db.ts` to expose `resetDbForTesting()`.
- **IMPLEMENT:**
  ```ts
  export function resetDbForTesting(): void {
    if (!process.env.VIBEMAESTRO_TEST) throw new Error("resetDbForTesting may only run in tests");
    closeDb();
    // tests set HOME to a fresh tmpdir in beforeAll; this just nukes the cached singleton
  }
  ```
- **MIRROR:** Test-isolation pattern — tests own DB lifecycle.
- **GOTCHA:** Don't `unlink` the file; Bun's tmpdir handling does that automatically. Just close + null the singleton so the next `getDb()` reopens against the new HOME-derived path.
- **VALIDATE:** `tests/lifecycle.test.ts` calls `resetDbForTesting()` in `beforeEach` without errors.

### Task 8: `task-service.ts`

- **ACTION:** Create `apps/desktop/src/main/services/task-service.ts`.
- **IMPLEMENT:** Full surface:
  - `create(input)` — pattern above
  - `requireById(id)` — throws `not_found` if missing
  - `list(filters)` — repo call; converts row dates to ISO strings
  - `update(input)` — verifies status === "backlog"; otherwise `invalid_state`
  - `delete(id)` — verifies status in `["backlog","complete","error"]`; otherwise `conflict`
  - `run(id)` — pattern above
  - `cancel(id)` — `transition(_,"cancel")`, marks current run cancelled via `runRepo.markFinished({status:"cancelled", ended_at: now, exit_code: null, ...})`
  - `approve(id)` — `transition(_,"approve")`
  - `reject(id, feedback?)` — `transition(_,"reject")`; stores feedback in task `metadata.last_feedback`
  - `retry(id)` — `transition(_,"retry")`; creates a new Run row
  - `discardRun(id)` — `transition(_,"discard_run")`; marks current run cancelled if running; clears `current_run_id`
- **MIRROR:** SERVICE_PATTERN.
- **IMPORTS:** `transition` from `@vibemaestro/core`; `taskRepo`, `runRepo` from `@vibemaestro/db`; `runId` from `../lib/id`; `getDb` from `../db`; `AppError` from `@vibemaestro/core`.
- **GOTCHA:** Every method that mutates wraps in `db.transaction()`. Don't do `db.transaction()` around a method that another method already wraps — better-sqlite3 nested transactions become savepoints, which is fine but unnecessary complexity.
- **VALIDATE:** Lifecycle test in Task 14 exercises every method.

### Task 9: `run-service.ts` and `run-service-internal.ts`

- **ACTION:** Create both files.
- **IMPLEMENT:**
  - `run-service.ts` (public, called by tRPC):
    - `list(taskId)`
    - `get(taskId, runId)` → throws `not_found` if not in that task
    - `getTranscript(taskId, runId)` — Plan #2 stub: throws `not_found` with message "Transcript not yet available; agent runtime lands in plan #3."
    - `getDiff(taskId, runId)` — same stub
  - `run-service-internal.ts` (NOT exposed via tRPC):
    - `markFinished(runId, { outcome: "succeeded"|"failed"|"cancelled", exit_code, bytes_emitted })` — wraps `db.transaction`, calls `runRepo.markFinished`, then `transition` on the parent task (`agent_exit_0` for succeeded, `agent_fail` for failed, no-op for cancelled because cancel already moved task to `blocked`), updates `task.status`.
    - `incrementBytes(runId, delta)` — increments live byte counter; called from plan #5's PTY pump.
- **MIRROR:** SERVICE_PATTERN with the seam for plan #3 carved out explicitly.
- **IMPORTS:** as Task 8.
- **GOTCHA:** When `markFinished` runs, the task may have already moved to `blocked` (cancel raced with completion). Detect this: if task status is `blocked`, leave it alone (the run becomes `cancelled`). Don't throw.
- **VALIDATE:** `runs.test.ts` exercises markFinished with each outcome; the race test verifies `cancel` followed by `markFinished` lands in `{task: blocked, run: cancelled}`.

### Task 10: `tasks` router

- **ACTION:** Create `apps/desktop/src/main/routers/tasks.ts`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** ROUTER_THIN_PATTERN.
- **IMPORTS:** `procedure`, `router` from `../trpc`; schemas from `@vibemaestro/core`; `taskService` from `../services/task-service`.
- **GOTCHA:** `update` should NOT accept `status` as an input field — status changes only via action endpoints. `updateTaskInput` already excludes `status`; double-check.
- **VALIDATE:** Renderer-side type inference: `import type { AppRouter } from "../main/routers/_app"; type CreateInput = inferProcedureInput<AppRouter["tasks"]["create"]>;` — TS resolves to `CreateTaskInput`.

### Task 11: `runs` router

- **ACTION:** Create `apps/desktop/src/main/routers/runs.ts`.
- **IMPLEMENT:**
  ```ts
  const runIdInput = z.object({ task_id: z.string(), run_id: z.string() });
  export const runsRouter = router({
    list: procedure.input(z.object({ task_id: z.string() })).query(({ input }) => runService.list(input.task_id)),
    get: procedure.input(runIdInput).query(({ input }) => runService.get(input.task_id, input.run_id)),
    getTranscript: procedure.input(runIdInput).query(({ input }) => runService.getTranscript(input.task_id, input.run_id)),
    getDiff: procedure.input(runIdInput).query(({ input }) => runService.getDiff(input.task_id, input.run_id)),
  });
  ```
- **MIRROR:** ROUTER_THIN_PATTERN.
- **IMPORTS:** as Task 10.
- **GOTCHA:** `getTranscript` and `getDiff` return `not_found` in plan #2; renderer (plan #7) must handle that gracefully and not interpret `not_found` as "the run doesn't exist." API.md §5.2 update in Task 18 documents this contract.
- **VALIDATE:** `runs.test.ts` covers each procedure.

### Task 12: Compose into `_app.ts`

- **ACTION:** Update `apps/desktop/src/main/routers/_app.ts`.
- **IMPLEMENT:**
  ```ts
  import { router } from "../trpc";
  import { healthRouter } from "./health";
  import { tasksRouter } from "./tasks";
  import { runsRouter } from "./runs";
  export const appRouter = router({ health: healthRouter, tasks: tasksRouter, runs: runsRouter });
  export type AppRouter = typeof appRouter;
  ```
- **MIRROR:** Composition pattern from plan #1.
- **GOTCHA:** AppRouter type explosion: as the router grows, TS inference time on the renderer side can creep. Plan #6 will add `inferRouterOutputs` / `inferRouterInputs` helpers; not needed yet.
- **VALIDATE:** `bun --filter @vibemaestro/desktop typecheck` is green.

### Task 13: State machine tests

- **ACTION:** Create `apps/desktop/test/state-machine.test.ts`.
- **IMPLEMENT:** Pure-function tests:
  - For each entry in `ALLOWED`, assert `transition(from, via)` returns the expected `to`.
  - For each `(from, via)` NOT in `ALLOWED`, assert `transition` throws `AppError("invalid_state")` with `details.current === from`.
  - `discard_run` is allowed from every status — explicit test for that.
- **MIRROR:** Pure-function test layout.
- **IMPORTS:** `transition`, `TASK_STATUSES`, `AppError` from `@vibemaestro/core`.
- **GOTCHA:** Use a 2D loop to cover the full N×M matrix; don't hand-write 36 cases.
- **VALIDATE:** Tests pass.

### Task 14: Lifecycle tests

- **ACTION:** Create `apps/desktop/test/tasks.lifecycle.test.ts`.
- **IMPLEMENT:** Canonical pattern above plus retry, cancel, reject, discard-from-each-state.
- **MIRROR:** INTEGRATION_TEST_PATTERN.
- **IMPORTS:** see canonical pattern.
- **GOTCHA:** `beforeEach(resetDbForTesting)` — without it, IDs persist across tests and assertions on `VM-1` break.
- **VALIDATE:** Tests pass; total runtime < 2s for the full lifecycle suite.

### Task 15: CRUD tests

- **ACTION:** Create `apps/desktop/test/tasks.crud.test.ts`.
- **IMPLEMENT:**
  - Create 25 tasks; `list({per_page:10, page:2})` returns 10 with correct `meta.total`.
  - Filter by `status: ["backlog"]` returns only backlog rows.
  - Filter by `agent_id`.
  - Sort `-updated_at` and `created_at`.
  - `update({title:"x"})` on a backlog task succeeds.
  - `update` on a running task throws `invalid_state`.
  - `delete` on a running task throws `conflict`.
  - `delete` on a complete task succeeds.
- **MIRROR:** INTEGRATION_TEST_PATTERN.
- **GOTCHA:** Bun test's `expect(...).rejects.toMatchObject({...})` works with tRPC errors as long as the data shape matches `error.data.envelope.error.code`.
- **VALIDATE:** Tests pass.

### Task 16: Run + ID allocator tests

- **ACTION:** Create `apps/desktop/test/{runs.test.ts,task-id.test.ts}`.
- **IMPLEMENT:**
  - `runs.test.ts`: create task → run → `runs.list` returns the new run; `runs.get` for unknown id throws `not_found`; `getTranscript` returns `not_found` envelope; `markFinished("succeeded")` flips task to `reviewing`; multiple runs per task are listed in id-DESC order.
  - `task-id.test.ts`: 100 sequential `allocateNextId` calls produce `VM-1` … `VM-100`.
- **MIRROR:** INTEGRATION_TEST_PATTERN + pure-function tests.
- **GOTCHA:** ULID-based run IDs sort lexicographically same as time order, but only within a single millisecond. Tests should generate runs with a 1ms delay or mock `Date.now()` to be deterministic.
- **VALIDATE:** Tests pass.

### Task 17: Update API.md §5.2

- **ACTION:** Edit `API.md` §5.2 to make stub behavior explicit.
- **IMPLEMENT:** Add a sentence: *"In v1 plan #2, `getTranscript` and `getDiff` return `not_found` until the agent runtime (plan #3) produces output. Plan #6 must treat this `not_found` as "no output yet," not "run does not exist."*
- **MIRROR:** Documentation stays in sync.
- **GOTCHA:** Don't mass-rewrite §5.2; one paragraph append in the field-notes column.
- **VALIDATE:** Manual re-read.

### Task 18: Final validation

- **ACTION:** Run all validation commands.
- **IMPLEMENT:** Per "Validation Commands" below.
- **MIRROR:** "Every plan ends green" pattern from plan #1.
- **VALIDATE:** All commands pass.

---

## Testing Strategy

### Unit Tests (state-machine.test.ts)

| Case | Input | Expected |
|---|---|---|
| Allowed | `transition("backlog","run")` | `"running"` |
| Allowed | `transition("running","cancel")` | `"blocked"` |
| Disallowed | `transition("complete","run")` | throws `AppError("invalid_state")` |
| Universal | `transition(any, "discard_run")` | `"backlog"` |
| Matrix sweep | every (status, transition) pair | matches `ALLOWED` |

### Integration tests

- Full happy path: `create → run → markFinished("succeeded") → approve` ⇒ `complete`
- Retry path: `create → run → markFinished("failed") → retry → markFinished("succeeded") → approve` ⇒ `complete`
- Cancel path: `create → run → cancel` ⇒ `task: blocked, run: cancelled`
- Reject path: `create → run → markFinished("succeeded") → reject("not what I wanted")` ⇒ `task: backlog, metadata.last_feedback set`
- Discard from each state: `create → … → discardRun` ⇒ `task: backlog`, current_run_id null
- CRUD pagination/filter/sort
- Update/delete restrictions per state

### Edge Cases Checklist

- [ ] Empty list
- [ ] List filtered to no results
- [ ] Pagination beyond last page (returns empty `data`, correct `meta.total`)
- [ ] `update({title:""})` rejects with `validation_error` (Zod min length)
- [ ] `tasks.run` on non-existent task throws `not_found` (not `invalid_state`)
- [ ] `tasks.cancel` on a task with no current run still succeeds (idempotent)
- [ ] `runs.get` for a run that belongs to a different task throws `not_found`
- [ ] Sequence allocator inside a transaction rolled back: counter does not advance
- [ ] Concurrent `taskService.create` calls produce distinct IDs (no race)
- [ ] `markFinished` after `cancel` (race): task stays `blocked`, run becomes `cancelled`

---

## Validation Commands

### Static analysis
```bash
bun lint
bun typecheck
```
**EXPECT:** zero errors.

### Tests
```bash
bun test
```
**EXPECT:** all suites pass; total runtime < 8s.

### Migration check
```bash
cd packages/db && bunx --bun drizzle-kit check
```
**EXPECT:** "no schema drift."

### Manual smoke
```bash
bun dev
# In renderer DevTools console:
await window.vmBridge.trpcInvoke({ id: "1", path: "tasks.create", type: "mutation", input: { title: "smoke", prompt: "hello", agent_id: "claude-code" } })
# Expect { ok: true, data: { data: { id: "VM-1", status: "backlog", ... } } }
```

---

## Acceptance Criteria
- [ ] All 18 tasks completed
- [ ] Schema migration generated and committed (`0001_tasks_runs.sql` + journal/snapshot)
- [ ] CHECK constraints present on `tasks.status` and `runs.status`
- [ ] State machine table exhaustively tested
- [ ] Full lifecycle integration test passes
- [ ] CRUD restrictions enforced (update only on backlog; delete only on terminal/backlog states)
- [ ] `runs.getTranscript` / `runs.getDiff` return `not_found` (plan #2 stub behavior)
- [ ] API.md §5.2 updated to document stub behavior
- [ ] No router contains business logic
- [ ] No service contains raw SQL (everything goes through repos)
- [ ] No code in `apps/desktop/src/renderer/` was modified

## Completion Checklist
- [ ] Code follows ZOD_SCHEMA_PATTERN, REPOSITORY_PATTERN, SERVICE_PATTERN, ROUTER_THIN_PATTERN
- [ ] Error handling throws `AppError` with the correct `code`
- [ ] Logging uses `ctx.logger.child(...)` — no `console.log`
- [ ] Tests follow `apps/desktop/test/<area>.test.ts`
- [ ] Drizzle migrations commit cleanly (no unstaged generator output)
- [ ] No circular workspace dependencies (`@vibemaestro/db` imports types from `@vibemaestro/core` but not the reverse)
- [ ] No raw `Date.now()` in services (use `new Date().toISOString()` for the wire shape, `new Date()` for Drizzle date columns)
- [ ] Self-contained — no questions needed during implementation

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Drizzle's `mode: "timestamp_ms"` mismatches the API's ISO-8601 wire shape | Medium | Medium | Convert at the service boundary: `Date` in DB layer, ISO string in tRPC output. Mirror plan #1's row→domain converters. |
| CHECK constraint missing on `runs.status` because Drizzle won't emit it | High | Medium | Task 4 explicitly augments the generated SQL — gated by validation in Task 18 |
| Sequence table race | Low (SQLite serializes writes) | High (duplicate IDs) | Always allocate inside `db.transaction()` |
| `markFinished` after `cancel` race produces inconsistent state | Medium | Medium | Service detects and short-circuits (Task 9 GOTCHA) |
| TS type inference balloon as router grows | Low (only 3 routers in #2) | Low (slow `tsc`) | Acceptable in #2; revisit in plan #6 with `inferRouterOutputs` if it bites |
| Migration in plan #2 ships with a bug post-release | Medium | High (data loss) | Plan #2 is **pre-release**; we can edit `0001_*.sql` freely. After plan #1+#2 merge to main, follow the rule: never edit a shipped migration; write `0002_alter_*.sql`. |

## Notes

### Plan-#2 → Plan-#3 contract

Plan #3 will:
1. Subscribe to a "new run created" event (introduced in plan #4).
2. Spawn the configured agent process inside a PTY (using `@vibemaestro/pty-daemon`).
3. Wire the PTY exit handler to call `runService_internal.markFinished(runId, { outcome, exit_code, bytes_emitted })`.
4. Wire the PTY data handler to call `runService_internal.incrementBytes(runId, chunk.length)`.

Plan #2 leaves all four hooks ready: the run row exists, the public service has the queue-style state, the internal service has the seam, and `current_run_id` on the task is set.

### Plan-#2 → Plan-#6 contract

Plan #6's renderer code will use the typed tRPC client to call `tasks.list`, `tasks.create`, etc. Plan #2 ships with no SSE/IPC events — the renderer must polling-refresh until plan #4 adds subscribe channels. Plan #6 will document the polling cadence (≤ 1 Hz) and note it as an interim pattern.

### Self-contained guarantee

Every pattern, every snippet, every file path, and every gotcha needed to implement plan #2 is captured here. A developer unfamiliar with this codebase should be able to execute Tasks 1–18 sequentially without searching the web or reading docs beyond the External Documentation table.
