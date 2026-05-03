# Plan 04: Internal Event Bus & IPC Streams

## Summary
Introduce a typed in-process event bus that decouples services from each other and fans the same events out to the renderer over IPC channels — replacing plan #3's direct `taskService → runDispatcher` call with publish/subscribe and unblocking the renderer from polling. Implements the activity feed (firehose) and per-task event channels (`API.md §6.1` and `§6.2`) over Electron IPC, with a ring buffer for `Last-Event-ID`-style resume.

## User Story
As a developer building VibeMaestro,
I want every state change to flow through one typed event bus that the renderer can subscribe to,
So that the conductor strip and the board update live without polling, and any future subscriber (analytics, audit log, plan #5 terminal hooks) plugs in without touching the services that emit.

## Problem → Solution
- **Current state (after plan #3):** Services call each other directly. `taskService.run` calls `runDispatcher.start`. The renderer can't see state changes until it polls `tasks.list` again. There is no audit channel, no live progress, no replay.
- **Desired state:** `taskService.run` emits `run.created`; the dispatcher subscribes. `runDispatcher` emits `run.started`, `run.progress` (1Hz while live), and `run.ended`. `taskService` and `runService_internal` emit `task.state_changed`. `agentService` emits `agent.availability_changed`. Every event is also fanned out to the renderer over `event:activity` (firehose) and `event:task.<task_id>` (scoped). Renderer reconnect calls `events.replaySince({since})` to recover events from a 1000-entry ring buffer.

## Metadata
- **Complexity:** Medium-Large
- **Source PRD:** N/A — derived from `API.md §6` and the seam carved in plan #3
- **PRD Phase:** N/A — plan 4 of 8
- **Estimated Files:** ~22
- **Confidence Score:** 8/10 — patterns are well-understood; main risk is double-emission during the refactor

---

## UX Design

N/A — runtime layer. Plan #6 consumes these events for the conductor strip and live card updates.

---

## Mandatory Reading

| Priority | File | Section/Lines | Why |
|---|---|---|---|
| **P0** | `API.md` | §6 (full), §11 | Event types and the v2 SSE mirror that this plan's IPC fan-out must shadow exactly |
| **P0** | `.claude/PRPs/plans/03-agent-registry-pty-daemon.plan.md` | "Plan-#3 → Plan-#4 contract" | The seam plan #3 left for plan #4 |
| **P0** | `apps/desktop/src/main/services/{task-service.ts,run-dispatcher.ts,run-service-internal.ts,agent-service.ts}` | full | Every service this plan refactors to emit |
| **P1** | `apps/desktop/src/main/ipc.ts` | full | The IPC bridge plan #1 established; this plan adds event-channel fan-out alongside the tRPC channel |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| **Electron `webContents.send`** | `electronjs.org/docs/api/web-contents#contentssendchannel-args` | 33+ | Fire-and-forget message from main → renderer. We do **not** use `webContents.postMessage` (transferable-objects flavor); plain `send` is sufficient for JSON payloads. |
| **Electron `ipcRenderer.on`** | `electronjs.org/docs/api/ipc-renderer#ipcrendereronchannel-listener` | 33+ | Renderer listener; remove with `ipcRenderer.removeListener` to avoid leaks across HMR reloads. |
| **EventTarget vs custom emitter** | `developer.mozilla.org/en-US/docs/Web/API/EventTarget` | — | Native `EventTarget` is portable but loses TS type inference at the listener boundary. We use a small custom typed emitter (~30 lines) instead — same pattern Superset uses internally. |
| **ULID monotonicity** | `github.com/ulid/javascript` | — | `monotonicFactory()` ensures lex-sortable ULIDs even when generated within the same millisecond. Required for the replay ring's ordering. |

```
KEY_INSIGHT: Refactoring a direct call to publish/subscribe risks double-firing OR
            no-firing during the cutover. Move one service at a time; tests assert
            exactly-once delivery per event type.
APPLIES_TO: task-service, run-dispatcher, agent-service, run-service-internal
GOTCHA:     Wrap each service's emit in a single helper (`bus.emit(...)`) — never
            inline `webContents.send` from a service. The IPC fan-out subscribes
            to the bus; that's the ONLY bus → IPC bridge.

KEY_INSIGHT: Per-task event channels need to know which renderer windows care.
            Tracking subscriptions explicitly avoids broadcasting irrelevant chatter.
APPLIES_TO: ipc-events.ts subscription registry
GOTCHA:     A renderer-window crash leaves the registry stale. Listen to
            `webContents.on("destroyed")` and clear all subscriptions for that wc id.

KEY_INSIGHT: The ring buffer is bounded; old events fall off. A renderer that's
            been disconnected longer than the ring's age must do a full re-fetch.
APPLIES_TO: replaySince RPC
GOTCHA:     Return `{ truncated: true }` instead of partial replay when the requested
            `since` ID is older than the oldest ring entry; the renderer treats
            this as "go re-fetch tasks.list and agents.list, then resubscribe."
```

---

## Patterns to Establish

> Plan #4 establishes the eventing primitives. Plans #5 (terminal channel), #6 (renderer subscriptions), #7 (detail panel events) all build on these.

### TYPED_EVENT_BUS_PATTERN — small, typed, single source of truth

```ts
// packages/core/src/events.ts
import { z } from "zod";
import { taskStatusSchema } from "./schemas/task";

export const eventTaskStateChanged = z.object({
  type: z.literal("task.state_changed"),
  task_id: z.string(),
  from: taskStatusSchema,
  to: taskStatusSchema,
  at: z.string().datetime(),
});
export const eventRunStarted = z.object({
  type: z.literal("run.started"),
  task_id: z.string(),
  run_id: z.string(),
  agent_id: z.string(),
  at: z.string().datetime(),
});
export const eventRunProgress = z.object({
  type: z.literal("run.progress"),
  task_id: z.string(),
  run_id: z.string(),
  elapsed_ms: z.number().int(),
  bytes_emitted: z.number().int(),
});
export const eventRunEnded = z.object({
  type: z.literal("run.ended"),
  task_id: z.string(),
  run_id: z.string(),
  exit_code: z.number().int().nullable(),
  duration_ms: z.number().int(),
  outcome: z.enum(["succeeded", "failed", "cancelled"]),
});
export const eventAgentAvailability = z.object({
  type: z.literal("agent.availability_changed"),
  agent_id: z.string(),
  available: z.boolean(),
});

// Internal-only — not fanned out to renderer
export const eventRunCreated = z.object({
  type: z.literal("run.created"),
  task_id: z.string(),
  run_id: z.string(),
  agent_id: z.string(),
  prompt: z.string(),
});

export const renderableEvent = z.discriminatedUnion("type", [
  eventTaskStateChanged, eventRunStarted, eventRunProgress, eventRunEnded, eventAgentAvailability,
]);
export type RenderableEvent = z.infer<typeof renderableEvent>;

export const internalEvent = z.discriminatedUnion("type", [eventRunCreated]);
export type InternalEvent = z.infer<typeof internalEvent>;

export type AppEvent = RenderableEvent | InternalEvent;

// On-the-wire envelope for IPC fan-out adds a server-stamped id (ULID) and timestamp
export type EnvelopedEvent = { id: string; at: string; event: RenderableEvent };
```

```ts
// apps/desktop/src/main/lib/event-bus.ts
import { monotonicFactory } from "ulid";
import type { AppEvent, RenderableEvent, EnvelopedEvent } from "@vibemaestro/core";

const newId = monotonicFactory();

type Listener<T> = (e: T) => void;

class TypedBus {
  private listeners = new Map<string, Set<Listener<any>>>();
  private ring: EnvelopedEvent[] = [];
  private RING_MAX = 1000;

  on<E extends AppEvent>(type: E["type"], fn: Listener<E>): () => void {
    let set = this.listeners.get(type);
    if (!set) { set = new Set(); this.listeners.set(type, set); }
    set.add(fn);
    return () => set!.delete(fn);
  }

  // "*" subscribers get every renderable event with envelope (used by IPC fan-out)
  onAny(fn: Listener<EnvelopedEvent>): () => void {
    let set = this.listeners.get("*");
    if (!set) { set = new Set(); this.listeners.set("*", set); }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(event: AppEvent): void {
    const set = this.listeners.get(event.type);
    if (set) for (const fn of set) try { fn(event); } catch (err) { /* logged by caller */ }
    if (event.type !== "run.created") {
      const enveloped: EnvelopedEvent = { id: newId(), at: new Date().toISOString(), event: event as RenderableEvent };
      this.ring.push(enveloped);
      if (this.ring.length > this.RING_MAX) this.ring.shift();
      const any = this.listeners.get("*");
      if (any) for (const fn of any) try { fn(enveloped); } catch (err) { /* swallow */ }
    }
  }

  replaySince(sinceId: string | null): { events: EnvelopedEvent[]; truncated: boolean } {
    if (!sinceId) return { events: [...this.ring], truncated: false };
    const idx = this.ring.findIndex((e) => e.id === sinceId);
    if (idx < 0) {
      // Either older than ring or unknown id → truncated
      const oldest = this.ring[0]?.id;
      return { events: [], truncated: oldest !== undefined && sinceId < oldest };
    }
    return { events: this.ring.slice(idx + 1), truncated: false };
  }
}

export const bus = new TypedBus();
```

**Rule:** services call `bus.emit(...)` only. Subscribers call `bus.on(type, fn)`. The bus is a process-wide singleton — there is exactly one in `apps/desktop/src/main/lib/event-bus.ts`.

### IPC_EVENT_FAN_OUT_PATTERN — bus → renderer windows

```ts
// apps/desktop/src/main/ipc-events.ts
import { ipcMain, BrowserWindow } from "electron";
import { bus } from "./lib/event-bus";
import { logger } from "./lib/logger";

// Per-window per-task subscription registry (Set<task_id> per webContents id)
const taskSubs = new Map<number, Set<string>>();

export function registerEventBridges() {
  // Firehose: every renderable event goes to every open window via "event:activity"
  bus.onAny((env) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("event:activity", env);
    }
    // Per-task scoped fan-out (only if a window subscribed)
    if (env.event.type !== "agent.availability_changed") {
      const taskId = (env.event as any).task_id as string;
      for (const win of BrowserWindow.getAllWindows()) {
        const subs = taskSubs.get(win.webContents.id);
        if (subs?.has(taskId)) win.webContents.send(`event:task.${taskId}`, env);
      }
    }
  });

  ipcMain.handle("events.subscribeTask", (e, taskId: string) => {
    let s = taskSubs.get(e.sender.id);
    if (!s) { s = new Set(); taskSubs.set(e.sender.id, s); }
    s.add(taskId);
    return { ok: true };
  });
  ipcMain.handle("events.unsubscribeTask", (e, taskId: string) => {
    taskSubs.get(e.sender.id)?.delete(taskId);
    return { ok: true };
  });
  ipcMain.handle("events.replaySince", (_e, sinceId: string | null) => bus.replaySince(sinceId));

  // Cleanup on window close
  for (const win of BrowserWindow.getAllWindows()) wireWindow(win);
}

function wireWindow(win: BrowserWindow) {
  win.webContents.on("destroyed", () => taskSubs.delete(win.webContents.id));
}
```

**Rule:** the bridge is the **only** code that calls `webContents.send`. Services never reach for renderer surfaces directly.

### EVENT_REPLAY_PATTERN — bounded ring + truncation signal

Renderer:
1. On boot: `replaySince(null)` to seed the activity stream from the ring.
2. On reconnect (after a renderer-side disconnect): `replaySince(lastSeenId)`.
3. If `truncated: true` returned, fall back to `tasks.list` + `agents.list` re-fetch and treat the cache as cold.

**Rule:** never trust a partial replay. Truncation always implies full refetch.

### INTERVAL_LIFECYCLE_PATTERN — every interval has a start AND a clear

```ts
// apps/desktop/src/main/services/run-dispatcher.ts (additions)
const progressTimers = new Map<string, ReturnType<typeof setInterval>>();

function startProgress(runId: string, taskId: string, startedAt: Date) {
  const t = setInterval(() => {
    const handle = live.get(runId);
    if (!handle) { stopProgress(runId); return; }
    bus.emit({
      type: "run.progress", task_id: taskId, run_id: runId,
      elapsed_ms: Date.now() - startedAt.getTime(),
      bytes_emitted: handle.bytesEmittedCounter, // dispatcher tracks the live count
    });
  }, 1000);
  progressTimers.set(runId, t);
}
function stopProgress(runId: string) {
  const t = progressTimers.get(runId);
  if (t) clearInterval(t);
  progressTimers.delete(runId);
}
```

**Rule:** every `setInterval` / `setTimeout` registers a handle and clears it in the matching lifecycle hook. Plan #5's terminal channel will mirror this.

---

## Files to Change

### `@vibemaestro/core`

| File | Action | Justification |
|---|---|---|
| `packages/core/src/events.ts` | CREATE | Zod schemas + types for every event (canonical pattern above) |
| `packages/core/src/index.ts` | UPDATE | Re-export from `./events` |

### `apps/desktop` (main process)

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/main/lib/event-bus.ts` | CREATE | Typed bus + ring (canonical pattern) |
| `apps/desktop/src/main/ipc-events.ts` | CREATE | Bus → IPC fan-out + subscription registry + replaySince handler |
| `apps/desktop/src/main/ipc.ts` | UPDATE | Call `registerEventBridges()` alongside `registerIpcHandlers()` |
| `apps/desktop/src/main/services/task-service.ts` | UPDATE | Emit `task.state_changed` after every transaction. Emit `run.created` after `run()`/`retry()` instead of calling `runDispatcher.start` directly |
| `apps/desktop/src/main/services/run-service-internal.ts` | UPDATE | Emit `task.state_changed` when an outcome propagation moves the task |
| `apps/desktop/src/main/services/agent-service.ts` | UPDATE | Emit `agent.availability_changed` from `markProbed` (and `update` when `command` changes) |
| `apps/desktop/src/main/services/run-dispatcher.ts` | UPDATE | Subscribe to `run.created` (replaces direct call from taskService). Track `bytesEmittedCounter` on `SpawnedRun`. Emit `run.started` after spawn, `run.progress` every 1s via INTERVAL_LIFECYCLE_PATTERN, `run.ended` after exit. Stop the interval in the exit handler. |
| `apps/desktop/src/main/lifecycle.ts` | UPDATE | Add bus cleanup to `before-quit` (clear all timers, drop listeners) |
| `apps/desktop/src/main/index.ts` | UPDATE | Call `registerEventBridges()` after `whenReady()` |

### `apps/desktop` (preload)

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/preload/index.ts` | UPDATE | Expose: `subscribeActivity(cb)`, `subscribeTask(taskId, cb)`, `unsubscribeTask(taskId)`, `replayEventsSince(sinceId)` |

### `apps/desktop` (renderer)

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/events.ts` | CREATE | Typed wrappers + `useEventStream(taskId?)` React hook stub (consumed by plan #6) |

### Tests

| File | Action | Justification |
|---|---|---|
| `apps/desktop/test/event-bus.test.ts` | CREATE | Pure-function tests: `on/emit/off`, ring eviction, `replaySince` with known/unknown/null/older IDs, `onAny` excludes internal events |
| `apps/desktop/test/events-integration.test.ts` | CREATE | Full lifecycle (`create → run → fake-success exit → approve`) emits exactly: `task.state_changed (backlog→running)`, `run.created`, `run.started`, ≥1 `run.progress`, `run.ended (succeeded)`, `task.state_changed (running→reviewing)`, `task.state_changed (reviewing→complete)`. Order asserted. |
| `apps/desktop/test/event-replay.test.ts` | CREATE | Generate 1500 events; replay from id #500 returns 999 events; replay from a fabricated older id returns `truncated: true`; replay from `null` returns the full ring (1000) |
| `apps/desktop/test/event-fanout.test.ts` | CREATE | Mock `BrowserWindow.getAllWindows()`; emit a renderable event; assert `webContents.send("event:activity", ...)` called for every non-destroyed window. Subscribe to `task.<id>`; emit a different task's event; assert NOT delivered to the per-task channel. |

### Documentation

| File | Action | Justification |
|---|---|---|
| `API.md` | UPDATE §6 | Spell out the IPC channel names (`event:activity`, `event:task.<id>`, `events.replaySince`) and the truncation behavior. v2 SSE mirror inherits the same channels. |

---

## NOT Building

- **SSE / WebSocket implementations.** v1 is IPC-only (locked); the v2 mirror is a separate plan.
- **Renderer UI consumption of events.** Plan #6 wires the conductor strip and live card updates.
- **Persisting events to disk.** The ring buffer is in-memory. Restart loses replay history. v2 may add a durable event log.
- **Multi-window conflict resolution.** Multi-window in v1 is just "two views of the same data"; both receive the same firehose.
- **Throttling per-task progress beyond 1Hz.** The fixed 1Hz for `run.progress` matches `API.md §6.1`.
- **Backpressure on slow renderers.** `webContents.send` queues; if the renderer can't drain fast enough, IPC buffers grow. v1 acceptable; v1.5 may add coalescing.

---

## Step-by-Step Tasks

### Task 1: Event types in `@vibemaestro/core`

- **ACTION:** Create `packages/core/src/events.ts`. Update `packages/core/src/index.ts`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** ZOD_SCHEMA_PATTERN.
- **GOTCHA:** Internal events (`run.created`) and renderable events are intentionally separate unions — only renderable ones get fanned out to IPC.
- **VALIDATE:** Typecheck passes; `RenderableEvent` and `InternalEvent` discriminate correctly on `type`.

### Task 2: Event bus implementation

- **ACTION:** Create `apps/desktop/src/main/lib/event-bus.ts`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** TYPED_EVENT_BUS_PATTERN.
- **GOTCHA:** `monotonicFactory()` is required — ULIDs from `ulid()` may collide within a millisecond and break ring ordering.
- **VALIDATE:** `event-bus.test.ts` (Task 11).

### Task 3: Refactor `task-service` to emit

- **ACTION:** Update every state-mutating method.
- **IMPLEMENT:**
  - `create`: NO emit (no state transition; the task starts in `backlog` and there's no "from" state).
  - `run` / `retry`: emit `task.state_changed` (from→running) + emit `run.created` ({task_id, run_id, agent_id, prompt}). **Remove the direct `runDispatcher.start(...)` call** — the dispatcher subscribes.
  - `cancel`: emit `task.state_changed` (running→blocked). Keep the existing `runDispatcher.cancel(runId)` call (the kill is a side effect, not data flow).
  - `approve` / `reject`: emit `task.state_changed`.
  - `discardRun`: emit `task.state_changed`. Keep `runDispatcher.cancel(runId)` if a run was live.
- **MIRROR:** Service-emits-after-transaction pattern.
- **GOTCHA:** Emit AFTER `db.transaction()` returns. Emitting inside the transaction would expose intermediate state to subscribers if the transaction rolls back later (it can't, since better-sqlite3 transactions are sync, but the principle holds: emit on commit, not on attempt).
- **VALIDATE:** `events-integration.test.ts` asserts the full sequence.

### Task 4: Refactor `run-service-internal` to emit

- **ACTION:** Update `markFinished`.
- **IMPLEMENT:** After updating the run + task in `db.transaction`, emit `task.state_changed` with the `from` (passed in from before the transition) and `to` (resolved by the state machine). For `outcome: "cancelled"` where the task was already moved to `blocked` by `taskService.cancel`, do NOT emit a redundant `task.state_changed` — only the run's state in the DB changed.
- **MIRROR:** Same as Task 3.
- **GOTCHA:** Do not emit `run.ended` here — that's the dispatcher's job (it has the duration_ms and exit_code at the source). `markFinished` is database-only state.
- **VALIDATE:** `events-integration.test.ts` covers happy + failure + cancel.

### Task 5: Refactor `agent-service` to emit

- **ACTION:** In `markProbed` (called by `probe` and async post-`create`), emit `agent.availability_changed` if `available` changed. Same for `update` when the `command` triggers a re-probe whose result differs.
- **IMPLEMENT:** Compare previous DB row against the new row before emitting.
- **MIRROR:** Same as Task 3.
- **GOTCHA:** Don't emit on every probe — only when `available` flipped. Probe is called frequently; emitting unconditionally creates noise.
- **VALIDATE:** `events-integration.test.ts` includes an availability flip test.

### Task 6: Wire `run-dispatcher` to subscribe + emit

- **ACTION:** Update `run-dispatcher.ts`.
- **IMPLEMENT:**
  - On module load, call `bus.on("run.created", ({task_id, run_id, agent_id, prompt}) => start(run_id, prompt, agent_id, task_id).catch(...))`. The catch path emits a synthetic `run.ended` with `outcome: "failed", exit_code: -1` so subscribers see the failure.
  - In `start()`: after spawn succeeds, emit `run.started`. Track `bytesEmittedCounter` on the `SpawnedRun` object (incremented in the existing `onData` handler).
  - In `start()`: after spawn, call `startProgress(runId, taskId, startedAt)` (canonical pattern above).
  - In the existing `onExit` handler: call `stopProgress(runId)` first, then emit `run.ended` with the actual `duration_ms` and `outcome`. Then call `runService_internal.markFinished(...)` as today.
  - Add `getLive(runId): SpawnedRun | undefined` for plan #5.
- **MIRROR:** INTERVAL_LIFECYCLE_PATTERN.
- **GOTCHA:** When dispatcher's `start` throws (e.g. agent_unavailable), it must NOT leave the task stuck in `running`. The catch path in the bus handler calls `runService_internal.markFinished({ outcome: "failed" })` which propagates the state and emits the missing `task.state_changed`. Verify this in tests.
- **VALIDATE:** `events-integration.test.ts` asserts the dispatcher emits in order.

### Task 7: IPC fan-out

- **ACTION:** Create `apps/desktop/src/main/ipc-events.ts`. Update `apps/desktop/src/main/ipc.ts` and `index.ts`.
- **IMPLEMENT:** Canonical pattern above. Wire `wireWindow(...)` for every BrowserWindow created (plan #1's `createMainWindow` becomes the call site).
- **MIRROR:** IPC_EVENT_FAN_OUT_PATTERN.
- **GOTCHA:** `webContents.id` (not `BrowserWindow.id`) is the right key for the registry — they differ.
- **VALIDATE:** `event-fanout.test.ts`.

### Task 8: Preload exposure

- **ACTION:** Update `apps/desktop/src/preload/index.ts`.
- **IMPLEMENT:** Expose:
  ```ts
  const evHandlers = new Map<string, Set<(env: any) => void>>();
  ipcRenderer.on("event:activity", (_e, env) => { evHandlers.get("*")?.forEach(fn => fn(env)); });
  // For per-task: register channel listeners lazily on first subscribe

  contextBridge.exposeInMainWorld("vmBridge", {
    ...existing trpcInvoke...,
    subscribeActivity(cb: (env: any) => void) {
      let s = evHandlers.get("*"); if (!s) { s = new Set(); evHandlers.set("*", s); }
      s.add(cb);
      return () => s!.delete(cb);
    },
    subscribeTask(taskId: string, cb: (env: any) => void) {
      const channel = `event:task.${taskId}`;
      const wrapped = (_e: any, env: any) => cb(env);
      ipcRenderer.on(channel, wrapped);
      ipcRenderer.invoke("events.subscribeTask", taskId);
      return () => {
        ipcRenderer.removeListener(channel, wrapped);
        ipcRenderer.invoke("events.unsubscribeTask", taskId);
      };
    },
    replayEventsSince(sinceId: string | null) {
      return ipcRenderer.invoke("events.replaySince", sinceId);
    },
  });
  ```
- **MIRROR:** Bridge expansion pattern from plan #1.
- **GOTCHA:** Always return an unsubscribe function. Plan #6's React hooks rely on this for cleanup.
- **VALIDATE:** Manual: from renderer DevTools, subscribe and observe events.

### Task 9: Renderer-side typed helpers

- **ACTION:** Create `apps/desktop/src/renderer/events.ts`.
- **IMPLEMENT:**
  ```ts
  import type { EnvelopedEvent } from "@vibemaestro/core";

  export const events = {
    subscribeActivity(cb: (env: EnvelopedEvent) => void) {
      return window.vmBridge.subscribeActivity(cb as any);
    },
    subscribeTask(taskId: string, cb: (env: EnvelopedEvent) => void) {
      return window.vmBridge.subscribeTask(taskId, cb as any);
    },
    async replaySince(sinceId: string | null) {
      return window.vmBridge.replayEventsSince(sinceId) as Promise<{ events: EnvelopedEvent[]; truncated: boolean }>;
    },
  };
  ```
- **MIRROR:** Bridge wrapper pattern.
- **GOTCHA:** Type-only import of `EnvelopedEvent`. Plan #6 will add the React hook (`useEventStream`) on top.
- **VALIDATE:** Typecheck passes; renderer DevTools `events.subscribeActivity(console.log)` works.

### Task 10: Update `lifecycle.ts`

- **ACTION:** Add bus + interval cleanup.
- **IMPLEMENT:** In `before-quit`, call `runDispatcher.killAll()` (plan #3) which also clears progress intervals via the existing `stopProgress` calls inside the exit handlers.
- **MIRROR:** PROCESS_LIFECYCLE_PATTERN.
- **GOTCHA:** Don't `bus.off("*")` — the bus singleton is GC'd with the process. Adding off-all just slows quit.
- **VALIDATE:** Manual: quit during a long-running task, no zombie intervals.

### Task 11: Tests — event bus

- **ACTION:** Create `event-bus.test.ts`.
- **IMPLEMENT:** Pure-function tests:
  - `on / emit / unsubscribe (returned function)` — assert listener fires once, then never after unsubscribe.
  - `onAny` receives renderable events but NOT `run.created` (internal).
  - Ring max: emit 1500 events; ring length is exactly 1000; oldest is the 501st event.
  - `replaySince(null)`: returns the entire ring.
  - `replaySince(<id of event 750>)`: returns events 751..1500 (250 events).
  - `replaySince(<id older than ring>)`: returns `{events: [], truncated: true}`.
  - `replaySince(<unknown id>)`: returns `{events: [], truncated: false}` (ID didn't make it into the ring; treat as "I'm at the head").
- **MIRROR:** Pure-function test layout.
- **GOTCHA:** ULID monotonicity matters: don't compare IDs by string equality alone — use `<` for "older than oldest" check.
- **VALIDATE:** Tests pass < 100ms.

### Task 12: Tests — events integration

- **ACTION:** Create `events-integration.test.ts`.
- **IMPLEMENT:**
  - Subscribe to `bus.onAny`. Run the full task lifecycle using `createCallerFactory` and a fake-success agent.
  - Assert event sequence in order:
    1. `task.state_changed` (backlog → running)
    2. `run.created` (internal — but won't appear via `onAny`; check via `bus.on("run.created")`)
    3. `run.started`
    4. ≥1 `run.progress`
    5. `run.ended` (succeeded)
    6. `task.state_changed` (running → reviewing)
    7. (after `tasks.approve`) `task.state_changed` (reviewing → complete)
  - Repeat for fake-fail (expect `run.ended` outcome `failed` + `task.state_changed` to `error`).
  - Repeat for cancel (expect `task.state_changed` to `blocked`, `run.ended` outcome `cancelled`, NO additional `task.state_changed` from `markFinished`).
- **MIRROR:** INTEGRATION_TEST_PATTERN.
- **GOTCHA:** `run.progress` cadence is 1Hz — for tests with a fake agent that exits in <100ms, you may not see any progress events. Use `long-running.sh` for the progress assertion specifically.
- **VALIDATE:** Tests pass < 5s total.

### Task 13: Tests — replay

- **ACTION:** Create `event-replay.test.ts`.
- **IMPLEMENT:** Direct test of `bus.replaySince` (no IPC needed): generate 1500 task.state_changed events, capture IDs at #500 and #1000, run replay queries, assert correct slice / truncation.
- **MIRROR:** Pure-function test layout.
- **GOTCHA:** Ring is mutable across tests — use `beforeEach` to reset (export a `__resetForTesting()` from event-bus.ts gated by VIBEMAESTRO_TEST).
- **VALIDATE:** Tests pass.

### Task 14: Tests — IPC fan-out

- **ACTION:** Create `event-fanout.test.ts`.
- **IMPLEMENT:** Mock `BrowserWindow.getAllWindows()` to return synthetic windows with mock `webContents.send` and `webContents.id`. Mock `ipcMain.handle` (collect handlers in a Map). Drive subscriptions via the captured handlers; emit events via `bus.emit`; assert `send` calls.
- **MIRROR:** Mocking pattern for Electron module surface.
- **GOTCHA:** `bun:test` doesn't auto-mock Electron. Use a small manual mock module (`apps/desktop/test/mocks/electron.ts`) and `mock.module("electron", ...)` from `bun:test`.
- **VALIDATE:** Tests pass.

### Task 15: API.md update

- **ACTION:** Edit `API.md §6`.
- **IMPLEMENT:** Add an "IPC channel names (v1)" subsection: `event:activity` (firehose), `event:task.<task_id>` (scoped), `events.subscribeTask(task_id)`, `events.unsubscribeTask(task_id)`, `events.replaySince(sinceId): { events, truncated }`. Document the truncation contract.
- **MIRROR:** Documentation-stays-in-sync pattern.
- **VALIDATE:** Manual re-read.

### Task 16: Final validation

- **ACTION:** Per "Validation Commands" below.

---

## Testing Strategy

### Unit / pure-function

| Test | Input | Expected |
|---|---|---|
| `on/emit/unsubscribe` | listener, emit ×3, unsubscribe, emit | listener called 3× |
| `onAny` filters internal | emit `run.created` | `onAny` not called |
| Ring eviction | emit 1500 | ring length 1000 |
| Replay from null | — | all 1000 |
| Replay from known id | id of event #500 | events 501..1000 |
| Replay from older id | fabricated < oldest | `{events:[], truncated:true}` |

### Integration

- Full task lifecycle emits the documented event order (plan #4 gate)
- Fake-fail emits `run.ended outcome=failed` + task → error
- Cancel emits one `task.state_changed → blocked`, `run.ended outcome=cancelled`, NO duplicate state change from `markFinished`
- Two simultaneous tasks emit interleaved events without cross-contamination
- Agent probe flip emits `agent.availability_changed`
- Per-task channel scopes correctly (no fan-out for unrelated tasks)

### Edge cases

- [ ] Renderer subscribes to a task that doesn't exist yet — no error; subscription is honored when the task is created later
- [ ] Renderer subscribes, then window is destroyed — registry is cleaned up (no leak)
- [ ] Replay during heavy emission — events keep flowing; replay returns a snapshot
- [ ] `onAny` listener throws — bus continues emitting to other listeners (try/catch swallow + log)
- [ ] Bus listener registered during emit — does NOT receive the in-progress event (Set iteration semantics)

---

## Validation Commands

```bash
bun lint
bun typecheck
bun test
cd packages/db && bunx --bun drizzle-kit check
```
**EXPECT:** all green, total test runtime < 18s.

### Manual smoke
```bash
bun dev
# In renderer DevTools console:
const off = window.vmBridge.subscribeActivity((env) => console.log("evt", env));
// then run a task; observe events flow
const replay = await window.vmBridge.replayEventsSince(null);
console.log("ring size", replay.events.length, "truncated", replay.truncated);
off();
```

---

## Acceptance Criteria
- [ ] All 16 tasks completed
- [ ] `bus.emit` is the only publishing primitive in services
- [ ] `webContents.send` is called from `ipc-events.ts` only
- [ ] `taskService.run`/`retry` no longer call `runDispatcher.start` directly
- [ ] Full lifecycle emits the documented event order (regression test)
- [ ] Ring buffer caps at 1000 entries; truncation signal correct
- [ ] Per-task subscription is honored exactly; firehose is honored always
- [ ] Renderer can subscribe and unsubscribe without leaks (verified by mock test)
- [ ] `API.md §6` documents the IPC channel names and truncation contract

## Completion Checklist
- [ ] Code follows TYPED_EVENT_BUS_PATTERN, IPC_EVENT_FAN_OUT_PATTERN, EVENT_REPLAY_PATTERN, INTERVAL_LIFECYCLE_PATTERN
- [ ] No service contains `webContents.send`
- [ ] No service contains its own EventEmitter
- [ ] Every `setInterval` is matched with `clearInterval` in a lifecycle hook
- [ ] Listeners returned from `bus.on` are called once per emit then released cleanly
- [ ] `run.progress` emits at 1Hz exactly (no jitter from coalescing other timers)
- [ ] No regressions in plan #2/#3 tests
- [ ] Self-contained — no questions during implementation

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Double-emission during the refactor | Medium | Medium | Move one service at a time; the integration test asserts exactly-once and exact order |
| Subscription registry leaks on window crash | Medium | Low (memory) | `webContents.on("destroyed")` cleanup, asserted in test |
| Ring eviction loses events the renderer needed | Low (1000 events is generous) | Low (truncated → re-fetch) | Document the contract; renderer falls back to refetch |
| `setInterval` pile-up if dispatcher catches an exception before stopping | Low | Medium | Wrap dispatcher's body in try/finally; `finally { stopProgress(runId) }` |
| ULID collisions across processes (multi-window) | Very low | Low | All events go through one bus in main; only one ULID factory exists |
| Renderer subscribes during HMR without unsubscribing first | Medium (dev-only) | Low (dev memory) | Plan #6's React hook returns a stable cleanup; until then, document the manual `off()` |

## Notes

### Plan-#4 → Plan-#5 contract

Plan #5 will:
1. Add a binary IPC channel `term:output:<run_id>` for raw PTY bytes (high-throughput, separate from JSON event channels).
2. Subscribe to the dispatcher's `getLive(runId)` to attach to the live PTY's `onData` and pipe to the binary channel.
3. Add `term:input:<run_id>` and `term:control:<run_id>` for renderer→main keystrokes and resize.
4. Maintain a per-run scrollback ring (~32 KB) so reattach replays.

The IPC fan-out from plan #4 stays as-is — terminal bytes do not flow through the event bus (too high-volume); they get their own dedicated channel.

### Plan-#4 → Plan-#6 contract

Plan #6's React side will:
1. Use `events.replaySince(null)` on mount to seed the cache.
2. Use `events.subscribeActivity(cb)` to keep the conductor strip live.
3. Use `events.subscribeTask(taskId, cb)` when the detail panel is open for a specific task.
4. On reconnect (HMR or transient renderer disconnect), call `replaySince(lastSeenId)`; on `truncated: true`, refetch `tasks.list` + `agents.list`.

The renderer no longer polls — `tasks.list` is called once on boot to seed; events keep it live.

### Self-contained guarantee

Every pattern, snippet, file path, and gotcha needed to implement plan #4 is captured here. Plan #5–#8 reference plan #4 sections by name; do not duplicate.
