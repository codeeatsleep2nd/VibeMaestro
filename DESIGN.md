# VibeMaestro — Design System

> **Style direction:** terminal-dark (v1) · **Themes:** swappable · **Agents:** Claude Code + Codex (v1), more reserved · **Users:** single-user (v1), team-extensible · **Light mode:** deferred

## 1. Product framing

VibeMaestro is an **agent-first** project management dashboard. A human creates a task; local agents — **Claude Code** and **Codex** in v1, more later — pick it up and move it through `Backlog → Running → Reviewing → Complete` (with `Blocked` and `Error` as off-path states). Two design implications fall out of this:

1. **Agents are first-class citizens.** Every task card has to answer "which agent is on this, what is it doing right now, how long has it been at it." The system needs an agent-identity layer that scales to N agents without devolving into emoji or stock avatar circles.
2. **The board is the product.** Marketing/setup pages are secondary. The system optimizes for dense, scannable, status-rich task boards — not hero sections.

## 1.5. First-task journey

Every component decision below is anchored to this arc. When you change a surface, ask whether it still serves the moment.

```
  STEP                              | USER FEELS               | SURFACE / SIGNAL
  ----------------------------------|--------------------------|--------------------------------------
  1. Open app for the first time    | quiet anticipation       | Empty board (§11) — staff hairlines
                                    | "this is mine to fill"   | + display "No tasks yet."
                                    |                          | + muted conductor: "No agents
                                    |                          | conducting · connect Claude Code"
  ----------------------------------|--------------------------|--------------------------------------
  2. Press ⌘N, type a one-liner     | low-friction commitment  | Create-task modal (§10 cmd-palette
                                    | "I'll just describe it"  | family) — no required fields beyond
                                    |                          | title; agent defaults to Claude Code
  ----------------------------------|--------------------------|--------------------------------------
  3. Card spawns in Backlog         | "ok, the system has it"  | Optimistic card skeleton (§11)
                                    |                          | flips to real card on confirm
  ----------------------------------|--------------------------|--------------------------------------
  4. Press ⌘⏎ (or click Run)        | hand-off                 | Card lifts into Running lane,
                                    | "go to work for me"      | status dot starts pulsing (§9), agent
                                    |                          | stripe brightens
  ----------------------------------|--------------------------|--------------------------------------
  5. Click the card                 | focus                    | Detail panel slides in (§11),
                                    | "what is it doing now"   | terminal attaches, scrollback
                                    |                          | replays then live bytes flow
  ----------------------------------|--------------------------|--------------------------------------
  6. Watch agent work for 1-3 min   | calm trust               | Conductor strip's heuristic action
                                    | "this is actually doing  | line (§10) keeps the user oriented
                                    | the right thing"         | even if they leave the panel
  ----------------------------------|--------------------------|--------------------------------------
  7. Run ends, card moves to        | satisfaction +           | Approve / Request changes /
     Reviewing                      | mild scrutiny            | Discard footer reveals (§11);
                                    |                          | review status hue pulls amber
  ----------------------------------|--------------------------|--------------------------------------
  8. Click Approve                  | release + small          | One-time confirmation pulse on the
                                    | dopamine hit             | card (§11), card lands in Complete
                                    | "done."                  | lane. No toast — the pulse is the
                                    |                          | reward. Inverse of the error-shake.
```

This arc is the v1 happy path. Off-path moments (`Blocked`, `Error`, agent unavailable, lost connection) get their own surfaces in §11 — they should feel like *recoverable interruptions*, not catastrophes.

## 2. Style direction: terminal-dark (v1)

Near-black warm-cool surface, soft-white ink, **amber accent**, mono *display only* + Inter for everything readable. Built for long-running sessions watching agents work, with the visual character of an instrument-cluster console rather than a generic SaaS app.

### Why terminal-dark and not the obvious alternatives

| Direction | Rejected because |
|---|---|
| Default SaaS (white + blue + gradient) | Indistinguishable from Linear/Asana/Trello clones; no point of view. |
| Matrix-green terminal | Cliché. The amber accent gets the same "monitoring console" energy without copying it. |
| Pure black | Hostile for long sessions. The base surface is a near-black with a faint warm-cool cast. |
| Glassmorphism / neon-cyber | Generic AI-app slop; adds no information. |
| Editorial / paper-light | Considered, then deferred — see §3. |

## 3. Themes are configurable

The system is built on **semantic tokens**, not literal ones. Components reference `--surface-raised`, `--text-primary`, `--accent`, `--status-running`, `--agent-claude-code` — never `--ochre` or `--paper`. Themes only override the value mapping; the API is constant.

