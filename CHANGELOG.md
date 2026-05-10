# Changelog

All notable changes to VibeMaestro are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- **Plan #1** Bun + Turborepo + Biome + TS monorepo, Electron 41 shell with `contextIsolation/sandbox/nodeIntegration` flags, custom tRPC v11 IPC link, Drizzle + better-sqlite3 (WAL), pino child loggers, `health.ping`, MIT license, CONTRIBUTING.md, GitHub Actions CI on Ubuntu + macOS.
- **Plan #2** Task + Run Zod schemas + state machine + sequence-backed VM-NNN slugs + ULID run IDs + repository pattern + `tasks.*` and `agents.*` tRPC routers.
- **Plan #3** `@vibemaestro/pty-daemon` package — `spawnAgent`, `transcriptWriter`, `byteThrottle`, `probeAgent`, `ScrollbackRing`. `runDispatcher` per-run lifecycle: spawn, transcript capture to `~/.vibemaestro/runs/<run_id>/transcript`, atomic byte-throttle, exit-code-driven state transitions, SIGTERM→SIGKILL cancel, before-quit cleanup. macOS GUI PATH resolution via login shell. `agents.probe` + `probeAll` at startup.
- **Plan #4** Typed in-process event bus with 1000-entry replay ring + IPC fan-out over `event:activity` (firehose) and `event:task.<id>` (scoped). `events.replaySince` with `Last-Event-ID` semantics. Renderer uses `useEventStream` to merge events into the TanStack Query cache; replaces 2.5s polling.
- **Plan #5** Terminal IPC bridge — 32 KB per-task scrollback ring, multi-attach, attach-replays-scrollback, control messages (resize, signal, attached, run_ended, error). `term:*` channel family per API.md §7.
- **Plan #6** Renderer shell + board + theme — tokens.css generated from design-tokens.json, four-lane board, task cards with agent stripe + status indicator (color-blind-safe shape encoding) + agent chip, conductor strip, topbar, create-task modal, ⌘N shortcut, terminal-dark theme.
- **Plan #7** Detail panel + xterm.js — clamp(560,55vw,720)px aside, live PTY mounted to plan #5 bridge, state-aware Approve/Cancel/Run footer, Esc-close.
- **Plan #8** Polish — toast surface for mutation errors, ⌘K cmdk-driven palette with task search and create-with-prompt, `?` cheatsheet, prompt-prefill in Create modal.
- **Plan #9** Packaging — electron-builder for mac/win/linux, entitlements for native modules under hardened runtime, electron-updater wired against GitHub Releases (skipped in dev), `RELEASING.md` runbook, GitHub Actions release workflow on `v*` tags.

### Documentation

- **README.md** rewritten from sponsor-only stub to full project intro (status, run-from-source, what's inside, architecture diagram, scripts, contributing).
- **FUTURE-IMPLEMENTATIONS.md** added — quality-maintenance playbook covering pattern-mirroring rules for new resources / events / agents / IPC channels / visual surfaces, the anti-patterns to never reintroduce, the performance budgets, the pre-PR self-validation gauntlet, the reviewer checklist, common review smells, and the "when something breaks" runbook. Sets the bar that a future agent or human should be able to ship plan #11 without reading any conversation history.
- **TODOS.md** updated — new v1.x entries for Playwright-Electron E2E, error animations (shake-on-error / success-pulse / connection-lost banner), real `runs.getTranscript` router, and mobile lane-switcher.
- **IMPLEMENTATION.md** §5 done-state checkboxes flipped for the items that are now green (all 10 plans shipped, spike acceptance complete, contract test committed, docs current). Items still gated on real-world signal (full Playwright E2E, dogfooding week, signed release) left unchecked.

### Spike Acceptance (all four green)

- better-sqlite3 ABI rebuild against Electron 41 ✓
- node-pty ABI rebuild against Electron 41 ✓
- macOS GUI PATH resolution ✓ (probes Claude Code and Codex on real install)
- Bun + Electron + tRPC end-to-end ✓
