# CLAUDE.md — VibeMaestro

Cross-cutting rules for any Claude Code (or other agent) session working in this repo.
Read this first; then read `DESIGN.md`, `API.md`, and the plan you're executing.

## What this is

VibeMaestro is an **agent-first project management dashboard** for local single-user use in v1. A human creates a task; local agents (Claude Code, Codex) pick it up and move it through `Backlog → Running → Reviewing → Complete`. The board is the product.

## Source of truth

| File | Owns |
|---|---|
| `DESIGN.md` | Visual system, components, surfaces, anti-patterns, accessibility targets |
| `API.md` | Resource contracts, transport, state machine, errors, terminal protocol |
| `design-tokens.json` | Machine-readable token source (consumed by build → `tokens.css` in plan #6) |
| `design-preview.html` | Self-contained reference render of the token system + theme swap |
| `assets/logo.svg` | Primary mark (themeable via `currentColor`) |
| `.claude/PRPs/plans/0N-*.plan.md` | Sequenced implementation plans, #1 → #8 |
| `TODOS.md` | Deferred work, v2 promotions, design follow-ups |

If a UI affordance in `DESIGN.md` doesn't have a contract in `API.md`, that's a bug in `API.md` (and vice versa).

## Stack (locked in plan #1)

- **Runtime / package manager:** Bun `^1.3.x`
- **Workspace:** Turborepo `^2.8`
- **App shell:** Electron `^33` (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`)
- **Build:** electron-vite `^4.0`
- **IPC contract:** tRPC v11 over a custom IPC link (no `electron-trpc` dependency)
- **Persistence:** Drizzle ORM `^0.45` + better-sqlite3 `^11`
- **PTY:** node-pty `^1.0` (rebuilt against Electron's Node ABI via `electron-builder install-app-deps`)
- **Logging:** pino `^9` (JSON to stderr, per-request child logger bound to `request_id`)
- **Validation:** Zod `^3.23`
- **Lint/format:** Biome `^2.4`
- **Frontend (plan #6):** React + TanStack Query + Tailwind 4 + xterm.js (plan #7)

Pin every version; no floating `^*` on top-level deps.

## Plan execution order

Plans run in numeric order. Each plan has a "Plan-#N → Plan-#(N+1) contract" Notes section that defines the seam.

```
#1  backend skeleton + persistence + IPC bridge   (ships as 3 PRs: 1a tooling + CI,
                                                    1b electron+IPC, 1c DB+spike+contract)
#2  task + run resources + state machine
#3  agent registry + PTY daemon
#4  internal event bus + IPC streams
#5  terminal IPC bridge
#6  frontend shell + board + theme
#7  detail panel + xterm.js + diff/transcript
#8  polish + Playwright-Electron happy-path E2E
#9  packaging + signing + auto-update + release pipeline
```

### Spike-first gate (before plan #2)

Plan #1 doubles as a **spike** that validates four toolchain risks before plans #2-#8 land:
1. better-sqlite3 ABI rebuild against Electron 33
2. node-pty ABI rebuild against Electron 33
3. macOS GUI launch PATH resolution (Finder/Dock vs terminal)
4. Electron + Bun + tRPC end-to-end through the IPC bridge

See plan #1's "Spike Acceptance" section. If any check fails, **stop and re-evaluate**; do not start plan #2.

## Cross-cutting rules

### Style & visual
- **Tokens, not raw px.** All component code reads from `tokens.css` (generated from `design-tokens.json`). No `padding: 18px` — use `var(--space-4)`. (DESIGN.md §15)
- **Semantic tokens, not literal.** Components reference `--surface-raised`, `--accent`, `--status-running`. They never reference `--ochre` or `--paper`. Themes only override the value mapping. (DESIGN.md §3)
- **Anti-patterns are blocking.** PRs that introduce items from DESIGN.md §15 (gradients, glass, stock avatars, emoji status, generic dashboards, raw px, etc.) are rejected.
- **Color-blind safety.** Every status that conveys meaning by color also conveys it by shape or motion. Agent identity uses both hue and 2-letter monogram. (DESIGN.md §13)
- **Theme switch is hidden in v1.** `paper-light` is an internal mechanism verifier, not a shipping theme. Do not surface a user-facing toggle until paper-light is fully designed. (DESIGN.md §3)
- **Reserved layout slots.** Single-user mode renders `display: none` on the team-mode `assignee` chip slot on the task card and on the presence row above the conductor strip. The CSS exists so team mode is a config swap, not a redesign. **Do not delete these slots when refactoring single-user code.** (DESIGN.md §6)

### Code & architecture
- **Errors:** throw `AppError` from services and routers; the tRPC error formatter wraps them into the API.md §8 envelope. Never wrap in `TRPCError` directly. Catch-all `try { } catch (e) { }` is a smell — name the exception class. (plan #1, plan #2)
- **Logging:** use `pino` via `childLogger({ request_id })`. Never `console.log`. PTY content is **not** logged.
- **Identity:** identity comes from `AuthContext` (no-op in v1, pluggable). Endpoints **must not** read `Authorization`, `Cookie`, or `X-User-*` headers in v1. (API.md §3)
- **IDs are opaque.** Don't parse task slugs (`VM-218`) or run ULIDs (`run_…`) on the client. (API.md §4)
- **State transitions are server-enforced.** The client never sends `status: "running"`; it calls action endpoints. (API.md §5.1)
- **No localhost HTTP server in v1.** All renderer ↔ main traffic is Electron IPC. (API.md §2)
- **Terminal bytes use a dedicated IPC channel**, not the typed event bus. (plan #5)
- **Database access goes through repositories.** Services consume `TaskRepository`, `RunRepository`, `AgentRepository` from `packages/db/src/repositories/*`. No `import { drizzle }` or `import { sqliteTable }` outside `packages/db/`. SQLite-specific PRAGMAs live in `packages/db/src/dialects/sqlite-init.ts`. v1 ships SQLite; the repository pattern keeps a future postgres swap to a driver + init replacement, not a multi-week refactor. (plan #1c)
- **Contracts are Zod schemas in `@vibemaestro/core/contracts`.** Resources, event payloads, and the error envelope all share a single source of truth. tRPC routers consume them via `.input()` / `.output()`. The `contract.test.ts` snapshot in plan #1c locks the surface; intentional changes show up as snapshot diffs in PRs. v2 HTTP/SSE/WebSocket mirror reads the same schemas. (plan #1c)

### Perf budgets
- **Board:** renders < 100 tasks comfortably; 100-500 degrades but stays usable; > 500 unsupported in v1. Add `@tanstack/react-virtual` per lane when any single user crosses 100 tasks. (plan #6 + TODOS.md)
- **Conductor strip:** ≤ 8 active rows; the +N overflow chip handles the rest (DESIGN.md §10).
- **PTY scrollback:** 32 KB per task ring (configurable). Multiple attached windows share the ring. (plan #5)
- **Event ring buffer:** 1000 entries; older replays return `{ truncated: true }` and the renderer re-fetches. (plan #4)

### Tests
- Plans land with their tests in the same PR. `bun test` is the runner (Vitest-compatible).
- Coverage target: 80%+ for shared packages (`@vibemaestro/core`, `@vibemaestro/db`); behavioral coverage for the renderer (state machine merger, event cache merger, responsive logic).
- For PTY / node-pty integration, prefer test fixtures that use `/bin/echo` or a tiny scripted PTY rather than a real Claude/Codex process.

### Git
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- One plan per PR (or per stack of PRs) — keep diffs reviewable.
- Don't run `git add -A`. Stage explicit paths.

### Boundaries
- **Don't refactor across plan boundaries.** If plan #4 needs a tweak in plan #2's code, do the tweak — but don't take the opportunity to redesign plan #2's pattern.
- **Don't foreshadow.** Plan #N implements only plan #N's scope. v2 TODOs (API.md §11) stay deferred until they're picked up.
- **Don't expand the agent surface.** v1 supports two agents (Claude Code, Codex). Future agents (Gemini, GPT-5, Cursor, Aider) have reserved hues in `design-tokens.json` but **no adapter, no UI, no documentation** in v1.

## When the design changes

If you need to change the design system:
1. Update `DESIGN.md` first (rationale + decision).
2. Update `design-tokens.json` (machine source).
3. Update `design-preview.html` (the visible verifier).
4. Re-check WCAG contrast targets in DESIGN.md §13.
5. Update any plan that references the changed surface.

If you need to change the API:
1. Update `API.md` first (contract).
2. Update the plans that implement the changed surface.
3. Honor the v1/v2 split — don't promote a v2 TODO to v1 without an explicit plan.

## Quick checks

Before saying "done":
- [ ] No raw `px` values in component code (search: `: \d+px`)
- [ ] No `console.log` (search: `console\.log`)
- [ ] No catch-all error handlers (search: `catch.*Error.*{`)
- [ ] No emoji in status indicators (search: status emojis)
- [ ] DESIGN.md anti-patterns from §15 not reintroduced
- [ ] `bun typecheck && bun lint && bun test` all pass