### Mechanism

```html
<html data-theme="terminal-dark"> ... </html>
```

Each theme block in `design-preview.html` (and in `design-tokens.json`) defines the same set of semantic keys with theme-specific values. Swapping the `data-theme` attribute re-evaluates every token and updates every component. No component needs to know about themes.

### Themes today

| Theme | Status | Notes |
|---|---|---|
| `terminal-dark` | **default, v1** | Designed and shipped. |
| `paper-light` | internal verifier only | Defines all required keys so the swap mechanism works end-to-end, but is **not designed** for production. Treat as a proof point, not a product. **Not exposed in the user-facing theme switch in v1.** Promoted to a shipping theme only after a dedicated design pass against §13 contrast targets and §15 anti-patterns. Until then, swap is reachable from a developer-only menu (or by setting `data-theme="paper-light"` on `<html>`) for verifying the mechanism. |

### Adding a theme

1. Add a key under `themes.<id>` in `design-tokens.json`.
2. Provide a value for **every** key under `surface`, `text`, `border`, `accent`, `status`, `agent`, `shadow`. Missing keys are not allowed — components will read undefined and break.
3. Pass the contrast targets in §13 before merging.

## 4. Color tokens (terminal-dark)

All colors are OKLCH for perceptual uniformity. Full mapping in `design-tokens.json`; semantic API documented here.

### Surface

| Semantic | Value | Use |
|---|---|---|
| `surface.base` | `oklch(15% 0.005 240)` | App background |
| `surface.raised` | `oklch(19% 0.006 240)` | Card, lane background |
| `surface.pressed` | `oklch(22% 0.008 240)` | Pressed / nested |
| `surface.inset` | `oklch(13% 0.005 240)` | Log preview, inset code |
| `surface.overlay` | `oklch(11% 0.005 240 / 0.78)` | Modal backdrop |

### Text

| Semantic | Value | Use |
|---|---|---|
| `text.primary` | `oklch(94% 0.005 240)` | Primary ink |
| `text.secondary` | `oklch(72% 0.008 240)` | Labels, body |
| `text.tertiary` | `oklch(54% 0.010 240)` | Metadata, captions |
| `text.on-accent` | `oklch(15% 0.005 240)` | Text on accent buttons |

### Border

| Semantic | Value | Use |
|---|---|---|
| `border.subtle` | `oklch(26% 0.008 240)` | Hairlines, dividers |
| `border.default` | `oklch(34% 0.010 240)` | Buttons, inputs |
| `border.strong` | `oklch(50% 0.012 240)` | Emphasis |
| `border.focus` | `oklch(78% 0.14 75)` | Focus ring (= accent) |

### Accent

A single warm amber. No second brand color, no gradients. If a UI surface needs more visual weight, increase ink contrast — do not introduce new hues.

| Semantic | Value | Use |
|---|---|---|
| `accent.base` | `oklch(78% 0.14 75)` | Primary CTA, link, focus ring |
| `accent.hover` | `oklch(82% 0.14 75)` | Hover |
| `accent.pressed` | `oklch(70% 0.13 70)` | Active |
| `accent.soft` | `oklch(35% 0.06 75)` | Tinted background |

### Status

Status is communicated by **position in the board first, color second, motion third**. Colors are muted on purpose — they sit inside cards, not as full backgrounds.

| Semantic | Value | State |
|---|---|---|
| `status.idle` | `oklch(58% 0.008 240)` | Backlog, queued |
| `status.running` | `oklch(72% 0.16 145)` | Agent actively executing — **pulses** |
| `status.review` | `oklch(74% 0.11 70)` | Awaiting human review |
| `status.complete` | `oklch(58% 0.04 145)` | Done |
| `status.blocked` | `oklch(68% 0.16 30)` | Blocked, awaiting input |
| `status.error` | `oklch(64% 0.18 22)` | Failed run |

> **Note on `status.review` vs `accent`:** intentionally adjacent (same warm-amber neighborhood) because reviewing a task *is* the user action this product is asking for. Kept perceptibly distinct (lower L, lower C, hue shift) so a Reviewing dot is never confusable with a button.

## 5. Agent identity

Each agent gets a fixed hue. The hue is constant across the system, so a sand stripe always means **Claude Code**, a slate stripe always means **Codex**.

Hues sit on a single L band (≈72–74%) with chroma `0.13` so they read as clearly tinted (not muddy) at chip size on a dark surface. The previous draft used `0.10` chroma, which collapsed adjacent hues at 20px monogram size; bumping to `0.13` restores separability without breaking harmony.

