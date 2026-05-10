# Plan 08: Polish — Empty States, Create Task, Command Palette, Keyboard, Toasts

## Summary
Final pass to make VibeMaestro feel finished: editorial empty states across the board / lanes / detail panel (DESIGN.md §11), the create-task flow (topbar button + modal), the `⌘K` command palette with task search and jump-to-task, the `?` keyboard cheatsheet, app-wide keyboard shortcuts, a toast system that replaces inline `alert()` fallbacks, focus trapping inside the detail panel, and the error-card shake-on-entry from DESIGN.md §11.

## User Story
As a developer running VibeMaestro,
I want every interaction to feel intentional — typing `⌘N` to create, `⌘K` to jump, `?` to learn what else exists, and meaningful empty states when there's nothing to show,
So that the product reads as designed software, not a wired-up backend.

## Problem → Solution
- **Current state (after plan #7):** Board, panel, terminal all work. But: empty states are stub strings; tasks must be created via tRPC console; there are no keyboard shortcuts; mutation errors `alert()`; the panel doesn't trap focus; running tasks don't shake on entry to error.
- **Desired state:** Boot the app for the first time → editorial empty state with "No tasks yet." and a `⌘N` hint. Press `⌘N` → create-task modal. Press `⌘K` → command palette opens with task search and a "Create new task" prefix. Press `?` → cheatsheet overlay shows every shortcut. Mutations show toasts on failure. The detail panel traps Tab focus while open. Cards transitioning to error state shake once on entry.

## Metadata
- **Complexity:** Medium-Large
- **Source PRD:** N/A — derived from `DESIGN.md §10` (Toast/Shortcut chip), `§11` (Empty/Loading/Error states, Mobile lane-switcher polish), `§13` (Keyboard navigation, Reduced motion)
- **PRD Phase:** N/A — plan 8 of 8 (final)
- **Estimated Files:** ~26
- **Confidence Score:** 8/10 — surface area is wide but every piece is small and uses primitives already in place

---

## UX Design

### Empty board (first launch)
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              No tasks yet.                           │
│                                                      │
│   Drop a one-liner. Your agents will pick it up.     │
│                                                      │
│              [ New task ]   ⌘N                       │
│                                                      │
│              ─────────────                           │
│                                                      │
│   No agents conducting · connect Claude Code…       │
└──────────────────────────────────────────────────────┘
```

### Command palette (⌘K)
```
┌────────── ⌘K ────────────────────────────────┐
│ ⌕ search tasks or type to create…           │
│ ────────────────────────────────────────────  │
│ + New task with this prompt          ⏎      │
│ VM-218  Refactor auth middleware     ↩ open │
│ VM-211  Replace bcrypt with argon2…  ↩ open │
│ VM-204  Strip Buy Me a Coffee link   ↩ open │
└────────────────────────────────────────────┘
```

### Cheatsheet (?)
Bottom-right floating card listing every shortcut grouped by surface (Global / Board / Panel).

### Interaction Changes

| Touchpoint | Before | After |
|---|---|---|
| Empty board | "Nothing here." | DESIGN.md §11 hero with `New task` CTA |
| Empty lane | "Nothing here." | "Nothing running. Move a backlog card here or run `⌘⏎`." |
| Loading state | nothing | Card skeletons during initial fetch |
| Mutation error | `alert(…)` | Toast in bottom-right with the envelope's message |
| `⌘N` | n/a | Opens create-task modal |
| `⌘K` | n/a | Opens command palette |
| `?` | n/a | Toggles cheatsheet |
| `⌘⏎` (with task selected) | n/a | Runs the focused task |
| `Tab` inside detail panel | escapes panel | Cycles focus inside panel |
| Card moves to error | silent | One-time horizontal shake on entry (220 ms) |

---

## Mandatory Reading

| Priority | File | Section/Lines | Why |
|---|---|---|---|
| **P0** | `DESIGN.md` | §10 (Buttons, Toast, Keyboard chip), §11 (every empty/loading/error state), §13 (Accessibility — keyboard, reduced motion) | The contracts this plan implements |
| **P0** | `.claude/PRPs/plans/06-frontend-shell-board.plan.md` | TANSTACK_QUERY_PATTERN, EVENT_STREAM_HOOK_PATTERN | Rendering primitives this plan extends |
| **P0** | `.claude/PRPs/plans/07-detail-panel-xterm.plan.md` | DETAIL_PANEL_PATTERN, KEYBOARD_DISMISS_PATTERN | The panel this plan adds focus-trap to |
| **P1** | `apps/desktop/src/renderer/components/board/TaskCard.tsx` | full | The card this plan adds shake-on-entry to |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| **`react-aria` focus traps (optional)** | `react-spectrum.adobe.com/react-aria/FocusScope.html` | — | We're rolling a 30-line custom focus trap to avoid the dep; document the alternative for plan #v1.5 if accessibility complaints surface |
| **`cmdk` (Command Menu primitive)** | `cmdk.paco.me` | `^1.0` | Headless command-menu primitive used by Linear and Vercel. Solid keyboard nav, fuzzy search, type-safe items. Adding one focused dep is acceptable since palette is non-trivial. |
| **WAI-ARIA Combobox pattern** | `w3.org/WAI/ARIA/apg/patterns/combobox/` | — | Command palette is a combobox + listbox; cmdk handles ARIA correctly out of the box |
| **Reduced motion semantics** | MDN / DESIGN.md §13 | — | `motion-safe:` Tailwind 4 utility scopes animations away from `prefers-reduced-motion: reduce` |

```
KEY_INSIGHT: Empty states aren't just "no data" — they're the first impression
            and the place to teach a shortcut. DESIGN.md §11 specifies
            editorial copy + a CTA + a keyboard chip.
APPLIES_TO: BoardEmptyState, LaneEmptyState
GOTCHA:     Don't ship "Lorem ipsum" copy. Use DESIGN.md's exact words.

KEY_INSIGHT: Global keyboard shortcuts must NOT fire while the user is typing
            in an input/textarea/xterm.js terminal.
APPLIES_TO: useGlobalShortcuts.ts
GOTCHA:     Check the active element's tagName (INPUT/TEXTAREA) AND its
            contentEditable attr AND whether xterm.js's helperTextarea has
            focus (xterm.js wraps a hidden textarea for IME support).

KEY_INSIGHT: Toasts must be screen-reader-friendly (aria-live="polite") AND
            visually unobtrusive. DESIGN.md §10 mandates a 4-variant taxonomy
            (info/success/warning/error) with shape variants.
APPLIES_TO: components/toast/Toaster.tsx
GOTCHA:     Don't use aria-live="assertive" — it interrupts screen reader
            speech. Polite is correct for non-critical messages.

KEY_INSIGHT: cmdk renders a portal. The portal must be inside our theme
            scope OR we re-apply the data-theme attribute on the portal root.
APPLIES_TO: CommandPalette.tsx
GOTCHA:     cmdk's <Command.Dialog> mounts to document.body by default.
            Either pass `container={document.documentElement}` to keep
            theming inherited, or wrap the dialog content in a div with
            data-theme set explicitly.

KEY_INSIGHT: Shake-on-entry should fire ONCE per state transition, not on
            every re-render in error state. Use a ref + the event id as
            the trigger so re-renders during error don't re-shake.
APPLIES_TO: TaskCard.tsx (shake mod)
GOTCHA:     React 19 + StrictMode runs effects twice in dev. Wrap with a
            "fired-once-per-event-id" guard.
```

---

## Patterns to Establish

> Plan #8 establishes the polish primitives. There are no plans #9+; v1 ships after #8.

### EMPTY_STATE_PATTERN — editorial copy + CTA + keyboard chip

```tsx
// components/empty-states/BoardEmptyState.tsx
export function BoardEmptyState() {
  const open = useCreateTaskModal();
  const agentsAvailable = useAnyAgentAvailable();
  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <h2 className="font-display text-display tracking-tight text-text-primary">No tasks yet.</h2>
      <p className="mt-3 text-text-secondary max-w-prose">
        Drop a one-liner. Your agents will pick it up.
      </p>
      <div className="mt-6 flex items-center gap-2">
        <Button variant="primary" onClick={open}>New task</Button>
        <KeyboardChip keys={["⌘", "N"]} />
      </div>
      {!agentsAvailable && (
        <p className="mt-8 text-text-tertiary meta">
          No agents conducting · install <code>claude</code> or <code>codex</code> on your PATH to begin.
        </p>
      )}
    </section>
  );
}
```

**Rule:** every empty state pairs the editorial copy with at least one action. No bare "nothing here" strings ship in v1.

### COMMAND_PALETTE_PATTERN — `cmdk` + tasks + create

```tsx
// components/command-palette/CommandPalette.tsx (sketch)
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [query, setQuery] = useState("");
  const { data: tasks } = trpc.tasks.list.useQuery({});
  const { open: openTask } = useDetailPanel();
  const createModal = useCreateTaskModal();

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command palette">
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="search tasks or type to create…"
      />
      <Command.List>
        {query.trim().length > 0 && (
          <Command.Item onSelect={() => { onOpenChange(false); createModal.open({ initialPrompt: query }); }}>
            <Plus className="size-4" /> New task with this prompt <KeyboardChip keys={["⏎"]} />
          </Command.Item>
        )}
        <Command.Group heading="Tasks">
          {(tasks?.data ?? []).map((t) => (
            <Command.Item
              key={t.id}
              value={`${t.id} ${t.title}`}
              onSelect={() => { onOpenChange(false); openTask(t.id); }}
            >
              <span className="meta">{t.id}</span>
              <span className="ml-2">{t.title}</span>
              <StatusIndicator state={t.status} className="ml-auto" />
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

**Rule:** the palette has exactly two affordances in v1: jump-to-task and create-task. v1.5 may add agent commands, theme switch, etc.

### TOAST_PATTERN — small custom toaster, no sonner dep

```tsx
// components/toast/toast.ts — imperative API
type ToastVariant = "info" | "success" | "warning" | "error";
type Toast = { id: string; variant: ToastVariant; title: string; body?: string };

const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

export const toast = {
  push(variant: ToastVariant, title: string, body?: string) {
    const id = ulid();
    toasts = [...toasts, { id, variant, title, body }];
    listeners.forEach(l => l(toasts));
    if (variant !== "error") setTimeout(() => toast.dismiss(id), 8000);
    return id;
  },
  dismiss(id: string) { toasts = toasts.filter(t => t.id !== id); listeners.forEach(l => l(toasts)); },
  subscribe(cb: (t: Toast[]) => void) { listeners.add(cb); return () => listeners.delete(cb); },
};
```

```tsx
// components/toast/Toaster.tsx
export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => toast.subscribe(setList), []);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2" aria-live="polite">
      {list.slice(-3).map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
```

**Rule:** every mutation's `onError` calls `toast.push("error", envelope.error.message, …)`. No `alert()` in production.

### KEYBOARD_SHORTCUT_PATTERN — global hook + skip-typing guard

```ts
// hooks/useGlobalShortcuts.ts
type Binding = { keys: string; handler: (e: KeyboardEvent) => void; allowInInput?: boolean };

const bindings: Binding[] = [];

export function registerShortcut(b: Binding) { bindings.push(b); return () => { const i = bindings.indexOf(b); if (i >= 0) bindings.splice(i, 1); }; }

function isTyping(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  if (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable) return true;
  // xterm.js wraps a hidden textarea
  if (a.classList.contains("xterm-helper-textarea")) return true;
  return false;
}

export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = comboString(e); // e.g. "Mod+N"
      for (const b of bindings) {
        if (b.keys === combo && (b.allowInInput || !isTyping())) { b.handler(e); break; }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
```

Bindings registered at App boot:
- `Mod+N` → open create-task modal
- `Mod+K` → toggle command palette
- `?` → toggle cheatsheet (allowInInput: false)
- `Mod+Enter` → run focused task (board nav state)
- `Esc` → close panel/palette/cheatsheet (handled per-component)
- `←/→` → navigate lanes (board only)
- `↑/↓` → navigate cards within a lane (board only)

**Rule:** every shortcut has a chip in the cheatsheet AND a `KeyboardChip` somewhere in the UI where it's actionable.

### FOCUS_TRAP_PATTERN — small custom hook for the panel

```ts
// hooks/useFocusTrap.ts
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const before = document.activeElement as HTMLElement | null;
    const focusables = () => root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = Array.from(focusables());
      if (list.length === 0) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener("keydown", handler);
    (focusables()[0] ?? root).focus();
    return () => { root.removeEventListener("keydown", handler); before?.focus?.(); };
  }, [active, ref]);
}
```

**Rule:** the detail panel is the only consumer in v1. Modal dialogs (create-task) get focus trap too.

---

## Files to Change

### Tooling

| File | Action | Justification |
|---|---|---|
| `apps/desktop/package.json` | UPDATE | Add `cmdk@^1.0`. No other deps. |

### Renderer libs / hooks

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/hooks/useGlobalShortcuts.ts` | CREATE | Canonical KEYBOARD_SHORTCUT_PATTERN |
| `apps/desktop/src/renderer/hooks/useFocusTrap.ts` | CREATE | Canonical FOCUS_TRAP_PATTERN |
| `apps/desktop/src/renderer/hooks/useCreateTaskModal.ts` | CREATE | Tiny store like `useDetailPanel`: `open(initial?)`, `close()`, `state` |
| `apps/desktop/src/renderer/hooks/useCommandPalette.ts` | CREATE | Toggle store; bound to `⌘K` in `useGlobalShortcuts` |
| `apps/desktop/src/renderer/hooks/useCheatsheet.ts` | CREATE | Toggle store; bound to `?` |
| `apps/desktop/src/renderer/hooks/useFocusedTaskId.ts` | CREATE | Tracks the last-focused/selected card; used by `⌘⏎` |
| `apps/desktop/src/renderer/hooks/useAnyAgentAvailable.ts` | CREATE | Reads `trpc.agents.list` cache; returns true if any agent's `available === true` |

### Renderer components

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/components/empty-states/BoardEmptyState.tsx` | CREATE | Canonical EMPTY_STATE_PATTERN |
| `apps/desktop/src/renderer/components/empty-states/LaneEmptyState.tsx` | CREATE | Per-lane copy from DESIGN.md §11 |
| `apps/desktop/src/renderer/components/skeletons/TaskCardSkeleton.tsx` | CREATE | Pulse-on-load skeleton; rendered while `tasks.list` is `pending` |
| `apps/desktop/src/renderer/components/create-task/CreateTaskButton.tsx` | CREATE | Topbar `primary` button + `⌘N` chip |
| `apps/desktop/src/renderer/components/create-task/CreateTaskModal.tsx` | CREATE | Modal with title input, prompt textarea, agent picker dropdown; submits via `trpc.tasks.create.useMutation`; closes on success; toast on error |
| `apps/desktop/src/renderer/components/command-palette/CommandPalette.tsx` | CREATE | Canonical COMMAND_PALETTE_PATTERN using cmdk |
| `apps/desktop/src/renderer/components/cheatsheet/Cheatsheet.tsx` | CREATE | DESIGN.md §10 keyboard chip group; floats bottom-right; toggled by `?` |
| `apps/desktop/src/renderer/components/keyboard/KeyboardChip.tsx` | CREATE | DESIGN.md §10 chip — surface-inset background, mono font, padding `1px 6px` |
| `apps/desktop/src/renderer/components/toast/Toaster.tsx` | CREATE | Canonical TOAST_PATTERN renderer |
| `apps/desktop/src/renderer/components/toast/toast.ts` | CREATE | Imperative API + subscribe |
| `apps/desktop/src/renderer/components/toast/ToastItem.tsx` | CREATE | DESIGN.md §10 visual: surface-raised + 4px border-left in variant color, dismiss button |
| `apps/desktop/src/renderer/components/board/Lane.tsx` | UPDATE | Render `<LaneEmptyState lane={status} />` when no cards |
| `apps/desktop/src/renderer/components/board/Board.tsx` | UPDATE | Render `<BoardEmptyState />` when zero tasks total; render skeletons during pending |
| `apps/desktop/src/renderer/components/board/TaskCard.tsx` | UPDATE | Add shake-on-entry-to-error: subscribe to `task.state_changed` per-card via the cache; on transition `* → error`, set `data-shake` for 240 ms |
| `apps/desktop/src/renderer/components/detail-panel/DetailPanel.tsx` | UPDATE | Wire `useFocusTrap(panelRef, isOpen)` |
| `apps/desktop/src/renderer/components/topbar/TopBar.tsx` | UPDATE | Insert `<CreateTaskButton />` between brand and theme switch |
| `apps/desktop/src/renderer/App.tsx` | UPDATE | Mount `<Toaster />`, `<CommandPalette />`, `<Cheatsheet />`, `<CreateTaskModal />`; call `useGlobalShortcuts()` once |
| `apps/desktop/src/renderer/styles/global.css` | UPDATE | Add `@keyframes shake-x` + `motion-safe:animate-shake-x` utility (DESIGN.md §11) |

### Mutation error wiring

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/renderer/lib/with-toast.ts` | CREATE | Higher-order helper: `withToast(mutation, { successMessage?, errorMessage? })` returns a wrapped mutation that pushes toasts on settle |
| `apps/desktop/src/renderer/components/board/TaskCardActions.tsx` | UPDATE | Wrap each `useMutation` with `withToast` (no `alert()` paths) |
| `apps/desktop/src/renderer/components/detail-panel/PanelFooter.tsx` | UPDATE | Same wrap |
| `apps/desktop/src/renderer/components/create-task/CreateTaskModal.tsx` | UPDATE | Same wrap |

### Tests

| File | Action | Justification |
|---|---|---|
| `apps/desktop/test/renderer/components/CommandPalette.test.tsx` | CREATE | Search filters tasks; pressing Enter on a task calls `openTask`; pressing Enter with no match opens create modal with the query as initial prompt |
| `apps/desktop/test/renderer/components/CreateTaskModal.test.tsx` | CREATE | Validates input; calls `tasks.create`; closes on success; toast on error |
| `apps/desktop/test/renderer/components/Toaster.test.tsx` | CREATE | Push 4 toasts; only last 3 visible; non-error auto-dismisses after 8s (fake timer); error persists |
| `apps/desktop/test/renderer/components/Cheatsheet.test.tsx` | CREATE | `?` toggles; lists every registered shortcut |
| `apps/desktop/test/renderer/hooks/useGlobalShortcuts.test.ts` | CREATE | Skip-typing guard: pressing `?` while focused on `<input>` does NOT trigger; pressing `Mod+K` when focused on input DOES trigger if `allowInInput: true` |
| `apps/desktop/test/renderer/hooks/useFocusTrap.test.tsx` | CREATE | Tab cycles within container; Shift+Tab from first wraps to last; restores focus on deactivate |
| `apps/desktop/test/renderer/components/empty-states.test.tsx` | CREATE | Board empty hero renders; lane empty copy matches DESIGN.md §11 |
| `apps/desktop/test/renderer/components/TaskCard.shake.test.tsx` | CREATE | Transition to error sets `data-shake`; transition error → backlog (retry) does NOT re-shake; only on enter-error edge |

### Documentation

| File | Action | Justification |
|---|---|---|
| `README.md` | UPDATE | Add a "Keyboard shortcuts" subsection sourced from the cheatsheet |
| `DESIGN.md` | (no change) | Already specifies these surfaces |

---

## NOT Building

- **Drag-and-drop card movement.** Lanes change via state machine only (DESIGN.md anti-pattern).
- **Animation library (framer-motion).** All animations are CSS keyframes.
- **Multi-modal management.** v1 has at most one modal/palette open at a time; opening a second closes the first.
- **`react-aria` or other a11y libraries.** Custom focus trap + cmdk's built-in ARIA is sufficient for v1.
- **i18n.** Copy is English-only.
- **Telemetry / analytics.** v2 (per Superset stack fallback policy).
- **Visual regression test pipeline.** Plan #6's note still applies — manual diff against `design-preview.html`.

---

## Step-by-Step Tasks

### Task 1: cmdk dep + global shortcuts hook

- **ACTION:** Update `package.json`. Create `useGlobalShortcuts.ts`.
- **IMPLEMENT:** Canonical pattern. `comboString(e)` produces strings like `"Mod+N"`, `"Mod+Enter"`, `"?"`, `"Escape"`, `"ArrowLeft"`, etc. `Mod` = `e.metaKey || e.ctrlKey`.
- **GOTCHA:** `e.preventDefault()` inside the binding — otherwise `⌘N` opens a new browser window (Electron default).
- **VALIDATE:** `useGlobalShortcuts.test.ts`.

### Task 2: Toaster + toast API

- **ACTION:** Create `toast.ts`, `Toaster.tsx`, `ToastItem.tsx`.
- **IMPLEMENT:** Canonical TOAST_PATTERN. `ToastItem` per DESIGN.md §10 visual.
- **GOTCHA:** The 8s auto-dismiss must clear if the user clicks Dismiss earlier (don't fire `setTimeout`-driven dismiss after manual dismiss).
- **VALIDATE:** `Toaster.test.tsx`.

### Task 3: `withToast` mutation wrapper

- **ACTION:** Create `lib/with-toast.ts`.
- **IMPLEMENT:**
  ```ts
  export function withToast<TArgs, TRes>(
    mutation: { mutateAsync: (args: TArgs) => Promise<TRes>; isPending: boolean },
    opts: { error: string }
  ) {
    return {
      ...mutation,
      mutateAsync: async (args: TArgs) => {
        try { return await mutation.mutateAsync(args); }
        catch (err: any) {
          const msg = err?.data?.envelope?.error?.message ?? err?.message ?? "Action failed";
          toast.push("error", opts.error, msg);
          throw err;
        }
      },
    };
  }
  ```
- **MIRROR:** Helper pattern.
- **GOTCHA:** Don't swallow the error — re-throw so React Query keeps `isError` accurate.
- **VALIDATE:** `Toaster.test.tsx` covers the integration.

### Task 4: KeyboardChip

- **ACTION:** Create `components/keyboard/KeyboardChip.tsx`.
- **IMPLEMENT:** DESIGN.md §10 spec. Renders `keys: string[]` joined with a hairline separator (e.g. `["⌘","K"]` → `⌘K`; `["⌘","⏎"]` → `⌘⏎`; chord like `["G","then","B"]` allowed for board nav).
- **GOTCHA:** Use the actual unicode glyphs (`⌘`, `⇧`, `⌥`, `⌃`, `⏎`) not "Cmd"/"Shift" — DESIGN.md §10 mandates the symbol form.
- **VALIDATE:** Renders.

### Task 5: Empty states (board + lane)

- **ACTION:** Create `empty-states/{BoardEmptyState,LaneEmptyState}.tsx`. Update `Board.tsx` and `Lane.tsx`.
- **IMPLEMENT:**
  - `BoardEmptyState`: canonical pattern.
  - `LaneEmptyState({ lane })`: per-lane copy from DESIGN.md §11:
    - Backlog: "Nothing in backlog. Press ⌘N to add."
    - Running: "Nothing running. Move a backlog card here or run ⌘⏎ on a selected card."
    - Reviewing: "No tasks waiting for review."
    - Complete: "No tasks completed yet."
- **MIRROR:** EMPTY_STATE_PATTERN.
- **GOTCHA:** Detect the "all lanes empty AND no agents" state in `Board` and render the board-level hero instead of four lane-level placeholders.
- **VALIDATE:** `empty-states.test.tsx`.

### Task 6: Loading skeletons

- **ACTION:** Create `skeletons/TaskCardSkeleton.tsx`. Update `Board.tsx`.
- **IMPLEMENT:** During `tasks.list` pending state, render 6 skeletons distributed 2-2-1-1 across lanes. Each: dashed `border-subtle` border, 70%-width title bar in `surface-pressed`, mono `meta` line "creating…". Slow opacity oscillation `0.6 ↔ 1.0` over `--duration-slow`.
- **GOTCHA:** Use Tailwind's `motion-safe:animate-pulse` style; collapse to static under reduced-motion.
- **VALIDATE:** Visual; renders only during pending, hidden after.

### Task 7: Create-task modal + button

- **ACTION:** Create `CreateTaskButton.tsx`, `CreateTaskModal.tsx`, `useCreateTaskModal.ts`. Update `TopBar.tsx`, `App.tsx`.
- **IMPLEMENT:**
  - Modal: simple form with title input, prompt textarea (autofocus, accepts multiline), agent select dropdown (populated from `trpc.agents.list` filtered to `available: true`). Validation via Zod's `createTaskInput`. Submit calls `tasks.create` then `tasks.run` (so the task starts immediately — DESIGN.md §11 hero CTA implies this). Close on success.
  - Modal uses `useFocusTrap` and Esc-to-close.
- **GOTCHA:** When no agents are available, the modal shows an inline notice "No agents available. Run `claude --version` from your shell." with a `Probe` button that calls `agents.probe`.
- **VALIDATE:** `CreateTaskModal.test.tsx`.

### Task 8: Command palette

- **ACTION:** Create `CommandPalette.tsx`, `useCommandPalette.ts`. Update `App.tsx`.
- **IMPLEMENT:** Canonical pattern. Bind `Mod+K` in `useGlobalShortcuts`. cmdk handles all keyboard nav inside the palette.
- **GOTCHA:** cmdk renders to body; ensure `data-theme` is inherited (wrap inside `<Command.Dialog>` content with `<div data-theme={theme}>` if cmdk's portal escapes the theme scope).
- **VALIDATE:** `CommandPalette.test.tsx`.

### Task 9: Cheatsheet overlay

- **ACTION:** Create `Cheatsheet.tsx`, `useCheatsheet.ts`. Update `App.tsx`.
- **IMPLEMENT:** Floating card bottom-right (above the conductor strip), surface-raised, shadow-3, list of shortcuts grouped: Global / Board / Panel. Each row: `<KeyboardChip>` + label. Toggle via `?` shortcut.
- **GOTCHA:** Don't trap focus — the cheatsheet is informational, not interactive. Pressing `?` again or `Esc` dismisses.
- **VALIDATE:** `Cheatsheet.test.tsx`.

### Task 10: Wire all shortcuts

- **ACTION:** Update `App.tsx` to register the bindings.
- **IMPLEMENT:**
  ```ts
  useEffect(() => {
    const unsubs = [
      registerShortcut({ keys: "Mod+N", handler: (e) => { e.preventDefault(); createModal.open(); } }),
      registerShortcut({ keys: "Mod+K", handler: (e) => { e.preventDefault(); palette.toggle(); }, allowInInput: true }),
      registerShortcut({ keys: "?", handler: (e) => { e.preventDefault(); cheatsheet.toggle(); } }),
      registerShortcut({ keys: "Mod+Enter", handler: (e) => { /* run focused task */ } }),
      registerShortcut({ keys: "Escape", handler: () => { /* delegated to per-component */ }, allowInInput: true }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);
  useGlobalShortcuts();
  ```
- **GOTCHA:** `Esc` is per-component (panel, palette, modal each handle it locally). The global binding is only for closing all overlays in one go if multiple are stacked.
- **VALIDATE:** `useGlobalShortcuts.test.ts`.

### Task 11: Detail panel focus trap + Esc

- **ACTION:** Update `DetailPanel.tsx` to use `useFocusTrap`.
- **IMPLEMENT:** Pass the panel ref + `open === true` flag.
- **GOTCHA:** xterm.js's helper textarea is a focus target — it should be in the trap cycle. The default focusable selector list includes textareas.
- **VALIDATE:** `useFocusTrap.test.tsx`.

### Task 12: Card shake-on-error

- **ACTION:** Update `TaskCard.tsx`. Update `global.css`.
- **IMPLEMENT:** Subscribe via `useEventStream`-like to `task.state_changed` for this `task.id`. When `to === "error"`:
  ```ts
  const shake = useState<string | null>(null);
  useEffect(() => {
    const off = events.subscribeTask(task.id, (env) => {
      if (env.event.type === "task.state_changed" && env.event.to === "error") {
        setShake(env.id);
        setTimeout(() => setShake(null), 240);
      }
    });
    return () => off();
  }, [task.id]);
  ```
  Apply `motion-safe:animate-shake-x` when `shake !== null` AND `data-state === "error"`.
- **GOTCHA:** A re-shake on every render in error state would be wrong — guard by event id (one shake per state change event).
- **VALIDATE:** `TaskCard.shake.test.tsx`.

### Task 13: Replace `alert()` paths

- **ACTION:** Audit grep for `alert(` and replace with `withToast` wrappers.
- **IMPLEMENT:** As listed in "Files to Change → Mutation error wiring."
- **GOTCHA:** None — mechanical change.
- **VALIDATE:** `grep -rn "alert(" apps/desktop/src/renderer` returns nothing.

### Task 14: Tests

- **ACTION:** Create the test files listed.
- **IMPLEMENT:** Per the patterns above. Use Bun's fake timers for the 8s toast dismissal test.
- **VALIDATE:** All pass.

### Task 15: README update

- **ACTION:** Update `README.md` with a "Keyboard shortcuts" section.
- **VALIDATE:** Reads correctly.

### Task 16: Playwright-Electron full happy-path E2E (added by eng review 2026-05-09)

The cross-plan integration safety net. Single end-to-end test that walks the full v1 happy path. Catches regressions across plans #2-#8 in one signal.

- **IMPLEMENT:** Add `@playwright/test` and `playwright` (with Electron support) to `apps/desktop` devDependencies. Create `apps/desktop/e2e/happy-path.e2e.ts` and `apps/desktop/playwright.config.ts`. Use Playwright's `_electron.launch()` API to spawn the dev build.
- **TEST SCRIPT:**
  1. Launch the Electron app with a tempdir for `~/.vibemaestro/` so the test starts from empty board.
  2. Seed the DB at startup with one agent: `id: "echo", command: "/bin/echo", args: ["{{prompt}}"], prompt_via: "arg"` (a fake agent that prints the prompt and exits 0).
  3. Assert the empty board renders ("No tasks yet.").
  4. Press ⌘N, fill the create-task form (`title: "smoke"`, `prompt: "hello world"`, `agent: echo`), submit.
  5. Assert the card appears in Backlog with `VM-001`.
  6. Press ⌘⏎ (or click Run), assert the card moves to Running with the pulse class.
  7. Wait for the card to move to Reviewing (echo exits immediately; total time < 2s).
  8. Click the card, assert the detail panel opens, asserts the Terminal tab shows "hello world" in the xterm container, asserts the meta strip shows the byte count.
  9. Click Approve, assert the card moves to Complete and the success-pulse class is applied for 480ms.
  10. Take a screenshot at the end and save to `apps/desktop/e2e/__screenshots__/happy-path-final.png` for visual sanity.
- **CI:** Add to `.github/workflows/ci.yml` (from plan #1a) as a new job that runs on Ubuntu only (Playwright's xvfb support); macOS runs on `pull_request` against `main` only (the Electron-on-macOS Playwright job can be flaky in headless mode; add as `continue-on-error: true` initially and stabilize).
- **GOTCHA:** Playwright + Electron requires the app to be either packaged or runnable via `electron .`. Use the `electron-vite preview` build output for the test target (deterministic, no HMR). Document the test command: `bun run test:e2e`.
- **VALIDATE:** Test passes locally with `bun run test:e2e`. Test fails predictably when, e.g., plan #4's event bus is wired wrong (card never moves to Reviewing) or plan #7's Approve button is disabled at the wrong state.

### Task 17: Final validation

- **ACTION:** Per "Validation Commands" below.

---

## Testing Strategy

### Unit / hook

| Test | Critical assertion |
|---|---|
| `useGlobalShortcuts` skip-typing | Press `?` with `<input>` focused → handler NOT called |
| `useGlobalShortcuts` allowInInput | Press `Mod+K` with input focused → handler called |
| `useFocusTrap` cycles | Tab from last focusable wraps to first |
| `useFocusTrap` restore | On deactivate, previous element regains focus |
| `toast.push` + auto-dismiss | Non-error toast disappears after 8s; error persists |
| Toaster cap | 4 toasts pushed, only last 3 rendered |

### Component

- `BoardEmptyState`: hero copy matches DESIGN.md; CTA opens create modal; `⌘N` chip visible
- `LaneEmptyState`: per-lane copy matches
- `CreateTaskModal`: validates inputs (Zod); submits; closes; toasts on error; agent dropdown shows only available agents
- `CommandPalette`: search filters; Enter on task opens detail panel; Enter on no-match opens create modal with query
- `Cheatsheet`: lists every registered shortcut; toggles on `?`
- `KeyboardChip`: renders unicode glyphs
- `Toaster`: variant border colors match status tokens; dismiss button works
- `TaskCard.shake`: shake fires once on transition-to-error; not on every re-render

### Integration

- Boot empty backend → board hero visible; click `New task` → modal opens; submit a valid task → modal closes; task appears on board; toast not shown on success (silence is golden)
- Submit a task with invalid input → modal stays open; inline validation errors visible
- Submit while no agents available → modal shows the install hint; Probe button refreshes
- Press `⌘K` mid-typing in the title field → palette opens; press Esc → closes; focus returns to the title field
- Cancel a running task from the panel → toast on success? No — silence; the card move tells the story
- Trigger an error: stop a task with no agent registered → mutation throws → toast appears with the envelope message

---

## Validation Commands

```bash
bun lint
bun typecheck
bun test
bun --filter @vibemaestro/desktop run build
grep -rn "alert(" apps/desktop/src/renderer  # expect: no matches
```
**EXPECT:** all green; bundle size delta < 80 KB gzipped (cmdk + toast).

### Manual
1. Boot empty → hero visible. Press `⌘N` → modal opens. Create a task. ✓
2. Press `⌘K` → palette opens. Type a task ID. ↩ → panel opens. ✓
3. Press `?` → cheatsheet appears bottom-right. Press `?` again → dismisses. ✓
4. Trigger an error path (e.g., delete an agent referenced by a task) → toast fires. ✓
5. Open detail panel, press Tab repeatedly → focus stays inside panel. Press Esc → focus returns to card. ✓
6. Run an agent that exits non-zero → card shakes once on entering error. ✓
7. Toggle reduced motion (System Preferences) → no shake, no pulse, no slide. ✓

---

## Acceptance Criteria
- [ ] All 16 tasks completed
- [ ] Empty states match DESIGN.md §11 copy verbatim
- [ ] Loading skeletons render during initial fetch
- [ ] Create-task flow ships (button + modal + Zod validation + agent picker)
- [ ] Command palette opens via `⌘K`; jump-to-task and create-from-query work
- [ ] Cheatsheet opens via `?`; lists every binding
- [ ] All keyboard shortcuts honor the skip-typing guard
- [ ] Detail panel traps Tab focus; Esc restores prior focus
- [ ] Toasts replace every `alert()` in the codebase
- [ ] Cards shake once on transition-to-error
- [ ] Reduced motion disables shake, pulse, slide-in, and skeleton oscillation
- [ ] No regressions in plans #1–#7

## Completion Checklist
- [ ] Code follows EMPTY_STATE_PATTERN, COMMAND_PALETTE_PATTERN, TOAST_PATTERN, KEYBOARD_SHORTCUT_PATTERN, FOCUS_TRAP_PATTERN
- [ ] No `alert()` in renderer source
- [ ] Every `setTimeout` from toast auto-dismiss is cleared on manual dismiss
- [ ] cmdk's portal inherits theming
- [ ] Unicode glyphs used in `KeyboardChip` (not "Cmd"/"Shift" strings)
- [ ] `bun build` size delta within budget (< 80 KB gz)
- [ ] Self-contained — no questions during implementation

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| cmdk theming escapes our scope | Medium | Low (cosmetic) | Wrap dialog content in `<div data-theme={theme}>` |
| Global shortcut fires while user is typing in xterm.js | Medium | High (breaks terminal UX) | `isTyping()` checks for `xterm-helper-textarea` class; tested |
| Focus trap blocks accessibility tools | Low | Medium | Custom trap uses standard focusable selector; doesn't disable keyboard |
| Toast aria-live disrupts screen readers | Low | Low | `aria-live="polite"` (not assertive); errors stay visible until dismissed |
| Shake animation re-fires on every render | Medium | Low (annoying) | Guard with event-id ref |
| Modal stack (palette opens with modal already open) | Low | Low | Only one is open at a time; opening one closes the other (App-level coordination) |
| Cheatsheet drifts out of date | High over time | Low | Single source: `useGlobalShortcuts` registry exposes bindings; cheatsheet renders from same source — guaranteed in sync |

## Notes

### v1 ships after plan #8

Once plan #8 lands, VibeMaestro is feature-complete for v1. Remaining items are tracked under "v1.5 TODOs" (real diff, project-root, transcript virtualization, sandbox) and "v2 fallbacks" (Next.js cloud, better-auth, hosted MCP, etc.).

### Visual regression pipeline (deferred)

Plan #8 does not introduce screenshot-based regression. After v1 ships, a follow-up plan will:
1. Use Playwright + Electron to launch the app with seed data.
2. Snapshot key screens (empty board, full board, detail panel, palette, cheatsheet).
3. Diff against committed reference images (with tolerance).

### Accessibility audit (deferred)

DESIGN.md §13 mandates contrast targets and keyboard nav, both verified in unit tests. A full WCAG 2.2 audit (screen reader pass, color-blind safety verification, motor accessibility) is a v1.5 task with a dedicated plan.

### Self-contained guarantee

Every pattern, snippet, file path, and gotcha needed to implement plan #8 is captured here. There are no plans #9+ in the v1 roadmap.
