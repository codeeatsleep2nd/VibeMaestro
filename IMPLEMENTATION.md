# VibeMaestro — Master Implementation Plan

> Single source of truth for what we're building, in what order, and how to know it's done. Derived from `DESIGN.md` (visual + behavioral spec) and `API.md` (data + transport contracts). The detailed step-by-step breakdowns live in `.claude/PRPs/plans/01-10-*.plan.md`; this document is the map.

## 1. What we're building

VibeMaestro is an **agent-first project management dashboard for local single-user use**. A human creates a task; local agents (Claude Code + Codex in v1) pick it up and move it through `Backlog → Running → Reviewing → Complete`. The board is the product. The agent is the worker. The user is the conductor.

Two design implications drive every architectural choice:

1. **Agents are first-class.** Not avatar circles, not emoji — a fixed hue + 2-letter monogram per agent, scaled to N agents via a documented allocator. (`DESIGN.md §5`)
2. **The board is the product.** Marketing/setup is secondary. The system optimizes for dense, scannable, status-rich task boards rendered in `terminal-dark` with one ambient motion (the running-task pulse) and one editorial typographic moment per surface. (`DESIGN.md §1, §10`)

### v1 scope

| Dimension | v1 | Deferred to v2 |
|---|---|---|
| User model | Single-user, local | Team mode (presence, assignees, mentions) |
| Agents | Claude Code + Codex | Gemini, GPT-5, Cursor, Aider (hues reserved in `design-tokens.json`) |
| Theme | `terminal-dark` only (toggle hidden) | `paper-light` full design pass |
| Transport | Electron IPC (renderer ↔ main) | HTTP + SSE + WebSocket localhost mirror for external CLI/MCP integration |
| Auth | No-op `AuthContext` (slot wired) | Per-launch token; OAuth/PAT for remote backend |
| Persistence | SQLite at `~/.vibemaestro/data.sqlite` (WAL mode) | Postgres swap (architecture supports it; see plan #1c "Database portability") |
| Distribution | Signed `.dmg` / `.exe` / `.AppImage` via GitHub Releases + electron-updater auto-update | Linux package managers, Windows EV cert, beta channel |
| Mobile | Read-only lane-switcher (< 640px) | Real mutation affordances + 44px tap targets |

---

## 2. The contracts that drive everything

These four files are the contract. Every implementation plan reads them as the source of truth; they read no plans in return.

| File | Owns | Updated by |
|---|---|---|
| `DESIGN.md` | Visual system, components, surfaces, anti-patterns, accessibility targets, first-task journey storyboard | A design review (`/plan-design-review`) |
| `API.md` | Resource contracts, transport, state machine, errors, terminal protocol, v1/v2 split | A spec change with corresponding plan updates |
| `design-tokens.json` | Color, typography, spacing, motion, agent hue allocation | Design system change (regenerates `tokens.css` for both app and landing) |
| `design-preview.html` | Self-contained reference render of the design system | Manual sync when `design-tokens.json` or `DESIGN.md` §10 changes |

Plus the operational rule book:

| File | Owns |
|---|---|
| `CLAUDE.md` | Cross-cutting rules for any agent working in this repo (stack, plan order, anti-pattern policy, repository discipline, contract discipline, perf budgets) |
| `TODOS.md` | Deferred work with rationale (v1.x promotions, v2 items, doc hygiene) |

If a UI affordance in `DESIGN.md` doesn't have a contract in `API.md`, that's a bug in `API.md`. If a contract in `API.md` has no UI in `DESIGN.md`, that's a bug in `DESIGN.md`. The two stay coupled.

---

## 3. Implementation roadmap — the 10 plans

> All plans #1-#10 reviewed: CEO + Eng on 2026-05-09 (covering plans #1-#8 holistically; plan #9 added by that eng review; plan #10 added separately). Design review (2026-05-09) covers DESIGN.md, which plans #6-#8 consume.

The product is built across 10 sequenced plans plus an independent landing site. Each plan is a self-contained design document with its own KEY_INSIGHT/GOTCHA blocks, file lists, step-by-step tasks, integration tests, and Risks table. Each plan ends with a "Plan-#N → Plan-#(N+1) contract" Notes section that defines the seam.

```
DESIGN.md ────┐
              │
API.md ───────┤
              │
design-       ├──▶  #1  Backend skeleton + persistence + IPC bridge        (PR #1a + #1b + #1c)
tokens.json ──┤            │ Spike Acceptance gate
              │            ▼
              ├──▶  #2  Task + Run resources + state machine
              │            │
              │            ▼
              ├──▶  #3  Agent registry + PTY daemon
              │            │
              │            ▼
              ├──▶  #4  Internal event bus + IPC streams
              │            │
              │            ▼
              ├──▶  #5  Terminal IPC bridge
              │            │
              │            ▼
              ├──▶  #6  Frontend shell + board + theme
              │            │
              │            ▼
              ├──▶  #7  Detail panel + xterm.js + Diff/Transcript
              │            │
              │            ▼
              ├──▶  #8  Polish + Playwright-Electron happy-path E2E
              │            │
              │            ▼
              └──▶  #9  Packaging + signing + auto-update + release pipeline
                                      │
                                      ▼
                                  v0.1.0 SHIPS

design-tokens.json ──▶  #10 Landing site (vibemaestro.dev) — independent track
```

### Plan-by-plan

| # | Plan | Owns | Files | Confidence | Status |
|---|---|---|---|---|---|
| **1** | [Backend skeleton + persistence](.claude/PRPs/plans/01-backend-skeleton.plan.md) | Bun + Turborepo monorepo, Electron app shell, custom tRPC IPC link, Drizzle + better-sqlite3 (WAL), AuthContext middleware, error envelope, pino, `health.ping`, **Spike Acceptance gate**, **CI workflow**, **DB portability discipline**, **Zod-schema contract test**, **LICENSE + CONTRIBUTING.md (in PR #1a)**. Ships as 3 PRs: **1a tooling+CI+OSS basics (~10)**, **1b Electron+IPC (~15)**, **1c DB+spike+contract (~13)**. | ~38 total | 8/10 | **PROTOTYPE LANDED** (impl-01) — IPC bridge verified end-to-end, native module rebuild works (`electron-builder install-app-deps`), pino + AuthContext + envelope all wired. Full Spike Acceptance: better-sqlite3 ABI ✓, Bun+Electron+tRPC ✓, **node-pty ABI ✓** (post plan #3), **macOS GUI PATH ✓** (post plan #3 — `path-helper` resolves login-shell PATH and Claude Code/Codex probes return real versions). Contract test snapshot deferred to a real plan #1c PR. Note: Electron pinned to 41.5.1 (33 was alpha-only). |
| **2** | [Task + Run resources + state machine](.claude/PRPs/plans/02-task-run-resources.plan.md) | Drizzle schema for `tasks` + `runs`, sequence-backed task-ID allocator, ULID run IDs, Zod schemas in `@vibemaestro/core`, repository + service layers, `tasks.*` and `runs.*` tRPC routers, server-enforced state transitions, integration tests against real :memory: DB. | ~28 | 8/10 | **PROTOTYPE LANDED** (impl-01) — schemas, repos, services, routers all in place. State machine has unit tests (17 pass). Integration tests against :memory: DB deferred to a real plan #2 PR. |
| **3** | [Agent registry + PTY daemon](.claude/PRPs/plans/03-agent-registry-pty-daemon.plan.md) | `Agent` resource (`API.md §5.3`), `@vibemaestro/pty-daemon`, per-run PTY lifecycle, transcript capture to `~/.vibemaestro/runs/<run_id>.transcript`, throttled byte counter (250ms / 4KB), agent registry CRUD + probe action, exit-code-driven `running → reviewing/error` transitions, macOS GUI PATH resolution, FAKE_AGENT_FIXTURE for tests. | ~30 | 7/10 | **SHIPPED** (impl-01) — `@vibemaestro/pty-daemon` package with `spawnAgent`, `transcriptWriter`, `byteThrottle`, `probeAgent`. `runDispatcher` owns lifecycle: spawn after task-service.run() commits, SIGTERM→SIGKILL cancel, `before-quit` killAll. macOS shell PATH resolved via login shell (`zsh -l -c 'echo $PATH'`), cached. `agents.probe` + `probeAll` at startup populate availability + version. 4 fake-agent shell fixtures + 14 tests (10 pass, 4 PTY-runtime tests skipped under bun test — covered by plan #8 Playwright-Electron E2E). `tasks._simulateAgentExit` retained as dev helper for manual board walks. |
| **4** | [Internal event bus + IPC streams](.claude/PRPs/plans/04-event-bus-ipc-streams.plan.md) | Typed in-process event bus, decouple `taskService → runDispatcher` direct call to publish/subscribe, fan out to renderer over `event:activity` (firehose) + `event:task.<id>` (scoped), 1000-entry replay ring with `Last-Event-ID` resume, exact-once + ordered delivery asserted by `events-integration.test.ts`. | ~22 | 8/10 | Not started — prototype polls every 2.5s instead. |
| **5** | [Terminal IPC bridge](.claude/PRPs/plans/05-terminal-ipc-bridge.plan.md) | `term:*` IPC channel family (`API.md §7`), 32 KB per-task scrollback ring, multi-attach (multiple windows can share one PTY), reattach-replays-scrollback semantics, control messages (resize, signal, attached, run_ended, error). | ~16 | 8/10 | Not started — depends on plan #3. |
| **6** | [Frontend shell + board + theme](.claude/PRPs/plans/06-frontend-shell-board.plan.md) | React + Tailwind 4 + design tokens generated from `design-tokens.json`, four-lane board, task cards with agent stripe + status indicator + agent chip, conductor strip (84px expanded / 56px compact, +N overflow), topbar, mobile lane-switcher (< 640px, read-only), TanStack Query + tRPC, event-driven cache merger. | ~32 | 8/10 | **PROTOTYPE LANDED** (impl-01) — terminal-dark theme via tokens.css generator, four-lane board, task cards with agent stripe + status shape encoding (pulse, ring, triangle), conductor strip with 1Hz tick, topbar, create-task modal, theme toggle. Mobile lane-switcher + event-driven cache merger deferred to a real plan #6 PR. |
| **7** | [Detail panel + xterm.js](.claude/PRPs/plans/07-detail-panel-xterm.plan.md) | Right-side panel (clamp 560-720px, 1280×800 minimum window), `xterm.js` mounted to plan #5's terminal bridge with scrollback replay, Diff tab (v1.5 placeholder), Transcript tab, state-aware Approve/Request changes/Discard footer, focus management. | ~20 | 7/10 | Not started. |
| **8** | [Polish + E2E](.claude/PRPs/plans/08-polish.plan.md) | Editorial empty states, create-task modal, ⌘K command palette, ? cheatsheet overlay, app-wide keyboard shortcuts, toast system replacing `alert()`, focus trapping in detail panel, error-card shake-on-entry, success-pulse on Reviewing → Complete, connection-lost banner, agent-unavailable triple-signal, **Playwright-Electron happy-path E2E**. | ~26 | 8/10 | Partial — empty state, create-task modal, and ⌘N shortcut shipped in the prototype. ⌘K palette, cheatsheet, toasts, E2E deferred. |
| **9** | [Packaging + release pipeline](.claude/PRPs/plans/09-packaging-release.plan.md) | electron-builder for mac/win/linux, macOS code signing + Apple notarization, Windows code signing (or honest unsigned-fallback), electron-updater wired against GitHub Releases, semver `bun run release:*` scripts, GitHub Actions release workflow, `RELEASING.md` runbook, in-app update toast. | ~18 | 6/10 | Not started. |
| **10** | [Landing site (vibemaestro.dev)](.claude/PRPs/plans/10-landing-site.plan.md) | Editorial static HTML in `site/`, terminal-dark inheritance, asymmetric hero with live conductor-strip animation, WHY/HOW/WHAT editorial body, OS-detecting Download CTA reading GitHub Releases, Cloudflare Pages deploy with Lighthouse CI gate, vanilla JS (≤ 50 KB total). Independent of plans #1-#9. | ~14 | 8/10 | Not started. |

### Sequencing rules

The execution chain is **fully linear**: `#1 → #2 → #3 → #4 → #5 → #6 → #7 → #8 → #9`. Plan #6 (frontend shell) consumes the contracts established by plans #2-#5, so the backend track must complete before the frontend track starts. Plan #10 (landing site) is the only parallel track.

```
   ┌────────────────────────────────────────────────────────────────┐
   │ APP TRACK (linear)                                             │
   │                                                                │
   │ #1 ─▶ #1c Spike Acceptance ✱ ─▶ #2 ─▶ #3 ─▶ #4 ─▶ #5 ─▶ #6 ─▶ #7 ─▶ #8 ─▶ #9 ─▶ v0.1.0 ships
   │                              gates everything below            │
   └────────────────────────────────────────────────────────────────┘

   ┌────────────────────────────────────────────────────────────────┐
   │ LANDING TRACK (independent, parallel)                          │
   │                                                                │
   │ #10  (any time after design-tokens.json is stable, which is now)│
   │      Download CTA degrades to "Coming soon" until plan #9      │
   │      ships at least one GitHub Release.                        │
   └────────────────────────────────────────────────────────────────┘
```

- **#1c gates everything.** The Spike Acceptance criteria (better-sqlite3 ABI, node-pty ABI, macOS GUI PATH, Electron+Bun+tRPC end-to-end) MUST pass before plan #2 starts. If any check fails, re-spec the affected plans rather than ship plan #1 with the issue deferred. (`.claude/PRPs/plans/01-backend-skeleton.plan.md` "Spike Acceptance" section)
- **#9 ships v0.1.0.** Depends on plans #1-#8 being done. Not technically blocked from earlier work, but the value of the release pipeline arrives only when there's an app to release.
- **#10 is independent.** Can land any time after `design-tokens.json` is stable (which is now). Its Download CTA gracefully degrades to "Coming soon" until plan #9 ships at least one release.

## 3.5 End-of-v1 file structure

What the repo looks like after all 10 plans ship.

```
VibeMaestro/
├── apps/
│   └── desktop/                      ◀── plan #1b shell, plans #2-#8 build out
│       ├── src/
│       │   ├── main/                     # Electron main process
│       │   │   ├── ipc.ts                #   tRPC IPC handler + event fan-out
│       │   │   ├── routers/              #   tasks, runs, agents, health
│       │   │   ├── services/             #   task-service, run-dispatcher,
│       │   │   │                         #   run-service-internal, agent-service
│       │   │   ├── auto-update.ts        #   plan #9 electron-updater wiring
│       │   │   └── main.ts               #   entry: window factory, DB init, lifecycle
│       │   ├── preload/                  # contextBridge: vmBridge surface
│       │   └── renderer/                 # React + Tailwind 4
│       │       ├── components/           #   board/, panel/, palette/, toast/, agent-chip,
│       │       │                         #   status-indicator, conductor-strip, update-toast
│       │       ├── hooks/                #   useEventStream, useGlobalShortcuts, etc.
│       │       ├── styles/
│       │       │   ├── tokens.css        #   GENERATED from design-tokens.json
│       │       │   └── global.css
│       │       └── main.tsx              #   App composition
│       ├── e2e/
│       │   └── happy-path.e2e.ts         ◀── plan #8 Task 16 Playwright-Electron E2E
│       ├── test/                         # Vitest unit + integration tests
│       │   ├── contract.test.ts          ◀── plan #1c Zod-schema snapshot
│       │   └── events-integration.test.ts ◀── plan #4 exact-once + order
│       ├── electron-builder.yml          ◀── plan #9
│       ├── entitlements.mac.plist        ◀── plan #9 macOS hardened runtime
│       └── package.json
├── packages/
│   ├── core/                         ◀── plan #1, extended by #2/#3/#4
│   │   └── src/
│   │       ├── contracts/                # Zod schemas — single source of truth
│   │       │   ├── task.ts, run.ts, agent.ts
│   │       │   ├── events.ts             # run.started, task.state_changed, ...
│   │       │   └── error.ts              # API.md §8 envelope
│   │       ├── errors.ts                 # AppError class
│   │       └── id.ts                     # ULID + slug helpers
│   ├── db/                           ◀── plan #1c, schema extended by #2/#3
│   │   ├── src/
│   │   │   ├── client.ts                 # Drizzle + better-sqlite3 singleton
│   │   │   ├── schema.ts                 # tasks, runs, agents, sequences
│   │   │   ├── repositories/             # TaskRepository, RunRepository, AgentRepository
│   │   │   └── dialects/
│   │   │       └── sqlite-init.ts        # WAL pragmas
│   │   └── migrations/
│   │       └── sqlite/                   # *.sql + meta/_journal.json
│   └── pty-daemon/                   ◀── plan #3
│       └── src/
│           ├── spawn.ts                  # spawnAgent
│           ├── byte-throttle.ts          # 250ms / 4KB flush
│           ├── transcript.ts             # append-only file writer
│           └── scrollback-ring.ts        # plan #5 32 KB ring
├── site/                             ◀── plan #10 (independent track)
│   ├── index.html
│   ├── styles/
│   │   ├── tokens.css                    # GENERATED (same generator as renderer)
│   │   └── landing.css
│   ├── scripts/
│   │   ├── conductor-strip.ts
│   │   └── download-cta.ts
│   └── assets/                           # logo, og-image, favicon
├── scripts/
│   └── generate-tokens.ts            # design-tokens.json → tokens.css (both surfaces)
├── .github/
│   └── workflows/
│       ├── ci.yml                    ◀── plan #1a — typecheck/lint/test, build-installer
│       ├── release.yml               ◀── plan #9 — build + sign + publish on tag
│       └── deploy-site.yml           ◀── plan #10 — Cloudflare Pages
├── DESIGN.md                         # Visual system, components, surfaces, anti-patterns
├── API.md                            # Resource contracts, transport, state machine
├── design-tokens.json                # Token source
├── design-preview.html               # Self-contained reference render
├── assets/
│   └── logo.svg                      # Primary mark
├── IMPLEMENTATION.md                 # This file — the master map
├── CLAUDE.md                         # Cross-cutting rules
├── TODOS.md                          # Deferred work
├── README.md                         # Public-facing intro
├── CONTRIBUTING.md                   ◀── plan #1a — how to contribute
├── LICENSE                           ◀── plan #1a — MIT
├── RELEASING.md                      ◀── plan #9 — release runbook
├── CHANGELOG.md                      ◀── plan #9 — auto-generated by standard-version
├── .claude/
│   └── PRPs/
│       └── plans/
│           ├── 01-backend-skeleton.plan.md
│           ├── 02-task-run-resources.plan.md
│           ├── 03-agent-registry-pty-daemon.plan.md
│           ├── 04-event-bus-ipc-streams.plan.md
│           ├── 05-terminal-ipc-bridge.plan.md
│           ├── 06-frontend-shell-board.plan.md
│           ├── 07-detail-panel-xterm.plan.md
│           ├── 08-polish.plan.md
│           ├── 09-packaging-release.plan.md
│           └── 10-landing-site.plan.md
├── package.json                      # Root: workspaces, dev/build/test/release scripts
├── turbo.json                        # Turborepo pipeline
├── bun.lockb
└── .gitignore
```

---

## 4. Cross-cutting concerns

### CI/CD (lives in plan #1a, expanded in plan #9)

```
Every PR / push to main:
  ├── bun typecheck
  ├── bun lint
  ├── bun test  (matrix: Ubuntu + macOS)
  └── (push to main only) build-installer  (catch packaging breaks before tag)

Every git tag v*:
  ├── Build matrix: ubuntu-latest, macos-latest, windows-latest
  ├── Sign + notarize (macOS)
  ├── Sign (Windows, optional)
  ├── Publish GitHub Release with .dmg + .exe + .AppImage
  └── electron-updater latest-mac.yml / latest.yml / latest-linux.yml manifests

Every push to main touching site/** or design-tokens.json:
  ├── Regenerate site/styles/tokens.css
  ├── Lighthouse CI (≥ 95 on Performance/A11y/Best Practices/SEO)
  └── Deploy to Cloudflare Pages (or GitHub Pages fallback)
```

### Testing strategy

- **Unit tests** — every package and every router. Lives next to the code (`apps/desktop/test/<area>.test.ts`, `packages/<pkg>/src/**/*.test.ts`).
- **Integration tests** — per-plan. Plan #2 covers state machine end-to-end against real :memory: DB. Plan #3 covers PTY lifecycle with a fake-echo agent. Plan #4 covers exact-once + ordered event delivery. Plan #6 covers the event-driven cache merger.
- **E2E test** — single Playwright-Electron happy-path test in plan #8 that walks: empty board → create task → run → watch terminal → approve → see card move to Complete with success-pulse. The cross-plan integration safety net.
- **Contract test** — plan #1c's `contract.test.ts` snapshots the tRPC router shape from `@vibemaestro/core/contracts`. v2 HTTP/SSE/WebSocket mirror reads the same Zod schemas; PRs that drift the contract fail CI unless the snapshot is updated intentionally.
- **Visual regression** — plan #10 (landing) uses Playwright screenshots at 320/768/1280. Plan #6/#8 (app UI) does manual diff against `design-preview.html`; visual regression for the app is deferred to v1.5.
- **Coverage target** — 80%+ for shared packages (`@vibemaestro/core`, `@vibemaestro/db`); behavioral coverage for the renderer (state machine merger, event cache merger, responsive logic).

### Performance budgets (from `CLAUDE.md`)

| Surface | Budget |
|---|---|
| Board | < 100 tasks comfortable; 100-500 degraded but usable; > 500 unsupported in v1 (TODOS.md captures `@tanstack/react-virtual` v1.5 promotion) |
| Conductor strip | ≤ 8 active rows; +N overflow chip handles the rest |
| PTY scrollback | 32 KB per task ring |
| Event ring buffer | 1000 entries; older replays return `{ truncated: true }` |
| JS bundle (app, renderer) | < 300 KB gzipped |
| JS bundle (landing) | ≤ 50 KB total |
| Lighthouse (landing) | ≥ 95 on Performance/A11y/Best Practices/SEO |

### Security posture

- v1 is local single-user; no remote API, no auth needed beyond the no-op `AuthContext`.
- Electron `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` — never disabled. Renderer reaches main only through the preload `contextBridge`.
- PTY content is **not** logged (prevents agent prompts/secrets leaking to disk via pino).
- No third-party analytics, no telemetry, no API keys leaving the user's machine.
- Standard agent-trust-boundary applies: user prompts go to subprocess agents. Documented in `CLAUDE.md`; revisited for the v2 remote-backend threat model.

### Distribution

Plan #9 owns the full pipeline. Honest unsigned-fallback if signing certs aren't available (macOS right-click workaround + Windows SmartScreen workaround documented in README). When `vibemaestro.dev` lands, the landing site (plan #10) becomes the canonical download surface.

---

## 5. Done state — when v0.1.0 ships

v0.1.0 is shippable when ALL of the following hold:

- [ ] All 10 plans implemented to their Acceptance Criteria
- [ ] Plan #1c Spike Acceptance passed on macOS (Apple Silicon + Intel) and Linux
- [ ] CI passes: typecheck + lint + test on Ubuntu + macOS for every PR
- [ ] Contract test snapshot is committed; matches the tRPC router shape
- [ ] Plan #4's `events-integration.test.ts` asserts exact-once + correct order across the full lifecycle
- [ ] Plan #8's Playwright-Electron E2E walks the full happy path against a packaged build
- [ ] Plan #9's release workflow successfully tagged + published a `.dmg` + `.exe` + `.AppImage` to GitHub Releases
- [ ] Plan #10's landing site is deployed and Lighthouse-green
- [ ] **Project author has dogfooded VibeMaestro for at least one week**: at least 5 real Claude Code or Codex tasks managed across at least 5 different days, on the dev build (or signed installer once plan #9 ships). Bugs found during dogfooding are fixed or accepted as known issues with explicit `RELEASING.md` mention.
- [ ] DESIGN.md, API.md, IMPLEMENTATION.md, README.md, CLAUDE.md, TODOS.md, RELEASING.md, CONTRIBUTING.md are all current
- [ ] LICENSE (MIT) is committed and readable on github.com
- [ ] No critical findings open from CEO / Design / Eng reviews

The first user who can install VibeMaestro from the landing's Download button, create a task, and watch their local Claude Code session execute it inside the app — that's the moment v1 is real.

### Versioning policy

- **v0.x.y**: v1 development. v0.1.0 is the first public release; v0.x.y patches and v0.y.0 minors track v1 feature additions and bug fixes.
- **v1.0.0**: ships when v0.1.0 has been in real use for ≥ 2 weeks without a critical bug AND the v1 scope (this section's done-state) is met without "known issues" exceptions.
- **v2.0.0**: any breaking change to the public API surface (resources, events, terminal protocol — see API.md §9), the introduction of remote backend, or team mode. v1 deprecation runs 6 months out via API.md §9's `Sunset:` header convention.
- **Pre-v1 commits** use conventional-commits (`feat:`, `fix:`, `refactor:`, etc.) so plan #9's `standard-version` can auto-generate CHANGELOG.md from them.

---

## 6. Project-level risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Toolchain assumption fails (node-pty + Electron + Bun ABI) | Medium | High (re-spec required) | Plan #1c Spike Acceptance gates plans #2-#9 on this exact validation |
| macOS Apple notarization adds friction or fails | Medium | Medium (release blocked) | Plan #9 ships unsigned-fallback as a configured path; release pipeline doesn't gate on signing |
| Plan #1's 38-file PR overwhelms review | Mitigated | — | Split into PR #1a + #1b + #1c per eng review |
| Cross-plan integration regression slips through | Medium | Medium | Plan #4's exact-once test + Plan #8's E2E + Plan #1c's contract snapshot are the three layers of safety net |
| Design system drift (someone hand-tunes a px value) | Medium | Low individually, High cumulatively | CLAUDE.md "no raw px" rule + token generator pattern + design preview as living reference |
| Distribution gap silently persists | Mitigated | — | Plan #9 added explicitly; eng review caught the gap before any code ships |
| Visual regression undetected in v1 | Low | Low | Manual diff against `design-preview.html` documented as the v1 gate; automated visual regression is a v1.5 TODO |
| User loses tasks on disk corruption | Low (with WAL) | Medium | SQLite WAL mode + `synchronous = NORMAL` + `wal_autocheckpoint = 1000` per plan #1c. Backup is a v1.x TODO. |

---

## 7. Glossary

| Term | Definition |
|---|---|
| **Agent** | A configured local CLI tool VibeMaestro can spawn in a PTY (Claude Code, Codex). Has a fixed hue + 2-letter monogram. |
| **Task** | A user-created request: title + prompt + agent. Moves through the state machine in `API.md §5.1`. |
| **Run** | A single agent execution attempt for a task. Tasks have many runs; one is current at a time. ULID-identified. |
| **Conductor strip** | The persistent sticky footer (`DESIGN.md §10`) showing live agent activity. Most distinctive surface in the product. |
| **Detail panel** | The right-side slide-in panel showing a task's terminal, diff (v1.5 stub), and transcript. |
| **PTY** | Pseudoterminal. The interface VibeMaestro uses to spawn an agent process and capture its TTY-formatted output. |
| **Scrollback ring** | The 32 KB per-task buffer in the main process holding recent PTY bytes for reattach (`API.md §7`). |
| **Event bus** | The typed in-process pub/sub (`plan #4`) that decouples services and fans out to the renderer. |
| **Spike Acceptance** | The toolchain-validation gate in plan #1c that must pass before plans #2-#9 begin. |
| **`@vibemaestro/core/contracts`** | The Zod schemas that ARE the API surface. Single source of truth for resources, events, errors. |
| **terminal-dark / paper-light** | The v1 theme (default) and the internal-verifier-only theme. Toggle is hidden from users in v1. |
| **conductor** | The user. The product framing: agents are the workers, you are the conductor. |
| **the spike** | Shorthand for plan #1c's Spike Acceptance work. |

---

## 8. Where to start

1. Read this file (`IMPLEMENTATION.md`) — you're already here. It's the entry point.
2. Read `DESIGN.md` (visual + behavior), `API.md` (contracts), `CLAUDE.md` (rules), `TODOS.md` (deferred). In that order.
3. Read `.claude/PRPs/plans/01-backend-skeleton.plan.md`. Pay attention to "Recommended PR split" and "Spike Acceptance" sections.
4. Open PR #1a (monorepo + tooling + CI + LICENSE + CONTRIBUTING.md). Land it.
5. Open PR #1b (Electron + IPC + tRPC). Land it.
6. Open PR #1c (DB + Spike Acceptance + contract test). Run the Spike Acceptance. If green, proceed to plan #2. If not, surface the failure, re-spec, do not paper over.
7. Plan #10 (landing) can be done in parallel by anyone whenever; doesn't block the app track.

After each plan PR merges: update §3's plan-by-plan table to mark that plan SHIPPED with the merge commit hash. Update §5 done-state checkboxes if the plan delivered an acceptance item. Stale master docs are worse than no master docs.
