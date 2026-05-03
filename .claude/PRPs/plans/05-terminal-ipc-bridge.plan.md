# Plan 05: Terminal IPC Bridge

## Summary
Pipe a live PTY's bytes to and from the renderer over dedicated IPC channels so an `xterm.js` instance (wired in plan #7) can attach, type into, resize, signal, and reattach without losing recent context. Implements the `term:*` IPC channel family from `API.md §7`'s v1 transport, a per-run **scrollback ring** for reattach/replay, and multi-attach (multiple renderer windows can share one PTY).

## User Story
As a developer building VibeMaestro,
I want the renderer to read live PTY bytes and send keystrokes back over a low-latency channel,
So that plan #7 can attach `xterm.js` to a running agent and the user can interact with it directly.

## Problem → Solution
- **Current state (after plan #4):** PTY output streams to a transcript file on disk. The renderer has no way to see live bytes, no way to type, no way to resize. The dispatcher's `getLive(runId)` exists but is unused.
- **Desired state:** A renderer calls `terminal.attach(runId)` and immediately receives the recent scrollback (up to 32 KB), then continues to receive each new chunk over `term:output:<runId>`. Keystrokes go back over `term:input:<runId>`; viewport changes over `term:resize:<runId>`; signals (Ctrl-C, etc.) over `term:signal:<runId>`. Detaching is idempotent. Multiple renderers may attach to the same run simultaneously.

## Metadata
- **Complexity:** Medium-Large
- **Source PRD:** N/A — derived from `API.md §7`
- **PRD Phase:** N/A — plan 5 of 8
- **Estimated Files:** ~16
- **Confidence Score:** 8/10 — pattern is well-trodden (`ttyd`, `tmux`, VS Code's terminal share the same shape); main risk is binary IPC payload framing with Electron's `contextBridge`

---

## UX Design

N/A — transport layer. Plan #7 wires the actual xterm.js instance and visible UX into the detail panel.

---

## Mandatory Reading

| Priority | File | Section/Lines | Why |
|---|---|---|---|
| **P0** | `API.md` | §7 (full) | Frame protocol, control messages, scrollback semantics, reattach contract, multi-attach |
| **P0** | `.claude/PRPs/plans/03-agent-registry-pty-daemon.plan.md` | "Plan-#3 → Plan-#5 contract" Notes | The dispatcher hooks (`getLive`, `onData` re-tap) plan #5 builds on |
| **P0** | `.claude/PRPs/plans/04-event-bus-ipc-streams.plan.md` | "Plan-#4 → Plan-#5 contract" Notes | Why terminal bytes use a dedicated channel (NOT the event bus) |
| **P0** | `apps/desktop/src/main/services/run-dispatcher.ts` | full | `live: Map<string, SpawnedRun>` — the source of truth |
| **P1** | `DESIGN.md` | §10 (Terminal in-panel), §11 (detail panel) | Spec for what plan #7 will do with this bridge |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| **node-pty I/O** | `github.com/microsoft/node-pty#api` | 1.0+ | `ipty.onData((s: string) => void)`; data arrives as **strings** (UTF-8). For binary safety we Buffer-encode at the IPC boundary. `ipty.write(data)` accepts strings; for keystrokes from the renderer we pass through. |
| **node-pty resize** | same | — | `ipty.resize(cols, rows)` updates `winsize`. Required so the agent re-flows output. |
| **Electron `contextBridge` + binary** | `electronjs.org/docs/latest/api/context-bridge#parameter-error-non-clonable-types-throw` | 33+ | `contextBridge` supports structured-clone-safe types — including `Uint8Array`, `ArrayBuffer`, `Buffer` (treated as Uint8Array). Strings are fine but force the renderer into UTF-8 decoding; `Uint8Array` is more efficient and lossless. |
| **xterm.js write()** | `xtermjs.org/docs/api/terminal/classes/terminal/#write` | (plan #7) | `term.write(data: string | Uint8Array)`. Uint8Array preferred to avoid double UTF-8 conversion. |
| **Event bus exclusion** | plan #4 §"Plan-#4 → Plan-#5 contract" | — | Terminal bytes do NOT flow through the typed event bus. They use dedicated `term:output:<runId>` channels per attached window — this avoids polluting the activity feed and the ring buffer with high-volume PTY data. |

```
KEY_INSIGHT: Per-run channels (`term:output:VM-218`) scale better than one global
            channel. Renderers only listen to the runs they're attached to.
APPLIES_TO: ipc-terminal.ts attach/detach lifecycle
GOTCHA:     Don't pre-create a channel before attach. ipcRenderer.on("term:output:X")
            is fine to call lazily; the channel name is just a string. Avoid leaking
            handlers across attach/detach cycles.

KEY_INSIGHT: Scrollback is bytes, not lines. ANSI escape sequences span chunk
            boundaries; line-based rings would corrupt them.
APPLIES_TO: scrollback-ring.ts
GOTCHA:     Ring evicts whole chunks from the head, not bytes. The ring may briefly
            exceed RING_MAX between two chunks — that's fine; eviction happens
            after each push when total > RING_MAX.

KEY_INSIGHT: Multi-attach: every attached window receives the same byte stream.
            Keystrokes from any attached window go to the single PTY.
APPLIES_TO: ipc-terminal.ts attached registry
GOTCHA:     Two windows typing simultaneously interleaves their input. v1 acceptable
            (single-user — second window is the user's other tab/screen). Document.

KEY_INSIGHT: When the run ends, the bridge sends one final term:output frame (any
            buffered bytes) followed by term:closed:<runId>. After term:closed,
            subsequent keystrokes are silently dropped.
APPLIES_TO: dispatcher onExit handler integration
GOTCHA:     Renderer must treat term:closed as the canonical "no more bytes" signal,
            NOT the run.ended event from plan #4 (which lives on a different channel
            and may be slightly out-of-order due to JS task queue scheduling).
```

---

## Patterns to Establish

> Plan #5 establishes the terminal-attachment primitives. Plan #7 wires xterm.js to these.

### SCROLLBACK_RING_PATTERN — bounded byte buffer of chunks

```ts
// packages/pty-daemon/src/scrollback-ring.ts
const RING_MAX = 32 * 1024; // 32 KB

export class ScrollbackRing {
  private chunks: Uint8Array[] = [];
  private byteCount = 0;

  push(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.byteCount += chunk.byteLength;
    while (this.byteCount > RING_MAX && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!;
      this.byteCount -= dropped.byteLength;
    }
  }

  snapshot(): Uint8Array {
    if (this.chunks.length === 0) return new Uint8Array(0);
    const out = new Uint8Array(this.byteCount);
    let offset = 0;
    for (const c of this.chunks) { out.set(c, offset); offset += c.byteLength; }
    return out;
  }

  get size(): number { return this.byteCount; }
  clear() { this.chunks = []; this.byteCount = 0; }
}
```

**Rule:** the ring is byte-aligned, chunk-evicted. Always preserve at least the most recent chunk (so a single huge chunk doesn't get dropped).

### BINARY_IPC_CHANNEL_PATTERN — Uint8Array over `webContents.send`

```ts
// Main → renderer: send raw bytes
win.webContents.send(`term:output:${runId}`, chunk);  // chunk is Uint8Array

// Renderer side (preload)
ipcRenderer.on(`term:output:${runId}`, (_e, chunk: Uint8Array) => onChunk(chunk));
```

**Rule:** binary frames are `Uint8Array`. Control frames are JSON. Separate channels per concern: `term:output:<runId>` for bytes; `term:closed:<runId>` for the end marker; `term:input:<runId>`, `term:resize:<runId>`, `term:signal:<runId>` for renderer→main.

### TERMINAL_ATTACH_PATTERN — registry of attached windows per run

```ts
// apps/desktop/src/main/ipc-terminal.ts (sketch)
type Attachment = { wcId: number };
const attached = new Map<string, Set<Attachment>>(); // runId → set
const rings = new Map<string, ScrollbackRing>();      // runId → ring (lifetime: spawn → exit)
const dataUnsub = new Map<string, () => void>();      // runId → dispatcher onData unsubscribe

function attach(runId: string, wc: WebContents): { attached_at: string; cols: number; rows: number; scrollback_replayed_bytes: number } {
  // Ensure ring + dispatcher tap exist
  ensureTap(runId);
  let set = attached.get(runId); if (!set) { set = new Set(); attached.set(runId, set); }
  set.add({ wcId: wc.id });
  // Replay scrollback to this window
  const ring = rings.get(runId)!;
  const snap = ring.snapshot();
  if (snap.byteLength) wc.send(`term:output:${runId}`, snap);
  const handle = runDispatcher.getLive(runId);
  return {
    attached_at: new Date().toISOString(),
    cols: handle?.cols ?? 120,
    rows: handle?.rows ?? 30,
    scrollback_replayed_bytes: snap.byteLength,
  };
}

function ensureTap(runId: string) {
  if (rings.has(runId)) return;
  const handle = runDispatcher.getLive(runId);
  if (!handle) throw new AppError("not_found", `Run ${runId} is not live`);
  const ring = new ScrollbackRing();
  rings.set(runId, ring);
  // Subscribe to PTY data alongside the existing transcript writer
  const off = handle.ipty.onData((data) => {
    const buf = Buffer.from(data, "utf8"); // node-pty emits string; convert once
    ring.push(buf);
    const set = attached.get(runId);
    if (set) for (const a of set) {
      const win = BrowserWindow.fromId(/* lookup by wcId */); /* see Task 5 */
      if (win) win.webContents.send(`term:output:${runId}`, buf);
    }
  });
  dataUnsub.set(runId, () => off.dispose());
  handle.ipty.onExit(() => releaseTap(runId));
}

function releaseTap(runId: string) {
  const off = dataUnsub.get(runId); if (off) { off(); dataUnsub.delete(runId); }
  // Ring stays for ~30s after exit so a late attach can replay; then GC'd
  setTimeout(() => { rings.delete(runId); attached.delete(runId); }, 30_000);
  // Notify any attached windows
  const set = attached.get(runId);
  if (set) for (const a of set) {
    const win = BrowserWindow.fromId(/*…*/);
    if (win) win.webContents.send(`term:closed:${runId}`, { at: new Date().toISOString() });
  }
}
```

**Rule:** `ensureTap` is the single point that subscribes to the PTY for terminal purposes. The transcript writer and the terminal tap are independent subscribers — they don't share state.

---

## Files to Change

### `@vibemaestro/pty-daemon`

| File | Action | Justification |
|---|---|---|
| `packages/pty-daemon/src/scrollback-ring.ts` | CREATE | Canonical pattern above |
| `packages/pty-daemon/src/index.ts` | UPDATE | Re-export `ScrollbackRing` |

### `apps/desktop` (main process)

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/main/ipc-terminal.ts` | CREATE | All `term:*` channel handlers + attach/detach registry + per-run scrollback rings |
| `apps/desktop/src/main/ipc.ts` | UPDATE | Call `registerTerminalBridges()` alongside the tRPC and event bridges |
| `apps/desktop/src/main/services/run-dispatcher.ts` | UPDATE | Expose `cols`/`rows` on `SpawnedRun`; add `resize(runId, cols, rows)` and `sendInput(runId, data)` and `sendSignal(runId, sig)` helpers; keep `getLive(runId)` accurate |
| `apps/desktop/src/main/lifecycle.ts` | UPDATE | On `before-quit`, send `term:closed:*` to all attached windows and clear rings |

### `apps/desktop` (preload)

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/preload/index.ts` | UPDATE | Expose: `terminal.attach(runId)`, `terminal.detach(runId)`, `terminal.write(runId, data)`, `terminal.resize(runId, cols, rows)`, `terminal.signal(runId, sig)`, `terminal.onOutput(runId, cb)`, `terminal.onClosed(runId, cb)` |

### `apps/desktop` (renderer)

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/terminal-client.ts` | CREATE | Typed wrappers around the bridge; framework-agnostic. Plan #7 wires xterm.js to this client. |

### Tests

| File | Action | Justification |
|---|---|---|
| `apps/desktop/test/scrollback-ring.test.ts` | CREATE | Push small / large chunks; verify byteCount; verify eviction preserves the latest chunk; snapshot equality |
| `apps/desktop/test/terminal-bridge.test.ts` | CREATE | Spawn fake-success agent → attach to its runId → assert scrollback replay + live data flow → write input → assert agent received it (via transcript) → run exits → `term:closed` fires → ring is GC'd after delay |
| `apps/desktop/test/terminal-multiattach.test.ts` | CREATE | Two mocked windows attach to same runId; both receive the same byte stream; one detaches; the other still receives |
| `apps/desktop/test/terminal-not-live.test.ts` | CREATE | Attach to a runId for a run that already ended → `not_found` envelope (or returns empty scrollback if within the 30s GC window) |

### Documentation

| File | Action | Justification |
|---|---|---|
| `API.md` | UPDATE §7 | Add an "IPC channel names (v1)" subsection mirroring §6's update from plan #4: list every `term:*` channel, its direction, and payload shape. v2 WebSocket frame protocol is the same shape. |

---

## NOT Building

- **xterm.js integration.** Plan #7 wires `xterm.js` to `terminal-client.ts`. Plan #5 produces a framework-agnostic client.
- **Live event bus integration of terminal bytes.** PTY data does NOT flow through the typed event bus (volume too high). Confirmed in plan #4's "Plan-#4 → Plan-#5 contract."
- **Cancel/SIGINT coalescing.** Renderer sends raw signals; the dispatcher already supports cancel via plan #3. Plan #5 just exposes `terminal.signal()` for Ctrl-C-style interruption without state-machine effects (signal is informational; only `tasks.cancel` triggers state transitions).
- **Recording / playback / time-travel.** Scrollback is the most recent 32 KB only. Full session replay = the transcript file (plan #3).
- **Renderer-driven scrollback persistence beyond the 30s post-exit window.** A late reattach to an ended run reads the transcript file, not the in-memory ring.
- **Auth on `term:*`.** Plan #1's no-op AuthContext applies. v2 pluggable.

---

## Step-by-Step Tasks

### Task 1: Scrollback ring

- **ACTION:** Create `packages/pty-daemon/src/scrollback-ring.ts`. Update `packages/pty-daemon/src/index.ts`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** SCROLLBACK_RING_PATTERN.
- **GOTCHA:** Always preserve the most recent chunk even if it exceeds `RING_MAX` alone. Without the `&& this.chunks.length > 1` guard, a single huge chunk would self-evict and the snapshot would be empty — wrong for the "show me what just happened" use case.
- **VALIDATE:** `scrollback-ring.test.ts` covers small/large/eviction/snapshot.

### Task 2: Dispatcher additions

- **ACTION:** Update `apps/desktop/src/main/services/run-dispatcher.ts`.
- **IMPLEMENT:**
  - Add `cols`, `rows` to `SpawnedRun` (initialized at spawn time, default 120×30).
  - Add `resize(runId, cols, rows)`: looks up live handle, calls `ipty.resize(cols, rows)`, updates `cols/rows` on `SpawnedRun`.
  - Add `sendInput(runId, data: string | Uint8Array)`: looks up live handle, calls `ipty.write(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))`.
  - Add `sendSignal(runId, sig: "SIGINT" | "SIGTERM")`: looks up live handle, calls `ipty.kill(sig)`. **Important:** SIGINT does not kill the process tree on most agents — it interrupts the current operation (e.g. Claude Code abandons the in-flight tool call). SIGTERM = stop. The dispatcher's existing `cancel(runId)` already does SIGTERM→SIGKILL; this `sendSignal` is for user-initiated interrupts that don't change task state.
- **MIRROR:** Service-extends-existing pattern.
- **GOTCHA:** Don't expose `kill` directly; the only way to terminate a run is via `tasks.cancel` / `tasks.discardRun` (which transition the state machine). `sendSignal` is for user-driven interrupts that the agent may handle and recover from.
- **VALIDATE:** `terminal-bridge.test.ts` exercises resize and input.

### Task 3: Preload bridge expansion

- **ACTION:** Update `apps/desktop/src/preload/index.ts`.
- **IMPLEMENT:** Add a `terminal` namespace under `vmBridge`:
  ```ts
  terminal: {
    attach: (runId: string) => ipcRenderer.invoke("terminal.attach", runId),
    detach: (runId: string) => ipcRenderer.invoke("terminal.detach", runId),
    write:  (runId: string, data: Uint8Array | string) => ipcRenderer.invoke("terminal.write", runId, data),
    resize: (runId: string, cols: number, rows: number) => ipcRenderer.invoke("terminal.resize", runId, cols, rows),
    signal: (runId: string, sig: "SIGINT" | "SIGTERM") => ipcRenderer.invoke("terminal.signal", runId, sig),
    onOutput: (runId: string, cb: (chunk: Uint8Array) => void) => {
      const channel = `term:output:${runId}`;
      const wrapped = (_e: any, chunk: Uint8Array) => cb(chunk);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
    onClosed: (runId: string, cb: (info: { at: string }) => void) => {
      const channel = `term:closed:${runId}`;
      const wrapped = (_e: any, info: any) => cb(info);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
  }
  ```
- **MIRROR:** BINARY_IPC_CHANNEL_PATTERN + bridge expansion pattern from plan #4.
- **GOTCHA:** `onOutput` and `onClosed` return unsubscribe functions. The renderer client (Task 4) will use these and chain them into a single `disposable.dispose()`.
- **VALIDATE:** Manual: from renderer DevTools, `window.vmBridge.terminal.attach("run_X")` rejects with `not_found` for an unknown run; succeeds for a live one.

### Task 4: Renderer terminal client

- **ACTION:** Create `apps/desktop/src/renderer/terminal-client.ts`.
- **IMPLEMENT:**
  ```ts
  export type TerminalSession = {
    runId: string;
    cols: number;
    rows: number;
    scrollbackReplayedBytes: number;
    write(data: Uint8Array | string): Promise<void>;
    resize(cols: number, rows: number): Promise<void>;
    signal(sig: "SIGINT" | "SIGTERM"): Promise<void>;
    onOutput(cb: (chunk: Uint8Array) => void): () => void;
    onClosed(cb: () => void): () => void;
    detach(): Promise<void>;
  };

  export async function attachTerminal(runId: string): Promise<TerminalSession> {
    const info = await window.vmBridge.terminal.attach(runId);
    return {
      runId,
      cols: info.cols, rows: info.rows,
      scrollbackReplayedBytes: info.scrollback_replayed_bytes,
      write: (d) => window.vmBridge.terminal.write(runId, d),
      resize: (c, r) => window.vmBridge.terminal.resize(runId, c, r),
      signal: (s) => window.vmBridge.terminal.signal(runId, s),
      onOutput: (cb) => window.vmBridge.terminal.onOutput(runId, cb),
      onClosed: (cb) => window.vmBridge.terminal.onClosed(runId, cb),
      detach: () => window.vmBridge.terminal.detach(runId),
    };
  }
  ```
- **MIRROR:** Bridge wrapper pattern.
- **GOTCHA:** Plan #7 will wrap this with xterm.js: `term.onData(d => session.write(d))`, `session.onOutput(c => term.write(c))`, `term.onResize(({cols,rows}) => session.resize(cols, rows))`. Don't anticipate plan #7's wiring here.
- **VALIDATE:** Typecheck passes.

### Task 5: IPC terminal bridge (the heart of plan #5)

- **ACTION:** Create `apps/desktop/src/main/ipc-terminal.ts`. Update `apps/desktop/src/main/ipc.ts` to call `registerTerminalBridges()`.
- **IMPLEMENT:** Canonical pattern above, plus:
  - `ipcMain.handle("terminal.attach", (e, runId) => attach(runId, e.sender))` returns the attach metadata.
  - `ipcMain.handle("terminal.detach", (e, runId) => detach(runId, e.sender.id))` removes the wcId from the set; if the set becomes empty, KEEP the tap alive (other windows might attach later) — the tap is released only when the run exits.
  - `ipcMain.handle("terminal.write", (_e, runId, data) => runDispatcher.sendInput(runId, data))`.
  - `ipcMain.handle("terminal.resize", (_e, runId, cols, rows) => runDispatcher.resize(runId, cols, rows))`.
  - `ipcMain.handle("terminal.signal", (_e, runId, sig) => runDispatcher.sendSignal(runId, sig))`.
  - On `webContents.on("destroyed")`: walk every attached set and remove this wcId.
  - Use `BrowserWindow.fromId(wcId)`? No — `wcId` is a `webContents.id`. Use `webContents.fromId(wcId)` (Electron 33+) and check `isDestroyed()` before sending.
- **MIRROR:** TERMINAL_ATTACH_PATTERN + IPC_EVENT_FAN_OUT_PATTERN from plan #4.
- **GOTCHA:** The 30-second post-exit ring retention lets the user briefly see "what happened" even if they open the panel right after the run ends. After 30s, the ring is GC'd; reattach must fall back to the transcript file (plan #7's concern).
- **VALIDATE:** `terminal-bridge.test.ts` and `terminal-multiattach.test.ts`.

### Task 6: Lifecycle integration

- **ACTION:** Update `apps/desktop/src/main/lifecycle.ts`.
- **IMPLEMENT:** In `before-quit`: iterate every entry in `attached`, send `term:closed:<runId>` with `{ reason: "shutdown" }`, then clear all rings and registries.
- **MIRROR:** PROCESS_LIFECYCLE_PATTERN.
- **GOTCHA:** `runDispatcher.killAll()` (plan #3) handles process termination; the terminal bridge handles renderer notification. Don't duplicate the kill.
- **VALIDATE:** Manual: attach a terminal to a long-running task, quit the app, verify the renderer (in dev) saw `term:closed` before the window disappeared.

### Task 7: Tests — scrollback ring

- **ACTION:** Create `scrollback-ring.test.ts`.
- **IMPLEMENT:**
  - Push 10×100 bytes; size is 1000; snapshot length is 1000.
  - Push a 40 KB chunk into a fresh ring; size is 40 KB (preserved as the only chunk); snapshot length 40 KB.
  - Push 100×500 bytes (50 KB total); size is ≤ 32 KB after eviction; snapshot length matches.
  - `clear()` resets size and snapshot.
- **MIRROR:** Pure-function test layout.
- **GOTCHA:** Use `Uint8Array.from([...])` for fixtures; assert `byteLength`, not `length` (which is misleading for typed arrays).
- **VALIDATE:** Tests pass < 100ms.

### Task 8: Tests — terminal bridge end-to-end

- **ACTION:** Create `terminal-bridge.test.ts`.
- **IMPLEMENT:**
  1. Boot a fake-agent task that prints "hello" and waits 500ms before exiting.
  2. Mock `BrowserWindow` / `webContents` (one window with collected `send` calls).
  3. Call `tasks.run` and immediately `terminal.attach(runId)`.
  4. Assert the attach response has `scrollback_replayed_bytes: 0` (or the 5 bytes of "hello\n" if it raced).
  5. Wait for `webContents.send("term:output:<runId>", chunk)` to be called with bytes containing "hello".
  6. Call `terminal.write(runId, Buffer.from("more\n", "utf8"))`; verify the agent's transcript captures "more" (proves write went through).
  7. Wait for `term:closed:<runId>`.
  8. After 35s (use fake timers to advance), assert ring + attached + dataUnsub are GC'd.
- **MIRROR:** Full-stack integration test.
- **GOTCHA:** Bun's fake timers + real PTY don't mix cleanly (the PTY runs on real time). Either use real timers and a 30+ s wall-clock test (slow), or factor the GC delay into a configurable constant and override it for the test (`GC_DELAY_MS = process.env.VIBEMAESTRO_TEST ? 50 : 30_000`). Choose the second.
- **VALIDATE:** Test passes < 3s with the test-mode delay.

### Task 9: Tests — multi-attach

- **ACTION:** Create `terminal-multiattach.test.ts`.
- **IMPLEMENT:** Two mock windows attach to the same runId; both receive the same `term:output` chunks; window A detaches; window B continues to receive; window A's wcId is gone from the registry.
- **MIRROR:** Same as Task 8 with two windows.
- **GOTCHA:** Track received chunks per window; use deep-equal on the byte streams to assert parity.
- **VALIDATE:** Test passes.

### Task 10: Tests — attach to non-live run

- **ACTION:** Create `terminal-not-live.test.ts`.
- **IMPLEMENT:**
  - Run a fake-success task to completion. Within the 30s test-mode window, attach: succeeds, replays the captured ring, immediately receives `term:closed`.
  - After the GC delay, attach: throws `not_found` envelope.
- **MIRROR:** Integration test pattern.
- **GOTCHA:** The "within 30s" attach is a real product feature — it lets the user open the panel for a just-finished task and see the last bit of output. Don't regress this.
- **VALIDATE:** Test passes.

### Task 11: API.md update

- **ACTION:** Edit `API.md §7`.
- **IMPLEMENT:** Add an "IPC channel names (v1)" subsection. Tabulate every `term:*` channel with direction, payload shape, and lifecycle. Note that v2's WebSocket frame protocol mirrors these channel names as event types.
- **VALIDATE:** Manual re-read.

### Task 12: Final validation

- **ACTION:** Per "Validation Commands" below.

---

## Testing Strategy

### Unit / pure-function

| Test | Input | Expected |
|---|---|---|
| Ring push small | 10×100 B | size 1000, snapshot length 1000 |
| Ring push huge | 1×40 KB | size 40 KB (single-chunk preservation) |
| Ring eviction | 100×500 B | size ≤ 32 KB |
| Ring clear | clear after pushes | size 0, empty snapshot |

### Integration

- Attach mid-run → replay correct → live chunks delivered → write input → agent reads it → exit → `term:closed` → ring GC'd
- Multi-attach: two windows, identical streams, independent detach
- Late attach (within 30s post-exit) → replay + immediate close
- Late attach (after GC) → `not_found`
- `terminal.resize(80, 24)` → `ipty.resize` called with 80,24 (mocked)
- `terminal.signal("SIGINT")` → agent receives SIGINT (process-tree-dependent; for fake-agent shell scripts, SIGINT propagates and the script's `trap` exits)

### Edge cases

- [ ] Attach with `runId` that doesn't exist → `not_found`
- [ ] Detach without prior attach → no-op (idempotent)
- [ ] Renderer crash mid-stream → wcId removed from registry on `webContents.destroyed`
- [ ] Two writes interleaved from two windows → both reach the PTY in order received
- [ ] PTY emits a 40 KB chunk → ring keeps it; snapshot is the full 40 KB; subsequent 1 KB pushes evict the head
- [ ] Run exits while a window is mid-attach handshake → handshake completes, then `term:closed` fires immediately

---

## Validation Commands

```bash
bun lint
bun typecheck
bun test
```
**EXPECT:** all green; total runtime < 25s.

### Manual smoke
```bash
bun dev
# Renderer DevTools console after running a task:
const session = await (async () => {
  const t = await window.vmBridge.trpcInvoke({ id:"1", path:"tasks.create", type:"mutation", input:{ title:"term test", prompt:"echo hi", agent_id:"claude-code" } });
  const r = await window.vmBridge.trpcInvoke({ id:"2", path:"tasks.run", type:"mutation", input:{ id: t.data.data.id } });
  return { taskId: t.data.data.id, runId: r.data.run_id };
})();
const off = window.vmBridge.terminal.onOutput(session.runId, (chunk) => console.log("OUT", new TextDecoder().decode(chunk)));
const meta = await window.vmBridge.terminal.attach(session.runId);
console.log("attached", meta);
// Type something:
await window.vmBridge.terminal.write(session.runId, "ping\n");
```

---

## Acceptance Criteria
- [ ] All 12 tasks completed
- [ ] `term:*` channels handle attach/detach/write/resize/signal/output/closed
- [ ] Scrollback ring caps at 32 KB and preserves the most recent chunk
- [ ] Multi-attach delivers the same byte stream to all attached windows
- [ ] Late attach within 30s post-exit replays the ring; after, `not_found`
- [ ] `terminal-client.ts` is framework-agnostic (no React, no xterm.js imports)
- [ ] No `webContents.send("term:output:..."`)` outside `ipc-terminal.ts`
- [ ] No `pty.spawn` or `ipty.write` outside the dispatcher
- [ ] `API.md §7` documents v1 IPC channel names

## Completion Checklist
- [ ] Code follows SCROLLBACK_RING_PATTERN, BINARY_IPC_CHANNEL_PATTERN, TERMINAL_ATTACH_PATTERN
- [ ] `Uint8Array` payloads on output channels (not strings)
- [ ] Window destroyed → all attachments cleaned up
- [ ] `before-quit` notifies attached windows with `term:closed`
- [ ] Scrollback GC delay is configurable for tests (`GC_DELAY_MS` honors `VIBEMAESTRO_TEST`)
- [ ] No regression in plan #1–#4 tests
- [ ] Self-contained — no questions during implementation

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Binary payloads truncated by IPC | Low (Electron supports Uint8Array natively) | High (corrupted terminal output) | Tests assert byte-for-byte equality on multi-KB chunks |
| Ring grows without bound during a wedged eviction loop | Low | Medium (memory) | The `> RING_MAX && length > 1` guard prevents pathological loops; explicit unit test |
| Late attach after run exit returns stale data | Low | Low | 30s post-exit retention is documented; renderer (plan #7) reads transcript for older replays |
| Multi-window keystroke interleave confuses the agent | Medium (rare in single-user) | Low | Documented; v2 may add "primary attach" semantics |
| `webContents.fromId` returns destroyed handle | Low (we hook destroyed) | Low | Always `isDestroyed()` check before send; defensive |
| ANSI sequence chunk-boundary corruption from ring eviction | Low (chunks are atomic) | Medium | Ring evicts whole chunks; xterm.js handles partial-sequence buffering on its end |
| `node-pty` `onData` emits high-frequency tiny chunks during fast output | Medium | Low (CPU) | Each chunk is a single ring push + N webContents.send (cheap); no coalescing in v1 |

## Notes

### Plan-#5 → Plan-#7 contract

Plan #7 will:
1. Import `attachTerminal` from `terminal-client.ts`.
2. Create an `xterm.js` `Terminal` instance themed against `design-tokens.json`.
3. Wire: `term.onData(d => session.write(d))`, `session.onOutput(c => term.write(c))`, `term.onResize(({cols,rows}) => session.resize(cols, rows))`.
4. On panel open: `attachTerminal(runId)` and write the replayed scrollback into the terminal first.
5. On panel close: `session.detach()`. The PTY keeps running; reopening reattaches.
6. On `session.onClosed`: append a `— run ended —` line and disable input on the terminal.

### Plan-#5 → Plan-#6 contract

Plan #6 does NOT use the terminal bridge — the board only shows a one-line "latest log" preview that comes from the event bus's `run.progress` events (plan #4) plus the run's `current_log_line` (which we may add as a v1.5 addition; for plan #6, the latest log line is left empty until plan #7 wires the terminal in). Plan #6 must NOT depend on `terminal-client.ts`.

### Self-contained guarantee

Every pattern, snippet, file path, and gotcha needed to implement plan #5 is captured here. Plan #7 will reference plan #5 sections by name; do not duplicate.
