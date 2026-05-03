# Plan 07: Detail Panel + xterm.js + Diff/Transcript

## Summary
Implement the right-side detail panel from `DESIGN.md §11`: clicking a card opens it, the **Terminal** tab attaches `xterm.js` to plan #5's terminal bridge so the user can read and type into the live agent, the **Transcript** tab shows the captured output once the run ends, the **Diff** tab is a v1.5 stub with the rendering shell in place. State-aware footer (Approve / Reject / Discard) wires plan #2's mutations. Per-task event subscription drives live header/meta updates.

## User Story
As a developer running VibeMaestro,
I want to click a task card, see what the agent is doing right now in a real terminal, and approve or push back without leaving the panel,
So that the loop "kick off task → watch agent work → accept the result" is a single click + keystroke instead of a context switch.

## Problem → Solution
- **Current state (after plan #6):** Cards render in lanes; clicking does nothing. The terminal bridge from plan #5 is wired but unused. There's no way to see live agent output or approve/reject from the UI.
- **Desired state:** Clicking a card slides in a 720 px (or 55 vw) panel from the right. The Terminal tab is selected by default and attaches `xterm.js` to the run; scrollback replays immediately, then live bytes flow. The user can type. The state-aware footer offers `Approve & merge` (reviewing), `Request changes` (reviewing), `Discard run` (running/reviewing). `Esc` closes the panel; closing detaches but does not kill the run. The Transcript tab loads once the run ends. The Diff tab shows a v1.5-stub placeholder with the proper visual shell.

## Metadata
- **Complexity:** Large
- **Source PRD:** N/A — derived from `DESIGN.md §11` and the bridge in plan #5
- **PRD Phase:** N/A — plan 7 of 8
- **Estimated Files:** ~20
- **Confidence Score:** 7/10 — xterm.js theming + ANSI palette mapping have real depth; the scrollback replay must compose cleanly with live bytes

---

## UX Design

### Before (plan #6)
```
┌──── board ────┐
│ [card] [card] │   click → no-op
│ [card] [card] │
└───────────────┘
```

### After (plan #7)
```
┌──── board ────┬──────── DETAIL PANEL ─────────────────┐
│ [card] [card] │ VM-218 [CC] ◐ running · 2:14    [✕]   │
│ [card] [card] │ Refactor auth middleware…              │
│               │ ─────────────────────────────────────  │
│               │  [Terminal] Diff Transcript           │
│               │ ─────────────────────────────────────  │
│               │  > Reading src/auth/session.ts        │
│               │  > Editing src/auth/session.ts +24 -8 │
│               │  > Running pnpm tsc --noEmit          │
│               │  ▮                                    │
│               │ ─────────────────────────────────────  │
│               │  [SIGINT]   1.2 KB · 2m 14s           │
│               │ ─────────────────────────────────────  │
│               │  (no footer buttons while running;    │
│               │   appears once status === reviewing)  │
└───────────────┴───────────────────────────────────────┘
```

### Interaction Changes

| Touchpoint | Before | After |
|---|---|---|
| Click card | no-op | Slides in detail panel (220 ms emphasized ease-out) |
| Esc key | no-op | Closes panel; focus returns to the card |
| Type into the panel | n/a | xterm.js sends keystrokes via `terminal.write(runId, …)` |
| Resize window | board reflows | Panel + board both reflow; xterm fits-to-container |
| Run ends | event flows but invisible | Panel shows `— run ended (exit 0) —`; footer reveals action buttons |
| Click Approve | n/a | `tasks.approve` mutation; card flips to Complete via event |
| Click Discard | n/a | `tasks.discardRun` mutation; PTY killed, panel transitions to backlog state |

---

## Mandatory Reading

| Priority | File | Section/Lines | Why |
|---|---|---|---|
| **P0** | `DESIGN.md` | §10 (Terminal in-panel), §11 (detail panel) | The UX contract |
| **P0** | `.claude/PRPs/plans/05-terminal-ipc-bridge.plan.md` | "Plan-#5 → Plan-#7 contract" | The exact terminal-client surface |
| **P0** | `apps/desktop/src/renderer/terminal-client.ts` | full | What the xterm.js wrapper consumes |
| **P0** | `.claude/PRPs/plans/06-frontend-shell-board.plan.md` | TANSTACK_QUERY_PATTERN, EVENT_STREAM_HOOK_PATTERN, RESPONSIVE_PATTERN | Renderer patterns to extend |
| **P0** | `apps/desktop/src/renderer/styles/tokens.css` | full | Source for xterm.js theme palette |
| **P1** | `API.md` | §7 (terminal protocol) | Reattach + multi-attach semantics |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| **xterm.js Terminal API** | `xtermjs.org/docs/api/terminal/classes/terminal/` | `@xterm/xterm@^5.5` | `new Terminal({ theme, fontFamily, cursorBlink, … })`; `term.open(div)`; `term.write(data: string \| Uint8Array)`; `term.onData(cb)`; `term.onResize(cb)` |
| **Addon: fit** | `xtermjs.org/docs/api/addons/fit/` | `@xterm/addon-fit@^0.10` | `fit.fit()` resizes terminal to container; call on mount + on container ResizeObserver |
| **Addon: web-links** | `xtermjs.org/docs/api/addons/web-links/` | `@xterm/addon-web-links@^0.11` | Click-through URLs in PTY output |
| **Addon: webgl** | `xtermjs.org/docs/api/addons/webgl/` | `@xterm/addon-webgl@^0.18` | Performance — agents emit a lot of output. Falls back to canvas if GPU unavailable. |
| **Addon: serialize** | `xtermjs.org/docs/api/addons/serialize/` | `@xterm/addon-serialize@^0.13` | Capture terminal state as text (used by Transcript tab refresh) |
| **xterm.js theming** | `xtermjs.org/docs/api/terminal/interfaces/itheme/` | — | Theme is a plain JS object (`background`, `foreground`, `cursor`, `selectionBackground`, `black`/`red`/…/`brightBlack`/…). Re-apply via `term.options.theme = newTheme` after a theme switch. |
| **xterm.js + Uint8Array** | API | — | Plan #5's `term:output` channel delivers `Uint8Array`; `term.write(buf)` accepts it directly without TextDecoder |
| **React + ResizeObserver** | MDN | — | `useResizeObserver` (custom or `react-resize-detector`) — we'll roll the 10-line custom hook to avoid another dep |

```
KEY_INSIGHT: xterm.js theme is JS, our tokens are CSS. We bridge by reading
            getComputedStyle(:root) at terminal mount time, then re-applying
            after theme changes.
APPLIES_TO: lib/xterm-theme.ts
GOTCHA:     CSS variable values come back with whitespace + can be in any color
            format (oklch, rgb, hex). xterm.js wants strings like "#000000"
            but accepts any CSS color string the renderer's WebGL/Canvas can
            parse. oklch() is fine in Chromium 130 (Electron 33).

KEY_INSIGHT: The webgl addon needs a real <canvas> + active GPU context.
            In dev (HMR) the addon may double-attach if we don't dispose cleanly.
APPLIES_TO: useTerminal.ts cleanup
GOTCHA:     Always call `webglAddon.dispose()` and `term.dispose()` on unmount.
            Otherwise GPU contexts leak and HMR makes the renderer panic.

KEY_INSIGHT: Scrollback replay is delivered as a single (potentially large)
            Uint8Array on attach. Writing it before any onOutput subscription
            ensures the user sees recent context without flicker.
APPLIES_TO: TerminalTab.tsx attach sequence
GOTCHA:     The TerminalSession from plan #5 already returns
            `scrollback_replayed_bytes` — but the bytes themselves arrive on
            the FIRST term:output frame after attach. Subscribe BEFORE calling
            attach() to avoid losing them.

KEY_INSIGHT: Esc-to-close must not eat keystrokes the terminal needs
            (xterm.js consumes most keys, but keydown bubbles up unless we
            stop propagation).
APPLIES_TO: useDetailPanel.ts keydown handler
GOTCHA:     Listen on the panel container, not on document.body. xterm.js
            calls preventDefault on most keys but doesn't stopPropagation
            on Escape, so a panel-scoped listener catches it cleanly.

KEY_INSIGHT: Closing the panel must DETACH from the terminal bridge but NOT
            cancel the run. The PTY keeps running; reopening reattaches.
APPLIES_TO: TerminalTab.tsx unmount cleanup
GOTCHA:     If you call any tasks.cancel mutation on close, you'll kill the
            agent every time the user dismisses. Cleanup is detach() only.
```

---

## Patterns to Establish

> Plan #7 establishes the panel + terminal patterns. Plan #8 polishes empty/loading states inside the panel.

### DETAIL_PANEL_PATTERN — slide-in overlay, board stays interactive

```tsx
// components/detail-panel/DetailPanel.tsx (sketch)
export function DetailPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { data: task } = trpc.tasks.get.useQuery({ id: taskId });
  useTaskEvents(taskId);                  // per-task subscription (separate from firehose)
  useEscToClose(onClose);                 // Esc handler scoped to the panel
  if (!task) return null;
  return (
    <aside
      role="dialog" aria-label={`Task ${task.data.id}`}
      className="fixed top-0 right-0 h-full w-[min(720px,55vw)] bg-surface-raised
                 border-l border-border-subtle shadow-3 z-30
                 motion-safe:animate-slide-in-right"
    >
      <PanelHeader task={task.data} onClose={onClose} />
      <PanelTabs task={task.data} />
      <PanelFooter task={task.data} onClose={onClose} />
    </aside>
  );
}
```

**Rule:** the panel is a `position: fixed` overlay. The board grid does not change; it remains interactive (cards behind the panel are still clickable, opening a different panel replaces the open one).

### XTERM_INTEGRATION_PATTERN — bridge `terminal-client.ts` to `xterm.js`

```ts
// hooks/useTerminal.ts (sketch)
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { attachTerminal, type TerminalSession } from "../terminal-client";
import { buildXtermTheme } from "../lib/xterm-theme";

export function useTerminal(runId: string | null, container: HTMLDivElement | null) {
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!runId || !container) return;
    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.45,
      theme: buildXtermTheme(),
      cursorBlink: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      cursorStyle: "bar",
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    let webgl: WebglAddon | null = null;
    term.loadAddon(fit); term.loadAddon(links);
    try { webgl = new WebglAddon(); term.loadAddon(webgl); } catch { /* fall back to canvas */ }
    term.open(container);
    fit.fit();

    let unsubOutput: (() => void) | null = null;
    let unsubClosed: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const s = await attachTerminal(runId);
      if (cancelled) { await s.detach(); return; }
      // SUBSCRIBE FIRST: attach() will deliver scrollback as the first onOutput frame
      unsubOutput = s.onOutput((chunk) => term.write(chunk));
      unsubClosed = s.onClosed(() => setClosed(true));
      s.resize(term.cols, term.rows);
      term.onData((d) => s.write(d));
      term.onResize(({ cols, rows }) => s.resize(cols, rows));
      setSession(s);
    })();

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(container);

    return () => {
      cancelled = true;
      ro.disconnect();
      unsubOutput?.(); unsubClosed?.();
      session?.detach().catch(() => {}); // detach but do not cancel run
      webgl?.dispose();
      term.dispose();
    };
  }, [runId, container]);

  return { session, closed };
}
```

**Rule:** the only place that calls `attachTerminal` is `useTerminal`. Subscribe to `onOutput` BEFORE calling `attach()` — otherwise scrollback replay arrives before the listener is wired and the user misses it.

### PER_TASK_EVENTS_PATTERN — scoped subscription drives the panel

```ts
// hooks/useTaskEvents.ts
export function useTaskEvents(taskId: string) {
  useEffect(() => {
    const off = events.subscribeTask(taskId, (env) => apply(env));
    return () => { off(); };
  }, [taskId]);
}
```

The panel reuses the same `apply()` from plan #6's `useEventStream` — events update the same query cache, components consume it via Query.

### KEYBOARD_DISMISS_PATTERN — `Esc` closes, focus returns

```ts
// hooks/useEscToClose.ts
export function useEscToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}
```

**Rule:** the panel records the previously-focused element on open and restores it on close. Plan #6's `TaskCard` is the typical opener — the card receives focus back.

---

## Files to Change

### Tooling

| File | Action | Justification |
|---|---|---|
| `apps/desktop/package.json` | UPDATE | Add `@xterm/xterm@^5.5`, `@xterm/addon-fit@^0.10`, `@xterm/addon-web-links@^0.11`, `@xterm/addon-webgl@^0.18`, `@xterm/addon-serialize@^0.13` |

### Renderer libs + hooks

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/lib/xterm-theme.ts` | CREATE | Build `ITheme` from CSS variables; re-build on theme change |
| `apps/desktop/src/renderer/hooks/useTerminal.ts` | CREATE | Canonical XTERM_INTEGRATION_PATTERN |
| `apps/desktop/src/renderer/hooks/useTaskEvents.ts` | CREATE | Per-task subscription wrapper |
| `apps/desktop/src/renderer/hooks/useEscToClose.ts` | CREATE | Canonical KEYBOARD_DISMISS_PATTERN |
| `apps/desktop/src/renderer/hooks/useDetailPanel.ts` | CREATE | App-level state for "which task is open"; exposes `openTask(id)` and `closeTask()` |
| `apps/desktop/src/renderer/hooks/useResizeObserver.ts` | CREATE | 10-line custom hook used by useTerminal |

### Renderer components — detail panel

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/components/detail-panel/DetailPanel.tsx` | CREATE | Canonical pattern above |
| `apps/desktop/src/renderer/components/detail-panel/PanelHeader.tsx` | CREATE | Task key + agent chip + status indicator + close button (`X` icon from lucide-react) |
| `apps/desktop/src/renderer/components/detail-panel/PanelTabs.tsx` | CREATE | Three-tab strip; controls active tab via local state; aria roles `tablist`/`tab`/`tabpanel` |
| `apps/desktop/src/renderer/components/detail-panel/PanelFooter.tsx` | CREATE | State-aware: reviewing → `Approve` (primary) + `Request changes` (secondary); running → empty (cancel happens via signal row in TerminalTab); error → `Retry`. Always includes `Discard run` (ghost). |
| `apps/desktop/src/renderer/components/detail-panel/MetaStrip.tsx` | CREATE | "runtime · bytes_emitted · exit_code (when ended)"; reads from `runs.list` cache |
| `apps/desktop/src/renderer/components/detail-panel/TerminalTab.tsx` | CREATE | Renders the xterm.js container; uses `useTerminal(currentRunId, ref)`; below the terminal: a 32 px status row with `[SIGINT]` / `[SIGTERM]` ghost buttons + bytes counter + `attached / detached / run ended` indicator |
| `apps/desktop/src/renderer/components/detail-panel/TranscriptTab.tsx` | CREATE | While running: shows "Run in progress — see Terminal." Once status moves out of running: calls `trpc.runs.getTranscript.useQuery(...)` and renders the text in a `<pre>` with mono font, scrollable, copyable |
| `apps/desktop/src/renderer/components/detail-panel/DiffTab.tsx` | CREATE | v1.5 stub: renders the visual shell from DESIGN.md §11 (file list + +/- gutters) with placeholder content + a callout "Diff capture lands in v1.5 — track your changes via `git diff` for now." |

### Renderer components — wiring

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/components/board/TaskCard.tsx` | UPDATE | `onClick` → `useDetailPanel().openTask(task.id)`; `onKeyDown` for Enter/Space mirrors |
| `apps/desktop/src/renderer/App.tsx` | UPDATE | Render `<DetailPanel taskId={openTask} onClose={closeTask} />` when a task is open |
| `apps/desktop/src/renderer/styles/global.css` | UPDATE | Add `@keyframes slide-in-right` + `motion-safe:animate-slide-in-right` utility for the panel mount transition |

### Tests

| File | Action | Justification |
|---|---|---|
| `apps/desktop/test/renderer/components/DetailPanel.test.tsx` | CREATE | Renders with given task; Esc key calls `onClose`; click outside does NOT close (panel is non-modal); panel-tabs roles are correct |
| `apps/desktop/test/renderer/components/PanelFooter.test.tsx` | CREATE | State-aware buttons appear/hide correctly; Approve mutation calls `tasks.approve`; Discard calls `tasks.discardRun`; the buttons are disabled while a mutation is in-flight |
| `apps/desktop/test/renderer/components/TranscriptTab.test.tsx` | CREATE | While running: placeholder; after end: query fires; while loading: skeleton; on error: error inline |
| `apps/desktop/test/renderer/hooks/useTerminal.test.ts` | CREATE | Mock `attachTerminal`; verify subscription order (onOutput before attach completes); verify dispose on unmount; verify resize propagation |
| `apps/desktop/test/renderer/lib/xterm-theme.test.ts` | CREATE | `buildXtermTheme()` reads CSS vars; switching `data-theme` produces a different theme object; ANSI palette is complete (16 colors) |

### Documentation

| File | Action | Justification |
|---|---|---|
| `DESIGN.md` | (no change) | Already specifies §10 and §11 — this plan implements them |

---

## NOT Building

- **Real diff computation.** `runs.getDiff` is still a v1.5 TODO. Plan #7 ships the visual shell + a placeholder; the contract for actual diff data isn't ready.
- **Multiple concurrent panels.** Only one panel is open at a time. Opening another task replaces the current panel (transition handled in `useDetailPanel`).
- **Drag-to-resize panel width.** Panel width is `min(720px, 55vw)`. v2 may add resize.
- **Tab persistence across panel reopens.** Default to Terminal each open. v1 acceptable.
- **Cross-task terminal sharing.** Each panel attaches to its own runId.
- **Empty-state polish for the panel.** Plan #8.
- **Toast on mutation success.** Plan #8.

---

## Step-by-Step Tasks

### Task 1: xterm.js dependencies

- **ACTION:** Update `apps/desktop/package.json`.
- **IMPLEMENT:** Add the six addons. Pin majors per External Documentation.
- **GOTCHA:** Each addon is a separate package under the `@xterm/` org. Don't grab the legacy `xterm-addon-*` packages.
- **VALIDATE:** `bun install` resolves; no native rebuild needed (xterm.js is pure JS).

### Task 2: xterm theme builder

- **ACTION:** Create `apps/desktop/src/renderer/lib/xterm-theme.ts`.
- **IMPLEMENT:**
  ```ts
  import type { ITheme } from "@xterm/xterm";

  function readVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  export function buildXtermTheme(): ITheme {
    return {
      background: readVar("--surface-inset"),
      foreground: readVar("--text-primary"),
      cursor: readVar("--accent"),
      cursorAccent: readVar("--surface-inset"),
      selectionBackground: readVar("--accent-soft"),
      // ANSI 16 — desaturated mapping that doesn't fight the design tokens.
      black: readVar("--surface-base"),
      red: readVar("--status-error"),
      green: readVar("--status-running"),
      yellow: readVar("--status-review"),
      blue: readVar("--agent-codex"),       // bluish — aligns with Codex hue
      magenta: readVar("--agent-gpt-5"),    // plum
      cyan: readVar("--agent-cursor"),      // teal
      white: readVar("--text-secondary"),
      brightBlack: readVar("--text-tertiary"),
      brightRed: readVar("--status-blocked"),
      brightGreen: readVar("--status-complete"),
      brightYellow: readVar("--accent"),
      brightBlue: readVar("--agent-claude-code"),
      brightMagenta: readVar("--agent-aider"),
      brightCyan: readVar("--agent-gemini"),
      brightWhite: readVar("--text-primary"),
    };
  }
  ```
- **MIRROR:** XTERM_INTEGRATION_PATTERN.
- **GOTCHA:** Pure-JS Tailwind classes don't help here — xterm.js writes directly to its canvas/WebGL surface, ignoring Tailwind utility classes.
- **VALIDATE:** `xterm-theme.test.ts` — toggle `data-theme="paper-light"`; assert `background` differs.

### Task 3: `useResizeObserver` hook

- **ACTION:** Create `apps/desktop/src/renderer/hooks/useResizeObserver.ts`.
- **IMPLEMENT:**
  ```ts
  export function useResizeObserver(ref: RefObject<Element>, cb: () => void) {
    useEffect(() => {
      if (!ref.current) return;
      const ro = new ResizeObserver(() => cb());
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, [ref, cb]);
  }
  ```
- **GOTCHA:** Don't pass an inline arrow function as `cb` without memoization — the effect tears down on every render. Wrap with `useCallback`.
- **VALIDATE:** Used by `useTerminal`; integration test asserts fit() is called on resize.

### Task 4: `useTerminal` hook

- **ACTION:** Create `apps/desktop/src/renderer/hooks/useTerminal.ts`.
- **IMPLEMENT:** Canonical XTERM_INTEGRATION_PATTERN.
- **MIRROR:** XTERM_INTEGRATION_PATTERN.
- **GOTCHA:** Always subscribe to `onOutput` BEFORE awaiting `attachTerminal()`. The first chunk after attach IS the scrollback — losing it shows the user a blank terminal even though plenty of context exists.
- **VALIDATE:** `useTerminal.test.ts` — mock `attachTerminal` to deliver scrollback synchronously; assert `term.write` was called with the scrollback bytes.

### Task 5: `useEscToClose` and `useDetailPanel`

- **ACTION:** Create the two hooks.
- **IMPLEMENT:**
  - `useEscToClose`: canonical pattern.
  - `useDetailPanel`: App-level state. Exports a small store (zustand-style or plain React context) — but to avoid a deps add, we use `useState` lifted to App with a context provider:
    ```ts
    type DetailPanelState = { taskId: string | null; open: (id: string) => void; close: () => void };
    export const DetailPanelContext = createContext<DetailPanelState | null>(null);
    export const useDetailPanel = () => {
      const ctx = useContext(DetailPanelContext);
      if (!ctx) throw new Error("useDetailPanel outside provider");
      return ctx;
    };
    ```
- **GOTCHA:** Restoring focus on close — capture `document.activeElement` when opening, call `.focus()` on it after close. Skip if it's `<body>` (no useful focus to restore).
- **VALIDATE:** `DetailPanel.test.tsx` — Esc closes; focus restoration verified.

### Task 6: `useTaskEvents` hook

- **ACTION:** Create `apps/desktop/src/renderer/hooks/useTaskEvents.ts`.
- **IMPLEMENT:** Canonical PER_TASK_EVENTS_PATTERN.
- **MIRROR:** EVENT_STREAM_HOOK_PATTERN from plan #6.
- **GOTCHA:** Subscribe AND unsubscribe within the same effect (React Strict Mode runs effects twice in dev — double-subscribe without cleanup is the canonical bug).
- **VALIDATE:** Subscribed once per taskId; unsubscribed on unmount (asserted via mock).

### Task 7: PanelHeader

- **ACTION:** Create `components/detail-panel/PanelHeader.tsx`.
- **IMPLEMENT:** `task-key` (mono uppercase) · `AgentChip` · `StatusIndicator` · close button (`X` from lucide-react). Then `task.title` as `<h2>` in `heading` style. Then `MetaStrip`.
- **GOTCHA:** `aria-label` on the close button: "Close task panel".
- **VALIDATE:** Renders.

### Task 8: PanelTabs

- **ACTION:** Create `components/detail-panel/PanelTabs.tsx`.
- **IMPLEMENT:** Three-tab pill row (`Terminal` / `Diff` / `Transcript`). Active tab rendered with `surface-pressed` background. Each tab is a `<button role="tab" aria-selected={...} aria-controls={...}>`. Default selected: Terminal.
- **GOTCHA:** Diff tab is enabled but its content is the v1.5 stub. Don't disable the tab — that would hide the visual shell.
- **VALIDATE:** Tab switching works; aria roles are correct.

### Task 9: PanelFooter

- **ACTION:** Create `components/detail-panel/PanelFooter.tsx`.
- **IMPLEMENT:**
  ```tsx
  function PanelFooter({ task, onClose }: { task: Task; onClose: () => void }) {
    const approve = trpc.tasks.approve.useMutation();
    const reject = trpc.tasks.reject.useMutation();
    const retry = trpc.tasks.retry.useMutation();
    const discard = trpc.tasks.discardRun.useMutation();
    return (
      <footer className="border-t border-border-subtle p-4 flex gap-2 justify-end">
        {task.status === "reviewing" && (
          <>
            <Button variant="secondary" disabled={reject.isPending} onClick={() => reject.mutateAsync({ id: task.id })}>Request changes</Button>
            <Button variant="primary" disabled={approve.isPending} onClick={() => approve.mutateAsync({ id: task.id })}>Approve & merge</Button>
          </>
        )}
        {task.status === "error" && (
          <Button variant="primary" disabled={retry.isPending} onClick={() => retry.mutateAsync({ id: task.id })}>Retry</Button>
        )}
        <Button variant="ghost" disabled={discard.isPending} onClick={() => discard.mutateAsync({ id: task.id })}>Discard run</Button>
      </footer>
    );
  }
  ```
- **MIRROR:** State-aware buttons from plan #6's `TaskCardActions`.
- **GOTCHA:** Don't show approve/reject in the footer when `status === "running"`. The user must wait for the run to end (or cancel via Discard or the SIGINT button in TerminalTab).
- **VALIDATE:** `PanelFooter.test.tsx`.

### Task 10: MetaStrip

- **ACTION:** Create `components/detail-panel/MetaStrip.tsx`.
- **IMPLEMENT:** `meta` font; renders runtime, bytes_emitted, exit code (after end). Reads from `trpc.runs.get.useQuery({ task_id, run_id: task.current_run_id })`. While running, uses `useNow(1000)` for live runtime.
- **GOTCHA:** When `task.current_run_id` is null (e.g. just-created backlog task), render an em-dash for every field.
- **VALIDATE:** Renders correctly while running and after end.

### Task 11: TerminalTab

- **ACTION:** Create `components/detail-panel/TerminalTab.tsx`.
- **IMPLEMENT:**
  ```tsx
  function TerminalTab({ task }: { task: Task }) {
    const ref = useRef<HTMLDivElement>(null);
    const { session, closed } = useTerminal(task.current_run_id, ref.current);
    return (
      <div className="flex flex-col h-full">
        <div ref={ref} className="flex-1 bg-surface-inset" />
        <div className="border-t border-border-subtle px-3 py-2 flex items-center gap-3 meta">
          <span>{closed ? "run ended" : session ? "attached" : "attaching…"}</span>
          {session && !closed && (
            <>
              <button onClick={() => session.signal("SIGINT")} className="ghost-btn">SIGINT</button>
              <button onClick={() => session.signal("SIGTERM")} className="ghost-btn">SIGTERM</button>
            </>
          )}
          <span className="ml-auto">{/* bytes counter from runs.get cache */}</span>
        </div>
      </div>
    );
  }
  ```
- **MIRROR:** XTERM_INTEGRATION_PATTERN.
- **GOTCHA:** `task.current_run_id` may be null (backlog or just-discarded). When null, render a `meta` line "No live run. Click Run on the card to start." instead of mounting an xterm.
- **VALIDATE:** `useTerminal.test.ts` covers the hook; manual test the visible status row.

### Task 12: TranscriptTab

- **ACTION:** Create `components/detail-panel/TranscriptTab.tsx`.
- **IMPLEMENT:**
  - If `task.status === "running"`: render `<p class="meta tertiary">Run in progress — see Terminal.</p>`.
  - Else: `trpc.runs.getTranscript.useQuery({ task_id, run_id: task.current_run_id })`. Render `<pre className="whitespace-pre-wrap font-mono p-4 overflow-auto">{transcript}</pre>`. While `isLoading`, show a 3-line skeleton. On `not_found`, show "No transcript available." On error, show the envelope's `message`.
- **GOTCHA:** The transcript file may be large (1+ MB). For v1, render in full; v1.5 may add virtualization. Document.
- **VALIDATE:** `TranscriptTab.test.tsx`.

### Task 13: DiffTab (v1.5 stub)

- **ACTION:** Create `components/detail-panel/DiffTab.tsx`.
- **IMPLEMENT:** Renders the visual shell from DESIGN.md §11 — file header + line-numbered mono body — with a single placeholder file showing example +/- lines and a banner: "Diff capture lands in v1.5. Use `git diff` in your project for now." Include a "Re-fetch when implemented" comment in the source.
- **GOTCHA:** Don't import `runs.getDiff` — it always returns `not_found` in v1, and we shouldn't render an error for an intentionally-unimplemented feature.
- **VALIDATE:** Renders without errors; visual passes review.

### Task 14: DetailPanel composition

- **ACTION:** Create `components/detail-panel/DetailPanel.tsx`.
- **IMPLEMENT:** Canonical pattern above; wires PanelHeader, PanelTabs, PanelFooter; tab content area renders TerminalTab/DiffTab/TranscriptTab based on the active tab.
- **GOTCHA:** Use a CSS grid (`grid-rows-[auto_auto_1fr_auto]`) so the tab content area expands.
- **VALIDATE:** Visual against DESIGN.md §11.

### Task 15: TaskCard click + App composition

- **ACTION:** Update `TaskCard.tsx` and `App.tsx`.
- **IMPLEMENT:**
  - `TaskCard`: add `onClick={() => openTask(task.id)}`. Add `onKeyDown` for Enter/Space (mirror DESIGN.md §13 keyboard nav).
  - `App.tsx`: wrap the layout in `<DetailPanelContext.Provider value={...}>`. Render `<DetailPanel ... />` when `taskId !== null`.
- **GOTCHA:** Stop propagation on action buttons inside the card (`TaskCardActions`) — clicking Approve in the inline actions should NOT also open the panel.
- **VALIDATE:** Manual click-through.

### Task 16: Slide-in animation

- **ACTION:** Update `apps/desktop/src/renderer/styles/global.css`.
- **IMPLEMENT:**
  ```css
  @keyframes slide-in-right {
    from { transform: translateX(100%); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  .motion-safe\:animate-slide-in-right { animation: slide-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1); }
  @media (prefers-reduced-motion: reduce) {
    .motion-safe\:animate-slide-in-right { animation: none; }
  }
  ```
- **GOTCHA:** No exit animation in v1 — close is instant. v2 may add a slide-out-right with `framer-motion` if it stays consistent with the rest of the system.
- **VALIDATE:** Visual.

### Task 17: Tests

- **ACTION:** Create the test files listed above.
- **IMPLEMENT:** Use `@testing-library/react`, mock `vmBridge.terminal.*`, render with the providers from plan #6's `setup.ts`.
- **GOTCHA:** xterm.js's WebGL addon will fail in `happy-dom` (no GPU). The hook gracefully falls back to canvas; tests should NOT enable the WebGL addon — guard the `new WebglAddon()` call with `try/catch` (already done in canonical pattern).
- **VALIDATE:** All tests pass.

### Task 18: Final validation

- **ACTION:** Per "Validation Commands" below.

---

## Testing Strategy

### Unit / hook

| Test | Critical assertion |
|---|---|
| `buildXtermTheme` | Reads CSS vars; ANSI 16 complete; theme differs after `data-theme` swap |
| `useTerminal` | onOutput subscription happens BEFORE `attachTerminal` resolves; cleanup on unmount disposes terminal + addons + session |
| `useEscToClose` | Esc triggers callback; non-Esc keys don't |
| `useDetailPanel` context | `open` and `close` mutate `taskId`; throws if used outside provider |

### Integration

- Click card → panel opens with correct task → Esc closes
- Open panel → terminal attaches → mock `onOutput` delivers bytes → assertion: `term.write` called with chunks
- Mock `onClosed` → state row says "run ended" → footer footer shows the right buttons
- Approve mutation triggered from footer → `tasks.approve` called → cache updates via event → panel header re-renders to "complete"
- Tab switching: Terminal → Transcript while running shows the placeholder; → Transcript after end fires the query; → Diff renders the v1.5 stub
- Open task A, then click task B's card → panel transitions to task B (terminal disposes for A, mounts for B)

### Edge cases

- [ ] Open panel for a task with `current_run_id === null` → terminal tab shows the "No live run" message; transcript tab shows nothing meaningful; diff tab shows the stub
- [ ] Open panel mid-run → scrollback replays; live bytes follow
- [ ] Run ends while panel is open → state row updates; footer reveals action buttons
- [ ] Theme switched while terminal is open → xterm.js theme re-applied (subscribe to a `themechange` event from `useTheme` — Task 4 GOTCHA: re-set `term.options.theme = buildXtermTheme()`)
- [ ] Window resize → fit() called → `session.resize(cols, rows)` propagates to PTY
- [ ] Open panel for ended run within 30s window → scrollback replays + immediate `term:closed` (plan #5 contract); UI shows "run ended" instantly
- [ ] Open panel for ended run after 30s GC → terminal tab attempts attach → `not_found` → render "No live terminal. See Transcript tab." inline

---

## Validation Commands

```bash
bun lint
bun typecheck
bun test
bun --filter @vibemaestro/desktop run build
```
**EXPECT:** all green. xterm.js bundle adds ~120 KB gzipped — acceptable.

### Manual

1. Boot. Create a task with a long-running fake agent (or real Claude Code).
2. Run it. Click the card. Panel slides in. Terminal attaches; live output appears.
3. Type `hello`. Verify the agent's transcript later shows it.
4. Click SIGINT. Agent receives SIGINT (visible in terminal as ^C).
5. Wait for run to end. Footer reveals Approve/Request changes.
6. Click Approve. Card moves to Complete; panel header updates to "complete."
7. Click Transcript tab. Full transcript renders.
8. Press Esc. Panel closes.
9. Reopen panel. Terminal tab is default; no live attachment; "No live terminal." inline message.

---

## Acceptance Criteria
- [ ] All 18 tasks completed
- [ ] Panel slides in on card click; Esc closes
- [ ] xterm.js attaches via `terminal-client.ts`; scrollback replay visible
- [ ] Theme switch updates xterm.js's theme
- [ ] State-aware footer buttons match DESIGN.md §11
- [ ] Transcript tab renders captured output
- [ ] Diff tab shows the v1.5 stub
- [ ] Closing the panel detaches but does NOT cancel the run
- [ ] Clicking another card while panel is open transitions cleanly (terminal disposes/remounts)
- [ ] Reduced-motion disables cursor blink + slide animation

## Completion Checklist
- [ ] Code follows DETAIL_PANEL_PATTERN, XTERM_INTEGRATION_PATTERN, PER_TASK_EVENTS_PATTERN, KEYBOARD_DISMISS_PATTERN
- [ ] No xterm.js imports outside `useTerminal.ts` and `xterm-theme.ts`
- [ ] No `vmBridge.terminal.*` calls outside `terminal-client.ts`
- [ ] All effects clean up properly (verified by HMR — open/close panel 5× in dev, no leaked GPU contexts)
- [ ] Theme switch re-applies `term.options.theme`
- [ ] No regressions in plans #1–#6
- [ ] Self-contained — no questions during implementation

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| xterm.js + happy-dom test environment incompatibility | High | Medium (test suite, not prod) | Tests mock `Terminal` and assert on `useTerminal`'s effect orchestration, not on actual rendering |
| WebGL addon fails on some Linux configurations | Medium | Low | try/catch around `new WebglAddon()`; canvas fallback is built into xterm.js |
| GPU context leak across HMR reloads | Medium (dev) | Low (dev only) | Strict `dispose()` chain in cleanup; verified manually |
| Scrollback replay arrives before subscribe | Medium | High (blank terminal) | Subscribe BEFORE awaiting attach (canonical Task 4 GOTCHA) |
| Theme switch mid-run flickers terminal | Low | Low | xterm.js redraws on `term.options.theme = …` instantly |
| Diff stub looks like a bug | Medium | Low | Banner clearly states "v1.5"; visual shell makes the intent obvious |
| Mutation race on Approve click + simultaneous event arrival | Low | Low | Mutations are idempotent; cache updates merge cleanly |
| Esc closes when user is mid-typing in terminal | Low (xterm.js consumes most keys) | Low | Esc inside xterm.js is a real terminal key (cancels readline editing); user-perceptible behavior matches a real terminal |

## Notes

### Plan-#7 → Plan-#8 contract

Plan #8 will:
1. Replace inline empty-state strings ("No live run.", "No transcript available.") with the editorial DESIGN.md §11 versions.
2. Replace `alert(...)` mutation error fallbacks with toasts.
3. Add the create-task button + form to the topbar.
4. Add command palette (`⌘K`) with task search + jump-to-task.
5. Wire `?` cheatsheet showing keyboard shortcuts.
6. Add focus-trapping to the panel for tab navigation.

### Remaining v1.5 TODOs (surfaced)

- Real diff capture
- Project-root concept (per-task cwd)
- Per-run sandbox
- Transcript virtualization for large outputs
- Panel exit animation

### Self-contained guarantee

Every pattern, snippet, file path, and gotcha needed to implement plan #7 is captured here.
