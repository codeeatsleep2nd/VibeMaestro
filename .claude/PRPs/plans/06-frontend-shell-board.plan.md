# Plan 06: Frontend Shell, Board & Theme

## Summary
Build the renderer UI from `DESIGN.md` §1–10: the four-lane board with live task cards, agent chips, status indicators, the conductor strip, the topbar with theme switch, and the mobile lane-switcher. Wires the design tokens (`design-tokens.json`) into Tailwind 4 + CSS variables, consumes plan #2's `tasks.*` and plan #3's `agents.*` via TanStack React Query, and stays live by applying plan #4's event stream to the query cache.

## User Story
As a developer running VibeMaestro,
I want to see my tasks moving across the board in real time as my agents work,
So that the visual system from DESIGN.md actually reflects what the backend is doing.

## Problem → Solution
- **Current state (after plan #5):** The renderer still shows the plan #1 stub (a wordmark and a "ping main" button). Backend has tasks, runs, agents, events, and a terminal bridge but the UI hasn't been built.
- **Desired state:** App boots into the terminal-dark theme. Topbar shows the logo, board name, and theme switch. The four-lane board (`Backlog / Running / Reviewing / Complete`) renders task cards with agent chips, status indicators, and elapsed-time meta. Cards in `running` pulse on the status dot. State changes from the event stream re-render in <100 ms without re-fetching. Inline card actions trigger the right `tasks.*` mutations. Below 640 px, lanes collapse to a single visible lane with a sticky chip-row switcher. The conductor strip footer lists every live agent activity with seconds counting up. **No detail panel yet (plan #7), no command palette / create-task form (plan #8).**

## Metadata
- **Complexity:** Large
- **Source PRD:** N/A — derived from `DESIGN.md §1–10` and the `design-tokens.json` API
- **PRD Phase:** N/A — plan 6 of 8
- **Estimated Files:** ~32
- **Confidence Score:** 8/10 — visual fidelity to `DESIGN.md` is the main quality bar; risk is stylistic drift

---

## UX Design

### Before (plan #1 stub)
```
┌────────────────────────────────────────┐
│  VIBEMAESTRO                           │
│  plan #1 — backend skeleton            │
│  [ Ping main ]                         │
│  { "status": "ok", … }                 │
└────────────────────────────────────────┘
```

### After (plan #6)
```
┌────────────────────────────────────────────────────────────────────┐
│ ▎▆▇  VIBEMAESTRO   v0.1.0          THEME [terminal-dark][paper-…]  │
├────────────────────────────────────────────────────────────────────┤
│  Refactor & release week                              2 agents · 7 │
│  ────────────────────────────────────────────────────────────────  │
│   BACKLOG · 2     RUNNING · 2    REVIEWING · 2    COMPLETE · 1     │
│   ────────────    ────────────   ─────────────    ─────────────    │
│  ┌──────────┐    ┌──────────┐   ┌──────────┐    ┌──────────┐       │
│  │▎ VM-221  │    │▎ VM-218  │   │▎ VM-211  │    │▎ VM-204  │       │
│  │  …       │    │  refac…  │   │  argon2… │    │  done    │       │
│  │  [CC]    │    │  ◐ 2:14  │   │  ● 4 fil │    │  ● 1:02  │       │
│  └──────────┘    └──────────┘   └──────────┘    └──────────┘       │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ NOW CONDUCTING  CC running VM-218 · 2:14  /  CX running …  /  …    │
└────────────────────────────────────────────────────────────────────┘
```

### Interaction Changes

| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Initial render | Stub | Board with all current tasks grouped by status | `tasks.list` on mount |
| State change (running → reviewing) | (n/a) | Card moves lanes within ~100 ms | Driven by `task.state_changed` event |
| Pulse on running dot | — | 2.2s radial pulse | DESIGN.md §10 |
| Hover task card | — | `shadow-2`, agent stripe widens to 5 px | DESIGN.md §10 |
| Card actions | — | Inline Approve/Request changes (reviewing) · Cancel (running) · Retry (error) · Discard (any) | Plan #6 (read+act); Plan #8 polishes |
| Theme switch | — | Click toggle → all components re-evaluate tokens | DESIGN.md §3 |
| Mobile (<640 px) | n/a | One lane visible; sticky chip row above to switch | DESIGN.md §11 mobile |

---

## Mandatory Reading

| Priority | File | Section/Lines | Why |
|---|---|---|---|
| **P0** | `DESIGN.md` | §1–10 | Visual contract this plan implements |
| **P0** | `design-tokens.json` | full | Single source of truth for color, typography, spacing, motion |
| **P0** | `design-preview.html` | full | Reference implementation — how the tokens look applied; mine for class names and motion timings |
| **P0** | `.claude/PRPs/plans/04-event-bus-ipc-streams.plan.md` | "Plan-#4 → Plan-#6 contract" Notes | How the renderer subscribes and recovers |
| **P0** | `apps/desktop/src/main/routers/_app.ts` | full | The `AppRouter` type the renderer infers from |
| **P0** | `apps/desktop/src/renderer/{trpc.ts,events.ts}` | full | Bridge surface from plans #1 + #4 |
| **P1** | `assets/logo.svg` | full | Inline into the topbar via React component |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| **Tailwind 4** | `tailwindcss.com/docs/installation` | `^4.1` | `@tailwindcss/postcss` plugin; CSS-first config via `@theme` directive — no `tailwind.config.ts` needed for v4. Use CSS variables from `tokens.css` directly in `@theme` |
| **Tailwind 4 + design tokens** | `tailwindcss.com/docs/v4-beta#using-css-variables` | — | `@theme { --color-surface-base: var(--surface-base); … }` exposes tokens as Tailwind utilities (`bg-surface-base`, `text-text-primary`) |
| **TanStack React Query 5** | `tanstack.com/query/latest/docs/framework/react/overview` | `^5.90` | `useQuery({ queryKey, queryFn })` for tasks/agents; `useMutation` for actions; `queryClient.setQueryData` for event-driven updates |
| **tRPC + TanStack Query** | `trpc.io/docs/client/react/setup` | `@trpc/tanstack-react-query@^11` | `createTRPCReact<AppRouter>()` provides `trpc.tasks.list.useQuery()` etc. with full type inference |
| **xterm.js** | `xtermjs.org` | (plan #7) | Plan #6 does NOT consume xterm.js |
| **Lucide React** | `lucide.dev` | `^0.563` | Tree-shakable icons (chevrons, X, search) — Superset uses this |
| **OKLCH browser support** | `caniuse.com/css-color-function` | — | Chrome 111+ / Safari 16.4+ — Electron 33 ships Chromium 130, so we're safe; no PostCSS shim needed for v1 |

```
KEY_INSIGHT: Tailwind 4's CSS-first config means the design tokens drive the
            utility namespace directly. We don't generate code; we generate
            a tokens.css that @theme picks up.
APPLIES_TO: scripts/generate-tokens.ts + tokens.css
GOTCHA:     Run the generator on `bun install` (postinstall) so a developer
            never sees stale tokens after a design-tokens.json change.

KEY_INSIGHT: TanStack Query's queryKey is the cache key. Mirror the tRPC path:
            ["tasks", "list", filters], ["tasks", "get", id], etc.
APPLIES_TO: hooks/useTasks.ts and the event-cache merger
GOTCHA:     trpc-react-query auto-generates these keys; use the helpers it
            exposes (e.g. trpc.tasks.list.queryOptions(filters).queryKey)
            so manual setQueryData calls hit the right entries.

KEY_INSIGHT: Apply event stream → query cache, not event stream → component state.
            Re-rendering happens automatically because Query notifies subscribers.
APPLIES_TO: hooks/useEventStream.ts integration
GOTCHA:     queryClient.setQueryData mutations must be functional (prev =>
            new) to avoid clobbering optimistic updates from useMutation.

KEY_INSIGHT: The conductor strip's elapsed-time counter ticks at 1Hz by deriving
            from new Date() - run.started_at — no need for a separate timer per
            row. Use a single requestAnimationFrame loop scheduled to ~1Hz.
APPLIES_TO: components/conductor/ConductorStrip.tsx
GOTCHA:     Re-render the whole strip on each tick is fine (it's small);
            don't optimize prematurely with refs.

KEY_INSIGHT: Pulse animation: prefers-reduced-motion must collapse it to a
            static ring. DESIGN.md §10 mandates this — do not skip.
APPLIES_TO: components/status/StatusIndicator.tsx
GOTCHA:     Use a CSS @media (prefers-reduced-motion: reduce) block, not a JS check.
```

---

## Patterns to Establish

> Plan #6 establishes the renderer-side patterns. Plan #7 (detail panel) and plan #8 (polish) will mirror them.

### TOKEN_TO_CSS_PATTERN — generate `tokens.css` from `design-tokens.json`

```ts
// apps/desktop/scripts/generate-tokens.ts (run on postinstall)
import { readFileSync, writeFileSync } from "node:fs";
const tokens = JSON.parse(readFileSync("../../design-tokens.json", "utf8"));
const out: string[] = [];

// Primitive tokens (theme-agnostic)
out.push(":root {");
for (const [k, v] of Object.entries(tokens.primitives.spacing)) out.push(`  --space-${k}: ${v};`);
for (const [k, v] of Object.entries(tokens.primitives.radius)) out.push(`  --radius-${k}: ${v};`);
// motion, typography...
out.push("}\n");

// Theme blocks
for (const [theme, def] of Object.entries(tokens.themes)) {
  out.push(`[data-theme="${theme}"] {`);
  for (const [group, fields] of Object.entries(def as any)) {
    if (group === "description" || group === "agent") continue; // agent handled below
    for (const [k, v] of Object.entries(fields as any)) {
      const cssName = `--${group.replace(/_/g, "-")}-${k.replace(/_/g, "-").replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      out.push(`  ${cssName}: ${v};`);
    }
  }
  // Agents — flatten to --agent-<id>
  for (const [agentId, info] of Object.entries((def as any).agent)) {
    out.push(`  --agent-${agentId}: ${(info as any).hue};`);
  }
  out.push("}");
}

writeFileSync("src/renderer/styles/tokens.css", out.join("\n"));
```

**Rule:** never hand-edit `tokens.css`. Edit `design-tokens.json` and run `bun run generate:tokens`.

### THEME_BOOTSTRAP_PATTERN — `data-theme` on `<html>`, no FOUC

```html
<!-- apps/desktop/index.html -->
<!doctype html>
<html lang="en" data-theme="terminal-dark">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/src/renderer/styles/tokens.css" />
    <link rel="stylesheet" href="/src/renderer/styles/global.css" />
    <script>
      // Inline before React mounts: read user pref from localStorage (terminal-dark | paper-light)
      try {
        const t = localStorage.getItem("vm:theme");
        if (t === "paper-light" || t === "terminal-dark") document.documentElement.setAttribute("data-theme", t);
      } catch {}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

```tsx
// apps/desktop/src/renderer/hooks/useTheme.ts
import { useState, useEffect } from "react";
type Theme = "terminal-dark" | "paper-light";
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.getAttribute("data-theme") as Theme) ?? "terminal-dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("vm:theme", theme); } catch {}
  }, [theme]);
  return [theme, setTheme];
}
```

**Rule:** the theme is set BEFORE React mounts (inline script in HTML). React's `useTheme` only changes the value — it never reads on first paint.

### TANSTACK_QUERY_PATTERN — tRPC + Query, typed end-to-end

```tsx
// apps/desktop/src/renderer/lib/trpc.ts (replaces plan #1 stub)
import { createTRPCReact } from "@trpc/tanstack-react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "../../main/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

// Custom IPC link from plan #1 (refactored into a function)
import { ipcLink } from "./ipc-link";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // events keep things fresh; queries don't need to refetch on focus
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const trpcClient = trpc.createClient({ links: [ipcLink()] });
```

```tsx
// hook usage
import { trpc } from "@/lib/trpc";
const { data: tasks } = trpc.tasks.list.useQuery({});
const cancel = trpc.tasks.cancel.useMutation();
await cancel.mutateAsync({ id: "VM-218" });
```

**Rule:** every server call goes through `trpc.<resource>.<method>.useQuery/useMutation()`. No raw `vmBridge.trpcInvoke` from components.

### EVENT_STREAM_HOOK_PATTERN — events drive the cache

```tsx
// apps/desktop/src/renderer/hooks/useEventStream.ts
import { useEffect, useRef } from "react";
import { events } from "../events";
import { queryClient, trpc } from "../lib/trpc";
import type { EnvelopedEvent } from "@vibemaestro/core";

export function useEventStream() {
  const lastSeenId = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const replay = await events.replaySince(lastSeenId.current);
      if (replay.truncated) {
        // Cold-cache: invalidate everything; queries refetch
        queryClient.invalidateQueries();
      } else {
        for (const env of replay.events) apply(env);
      }
      if (!alive) return;
    })();
    const off = events.subscribeActivity((env) => {
      lastSeenId.current = env.id;
      apply(env);
    });
    return () => { alive = false; off(); };
  }, []);
}

function apply(env: EnvelopedEvent) {
  const e = env.event;
  switch (e.type) {
    case "task.state_changed": {
      // Patch any cached `tasks.list` results that include this task
      queryClient.setQueriesData<{ data: Task[]; meta?: any } | undefined>(
        { queryKey: trpc.tasks.list.queryKey() },
        (old) => old ? { ...old, data: old.data.map(t => t.id === e.task_id ? { ...t, status: e.to, updated_at: e.at } : t) } : old
      );
      // Also patch `tasks.get`
      queryClient.setQueryData(trpc.tasks.get.queryKey({ id: e.task_id }), (prev: any) =>
        prev?.data ? { data: { ...prev.data, status: e.to, updated_at: e.at } } : prev);
      break;
    }
    case "run.progress": {
      // Update conductor-strip-derived live counts in the cache
      queryClient.setQueryData(trpc.runs.get.queryKey({ task_id: e.task_id, run_id: e.run_id }), (prev: any) =>
        prev ? { ...prev, bytes_emitted: e.bytes_emitted } : prev);
      break;
    }
    // run.started, run.ended, agent.availability_changed similarly
  }
}
```

**Rule:** every event handler calls `setQueryData` (functional update) — never component-level state. Components consume the cache via Query and re-render automatically.

### COMPOSITION_PATTERN — small components, intentional composition

```tsx
<TaskCard task={task}>
  <TaskCard.Header>
    <TaskKey id={task.id} />
    <AgentChip agentId={task.agent_id} />
  </TaskCard.Header>
  <TaskCard.Title>{task.title}</TaskCard.Title>
  <TaskCard.Status>
    <StatusIndicator state={task.status} />
    <RunMeta task={task} />
  </TaskCard.Status>
  <TaskCard.Actions task={task} />
</TaskCard>
```

**Rule:** components stay <80 lines. If a component crosses that line, split.

### RESPONSIVE_PATTERN — Tailwind breakpoints + visible-lane state

```tsx
// Board.tsx
<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  {LANES.map((lane) => (
    <Lane key={lane} status={lane} className={cn(visibleLane !== lane && "max-md:hidden")} />
  ))}
</div>
{/* mobile only */}
<div className="md:hidden sticky top-0 z-10 bg-surface-base">
  <LaneSwitcher value={visibleLane} onChange={setVisibleLane} />
</div>
```

**Rule:** `xl:` for desktop 4-up (≥1280, comfortably under DESIGN.md's 1100 threshold once topbar/conductor are accounted for); `md:` for tablet 2-up; default for mobile 1-up.

---

## Files to Change

### Tooling

| File | Action | Justification |
|---|---|---|
| `apps/desktop/package.json` | UPDATE | Add `tailwindcss@^4.1`, `@tailwindcss/postcss@^4.1`, `lucide-react@^0.563`, `clsx@^2`, `tailwind-merge@^2`, `@trpc/tanstack-react-query@^11`. Add `generate:tokens` script + postinstall hook |
| `apps/desktop/postcss.config.mjs` | CREATE | `export default { plugins: { "@tailwindcss/postcss": {} } }` |
| `apps/desktop/scripts/generate-tokens.ts` | CREATE | Canonical pattern above |
| `apps/desktop/scripts/lint-tokens-css.ts` | CREATE | CI guard: fails if `tokens.css` is out of date relative to `design-tokens.json` (re-runs the generator and diffs) |

### Renderer styles

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/styles/tokens.css` | CREATE (generated) | Output of `generate-tokens.ts`; commit it |
| `apps/desktop/src/renderer/styles/global.css` | CREATE | `@import "tailwindcss"; @import "./tokens.css"; @theme { … }` mapping CSS variables to Tailwind tokens; reset, body styles, scrollbar tweaks |
| `apps/desktop/index.html` | UPDATE | Inline theme bootstrap script (canonical pattern) |

### Renderer hooks

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/hooks/useTheme.ts` | CREATE | Canonical pattern |
| `apps/desktop/src/renderer/hooks/useEventStream.ts` | CREATE | Canonical pattern |
| `apps/desktop/src/renderer/hooks/useNow.ts` | CREATE | 1Hz ticker via `setInterval` for the conductor strip's elapsed times |
| `apps/desktop/src/renderer/hooks/useTasksByStatus.ts` | CREATE | Selector hook: groups `tasks.list` data by status; memoized |

### Renderer libs

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/lib/trpc.ts` | UPDATE | Replace plan #1 stub with `createTRPCReact` + custom IPC link wired into TanStack Query |
| `apps/desktop/src/renderer/lib/ipc-link.ts` | CREATE | The custom tRPC link from plan #1 extracted into a reusable factory `ipcLink()` |
| `apps/desktop/src/renderer/lib/cn.ts` | CREATE | `cn()` = `twMerge(clsx(args))`, the standard Tailwind class joiner |

### Renderer components

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/main.tsx` | UPDATE | `<QueryClientProvider>` + `<TRPCProvider>` + `<App />` |
| `apps/desktop/src/renderer/App.tsx` | REPLACE | Compose TopBar + Board + ConductorStrip; call `useEventStream()` once |
| `apps/desktop/src/renderer/components/topbar/TopBar.tsx` | CREATE | Logo + board name + theme switch |
| `apps/desktop/src/renderer/components/topbar/ThemeSwitch.tsx` | CREATE | DESIGN.md §3 pill-style switch wired to `useTheme` |
| `apps/desktop/src/renderer/components/logo/Logo.tsx` | CREATE | Inline SVG from `assets/logo.svg`; uses `currentColor` |
| `apps/desktop/src/renderer/components/board/Board.tsx` | CREATE | Lane grid; mobile lane-switcher integration |
| `apps/desktop/src/renderer/components/board/Lane.tsx` | CREATE | Header (caption + count) + card stack; empty-state placeholder text from DESIGN.md §11 (full empty-state polish in plan #8) |
| `apps/desktop/src/renderer/components/board/TaskCard.tsx` | CREATE | Compound component (Header / Title / Status / Actions); agent stripe; hover/focus states |
| `apps/desktop/src/renderer/components/board/TaskCardActions.tsx` | CREATE | State-aware action buttons (approve/reject for reviewing, cancel for running, retry for error, discardRun fallback) |
| `apps/desktop/src/renderer/components/board/RunMeta.tsx` | CREATE | "running · 2m 14s · N bytes" / "complete · 1m 02s" — derived from task + (optional) run |
| `apps/desktop/src/renderer/components/agent/AgentChip.tsx` | CREATE | DESIGN.md §10 spec: monogram + label, agent hue background tint |
| `apps/desktop/src/renderer/components/status/StatusIndicator.tsx` | CREATE | DESIGN.md §10 spec; pulse for running; static ring for idle; triangle for blocked; `prefers-reduced-motion` honored |
| `apps/desktop/src/renderer/components/conductor/ConductorStrip.tsx` | CREATE | Footer; "NOW CONDUCTING" + per-running-task line with elapsed time; per-reviewing-task badge |
| `apps/desktop/src/renderer/components/lane-switcher/LaneSwitcher.tsx` | CREATE | Mobile: chip row `[Backlog 2][Running 2]…`; horizontal scroll if overflow |

### Tests

| File | Action | Justification |
|---|---|---|
| `apps/desktop/test/renderer/event-cache.test.ts` | CREATE | `apply()` from `useEventStream`: state-change patch hits the right query keys; truncated replay invalidates all queries |
| `apps/desktop/test/renderer/components/TaskCard.test.tsx` | CREATE | Renders state-aware actions (only Approve/Reject in reviewing; only Cancel in running; etc.); agent stripe color matches token; pulse class present in running |
| `apps/desktop/test/renderer/components/StatusIndicator.test.tsx` | CREATE | Each state renders the correct shape/animation class; `prefers-reduced-motion` collapses pulse |
| `apps/desktop/test/renderer/components/ConductorStrip.test.tsx` | CREATE | Lists running tasks with elapsed time; updates after `useNow` ticks |
| `apps/desktop/test/renderer/components/ThemeSwitch.test.tsx` | CREATE | Click toggles `data-theme`; persists to localStorage |
| `apps/desktop/test/renderer/components/Board.test.tsx` | CREATE | Tasks group into the right lanes by status |
| `apps/desktop/test/renderer/responsive.test.tsx` | CREATE | At <640 px, only the active lane is visible; switcher updates `visibleLane` |
| `apps/desktop/test/renderer/setup.ts` | CREATE | Test setup: `happy-dom` env, mock `vmBridge`, render with `QueryClientProvider` + `TRPCProvider` |

### Documentation

| File | Action | Justification |
|---|---|---|
| `README.md` | UPDATE | Update "Getting started" with the renderer running screenshot and a note about `bun run generate:tokens` |
| `DESIGN.md` | (no change) | Already specifies the contract this plan implements |

---

## NOT Building

- **Detail panel + xterm.js terminal.** Plan #7. Clicking a card in plan #6 is a no-op (or opens a placeholder).
- **Diff / Transcript views.** Plan #7.
- **Empty-state hero, loading skeletons, error toasts, command palette, keyboard shortcuts, `?` cheatsheet.** Plan #8.
- **Create-new-task UI.** Plan #8. For plan #6, tasks must be created via the tRPC console or by integration tests — sufficient for visual verification.
- **Drag-and-drop card movement between lanes.** Not in DESIGN.md; lanes change only through state-machine transitions, not direct manipulation.
- **Multi-board / project switcher.** v1 has one board.
- **Real-time agent availability indicator on the topbar.** v1 surfaces availability through the agent chip dim state when an agent is unavailable; topbar-level "agent connected" indicator is plan #8 polish.
- **Animation library (Framer Motion).** v1 uses CSS-only animations to keep the bundle small. If we need spring physics later, revisit.

---

## Step-by-Step Tasks

### Task 1: Tailwind 4 + PostCSS setup

- **ACTION:** Update `apps/desktop/package.json`. Create `apps/desktop/postcss.config.mjs`.
- **IMPLEMENT:** Add deps from the External Documentation table. Add scripts: `"generate:tokens": "bun run scripts/generate-tokens.ts"`, `"postinstall": "electron-builder install-app-deps && bun run generate:tokens"` (extends plan #1's postinstall).
- **GOTCHA:** Tailwind 4 prefers CSS-first config. Don't create a `tailwind.config.ts`. The `@theme` block lives in `global.css`.
- **VALIDATE:** `bun install` regenerates tokens; `bun --filter @vibemaestro/desktop run build` includes Tailwind utilities in output.

### Task 2: Token generator

- **ACTION:** Create `apps/desktop/scripts/generate-tokens.ts`.
- **IMPLEMENT:** Canonical pattern above.
- **MIRROR:** TOKEN_TO_CSS_PATTERN.
- **GOTCHA:** Camel-case keys in JSON (`textPrimary`) become `--text-primary` in CSS. Test the conversion on a few keys.
- **VALIDATE:** Run the script; diff `tokens.css` against the design-preview.html's `<style>` block — colors should match exactly.

### Task 3: Global CSS + theme bootstrap

- **ACTION:** Create `apps/desktop/src/renderer/styles/{global.css,tokens.css}`. Update `apps/desktop/index.html`.
- **IMPLEMENT:**
  ```css
  /* global.css */
  @import "tailwindcss";
  @import "./tokens.css";

  @theme {
    --color-surface-base: var(--surface-base);
    --color-surface-raised: var(--surface-raised);
    --color-text-primary: var(--text-primary);
    --color-text-secondary: var(--text-secondary);
    --color-text-tertiary: var(--text-tertiary);
    --color-accent: var(--accent);
    /* repeat for status, border, agent-* */
    --font-display: "JetBrains Mono", ui-monospace, monospace;
    --font-body: "Inter", system-ui, sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100%; }
  body {
    background: var(--surface-base);
    color: var(--text-primary);
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
  }
  ```
- **MIRROR:** THEME_BOOTSTRAP_PATTERN.
- **GOTCHA:** The inline theme-restore script in `index.html` runs synchronously before React. Without it the user sees a 100-200 ms flash of the wrong theme.
- **VALIDATE:** Boot the app; toggle theme; refresh; theme persists.

### Task 4: TanStack Query + tRPC react setup

- **ACTION:** Update `apps/desktop/src/renderer/lib/trpc.ts`. Create `lib/ipc-link.ts`. Update `main.tsx`.
- **IMPLEMENT:** Canonical TANSTACK_QUERY_PATTERN. The `ipc-link.ts` is plan #1's custom link extracted into `export function ipcLink(): TRPCLink<AppRouter> { … }`.
- **MIRROR:** TANSTACK_QUERY_PATTERN.
- **GOTCHA:** `<trpc.Provider>` must wrap `<QueryClientProvider>` AND share the same `QueryClient`. Order: `<QueryClientProvider client={queryClient}><trpc.Provider client={trpcClient} queryClient={queryClient}>{children}</trpc.Provider></QueryClientProvider>`.
- **VALIDATE:** `trpc.tasks.list.useQuery({})` in a component returns data without errors.

### Task 5: `cn()` and base utility hooks

- **ACTION:** Create `lib/cn.ts`, `hooks/useTheme.ts`, `hooks/useNow.ts`, `hooks/useTasksByStatus.ts`.
- **IMPLEMENT:** Canonical patterns; `useNow(intervalMs = 1000)` returns `number` (Date.now()), updates on interval. `useTasksByStatus(filters)` calls `trpc.tasks.list.useQuery(filters)` and `useMemo`-groups data by status into `{ backlog: Task[], running: Task[], … }`.
- **GOTCHA:** `useNow`'s interval must be cleared on unmount. Use `useEffect` cleanup.
- **VALIDATE:** Hooks render; no warnings in StrictMode.

### Task 6: Event stream hook

- **ACTION:** Create `hooks/useEventStream.ts`.
- **IMPLEMENT:** Canonical EVENT_STREAM_HOOK_PATTERN.
- **MIRROR:** EVENT_STREAM_HOOK_PATTERN.
- **GOTCHA:** Use `trpc.tasks.list.queryKey()` (or the equivalent helper from `@trpc/tanstack-react-query`) to get the **exact** query key prefix. Hand-rolled keys won't match.
- **VALIDATE:** `event-cache.test.ts` — apply `task.state_changed`, assert the corresponding cached task has the new status.

### Task 7: Logo component

- **ACTION:** Create `components/logo/Logo.tsx`.
- **IMPLEMENT:** Inline the SVG from `assets/logo.svg`. Accept a `className` prop; defaults to `text-accent w-7 h-7`.
- **GOTCHA:** Don't `<img src="logo.svg">` — that loses `currentColor` theming. Inline.
- **VALIDATE:** Renders; switching theme changes color.

### Task 8: AgentChip

- **ACTION:** Create `components/agent/AgentChip.tsx`.
- **IMPLEMENT:** Props: `agentId`. Reads from `trpc.agents.list.useQuery()` (cached) to find the matching agent's monogram, label, hue, available. Renders the chip per DESIGN.md §10: 20×20 monogram square + label, hue from `var(--agent-${agentId})`. Dim opacity when `available === false`.
- **GOTCHA:** If the agent doesn't exist (e.g. user deleted it after the task was created), render a fallback `?` chip in `text-tertiary`.
- **VALIDATE:** Component test renders both `claude-code` (CC, sand) and a custom agent.

### Task 9: StatusIndicator

- **ACTION:** Create `components/status/StatusIndicator.tsx`.
- **IMPLEMENT:** DESIGN.md §10 spec. Pulse via Tailwind 4 `@keyframes` defined in `global.css`:
  ```css
  @keyframes pulse-status {
    0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--status-running), transparent 50%); }
    70% { box-shadow: 0 0 0 6px color-mix(in oklch, var(--status-running), transparent 100%); }
    100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--status-running), transparent 100%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .status-running .status-dot { animation: none; box-shadow: 0 0 0 2px color-mix(in oklch, var(--status-running), transparent 70%); }
  }
  ```
- **MIRROR:** Match `design-preview.html`'s exact keyframes.
- **GOTCHA:** `color-mix(in oklch, …)` is supported in all evergreen browsers; Electron 33's Chromium 130 has it. No PostCSS shim needed.
- **VALIDATE:** Each state renders correct shape; pulse class is present in running; reduced-motion media query collapses to ring.

### Task 10: TaskCard + RunMeta + TaskCardActions

- **ACTION:** Create the three components.
- **IMPLEMENT:**
  - `TaskCard`: surface `surface-raised`, border `border-subtle`, radius `radius-md`, padding `space-4`. `::before` pseudo for the agent stripe (3 px → 5 px on hover via `group-hover:`). `data-state={task.status}`.
  - `RunMeta`: derives "running · 2m 14s · 18 KB" from task + the latest run (`trpc.runs.list.useQuery({task_id})` cached). Uses `useNow()` for live elapsed time when status is running.
  - `TaskCardActions`: state-aware buttons. Wired to `trpc.tasks.{approve,reject,cancel,retry,discardRun}.useMutation()`. Shown only on hover/focus to keep the card tight; full-time visible when card is `aria-selected` (keyboard-focused).
- **MIRROR:** COMPOSITION_PATTERN.
- **GOTCHA:** Do NOT enable mutations from a stale UI: every mutation has an `onSuccess` that triggers nothing (the event stream will deliver the state change and the cache will update — duplicating it via `invalidateQueries` causes a flash).
- **VALIDATE:** `TaskCard.test.tsx`; manual click-through.

### Task 11: Lane

- **ACTION:** Create `components/board/Lane.tsx`.
- **IMPLEMENT:** Header: `caption` style `space-2` padding-bottom, `border-b border-border-subtle`. Body: stack of cards with `space-3` between. If empty, render a single `text-tertiary meta` line: "Nothing here." (DESIGN.md §11 empty-lane spec; full polish in plan #8).
- **GOTCHA:** Lane width is `flex-1` inside the grid — must work for both 4-column and 1-column layouts.
- **VALIDATE:** Renders correctly empty and with cards.

### Task 12: Board + LaneSwitcher

- **ACTION:** Create `components/board/Board.tsx` and `components/lane-switcher/LaneSwitcher.tsx`.
- **IMPLEMENT:**
  - `Board`: calls `useTasksByStatus({})`. Renders 4 lanes in a CSS grid; mobile shows only `visibleLane`.
  - `LaneSwitcher`: pill-row with counts; sticky-top on mobile. Active state per DESIGN.md §11.
- **MIRROR:** RESPONSIVE_PATTERN.
- **GOTCHA:** Sticky positioning requires the parent to have an overflow context. Test in isolation in the storybook-like fixture.
- **VALIDATE:** Renders desktop 4-up, tablet 2-up, mobile 1-up.

### Task 13: ConductorStrip

- **ACTION:** Create `components/conductor/ConductorStrip.tsx`.
- **IMPLEMENT:**
  - Pulls all tasks where `status in [running, reviewing]` from `useTasksByStatus`.
  - For each running task, computes `elapsed_ms = now - task.updated_at` (the timestamp of the running transition) using `useNow(1000)`. Format mm:ss.
  - For each reviewing task, shows `VM-NNN ready for review`.
  - Layout: `bg-surface-raised border-t border-border-subtle`, sticky `bottom-0`, padding `space-3 space-6`. Mono font.
- **GOTCHA:** When there are zero running/reviewing tasks, render a muted "No agents conducting." line — full empty-state polish is plan #8 but the fallback shouldn't show "NOW CONDUCTING" with nothing after it.
- **VALIDATE:** `ConductorStrip.test.tsx`; manual.

### Task 14: TopBar + ThemeSwitch

- **ACTION:** Create `components/topbar/{TopBar.tsx,ThemeSwitch.tsx}`.
- **IMPLEMENT:**
  - `TopBar`: Logo + wordmark "VIBEMAESTRO" + version (mono) + ThemeSwitch (right-aligned).
  - `ThemeSwitch`: two-pill toggle (`terminal-dark`/`paper-light`). Wired to `useTheme`.
- **GOTCHA:** Match `design-preview.html`'s exact spacing — the topbar height affects board's main-grid math.
- **VALIDATE:** `ThemeSwitch.test.tsx`; visual against `design-preview.html`.

### Task 15: App composition + main entry

- **ACTION:** Replace `App.tsx`. Update `main.tsx`.
- **IMPLEMENT:**
  - `App.tsx`: `useEventStream()` once at the top; layout `<TopBar /><main><Board /></main><ConductorStrip />` in a CSS grid (`grid-rows-[auto_1fr_auto] min-h-screen`).
  - `main.tsx`: `<QueryClientProvider><trpc.Provider><App /></trpc.Provider></QueryClientProvider>` inside `<StrictMode>`.
- **GOTCHA:** Don't pass `useEventStream` arguments — it subscribes to the firehose; per-task subscriptions land in plan #7's detail panel.
- **VALIDATE:** Bootstraps; renders the full board; smoke-tests against a backend with seed data.

### Task 16: Tests — event cache merger

- **ACTION:** Create `event-cache.test.ts`.
- **IMPLEMENT:** Spin up a `QueryClient`, seed the `tasks.list` cache with 3 tasks, dispatch a `task.state_changed` event for one, assert the cache reflects the change. Truncated replay → `invalidateQueries` was called.
- **VALIDATE:** Test passes < 1s.

### Task 17: Tests — components

- **ACTION:** Create the component test files.
- **IMPLEMENT:** Use `@testing-library/react` (Bun-compatible). `setup.ts` provides a Provider stack with mocked `vmBridge`.
- **GOTCHA:** `happy-dom` doesn't fully implement `prefers-reduced-motion`; for the reduced-motion test, mock `matchMedia`.
- **VALIDATE:** All component tests pass.

### Task 18: Tests — responsive

- **ACTION:** Create `responsive.test.tsx`.
- **IMPLEMENT:** Force `window.innerWidth` to 320 and 1280 via `Object.defineProperty(window, "innerWidth", …)`; trigger `window.dispatchEvent(new Event("resize"))`; assert visibility of lanes and the LaneSwitcher.
- **GOTCHA:** Tailwind responsive classes are CSS — happy-dom evaluates layout poorly. Test the *className strings* and the *visibleLane state machine* separately rather than computed visibility.
- **VALIDATE:** Test passes.

### Task 19: README update

- **ACTION:** Update `README.md`.
- **IMPLEMENT:** Add a small section: "Generating design tokens" + "Customizing themes" with a pointer to `design-tokens.json`.
- **VALIDATE:** Reads correctly.

### Task 20: Final validation

- **ACTION:** Per "Validation Commands" below.

---

## Testing Strategy

### Component-level

| Component | Critical assertions |
|---|---|
| `StatusIndicator` | Each state's shape; pulse class only when running; reduced-motion collapses pulse |
| `AgentChip` | Hue maps from `--agent-<id>`; dim when unavailable; fallback `?` for unknown id |
| `TaskCard` | Renders correct subtree per state; hover lifts shadow; agent stripe color matches |
| `TaskCardActions` | Approve+Reject only when reviewing; Cancel only when running; Retry only when error; Discard always available |
| `Board` | Tasks grouped correctly by status |
| `ThemeSwitch` | Click toggles `data-theme`; localStorage persists |
| `LaneSwitcher` | Click changes `visibleLane`; active chip highlighted |
| `ConductorStrip` | Lists running tasks; elapsed time updates after `useNow` tick; reviewing tasks listed; empty-state line when none |

### Integration

- `event-cache.test.ts`: events drive query cache updates without re-fetching
- Boot the app with a mocked `vmBridge` returning seed tasks → screenshot the board → diff against `design-preview.html` (within tolerance) — visual regression check (deferred to manual until plan #8 sets up a screenshot pipeline)

### Edge cases

- [ ] Empty board (no tasks) — every lane renders empty placeholder
- [ ] Task with unknown `agent_id` — fallback agent chip
- [ ] Mutation throws — error toast (toast not implemented yet → plan #8; for #6, a plain `alert(envelope.error.message)` is acceptable bridge)
- [ ] Rapid state changes (e.g. 5 events in 100 ms) — cache stays consistent; no double-renders
- [ ] Theme switch mid-running animation — pulse continues smoothly
- [ ] Window resize across breakpoints — layout reflows without errors

---

## Validation Commands

```bash
bun lint
bun typecheck
bun test
bun --filter @vibemaestro/desktop run build
```

### Manual visual verification

1. Boot with seed data via the tRPC console (create 6+ tasks across statuses).
2. Open `design-preview.html` in another browser side-by-side with `bun dev`.
3. Compare: typography sizes, spacing, agent stripe widths, status dot pulse cadence, conductor strip layout.
4. Switch theme; both renderings update.
5. Resize the window: 4-up at ≥ 1280; 2-up at 640-1279; 1-up + LaneSwitcher below 640.
6. Trigger a state change from the backend (e.g. via terminal): assert the card moves lanes within ~200 ms (event-driven).

---

## Acceptance Criteria
- [ ] All 20 tasks completed
- [ ] `tokens.css` is generated from `design-tokens.json`; manual edits forbidden
- [ ] Both themes render correctly; theme switch persists across reload
- [ ] Board renders 4 lanes desktop / 2 tablet / 1 mobile + LaneSwitcher
- [ ] Task cards display agent stripe in correct hue
- [ ] Status indicators match DESIGN.md §10 (shape AND animation)
- [ ] Pulse animation honors `prefers-reduced-motion`
- [ ] Conductor strip lists running + reviewing tasks; elapsed time updates live
- [ ] Card actions trigger the correct mutations and update via event stream (no manual invalidate)
- [ ] No raw `vmBridge.trpcInvoke` calls outside `lib/ipc-link.ts`
- [ ] No `setQueryData` calls outside `useEventStream.ts`
- [ ] `bun run generate:tokens` is wired to postinstall

## Completion Checklist
- [ ] Code follows TOKEN_TO_CSS_PATTERN, THEME_BOOTSTRAP_PATTERN, TANSTACK_QUERY_PATTERN, EVENT_STREAM_HOOK_PATTERN, COMPOSITION_PATTERN, RESPONSIVE_PATTERN
- [ ] No component is > 80 lines (split if it grows)
- [ ] No inline styles except dynamic `--agent-<id>` references on a CSS variable assignment
- [ ] All Tailwind classes are valid v4 utilities; no v3-only syntax
- [ ] `useEffect` cleanups exist for every subscription
- [ ] No regressions in plan #1–#5 tests
- [ ] Self-contained — no questions during implementation

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tailwind 4 syntax differs from v3 reference snippets | Medium | Medium | Pin `^4.1`; reference `tailwindcss.com/docs/v4` exclusively; `bun --filter @vibemaestro/desktop run build` exercises every utility |
| `oklch()` rendering differences across Chromium versions | Low | Low | Electron 33 / Chromium 130 supports oklch fully; visual regression catches drift |
| Event-cache merger drops a key (cache stale) | Medium | High (UX-critical) | Test every event type explicitly in `event-cache.test.ts` |
| Mutation + event arrival race causes a flicker | Medium | Low | Mutations use the cache update (functional setQueryData); event arrival applies the same shape — idempotent |
| Theme bootstrap script runs after first paint | Low | Medium (FOUC) | Inline + synchronous in `<head>`; `<link rel="stylesheet">` precedes `<script type="module">` |
| Mobile layout breaks with very long task titles | Medium | Low | Truncate at 2 lines via `line-clamp-2`; tooltip with full title |
| `prefers-reduced-motion` test flaky on happy-dom | Medium | Low | Mock `matchMedia` directly in setup |

## Notes

### Plan-#6 → Plan-#7 contract

Plan #7 will:
1. Add a click handler to `TaskCard` that opens the detail panel.
2. Slide-in panel surface; `useEventStream` becomes per-task (`events.subscribeTask(taskId)`) inside the panel.
3. Wire xterm.js to plan #5's `terminal-client.ts`.
4. Tabs: Terminal / Diff / Transcript.

The panel does NOT change the board's layout — it overlays from the right and keeps the board interactive (DESIGN.md §11).

### Plan-#6 → Plan-#8 contract

Plan #8 will:
1. Replace placeholder empty-states with the editorial DESIGN.md §11 versions.
2. Replace `alert(...)` error fallbacks with toasts.
3. Add the create-task button + form (currently absent — tasks must be created via tRPC console for plan #6 testing).
4. Add command palette (`⌘K`) and keyboard shortcuts (`⌘N` create, `?` cheatsheet, lane navigation).
5. Add loading skeletons.

### Visual regression deferred

Plan #6 verifies design fidelity by manual side-by-side comparison with `design-preview.html`. Plan #8 will introduce a screenshot pipeline (Playwright + image diff) once the UI is stable. Don't try to bolt on visual regression here.

### Self-contained guarantee

Every pattern, snippet, file path, and gotcha needed to implement plan #6 is captured here.
