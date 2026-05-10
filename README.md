# VibeMaestro

Agent-first project management for humans who delegate to Claude Code and Codex.

> Local. Single-binary. Open source. The board is the product; the agent is the worker; you stay the conductor.

A four-lane board (`Backlog → Running → Reviewing → Complete`) backed by a real PTY so your local `claude` / `codex` actually starts when you press Run, captures its output, and reports success/failure on exit. SQLite at `~/.vibemaestro/data.sqlite`; one Electron window; no cloud.

## Status

v0.1.0 development — all ten plans in `IMPLEMENTATION.md` are SHIPPED on the `impl-01` branch. No public binary release yet; see [`RELEASING.md`](RELEASING.md) for what's wired and what gates the first tag.

## Run from source

Prerequisites: macOS / Linux / Windows, [Bun](https://bun.sh) ≥ 1.3, and at least one of `claude` or `codex` on your shell PATH.

```bash
git clone https://github.com/codeeatsleep2nd/VibeMaestro
cd VibeMaestro
bun install
bun run desktop:dev
```

`bun run desktop:dev` opens an Electron window. On first launch it creates `~/.vibemaestro/`, runs migrations, seeds nine starter tasks, and probes your installed agents (Claude Code, Codex) — both will show as "available" if they're on PATH.

Press **⌘N** to create a task. Click a card to open the detail panel with a live `xterm.js` mounted to a real PTY. Press **⌘K** for the command palette, **?** for shortcuts.

## What's inside

| Surface | What it does |
|---|---|
| `apps/desktop/` | Electron 41 shell with `contextIsolation: true`, `sandbox: true`. Main process owns the DB + event bus + PTY dispatcher. Renderer is React 19 + Tailwind 4 reading the design tokens. |
| `packages/core/` | Zod schemas as the IPC contract source of truth. State machine. ID helpers. The error envelope. |
| `packages/db/` | Drizzle + better-sqlite3 (WAL). Repository pattern keeps drizzle imports out of services. Migrations under `migrations/sqlite/`. |
| `packages/pty-daemon/` | `spawnAgent`, `transcriptWriter`, `byteThrottle`, `probeAgent`, `ScrollbackRing`. The only place `pty.spawn` is called. |
| `site/` | The vibemaestro.dev landing page. Same `tokens.css` as the app — change `design-tokens.json` and `bun run tokens` updates both. |
| `scripts/generate-tokens.ts` | `design-tokens.json` → `tokens.css` for app + landing. |

## Architecture in one diagram

```
Renderer (React)
   │  TanStack Query
   ▼
 vmBridge.trpcInvoke ──ipcRenderer──▶ ipcMain.handle("trpc.invoke")
                                            │
                                            ▼
                                    callTRPCProcedure
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                            ▼
                       services/...                   bus.emit(event)
                              │                            │
                              ▼                            ▼
                         RunDispatcher              webContents.send
                              │                            │
                              ▼                            ▼
                          pty.spawn                renderer cache merger
```

State transitions are server-enforced. The renderer never sends `status: "running"` — it calls `tasks.run` / `tasks.approve` / etc. and the bus pushes the resulting state change back to every window.

## Patterns

Read the spec docs in this order before contributing:

1. [`IMPLEMENTATION.md`](IMPLEMENTATION.md) — the master map.
2. [`DESIGN.md`](DESIGN.md) — visual system, components, anti-patterns, accessibility targets.
3. [`API.md`](API.md) — resource contracts, transport, state machine, terminal protocol.
4. [`CLAUDE.md`](CLAUDE.md) — cross-cutting rules for anyone (human or agent) editing the repo.
5. [`FUTURE-IMPLEMENTATIONS.md`](FUTURE-IMPLEMENTATIONS.md) — the playbook for extending without regressing.

## Scripts

```bash
bun run desktop:dev     # Electron + hot-reloaded renderer
bun run typecheck       # tsc across all packages
bun run lint            # biome check
bun run test            # bun test
bun run tokens          # regenerate tokens.css for app + landing
bun run package         # electron-builder (.dmg / .exe / .AppImage / .deb)
```

See [`RELEASING.md`](RELEASING.md) for the release runbook.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: read the spec docs first, follow the patterns in [`FUTURE-IMPLEMENTATIONS.md`](FUTURE-IMPLEMENTATIONS.md), keep PRs scoped to a single plan.

## License

MIT. See [`LICENSE`](LICENSE).

## Support

If this is useful, you can support the project:

<a href="https://buymeacoffee.com/codeeatsle9" target="_blank">
  <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" />
</a>

Or via [GitHub Sponsors](https://github.com/sponsors/codeeatsleep2nd).