### v1 agents (shipped)

| Agent | Monogram | Hue | Token |
|---|---|---|---|
| Claude Code | `CC` | sand | `agent.claude-code = oklch(74% 0.13 50)` |
| Codex | `CX` | slate | `agent.codex = oklch(72% 0.12 235)` |

### Reserved hues (future agents — listed in `design-tokens.json` under tier `future`)

| Agent | Monogram | Hue |
|---|---|---|
| Gemini | `GM` | moss `oklch(72% 0.13 145)` |
| GPT-5 | `G5` | plum `oklch(70% 0.14 320)` |
| Cursor | `CR` | teal `oklch(74% 0.13 195)` |
| Aider | `AI` | olive `oklch(72% 0.13 90)` |

These are defined in tokens but **not rendered** in v1 UI. Adding a new agent = flipping its tier from `future` to `v1` and registering its adapter; no design work required.

### Allocation rule

The 6 hues above are **hand-picked** at `L≈72%, C≈0.13` to maximize visual separability at chip size on a dark surface — they are not the output of an even 60° sweep (real spread is 50°/90°/145°/195°/235°/320°, biased away from yellow-green to keep the amber accent and the running-green status color uncrowded).

When a 7th agent is registered:
1. Add at the same band (`L≈72%, C≈0.13`) with **at least 30° hue separation** from every existing v1 agent and from `accent.base` (75°) and `status.running` (145°).
2. If no free 30° gap remains in the upper band, drop to a second band at `L≈65%, C≈0.13` and pick the hue with the largest available gap there.
3. Verify the new chip against existing chips at 20px monogram size before committing — perceptual separation, not just color-space separation.

## 6. Single-user v1, team-extensible

v1 is single-user (running locally). The design reserves slots for team mode so it ships as a configuration change, not a redesign.

| Surface | Single-user (v1) | Team mode (future) |
|---|---|---|
| Task card | `agent` chip on the right | `agent` chip + `assignee` chip on the right |
| Conductor strip | "Now conducting · CC running VM-218 ..." | Adds a presence row: "you · alex · jamie" with live cursors / activity dots |
| Mention pill | n/a | `@alex` style pill in `accent.soft` |
| User identity | implicit | hue-allocated stripe (separate band: `L≈68%, C≈0.07`) |

The CSS for the assignee slot is present in the system but rendered with `display: none` in single-user mode, so the layout never reflows when team mode is enabled. Treat the team-mode column as a design reservation, not a roadmap commitment — it will be re-validated against a team-mode PRD before shipping.

## 7. Typography

**Two families.** Inter does the readable work — body, titles, **headings**. JetBrains Mono is reserved for *display + technical context* — captions, metadata, task keys, log lines, and the one display-size moment (board name, hero).

This is a deliberate split. Mono everywhere fatigues the eye over a long session. Mono only at the extremes — tiny technical labels and the one big display moment — keeps the terminal character without making body reading work harder than it has to.

| Token | Size / weight | Family | Use |
|---|---|---|---|
| `caption` | 11px / 1.3, 0.08em tracking, uppercase, 500 | Mono | Lane headers, badge labels |
| `meta` | 12px / 1.4, 0.02em tracking | Mono | Task keys, runtime, timestamps |
| `body` | 14px / 1.5 | Inter | Default body |
| `body-lg` | 16px / 1.55 | Inter | Detail panel body |
| `title` | 15px / 1.4, 600 | Inter | Task card title |
| `heading` | 20px / 1.3, 500 | **Inter** | Section heading |
| `display` | clamp(28, 1.5vw + 22, 44) / 1.15, 500 | Mono | Board name in the topbar; the editorial line on the empty board ("No tasks yet."). The one terminal-character moment in the typography system. |

## 8. Spacing & layout

4px base. Use tokens directly; do not write `padding: 18px`.

| Token | Pixels |
|---|---|
| `space-1` | 4 |
| `space-2` | 8 |
| `space-3` | 12 |
| `space-4` | 16 |
| `space-5` | 24 |
| `space-6` | 32 |
| `space-7` | 48 |
| `space-8` | 64 |
| `space-9` | 96 |

For card-internal padding tuning between 16px and 24px, prefer `space-4` plus an internal grid (e.g., gap `space-2`) over inventing intermediate tokens. If a real density gap appears, add `space-4-5: 20px` rather than reaching for raw px.

### Board grid

