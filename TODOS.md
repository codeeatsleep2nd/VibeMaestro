# TODOS

Deferred work, ordered by horizon. Items here are not roadmap commitments — they're the explicit "considered, not now" record.

## v1.x (post plan #8)

### [P2] Design `paper-light` fully — promote from internal verifier to shipping theme
**Why:** DESIGN.md §15 forbids shipping a half-designed second theme. Today `paper-light` is a stub; the toggle is hidden in v1 (per CEO review 2026-05-09 D3). When there's a real product reason for a second theme, run a dedicated design pass.
**Cost:** ~1 day human / ~30 min CC. Includes: status hue rebalance for light surface, accent recheck (current `oklch(58% 0.14 55)` may not pass on raised surface), agent hue band re-allocation, contrast verification against §13 targets, design preview parity.
**Depends on:** Real product motivation (a paying user complaining; an embed context that needs light; a daytime-vs-nighttime workflow signal). Don't do speculatively.

### [P2] Ship a structured stdout event protocol for agents
**Why:** v1's conductor "live next action" line is a heuristic (last-line-of-scrollback, see API.md §10). It will sometimes show partial lines or noisy output. A small structured-event protocol (e.g., `⎞VM:status<json>⎠` markers in stdout) gives a real signal without requiring a separate IPC channel.
**Cost:** ~half day human / ~30 min CC. Touches API.md §5.3 adapter contract, plan #3 PTY parser, plan #4 event bus (new `run.action_changed` event type), plan #6 conductor strip render.
**Depends on:** A second-agent integration that motivates structured signals (Claude Code's tool calls aren't already structured-stdout; would need a wrapper). Re-evaluate when adding the third agent.

### [P2] Promote Diff tab from v1.5 placeholder to v1
**Why:** DESIGN.md §11 currently marks the Diff tab as "v1.5 — placeholder visual shell". Real diff requires a `project_root` concept on Task (where in the filesystem the agent is allowed to write).
**Cost:** ~1 day human / ~2 hr CC. Adds: `Task.project_root` field (API.md §5.1), git diff capture at run-end (plan #3), real diff rendering in the panel (plan #7), `runs.getDiff` real implementation (API.md §5.2.1 already specs the shape).
**Depends on:** Project-root scoping is also needed for v2 multi-project workspaces. Bundle the work.

## v2 (from API.md §11)

### [P1] HTTP/SSE/WebSocket localhost mirror
External CLI tools, MCP servers, and scripts need to talk to a running VibeMaestro. Mirrors §5-§7 over Hono on `127.0.0.1:<port>` with port discovery written to `~/.vibemaestro/port`. Renderer code does not change.

### [P1] Auth implementation
Per-launch token in `Authorization: Bearer …`; WebSocket via `?token=…`. Middleware slot already exists (API.md §3); this is a swap.

### [P2] Team mode resources
`User`, `Workspace`, `Membership`, `Mention`, presence channel. The `assignee` slot on Task and the presence row above the conductor strip are already reserved in DESIGN.md §6 (rendered `display: none` in single-user). **Reminder:** check the reserved slots still exist in the code when this lands — do not redesign the card from scratch.

### [P3] Cursor pagination
Add when any single-user task list crosses ~10K. Today's offset pagination is fine.

### [P3] Remote backend
Hosted variant with proper auth, multi-tenant data model, CORS. Local-only assumptions in v1 (`AuthContext = local`, no rate limiting, single-user scrollback ring) need to be unwound carefully.

### [P3] Cost / model metadata
Detail-panel meta strip mentions cost and model. v1 leaves these `null`. v2 collects via structured events (above) or an agent self-report endpoint.

## Documentation / hygiene

### [P2] v2 transport-mirror smoke test (added by CEO review 2026-05-09)
**Why:** v1 patterns (binary buffers via contextBridge, custom tRPC link, `webContents.send`) need to mirror cleanly to HTTP+WS+SSE in v2. Without a contract test, the IPC-vs-HTTP divergence shows up only when v2 is implemented.
**What:** A test in `packages/core` that takes a router definition and asserts the resource/event surface matches a transport-agnostic spec (probably a JSON schema dump of the tRPC routers). Runs in CI.
**Cost:** ~half day human / ~1 hr CC. Adds before any v2 code lands.

### [P3] Card layout at 4-digit task IDs
**Why:** Design preview assumes `VM-218` (3 digits). At `VM-1042` the card meta row may overflow.
**What:** Add a render check at the card-mock review for `VM-9999`. Either confirm it fits or shrink the meta row's column.

### [P3] Mobile breakpoint scoping note in DESIGN.md
**Why:** DESIGN.md §11 specifies behavior down to 320px. Electron desktop doesn't reach there. The mobile breakpoints exist for the v2 web mirror.
**What:** Add a one-line note to DESIGN.md §8 board grid: "Mobile breakpoints below 1024px target the v2 web mirror; the v1 Electron app's minimum window size is 1280×800."

### [P2] Board virtualization at 100+ tasks (added by eng review 2026-05-09)
**Why:** Plan #6 ships without virtualization. CLAUDE.md commits to a perf budget: < 100 tasks comfortable, 100-500 degraded but usable, > 500 unsupported. When any single user crosses 100 tasks routinely, virtualization becomes necessary.
**What:** Add `@tanstack/react-virtual` per lane in `apps/desktop/src/renderer/components/board/Lane.tsx`. Preserve hover/focus animation registration and the success-pulse target lookup (a virtualized item that's scrolled out of view at completion time still pulses when scrolled back in).
**Cost:** ~half day human / ~30 min CC. Adds ~6 files of test coverage.
**Depends on:** Real load — don't add speculatively. Promote when a user reports it or when telemetry (when added) shows it.

### [P2] Mobile a11y promotion (added by design review 2026-05-09)
**Why:** v1 explicitly scopes mobile (<640px) as read-only with sub-44px touch targets (DESIGN.md §13). When the v2 web mirror or team-mode field use ships, mobile becomes interactive and the existing chip/dot/keychip sizes fail WCAG 2.5.5.
**What:** Rewrite DESIGN.md §13 "Touch targets" to require 44×44 tap zones on every interactive element below 640px. Add to the mobile lane-switcher: real mutation affordances (long-press for context menu, swipe gestures for approve/reject), task creation as a sheet rather than a modal. Re-spec the agent chip with a tap-zone wrapper that doesn't change its visual size.
**Cost:** ~half day human / ~30 min CC for spec; implementation cost depends on whether v2 web-mirror or team-mode lands first.
**Depends on:** v2 web mirror or team-mode shipping. Don't promote speculatively.
