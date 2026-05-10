# Future Implementations — quality playbook

This document is the contract between **today's shipped code** and **whoever extends it next** (human or AI agent). Following it keeps the codebase coherent; ignoring it produces drift. Pair it with the spec docs in `README.md` § Patterns.

The structure mirrors the lifecycle of a change: **before writing code → while writing code → before opening a PR → before merging**.

---

## Before writing code

### 1. Read the four spec docs in order

| Doc | What you need from it |
|---|---|
| `IMPLEMENTATION.md` | Which plan you're extending. Done-state checkboxes. Plan-by-plan status. |
| `DESIGN.md` | The visual system, components, anti-patterns. If you're touching UI, read §3 (tokens), §5 (agents), §10 (conductor strip), §13 (a11y), §15 (anti-patterns). |
| `API.md` | The IPC contract surface. §3 (auth), §5 (resources), §7 (terminal proto), §8 (error envelope). Anything you change here must round-trip through the renderer. |
| `CLAUDE.md` | Cross-cutting rules. No raw px, no `console.log`, no catch-all `try/catch`, repos own DB access, IDs are opaque, state is server-enforced. |

Skipping any of these is the most common source of regressions.

### 2. Decide whether your change fits an existing plan or needs a new one

- **Existing plan**: append tasks to its file. Note the change in `IMPLEMENTATION.md` §3 status column.
- **New surface**: write a new plan file with the same structure (`.claude/PRPs/plans/NN-name.plan.md`). Don't expand existing plans beyond their declared seam.

### 3. Confirm the spec, not the code, is the source of truth

If the spec disagrees with the code, the spec wins by default and the code is the bug. (The exceptions are the explicit "**SHIPPED** — deferred X to vY" notes in `IMPLEMENTATION.md` §3.)

If you genuinely need to change the spec, update it **first** in the PR description, then the code. Spec change after the code change is a tell that the change wasn't reviewed against the contract.

---

## While writing code

### Patterns to mirror (in priority order)

When adding a new feature, find the closest existing analog and mirror its shape verbatim. The patterns below are the ones already encoded in the shipped code.

#### A. Adding a new resource (e.g., Project, Comment, Notification)

**Order matters.** Skipping a step compromises something downstream.

1. **Zod schema** → `packages/core/src/contracts/<resource>.ts`. Include `Resource`, `ResourceListInput`, `ResourceListResponse`, `ResourceResponse`, `ResourceIdInput`. Mirror `task.ts`.
2. **State machine** → if the resource has states, add to `packages/core/src/state-machine.ts`. Pattern: explicit `ALLOWED` table keyed by transition name. Tests in `packages/core/test/state-machine.test.ts` (mirror existing 10 cases).
3. **DB schema** → `packages/db/src/schema.ts`. Add CHECK constraints for enums. Add an index on hot filter combinations.
4. **Migration** → `packages/db/migrations/sqlite/NNNN_<name>.sql`. Update `meta/_journal.json`. Migrations are idempotent (`INSERT OR IGNORE` for seeds; `CREATE TABLE IF NOT EXISTS`).
5. **Repository** → `packages/db/src/repositories/<resource>-repo.ts`. The ONLY place `drizzle-orm` symbols appear (other than `client.ts` + `schema.ts`). Export class with `findById/list/insert/updateXxx/delete`.
6. **Service** → `apps/desktop/src/main/services/<resource>-service.ts`. Wraps repos in transactions. Throws `AppError`. Emits `bus.emit(...)` **after** the transaction commits — never inside.
7. **Router** → `apps/desktop/src/main/routers/<resource>.ts`. `.input(zodSchema).output(zodSchema)` on every procedure. Compose in `routers/_app.ts`.
8. **Renderer hook** → `apps/desktop/src/renderer/hooks/use<Resource>.ts`. `useQuery` + `useMutation` with `invalidateQueries` on success.
9. **Cache merger** → if the resource emits events, handle them in `useEventStream.ts` `apply()` switch.
10. **Contract test** → no action needed. The snapshot in `apps/desktop/test/contract.test.ts` will auto-include your procedures; the diff is your audit trail.

#### B. Adding a new event type (e.g., `task.commented`, `agent.cost_updated`)

1. Add to `packages/core/src/events.ts` as a new Zod schema; include it in the `renderableEventSchema` discriminated union.
2. Find the service that should emit it. Emit **after** the DB transaction commits.
3. Decide: firehose-only or also per-task scoped? If the event has a `task_id`, it'll automatically flow on the scoped channel — no extra wiring needed.
4. Handle it in renderer `useEventStream.ts` `apply()`. Either patch the cache in place or invalidate the relevant query.
5. Add to `apps/desktop/test/event-bus.test.ts` if the dispatch logic has any conditional shape.

#### C. Adding a new agent (e.g., Gemini, Aider)