- 4 lanes on desktop (≥ 1100px): equal-width columns, `space-4` gutter, faint horizontal hairlines running through the full board (a quiet nod to a musical staff).
- 2 lanes on tablet (≥ 640px), horizontal swipe to reveal the rest.
- 1 lane on mobile, with a sticky lane-switcher chip row — see §11.

### Radii

- `radius-xs: 3px` — chips, status pills
- `radius-sm: 4px` — buttons, inputs, agent monograms
- `radius-md: 6px` — task cards, panels
- `radius-lg: 10px` — modal, command palette

Avoid the "round everything" tic. Buttons stay at 4px. Cards stay at 6px. Nothing gets pill-rounded except true pill chips.

### Elevation

| Token | Use |
|---|---|
| `shadow-1` | Resting card |
| `shadow-2` | Hover card |
| `shadow-3` | Floating panel, command palette, conductor strip |

## 9. Motion

| Token | Value | Use |
|---|---|---|
| `duration.fast` | 120ms | Hover, focus ring |
| `duration.base` | 220ms | Card lift, lane move |
| `duration.slow` | 480ms | Status transition |
| `duration.pulse` | 2200ms | Running-task pulse |
| `easing.standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default |
| `easing.emphasized` | `cubic-bezier(0.16, 1, 0.3, 1)` | Status changes, important reveals |

**The pulse** is the only ambient motion in the system — running tasks display a 2.2s radial pulse on the status dot. Everything else is interaction-driven. `prefers-reduced-motion` collapses the pulse into a static dot with a 2px ring (see §13).

## 10. Components

### Task card

```
┌──────────────────────────────────────────────┐
│ ▌ agent stripe (3px, agent hue)              │
│ VM-218                            [CC] CC… │
│ Refactor auth middleware to use new          │
│ session token format                         │
│                                              │
│ ◐ running · 2m 14s · 18 tool calls           │
│ › Reading src/auth/session.ts                │
└──────────────────────────────────────────────┘
```

- Surface: `surface.raised`, border `1px solid border.subtle`, radius `radius-md`
- Padding: `space-4`
- Top edge: 3px stripe in agent hue (widens to 5px on hover)
- Hover: `shadow-2`, border to `border.default`
- Focus: 2px `border.focus` ring, offset 2px

### Agent chip

A 2-letter mono monogram in a 20px square, agent-hue background at 25% saturation, foreground in agent hue at full chroma. Always JetBrains Mono uppercase. **No emoji, no avatar, no face.**

### Status indicator

8px dot + label. See §4 for color mapping.

- **idle**: open ring (1.5px stroke), no fill
- **running**: filled dot, 2.2s ease-in-out radial pulse
- **review**: filled dot + 4px outer ring tint
- **complete**: filled dot, no animation
- **blocked**: small **triangle** (not dot) — shape encodes state, not just color, for color-blind safety
- **error**: filled dot + 1px solid border — shape variant for the same reason

### Lane

Lane header is `caption` (mono uppercase) followed by a count chip, with a hairline rule that runs to the edge of the lane. Cards stack with `space-3` between them.

### Conductor strip

A persistent sticky footer showing live agent activity. This is the most distinctive surface in the product. It exists because in agent-first PM, *who is doing what right now* is the most valuable status the user can see. In team mode, this strip gains a presence row above it.

#### Height & layout

- **Compact mode (1 active row):** 56px. Single line, vertically centered.
- **Expanded mode (2-3 active rows):** 84px. Rows stack with `space-1` (4px) gap; meta-12px text leaves comfortable breathing room.
- **Overflow (4+ active rows):** stays 84px, shows the 3 most recent rows, replaces the leftmost slot with a `+N more` ghost chip that opens a dropdown listing the rest. The dropdown is `surface.raised` with `shadow-3`.

#### Row format

Every row uses the same shape so the strip has a consistent rhythm:

```
<agent-chip> <verb> <task-key> · <elapsed>  [› <action-or-status>]
```

The `[› …]` half is **optional** — running rows include it, awaiting-review rows omit it (clean ending on the task-key + status verb).

```
NOW CONDUCTING  [CC] running VM-218 · 2:14  › Reading src/auth/session.ts
                [CX] running VM-219 · 0:41  › Running pnpm test
                [—]  VM-211 ready for review
```

The `[—]` slot in the third row is the agent-chip dropping to a neutral monogram-shaped placeholder when no agent is currently bound (the run already exited; the user is the next actor).

#### v1 "live next action" line — heuristic

Because v1 has no structured agent-event channel (see API.md §11 TODO), the `[› …]` cue is derived from the PTY scrollback rather than first-class events:

- Source: the **last non-blank line** of the per-task scrollback ring (API.md §7), stripped of ANSI escape sequences.
- Truncation: 60 chars, ellipsis on overflow.
- Cadence: updated at most 1 Hz (piggybacks on the `run.progress` event from API.md §6.1).
- Honesty: this is a placeholder. It will sometimes show partial lines or noisy output. Live with it in v1; promote to a real signal when the structured-event channel ships.

When `tool_calls_count` and structured per-tool-call events land in v2, the heuristic is replaced by the real "current tool" signal without changing the visual.

### Buttons

Three variants. Pick by intent.

| Variant | Surface | Border | Text | Use |
|---|---|---|---|---|
| `primary` | `accent.base` | `accent.base` | `text.on-accent` | Single primary action per surface (e.g. New task, Approve) |
| `secondary` | `surface.raised` | `border.default` | `text.primary` | Default action |
| `ghost` | transparent | transparent | `text.secondary` | Tertiary, in-row actions |

All variants: padding `8px 14px`, radius `radius-sm`, font `body 13px / 500`. Focus ring `2px border.focus`, offset 2px.

### Form inputs

- Surface: `surface.inset`, border `1px solid border.default`, radius `radius-sm`, padding `8px 12px`
- Text: `body`, color `text.primary`, placeholder `text.tertiary`
- Hover: border → `border.strong`
- Focus: border → `border.focus`, no outline (focus-ring is the border itself, 2px)
- Error: border → `status.error`, helper text in `status.error` `meta`
- Disabled: opacity 0.55, cursor `not-allowed`

Labels sit above inputs in `caption` style. Helper text below in `meta` color `text.tertiary`.

### Command palette

Keyboard-first surface. `⌘K` opens; ESC closes.

- Width: `min(640px, 92vw)`
- Surface: `surface.raised`, border `1px solid border.default`, radius `radius-lg`, shadow `shadow-3`
- Position: 18% from top, centered
- Header: search input in `meta` mono, no chrome, full-width, `surface.raised` (no inset)
- Results: rows of 40px, `space-3` horizontal padding, hover/active in `surface.pressed`
- Each row: leading icon (16px, `text.tertiary`), label (`body`), trailing keyboard chip
- Empty state: caption "No matches" + a keyboard hint to create a new task
- Backdrop: `surface.overlay`

### Toast / system message

Bottom-right stack, max 3 visible, 8s auto-dismiss for non-critical.

| Variant | Border-left | Icon | Use |
|---|---|---|---|
| `info` | `border.strong` | none | Generic notice |
| `success` | `status.complete` | dot | Task completed, file written |
| `warning` | `status.review` | triangle | Soft failure, retry suggested |
| `error` | `status.error` | dot+ring | Hard failure, manual intervention |

Surface: `surface.raised`, border `1px solid border.subtle`, 4px solid border-left in variant color, radius `radius-md`, padding `space-3 space-4`, shadow `shadow-2`. Title `title`, body `body`, dismiss button `ghost` 24px square with × glyph.

### Terminal (in-panel)

The terminal is the primary surface of the task detail panel. It is a live `xterm.js` instance attached over WebSocket to the agent's PTY (see API.md §7).

**Visual:**
- Surface: `surface.inset` (sits one step deeper than the panel's `surface.raised`)
- Padding: `space-3` all sides; the renderer uses its own internal padding inside the surface
- Font: `JetBrains Mono`, 13px / 1.45, no letter-spacing — terminals must not modify glyph metrics
- Theme: xterm.js `theme` object built from design tokens — `background = surface.inset`, `foreground = text.primary`, `cursor = accent.base`, `selectionBackground = accent.soft`. ANSI 16-color palette mapped onto desaturated variants of the status hues so agent color output stays legible on dark surface.
- Cursor: bar style, blink on, color `accent.base`
- Scrollback rendered: native xterm scrollback, no custom scrollbar — use the system one against `surface.inset`

**Behavior:**
- Resize via `addon-fit` on container resize; the `resize` control message is sent to the server.
- A small status row sits below the terminal: `attached / detached / run ended` indicator + a `meta` byte counter + signal buttons (`SIGINT`, `SIGTERM`) as `ghost` buttons.
- When the run ends, the terminal goes read-only (input disabled), a `meta` line `— run ended (exit 0) —` is appended, and the panel surfaces the Approve/Request-changes footer.
- Closing the panel detaches the WebSocket but does **not** stop the run; reopening replays scrollback.
- Reduced motion: cursor blink off when `prefers-reduced-motion: reduce`.

### Keyboard shortcut chip

A `meta`-sized inline chip showing a key or chord:

```
⌘K     ⇧⌘P     G then B
```

- Surface: `surface.inset`, border `1px solid border.subtle`, radius `radius-xs`, padding `1px 6px`
- Font: `meta` mono, color `text.secondary`
- Used inline in command palette rows, button hints, and a global `?` cheatsheet overlay

## 11. Surfaces & states

### Empty state — board with no tasks

First-launch impression. Single full-board `surface.base` with the four lane headers visible and a centered editorial moment:

- `display` line: "No tasks yet."
- `body` subtitle in `text.secondary`: "Drop a one-liner. Your agents will pick it up."
- `primary` button "New task" + a `meta` keyboard chip showing `⌘N`
- A *muted* version of the conductor strip at the bottom: "No agents conducting · connect Claude Code to begin"

**The display-type composition IS the illustration.** Do not add SVG art, mascots, hero graphics, or empty-state imagery. The lane headers, staff hairlines, and the editorial type moment are the entire visual; the restraint is the point.

### Success state — task moves Reviewing → Complete

The inverse of the error-card shake. When the user presses Approve and the task transitions to `complete`:

- The card emits a single 480ms outward glow in `status.complete` hue (1px → 6px box-shadow expansion), then settles to its resting `shadow-1`.
- The card moves into the Complete lane via the standard `duration.base` `easing.emphasized` lane-move animation.
- **No toast.** The pulse is the reward; a notification on top of a visual confirmation is noise.
- Reduced motion: skip the glow; rely on the lane move alone.

This is the only ambient celebratory motion in the system. Used here because completing a task is the moment the user pays for; everywhere else, motion is interaction-driven.

### Connection-lost state — backend unreachable

A single sticky banner sits above the topbar when the renderer can't reach the backend (in v1: a tRPC mutation has exhausted its retry budget; in v2: HTTP/WebSocket disconnect):

- Banner: 32px tall, `surface.raised` with a 4px solid `status.error` left border, `meta` text color `text.primary`
- Copy: `⚠ Lost connection to backend. Reconnecting…` (during retry) → `⚠ Disconnected. [Reconnect]` (after final failure, with a `secondary` retry button)
- All mutation buttons (Approve, Cancel, Retry, Discard, New task, palette actions) become disabled with `cursor: not-allowed` and 0.55 opacity.
- The board itself stays interactive for **read-only navigation** (focus, keyboard nav, opening the detail panel to read scrollback). New mutations are blocked.
- On reconnect: banner fades over `duration.slow`, buttons re-enable, a single muted `info` toast confirms `Reconnected`.
- Reduced motion: banner appears/disappears instantly, no fade.

### Agent-unavailable state

When `agent.available = false` (API.md §5.3), the agent is reachable in the registry but its `command` failed a probe (not on PATH, version mismatch, missing dependency). The system communicates this in three places at once:

- **Agent chip:** renders at 0.55 opacity with a 1.5px dashed border in `status.error` (replaces the resting solid background). Hover tooltip: `Agent <label> is unavailable: <reason>`.
- **Conductor strip:** an extra row appears, formatted as `[CC] unavailable · not on PATH  [Re-probe]`. The retry control is a `ghost` button. The row sits at the bottom of the active rows.
- **Card-level:** any task whose `agent_id` references the unavailable agent disables its Run button. Tooltip mirrors the chip tooltip. The card itself is otherwise unmodified — the agent stripe stays the agent's hue (identity is constant; availability is transient).

When the agent recovers (manual re-probe or auto-recovery), all three signals revert in the same render tick.

### Empty state — empty lane

A lane with no cards shows `caption` header + count `0`, then a `text.tertiary` `meta` line in the lane body: e.g. for `Running` — "Nothing running. Move a backlog card here or run `⌘⏎` on a selected card." No card-shaped placeholder.

### Loading state — agent connecting

When an agent is configured but hasn't reported in yet, its conductor-strip slot reads `agent-name connecting…` with a 2-bar progress shimmer using the agent's hue. The shimmer reuses the `pulse` animation timing.

### Loading state — task card skeleton

While a task is being created (optimistic insert), render a card skeleton:

- Surface: `surface.raised`, border `1px dashed border.subtle`
- Title: 70%-width `surface.pressed` bar, 12px tall, `radius-xs`
- Status row: a single status-idle indicator with text `creating…` in `meta tertiary`
- No agent stripe yet; replaced with a 3px `border.subtle` line
- Animation: opacity oscillation 0.6 ↔ 1.0 on `duration.slow` cycle (single property, compositor-friendly)

### Task detail panel

Opens when a card is clicked. Slides in from the right at `duration.base` `easing.emphasized`. The primary surface is the **live terminal** attached to the agent's PTY — see §10 *Terminal (in-panel)* below. The user reads, types, and signals the agent directly.

- Width: `clamp(560px, 55vw, 720px)` — wider than a typical sidebar because the terminal needs columns. Pairs with the v1 minimum window width of 1280×800 (set by plan #1's Electron config) so the board always retains at least 560px of working width when the panel is open.
- Surface: `surface.raised`, border-left `1px solid border.subtle`, full-height
- Header: `task-key` + agent chip + status indicator + close button (`ghost`)
- Title: `heading`, prompt body `body-lg`
- Meta strip: runtime, bytes emitted, exit code (when available) — all `meta`. Tool calls / model / cost are `—` in v1 (see API.md §11) and light up when the structured-event channel ships.
- Tabbed content:
  - **Terminal** (default, primary) — live `xterm.js` attached over WebSocket. Scrollback replays on attach so reopening the panel never loses context.
  - **Diff** — file changes for the current run, mono with semantic +/− gutters (§11 *Detail panel — diff view*). **v1.5 — ships in v1 as a placeholder visual shell** (the empty-state and the visual style of the diff rows are designed; the data is stubbed). Real diff rendering lights up when project-root scoping lands; the rendering shell is in place so the v1.5 promotion is purely a data wire-up. See API.md §5.2.1.
  - **Transcript** — full saved PTY output once the run ends. Searchable, copyable. While the run is live this tab shows "Run in progress — see Terminal."
- Footer: `Approve & merge` (`primary`), `Request changes` (`secondary`), `Discard run` (`ghost`). Buttons are state-aware and only appear in the relevant phase (Approve/Request changes when `reviewing`; Discard when `running`).
- Backdrop: none — the board stays interactive behind the panel
- Closing the panel does **not** stop the run. Discarding does.

### Mobile lane-switcher

On screens < 640px the board collapses to one visible lane. Above the lane sits a sticky chip row at `surface.base` z=10:

```
[ Backlog 2 ] [ Running 2 ] [ Reviewing 2 ] [ Complete 1 ]
```

- Each chip: `caption` text + count, `radius-pill`, padding `4px 10px`
- Active: `surface.raised` background, `text.primary`, 1px `border.default`
- Inactive: transparent, `text.tertiary`
- Horizontal scroll if chips overflow; first chip always pinned-left

### Error state — task failed

Card in `Reviewing` or pulled out of `Running` with `data-state="error"`:

- Border: 1px `status.error`
- Status indicator: error variant
- Card-log: shows the failing line in `status.error` mono on `surface.inset`
- Action row appears: `Retry` (`secondary`), `View log` (`ghost`)
- A single shake on entry: `translateX(-2px → 2px → 0)` over 240ms; never repeats

### Detail panel — diff view

When the agent has written code, the **Diff** tab shows file-by-file changes in mono:

- File header: `meta` mono, path in `text.primary`, `+N −M` in `status.complete` and `status.error`
- Body: line-numbered mono, additions on `surface.inset` with a 2px `status.complete` left border, deletions on a desaturated red tint with a 2px `status.error` left border
- No syntax highlighting in v1 — mono with semantic color is enough; revisit if real diffs feel illegible

## 12. Logo

`assets/logo.svg`. Three vertical bars of varying heights over a horizontal baseline — reads as agent-activity meter / conductor's hand setting tempo / signal monitor. Single-color (`currentColor`), 24×24 viewBox, 2px stroke, geometric.

```
│   │
│ │ │
│ │ │   ←  three bars, varying heights
─────   ←  baseline
```

The mark is themeable by inheritance: place it in any container with a `color` set, and it picks that color up. In the default app shell it renders in `accent`.

**Minimum contrast for the mark:** ≥ 4.5:1 against the surface it sits on. On `surface.base` in terminal-dark, `accent` resolves to ~9:1 — comfortably above. When placing the logo on alternative surfaces, verify before committing the placement.

## 13. Accessibility

### Contrast targets (WCAG 2.2)

Every theme must meet these or fail review.

| Pair | Target | terminal-dark actual |
|---|---|---|
| `text.primary` / `surface.base` | ≥ 7:1 (AAA) | ~14:1 |
| `text.primary` / `surface.raised` | ≥ 7:1 (AAA) | ~12:1 |
| `text.secondary` / `surface.raised` | ≥ 4.5:1 (AA) | ~6.8:1 |
| `text.tertiary` / `surface.raised` | ≥ 3:1 (AA non-text) | ~4.1:1 |
| `text.on-accent` / `accent.base` | ≥ 4.5:1 (AA) | ~9:1 |
| `border.focus` / `surface.raised` | ≥ 3:1 (AA non-text) | ~7:1 |
| Status colors / `surface.raised` | ≥ 3:1 each | all ≥ 4.5:1 |

If a new theme drops below any target, fix the theme; do not lower the target.

### Color-blind safety

Every status that conveys meaning by color **also** conveys it by shape or motion:

| State | Shape | Motion |
|---|---|---|
| idle | open ring | — |
| running | filled dot | radial pulse |
| review | filled dot + outer ring | — |
| complete | filled dot | one-time fade |
| blocked | triangle | — |
| error | filled dot + 1px border | shake on entry |

Agent identity uses both **hue and 2-letter monogram** — color is never the only signal.

### Keyboard navigation

- Every interactive element is reachable by `Tab`.
- Focus ring: 2px `border.focus`, offset 2px, on every focusable surface.
- Task cards are `tabindex=0`. `Enter` opens the detail panel; `space` selects.
- Global shortcuts: `⌘K` (palette), `⌘N` (new task), `?` (cheatsheet), `⌘⏎` (run selected task), `Esc` (close panel/palette).
- Lane navigation: `← →` to switch lanes, `↑ ↓` to move between cards within a lane, with the focused card visually outlined.

### Reduced motion

When `prefers-reduced-motion: reduce`:
- The running-task pulse becomes a static 2px ring around the dot.
- The error-card shake on entry is suppressed.
- The success-card pulse on Reviewing → Complete (§11) is suppressed; the lane move alone signals completion.
- Detail-panel slide-in becomes an instant render.
- Card hover lift drops to a 1px border-color change with no shadow transition.

### Touch targets — v1 scope

v1 is **desktop-primary** (Electron, 1280×800 minimum window). The mobile lane-switcher view (§11, < 640px) is included so the design system's responsive primitives are exercised end-to-end, but in v1 it is **read-only**: the chip row switches lanes, cards open into the detail panel for reading, but task creation, agent control, approve/reject/retry/discard, and command-palette actions all require a desktop session.

This means the dense terminal-console scale (20px agent chips, 8px status dots, 1px-padded keyboard chips) is intentionally below WCAG 2.5.5's 44×44 target-size guidance. Below 640px those elements are informational, not interactive.

When the v2 web mirror ships and team-mode implies field/mobile use, this section is rewritten: every interactive surface < 44px gets a transparent 44px tap zone, and the mobile lane-switcher gains real mutation affordances.

## 14. Browser support

OKLCH is supported in all evergreen browsers (Chrome 111+, Safari 16.4+, Firefox 113+). For environments that don't support OKLCH (e.g. older locked-down corp browsers), the build pipeline should:

1. Use a PostCSS plugin (e.g. `postcss-oklab-function`) to emit RGB fallbacks.
2. Place fallbacks **before** the OKLCH declaration so OKLCH wins where supported.
3. Reject any CI run where the fallback build produces a delta-E > 4 against the OKLCH reference.

The `color-mix(in oklch, …)` calls in the preview also need PostCSS shimming for the same target environments. If a build target predates OKLCH support without PostCSS, that target is out of scope for v1.

## 15. Anti-patterns

The following are explicitly **not** part of this design system. Reviewers should reject PRs that introduce them.

- Purple→blue or any multi-stop gradients on UI surfaces
- Glass / blurred-translucent cards
- Stock-avatar circles for agents (use the monogram chip)
- Emoji as status (use the indicator system)
- Generic centered-hero with gradient blob and a `Get started` CTA
- Default sidebar+cards+chart dashboard layout
- Border radius beyond what `radius-*` tokens define
- More than two font families
- Color used decoratively without a semantic meaning
- Scroll-triggered reveal animations on the board
- A second theme shipped at < 100% parity (do it fully or not at all)
- Raw px values in component code — go through tokens

## 16. Files

- `design-tokens.json` — machine-readable token source. Consume from build, generate CSS.
- `design-preview.html` — self-contained interactive preview. Open in any browser. Includes a working theme switch (terminal-dark ↔ paper-light) so the swap mechanism is verifiable.
- `assets/logo.svg` — primary mark.
- This file (`DESIGN.md`) — rationale, decisions, anti-patterns. Update when tokens or scope change.