1. Reserve a hue + monogram in `design-tokens.json` `themes.terminal-dark.agent.<id>` AND `paper-light.agent.<id>` if it's tier `v1`. Hue allocation: L≈72%, C≈0.13, sweep H by 30-60° from the last allocated hue. See `design-tokens.json.extensibility.newAgent` for the formula.
2. Add a row to `packages/db/migrations/sqlite/NNNN_<n>_agents.sql` via `INSERT OR IGNORE`. Set `tier: v1` only if the v1 design pass is done.
3. No code changes required — agents are data, not code. The dispatcher, probe, renderer, and conductor strip all read from the `agents` table.
4. Verify the agent CLI follows the adapter contract: receives prompt via stdin or `{{prompt}}` arg, exits 0 on success, non-zero on failure. If not, write an adapter shim or document the divergence.

#### D. Adding a new IPC channel (terminal-bridge style — high-volume binary)

Don't. The typed event bus + tRPC over IPC cover everything except PTY bytes. If you genuinely need a new high-volume channel:

1. Mirror plan #5 (`ipc-terminal.ts`). Per-WebContents subscription registry keyed by `webContents.id`. Cleanup on `webContents.destroyed`.
2. Validate all inputs with Zod before passing to the dispatcher.
3. Document the channel names and message shapes in `API.md`.
4. Add to the preload `vmBridge` typed surface.

#### E. Adding a new visual surface (e.g., notification overlay, settings panel)

1. Read `DESIGN.md` §15 (anti-patterns) FIRST. If your design hits any of them — gradients, glass, raw px, stock avatars — stop and re-read §3 (semantic tokens).
2. All sizing in `var(--space-*)`. All color in semantic tokens (`var(--surface-*)`, `var(--text-*)`, `var(--accent-*)`, `var(--status-*)`). NEVER literal hex.
3. Status meaning must encode in **shape + color**, not color alone. See `StatusIndicator.tsx` — running gets a pulse ring, blocked is a triangle, error has a halo. Color is the secondary cue.
4. Hover/focus/active states are required, not optional. See `TaskCard.tsx` for the pattern (`hover:border-border-default`, focus-visible outline via global CSS).
5. Respect `prefers-reduced-motion`. Wrap pulses + transitions in `@media (prefers-reduced-motion: reduce) { … }` overrides.

### Anti-patterns to never reintroduce

These are explicitly forbidden by `DESIGN.md` §15 / `CLAUDE.md`. The hooks won't catch them — humans + agents have to. If a reviewer spots one, the PR is rejected:

- Raw `px` in component code (use `var(--space-*)`)
- `console.log` in the main or renderer process (use `pino` via `childLogger({ request_id })`)
- Generic catch-all `try { } catch (e) { }` (name the exception class, throw `AppError` from services)
- `drizzle` / `sqliteTable` imports outside `packages/db/`
- Parsing task slugs (`VM-218`) or run IDs (`run_…`) on the client
- Renderer sending `status: "running"` directly — must call an action endpoint
- Inline `Authorization` / `Cookie` / `X-User-*` header reads (identity comes from `AuthContext` only)
- Emoji used as a status indicator
- Stock avatars or library defaults passed off as finished design
- Half-finished implementations stubbed in production code (use the placeholder pattern from `DiffTab.tsx` instead)

### Performance budgets

| Surface | Budget |
|---|---|
| Board | < 100 tasks comfortable. 100-500 degrades but stays usable. > 500: add `@tanstack/react-virtual` (tracked in `TODOS.md` §[P2]). |
| Conductor strip | ≤ 8 active rows. +N overflow chip handles the rest. |
| PTY scrollback | 32 KB per task ring. |
| Event ring buffer | 1000 entries; older replays return `{ truncated: true }`. |
| Renderer bundle (gzipped) | < 300 KB. Today: 1.1 MB un-gzipped (xterm + cmdk). Trim with route-level code-splitting if it grows. |
| Landing bundle (gzipped) | ≤ 50 KB total. |
| Lighthouse landing | ≥ 95 / 95 / 95 / 95. CI gate deferred (no deploy URL yet — TODOS.md). |

If you cross a budget intentionally, document why in the PR description AND open a `TODOS.md` entry with the rollback condition.

---

## Before opening a PR

### Self-validation gauntlet

```bash
bun run typecheck   # zero errors
bun run lint        # zero errors (warnings okay if documented)
bun run test        # all pass
bun run desktop:dev # smoke-test the change in the actual UI
```

Skip none. If `bun test` reports skipped tests, verify they're the documented PTY-runtime-skipped suite (4 tests in `pty-spawn.test.ts`) and nothing new.

### Branch + commit hygiene

- One plan (or one stack of small PRs from one plan) per branch.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`. Plans use `feat(plan-N): summary`.
- Don't `git add -A`. Stage explicit paths so you don't accidentally include `.DS_Store` or generated files.

### Required PR description sections

```markdown
## Summary
What plan(s) does this implement or extend? Link the plan file(s).

## Spec changes
Any DESIGN.md / API.md / CLAUDE.md edits? Why?

## Patterns mirrored
Which existing files did you copy the shape from?

## Deferred
Anything in the plan you explicitly didn't ship? Add to `TODOS.md`.

## Validation
- [ ] `bun typecheck` ✓
- [ ] `bun lint` ✓
- [ ] `bun test` ✓ (N pass, 4 PTY-runtime-skipped)
- [ ] `bun run desktop:dev` smoke-tested
- [ ] No raw `px` in new component code (`rg ': \d+px' --type tsx`)
- [ ] No `console.log` (`rg 'console\.log' --type ts --type tsx`)
- [ ] `IMPLEMENTATION.md` §3 status column updated

## Screenshots (UI changes only)
Before / after. Both themes if they differ.
```

### Spec-vs-code sync

If you changed `API.md`, the diff should mention:
- Which procedure(s) gained/lost surface
- Which event(s) were added
- Migration plan for clients (which doesn't matter in v1 since the renderer is the only client, but documents the v2 mirror's debt)

If you changed `DESIGN.md`, the diff should regenerate `design-preview.html` if the change is visible.

### Contract test snapshot

When `apps/desktop/test/contract.test.ts` reports a diff:
1. **Intentional?** Run `bun test --update-snapshots` and commit the new `.snap`.
2. **Unintentional?** You wired a procedure wrong — fix it.

The snapshot is the change log of the IPC surface. Never blindly accept a diff.

---

## Before merging

### Reviewer checklist

The reviewer (human or agent) verifies:

- [ ] All four spec docs read or skimmed
- [ ] Patterns mirrored from the closest analog
- [ ] No anti-patterns introduced
- [ ] Performance budget respected (or explicitly documented in the PR)
- [ ] Contract snapshot diff matches the intended surface change
- [ ] Tests cover the new behavior (not just code coverage — *behavior* coverage)
- [ ] `IMPLEMENTATION.md` status column reflects what shipped
- [ ] `TODOS.md` captures anything deferred
- [ ] `CHANGELOG.md` Unreleased section appended
- [ ] No secrets in the diff (`rg -i 'api[_-]?key|password|secret' --type ts --type tsx`)

### Common review smells

| Smell | Why it matters | Fix |
|---|---|---|
| New `try/catch` without a named exception | Hides real failures | Name the class; throw `AppError` |
| `useEffect` with empty deps that captures stale closures | Future bug magnet | Use refs or restructure |
| Service mutates DB then emits event in the same expression | Race window if event handler reads DB | Capture pending state in transaction, emit after commit |
| New IPC channel without Zod validation | Renderer can crash main | Validate every input |
| Renderer component reads `process.env.XYZ` | Doesn't work in production builds | Pass via tRPC or build-time `import.meta.env` |
| `as any` or `as unknown as X` | Type laundering, hides real bugs | Use `z.infer<typeof Schema>` or restructure |

### Merge

- **Squash** when the branch is one logical change with messy WIP commits.
- **Merge commit** when the branch has multiple well-formed `feat(plan-N):` commits that are individually meaningful.
- **Rebase** when the branch is a small linear addition to main (rare).

After merging:
1. Update `IMPLEMENTATION.md` §3 status column with the merge commit hash.
2. Tick the relevant `IMPLEMENTATION.md` §5 done-state checkbox.
3. Move any new `TODOS.md` entries to their permanent home (P1/P2/P3 by horizon).

---

## When something breaks

### A test goes red on main

1. **Don't disable the test.** The test is correct; the code is wrong, or the spec is wrong.
2. Reproduce locally with `bun run --cwd apps/desktop test test/<file>.test.ts`.
3. If it's flaky (passes 90% of the time), open a `TODOS.md` entry tagged `[P1] flaky:` with the test name and the conditions you noticed.
4. If it's deterministically broken, revert the offending commit or push a fix-forward PR.

### Lint or typecheck fails after `bun install`

Usually a dep version drift. Pin the resolved version in the relevant `package.json` and re-run `bun install`. Never use `^` or `~` on the top-level deps — `CLAUDE.md` requires exact pins.

### Electron won't launch

The most common cause is a native-module ABI mismatch (better-sqlite3 or node-pty rebuilt against the wrong Node ABI). Fix:
```bash
bun run --cwd apps/desktop electron-builder install-app-deps
```

If that doesn't work, your version of one of those modules may no longer be compatible with your Electron version. Check the spike notes in the prototype commit (`105cf34`) for the historical ABI matrix.

### A new agent CLI doesn't probe as available

Three things to check, in order:
1. Is `agent.command` on the shell PATH? `which <command>` in your login shell.
2. Does `<command> --version` exit 0 within 2 s? `probeAgent` enforces a 2 s timeout.
3. Is `path-helper.ts` resolving the right shell PATH? Look at the `shell PATH resolved` log line on app start — `length` should match your interactive shell's `echo $PATH | wc -c`.

If all three are fine and probe still fails, the issue is in the agent's CLI behavior (e.g., it prompts interactively on `--version`). File a `TODOS.md` entry; v2 will likely need a per-agent probe override.

---

## When extending the agent

This document itself is part of the contract. If you find a pattern that recurs three times, codify it here. If a rule turns out to be wrong, fix this document in the same PR that fixes the rule. A stale playbook is worse than no playbook — it actively misleads.

The bar is: **a future agent (or a competent human seeing the repo for the first time) should be able to ship plan #11 without reading any conversation history.** If you can't, this document is incomplete. Add to it.
