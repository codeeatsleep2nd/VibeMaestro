# Plan 11: Workspaces, Agent Skills, Per-Phase Skill Configuration

> **Plan revision history (post all reviews + D20 spike, 2026-05-10):**
> - Original draft (pre-reviews) used `stage_skills`, allowed up to 10 skills per stage, included git-clone workspaces, used `\n`-joined stdin prompt injection.
> - CEO review (24 decisions, "HOLD SCOPE"): naming `Workspace` is forward-compat with v2 team mode; folder-only v1 (no git clone); rename `stage` → `phase`; hard-scope board with cross-workspace conductor strip; freeze `task.agent_id` at creation; defensive migration; path normalization; etc.
> - Design review (17 specs, score 5→9/10): collapsed `WorkspaceStrip` (1 row, click to expand); per-phase Run buttons live ONLY in the task detail panel; AI-slop guardrails.
> - Eng review (7 findings): single call-site for `run-dispatcher.start`; explicit `BEGIN;…COMMIT;` wrapping migration; event-replay graceful degradation; +3 test GAPs + 1 IRON-RULE regression.
> - D20 spike (RESOLVED): `claude --print "<arg>"` honors **exactly one** leading slash command + free text. Multi-line `\n`-joined prefixes don't activate slash commands. Plan ships with: `prompt_via='arg'`, `args=["--print","{{prompt}}"]`, space-joined composition, **max 1 skill per phase**.
>
> See sections at the bottom of this file (`D20 Spike Resolution`, `Engineering Specifications`, `Design Specifications`, `GSTACK REVIEW REPORT`) for the full review trail.

## Summary

Introduce a `Workspace` resource that scopes the task board to a single filesystem folder, carries a default agent, and pins a per-phase skill recipe (`planning`, `running`, `reviewing`, `complete` — each phase holds **at most one** slash command per the D20 spike outcome). Extend the `Agent` resource with a `skills` registry. Thread `workspace_id` through tasks; tasks inherit the workspace's agent + per-phase skills at creation time but can override either. The run dispatcher composes `finalPrompt = "{phaseSkill} {task.prompt}"` (space-joined, not `\n`-joined) and passes it as a single CLI arg via `claude --print "{{prompt}}"` (or `codex exec "{{prompt}}"`). The existing state machine and PTY surface stay untouched.

**v1 ships folder workspaces only.** Git-clone workspaces are deferred to v1.x (D2). The team-mode `Workspace` reserved by TODOS.md line 53 is the v2 evolution of this same resource — `Membership`/`Mention` tables will reference `workspace_id` (D1).

## User Story

As a developer running multiple local repos through VibeMaestro,
I want each repo to be a workspace with its own task board, a default agent, and per-phase skill recipes,
so that I can pick "review with `/code-review`, finalize with `/document-release`" once per repo and have every new task inherit the recipe — while still overriding per-task when I need a different agent or skill set.

## Problem → Solution

- **Current state:** A single global board. Every task shares one process `cwd`. Agents are spawned with `agent.cwd ?? process.env.HOME ?? process.cwd()` (`apps/desktop/src/main/services/run-dispatcher.ts:100`). There is no concept of "this task belongs to repo X" and no way to pre-attach a slash command recipe to a task or phase. Skills aren't a first-class concept at all.
- **Desired state:** Users create folder workspaces (paste an absolute path; we normalize and verify). Each workspace pins a `default_agent_id` and a `phase_skills` map (0 or 1 slash command per phase). The board scopes to the active workspace; the conductor strip remains cross-workspace (with workspace prefix pills when 2+ workspaces exist). Task creation pre-fills `agent_id` and `phase_skills_override` from the workspace. When `tasks.run` fires, the dispatcher resolves the task's effective `running` phase skill, composes it as `${skill} ${task.prompt}` (single space), and passes the whole string to `claude --print "{{prompt}}"`. A new `tasks.invokePhase(id, phase)` mutation spawns ad-hoc runs for the `planning`, `reviewing`, and `complete` phases without state transitions, rejecting if a run is already live for that task.

## Metadata

- **Complexity:** XL
- **Source PRD:** N/A — feature request 2026-05-10
- **PRD Phase:** N/A — standalone plan, lands after plan #10 (landing site shipped)
- **Estimated Files:** ~22 (post-review scope; git-clone surface dropped saves ~6 files vs original draft)
- **Confidence Score:** 9/10 — all four review gates cleared, D20 spike resolved, every decision either applied or documented as deferred

---

## UX Design

### Before

```
┌──────────────────────────────────────────────────────────────┐
│ ⬢ VibeMaestro  v0.1 · prototype          [theme]  [+ New]    │  ← global topbar
├──────────────────────────────────────────────────────────────┤
│  Backlog        Running       Reviewing       Complete       │  ← single global board
│  VM-001         VM-003        VM-006          VM-008         │
│  VM-002         VM-004        VM-007          VM-009         │
└──────────────────────────────────────────────────────────────┘

  New task modal:
   • Title
   • Prompt
   • Agent  [Claude Code] [Codex]
```

### After (post-review, post-spike)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⬢ VibeMaestro │ [▾ acme-web]  v0.1 · prototype  [theme] [+ New task ⌘N] │  ← topbar + workspace picker pill
├──────────────────────────────────────────────────────────────────────────┤
│ acme-web · /Users/me/code/acme-web · CC Claude Code · [P:1 R:1 Rv:1 C:1] ▾│ ← WorkspaceStrip (collapsed, 40px)
├──────────────────────────────────────────────────────────────────────────┤   click ▾ to expand to 4 phase rows
│  BACKLOG        RUNNING       REVIEWING       COMPLETE                   │  ← board, hard-scoped to active workspace
│  VM-001         VM-003        VM-006          VM-008                     │
│  VM-002         VM-004                                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ NOW CONDUCTING  [acme-web] CC running VM-218 · 2:14 › Reading session.ts │  ← ConductorStrip with cross-workspace pills
│                 [personal] CX running VM-203 · 0:41 › Running pnpm test  │     (pills appear only when 2+ workspaces exist)
└──────────────────────────────────────────────────────────────────────────┘

WorkspacePicker dropdown (320px, opens below pill, anchors upward when clipped):
   WORKSPACES                                                            3
   ───────────────────────────────────────────────────────────────────────
   [CC] acme-web      /Users/me/code/acme-web        ←  active (✓)
   [CC] personal      /Users/me/code/personal-blog
   [CX] dotfiles      /Users/me/.dotfiles
   ───────────────────────────────────────────────────────────────────────
   + Create workspace…

CreateWorkspaceModal:
   Label   [acme-web________________]
   Path    [/Users/me/code/acme-web _] [Browse…]   ← Electron native folder picker
   Agent   ◯ Claude Code   ⚫ Codex
   Phases  planning  ( ) /plan-eng-review              ← single-select per phase (REV-S4)
           running   ( ) /tdd-workflow
           reviewing ( ) /code-review
           complete  ( ) /document-release
                                              [Cancel]  [Create workspace]

CreateTaskModal (extended) — pre-fill from active workspace:
   Title   [____________________________]
   Prompt  [____________________________]
   Agent   [⚫ Claude Code (workspace default)] [◯ Codex]
   Phases  planning  [inherit] /plan-eng-review        ← "inherit" pill; click to set override
           running   [inherit] /tdd-workflow
           reviewing [inherit] /code-review
           complete  [inherit] /document-release

Task detail panel (post-spike phase invocation):
   ┌─────────────────────────────────────────────────┐
   │ VM-218 · Refactor session module                │
   │ ...                                             │
   │ [Run]  [Run planning]  [Run reviewing]  [Run complete] │ ← per-phase Run buttons
   │   ↑ tasks.run                ↑ tasks.invokePhase        │   (only enabled when no live run for task)
   └─────────────────────────────────────────────────┘
```

### Interaction Changes

| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Topbar | Logo, theme, +New | Logo, **WorkspacePicker pill**, theme, +New | Picker shows active workspace label; click opens 320px dropdown with all workspaces + "Create workspace…" footer. Reuses DESIGN.md §10 command palette pattern at narrower width. |
| Board scope | All tasks globally | Tasks where `workspace_id == active` | Switching workspace re-queries (~150ms shimmer); active workspace persisted to `localStorage` (`vibemaestro:active_workspace`). Active workspace deleted → silent fallback to `ws_local` + info toast. |
| WorkspaceStrip | (didn't exist) | Single 40px row showing label · path · agent · phase chip-counts `[P:N R:N Rv:N C:N]` · expand chevron | Collapsed by default per D18. Expand on click reveals 4 phase rows. Per-phase Run buttons live ONLY in the task detail panel — strip is read-only context belt. |
| ConductorStrip | "Now conducting · CC running VM-218 · …" | Same + `[workspace-label]` pill BEFORE the agent chip on each row | Pill omitted when only 1 workspace exists. Cross-workspace by default — answers "did I leave something running over there?" |
| Create task | Pick agent only | Pick agent (default = workspace), edit per-phase override with "inherit" pill | Modal re-renders pre-fill on workspace switch (D14). |
| `tasks.run` | Spawns agent with raw prompt | Spawns agent with `cwd = workspace.path` AND `finalPrompt = "${phaseSkill} ${task.prompt}"` (space-joined; first/only skill prepended) | Invocation: `claude --print "<finalPrompt>"` for Claude Code, `codex exec "<finalPrompt>"` for Codex (per REV-S1). |
| `tasks.invokePhase` | (didn't exist) | New mutation spawns a Run for planning/reviewing/complete with that phase's skill prefix, NO state transition | Rejects with `invalid_state` if a Run is already live for the task (D9). |
| Detail panel | Run · Approve · Reject buttons | + `Run planning`, `Run reviewing`, `Run complete` buttons (disabled when a live run exists) | Each fires `tasks.invokePhase(id, phase)`. |
| CreateWorkspaceModal | (didn't exist) | New modal: label, path (text + Browse), agent picker, 4-row phase recipe single-select | Path validated on blur via `fs.statSync`. Empty agents list → "No agents configured" hint, Create disabled (D14). |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| **P0** | `CLAUDE.md` | all | Stack pins, IPC rule, repository pattern rule, contract source-of-truth rule |
| **P0** | `API.md` | §4, §5.1, §5.3, §8 | Conventions + Task / Agent / error contracts that this plan extends |
| **P0** | **This file's "D20 Spike Resolution" section** (below) | all | The skill-prefix runtime semantics this plan ships against. Read before touching dispatcher or agent registration. |
| **P0** | **This file's "Design Specifications" section** (below) | all | Token map per surface, interaction state coverage, ARIA, AI slop guardrails. Source of truth for the renderer work. |
| **P0** | **This file's "Engineering Specifications" section** (below) | all | ARCH-E1–E4 + CQ-E1–E3 + worktree parallelization strategy. The "how" behind the "what". |
| **P0** | `packages/core/src/contracts/task.ts` | all | Existing task contract; we add `workspace_id` + `phase_skills_override`. **No `agent_id_override`** (D7). |
| **P0** | `packages/core/src/contracts/agent.ts` | all | Agent contract; we add `skills` field. |
| **P0** | `packages/core/src/events.ts` | all | Event payload schemas; we add OPTIONAL `workspace_id` (ARCH-E3). |
| **P0** | `packages/db/src/schema.ts` | all | Drizzle schema; we add `workspaces` table + columns. |
| **P0** | `packages/db/migrations/sqlite/0000_init.sql` | all | Migration style + CHECK constraint pattern; the prior shape we're mutating. |
| **P0** | `packages/db/src/repositories/task-repo.ts` | all | Repository pattern we mirror for `workspace-repo.ts`. |
| **P0** | `packages/db/src/repositories/agent-repo.ts` | all | JSON-column rehydration pattern (`args`, `env`) for the new `skills` column. |
| **P0** | `apps/desktop/src/main/services/task-service.ts` | all | Transaction shape, event emit, dispatcher fire-and-forget pattern. |
| **P0** | `apps/desktop/src/main/services/run-dispatcher.ts` | 75-194 | Spawn path that we extend to inject phase skills (REV-S3 space-join). |
| **P0** | `apps/desktop/src/main/routers/tasks.ts` | all | tRPC router style; mirror for `workspaces.ts`. |
| **P0** | `apps/desktop/src/main/routers/_app.ts` | all | Router composition; add `workspaces`. |
| **P0** | `apps/desktop/src/main/trpc.ts` | all | Error formatter — never wrap in `TRPCError`, throw `AppError`. |
| **P0** | `packages/pty-daemon/src/spawn.ts` | all | `prompt_via` resolution; arg-mode branch (REV-S2) — don't write stdin. |
| **P1** | `apps/desktop/src/renderer/App.tsx` | all | Shell composition; we add active workspace state + `<WorkspaceStrip>`. |
| **P1** | `apps/desktop/src/renderer/components/topbar/Topbar.tsx` | all | Topbar layout; we slot `<WorkspacePicker>`. |
| **P1** | `apps/desktop/src/renderer/components/empty/CreateTaskModal.tsx` | all | Form pattern; extend with `<PhaseSkillEditor>` + inherit pills. |
| **P1** | `apps/desktop/src/renderer/components/conductor/ConductorStrip.tsx` | all | Cross-workspace pill prefix logic. |
| **P1** | `apps/desktop/src/renderer/components/detail-panel/DetailPanel.tsx` | all | Per-phase Run buttons live here (D18). |
| **P1** | `apps/desktop/src/renderer/hooks/useTasks.ts` | all | Query key pattern; we add workspace scoping. |
| **P1** | `apps/desktop/src/main/seed.ts` | all | Seed style; we add agent skills + ws_local lazy-fill. |
| **P1** | `apps/desktop/test/contract.test.ts` + snapshot | all | Locks the procedure surface — IRON-RULE diff inspection on PR. |
| **P2** | `DESIGN.md` | §6, §10, §13, §15 | Reserved layout slots, component vocabulary, contrast targets, anti-patterns. |
| **P2** | `~/.gstack/projects/codeeatsleep2nd-VibeMaestro/dongli-impl-02-design-20260510-164050.md` | all | Office-hours design doc — premise lineage. |

---

## External Documentation

| Topic | Source | Pin | Key Takeaway |
|---|---|---|---|
| Claude Code `--print` mode | local CLI v2.1.138 + D20 spike | bundled | `claude --print "<arg>"` honors a leading slash command + free text. Multi-slash in one arg fails. Stdin must be closed (`< /dev/null`) or the CLI waits 3s. |
| Codex `exec` mode | local CLI v0.115.0 | bundled | `codex exec "<prompt>"` is the non-interactive entry; positional arg = prompt. No user-defined slash commands. |
| node-pty `prompt_via` | `packages/pty-daemon/src/spawn.ts` | `node-pty@1.1.0-beta43` | `prompt_via="arg"` branch substitutes `{{prompt}}` into agent.args; never writes to stdin (REV-S2). |
| Drizzle column `references()` | `orm.drizzle.team/docs/sql-schema-declaration` | `drizzle-orm@^0.45` | `.references(() => workspaces.id, { onDelete: "restrict" })` — block workspace delete if tasks exist (mirror agent-delete pattern). |
| SQLite `BEGIN/COMMIT` semantics | `sqlite.org/lang_transaction.html` | bundled | Nested transactions via savepoints — explicit BEGIN inside a Drizzle-wrapped migration is harmless and defensive (ARCH-E2). |
| SQLite 12-step table rebuild | `sqlite.org/lang_altertable.html` | bundled | Adding `NOT NULL` column with FK requires CREATE NEW + COPY + DROP OLD + RENAME. Wrap in BEGIN/COMMIT. |

```
KEY_INSIGHT: claude --print "<arg>" activates a SINGLE leading slash command and treats
            the rest as the user prompt. The arg shape `/skill <prompt>` works; `/a /b`
            does not. Multi-line `\n`-joined prefix does NOT activate the slashes.
APPLIES_TO: REV-S3 dispatcher composition; REV-S4 phase-skill .max(1) constraint
GOTCHA:     Don't try to chain slash commands. If users want chained behavior, they
            define a custom slash command in ~/.claude/skills/ that internally chains.

KEY_INSIGHT: SQLite can't drop NOT NULL or add it without table rebuild.
APPLIES_TO: migration 0001_workspaces.sql — adding workspace_id (NOT NULL FK) to existing tasks
GOTCHA:     12-step rebuild wrapped in explicit BEGIN/COMMIT (ARCH-E2) — defensive against
            Drizzle's --> statement-breakpoint splitting transactions.

KEY_INSIGHT: pty-daemon's arg-mode branch substitutes {{prompt}} and NEVER writes stdin.
APPLIES_TO: REV-S2 — Claude Code with prompt_via='arg' will not hit the stdin write path
GOTCHA:     Don't fork the spawn surface; build finalPrompt upstream in the dispatcher.

KEY_INSIGHT: Existing run-dispatcher resolves cwd as agent.cwd ?? $HOME ?? cwd
            (run-dispatcher.ts:100). Plan #11 adds workspace.path at the top of that chain.
APPLIES_TO: ARCH-E1 — workspace.path takes precedence
GOTCHA:     Don't delete agent.cwd fallback — it remains for legacy callers / tests.

KEY_INSIGHT: contract.test.ts.snap currently locks 14 procedures.
APPLIES_TO: REGRESSION-E1 — every new router/procedure added in this plan
GOTCHA:     Regenerate with `bun test -u apps/desktop/test/contract.test.ts`. IRON-RULE
            diff inspection: only ADDITIONS, never modifications to existing 14 shapes.

KEY_INSIGHT: Event ring buffer (plan #4) replays up to 1000 events on reconnect.
APPLIES_TO: ARCH-E3 — pre-plan-11 entries lack workspace_id
GOTCHA:     Make workspace_id OPTIONAL on event payload Zod schemas. Renderer treats
            missing as "no pill" (matches D18's 1-workspace rule, visually identical).
```

---

## Patterns to Mirror

### NAMING_CONVENTION — package + module structure
```ts
// SOURCE: packages/core/src/contracts/task.ts:1-12 + agent.ts:1-22
// Pattern: one Zod schema per resource. Type derives via z.infer<>.
// File path: packages/core/src/contracts/<resource>.ts
// Export from: packages/core/src/contracts/index.ts
// NOTE: no `kind` field — v1 ships folder workspaces only (D2). Path is required.

export const workspaceSchema = z.object({
  id: z.string().regex(/^ws_[a-z0-9_-]+$/),
  label: z.string().min(1).max(80),
  path: z.string().min(1),                                // absolute, normalized (D12)
  default_agent_id: z.string(),
  phase_skills: phaseSkillsSchema,                         // see ZOD_CONTRACT below
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Workspace = z.infer<typeof workspaceSchema>;
```

### ID_FORMAT — workspace IDs
```ts
// SOURCE: packages/core/src/id.ts:1-15 (run_ULID), :20-25 (VM-### sequence)
// Pattern: workspace IDs are kebab-case slugs prefixed `ws_`. The system-created
// default workspace is `ws_local`. User-created workspaces use a short ulid:
// `ws_<lowercased-ulid-suffix>` for uniqueness without exposing time-of-creation.

export function newWorkspaceId(): string {
  return `ws_${ulid().toLowerCase().slice(-12)}`;
}
export function isWorkspaceId(value: string): boolean {
  return /^ws_[a-z0-9_-]+$/.test(value);
}
```

### ZOD_CONTRACT — single source of truth, Zod-first
```ts
// SOURCE: packages/core/src/contracts/task.ts:14-58
// Pattern: schema → type → router input/output. Optional + default fields use Zod
// defaults so missing JSON keys round-trip safely.
//
// REV-S4 (D20 spike outcome): each phase holds AT MOST ONE slash command. Claude
// Code's `--print` honors a single leading slash + free text; multiple slashes don't
// work. UI is single-select per phase, not multi-select.

export const PHASES = ["planning", "running", "reviewing", "complete"] as const;
export const phaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof phaseSchema>;

export const phaseSkillsSchema = z.object({
  planning: z.array(z.string().min(1).max(80)).max(1).default([]),  // REV-S4: max 1, not 10
  running:  z.array(z.string().min(1).max(80)).max(1).default([]),
  reviewing:z.array(z.string().min(1).max(80)).max(1).default([]),
  complete: z.array(z.string().min(1).max(80)).max(1).default([]),
});
export type PhaseSkills = z.infer<typeof phaseSkillsSchema>;

export const phaseSkillsOverrideSchema = phaseSkillsSchema.partial().nullable();
export type PhaseSkillsOverride = z.infer<typeof phaseSkillsOverrideSchema>;

export const skillDefinitionSchema = z.object({
  id: z.string().regex(/^\/?[a-z][a-z0-9-]*$/, "skill id must start with optional / then kebab-case"),
  label: z.string().min(1).max(80),
  description: z.string().optional(),
});
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;
```

### REPOSITORY_PATTERN — class with constructor-injected db client
```ts
// SOURCE: packages/db/src/repositories/agent-repo.ts:6-27
// Pattern: class, constructor(db), explicit `insert`/`findById`/`list`/`patch`/`delete`.
// JSON columns rehydrated by a private `rowToX` function at the bottom of the file.
// No business logic in repositories — services own that.
// NOTE: no setStatus method — workspaces don't have a status field anymore (D2).

export class WorkspaceRepository {
  constructor(private readonly db: DbClient) {}
  insert(ws: Workspace): void { /* ...same shape as agent-repo.ts:9-28 */ }
  findById(id: string): Workspace | null { /* ... */ }
  list(): Workspace[] { /* ... */ }
  patch(id: string, fields: Partial<Pick<Workspace, "label"|"default_agent_id"|"phase_skills">>, at: string): void { /* D15: path immutable */ }
  delete(id: string): void { /* ... */ }
}

function rowToWorkspace(row: DbWorkspaceRow): Workspace {
  return {
    id: row.id,
    label: row.label,
    path: row.path,
    default_agent_id: row.default_agent_id ?? FALLBACK_AGENT_ID, // D22: lazy-fill if null
    phase_skills: (row.phase_skills as PhaseSkills) ?? { planning:[], running:[], reviewing:[], complete:[] },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```

### SERVICE_PATTERN — factory function returning closures
```ts
// SOURCE: apps/desktop/src/main/services/task-service.ts:12-44
// Pattern: createXService() reads `getDb()` once, instantiates repos, returns
// closures. Mutations wrap repo writes in `db.transaction(() => {...})`. Events
// emit AFTER the transaction commits (task-service.ts:102-108).
// NOTE: synchronous create — no async git clone. No `status`/`error` fields.

export function createWorkspaceService() {
  const { db } = getDb();
  const repo = new WorkspaceRepository(db);
  const taskRepo = new TaskRepository(db);
  const agentRepo = new AgentRepository(db);

  function create(input: WorkspaceCreateInput): Workspace {
    const agent = agentRepo.findById(input.default_agent_id);
    if (!agent) throw new AppError("not_found", `Agent "${input.default_agent_id}" not found`);

    const normalized = normalizePath(input.path);          // D12: ~ expand, resolve, strip trailing /
    if (!fs.statSync(normalized).isDirectory()) {
      throw new AppError("validation_error", `Path "${normalized}" is not a directory`);
    }

    const id = newWorkspaceId();
    const at = nowIso();
    try {
      return db.transaction(() => {
        const ws: Workspace = {
          id, label: input.label, path: normalized,
          default_agent_id: input.default_agent_id,
          phase_skills: input.phase_skills ?? emptyPhaseSkills(),
          created_at: at, updated_at: at,
        };
        repo.insert(ws);
        log.info({ workspace_id: id, path: normalized, agent: input.default_agent_id }, "workspace created");
        return ws;
      });
    } catch (e) {
      if (isSqliteUniqueViolation(e)) {                    // D10: friendly label conflict
        throw new AppError("conflict", `Workspace label "${input.label}" is taken`);
      }
      throw e;
    }
  }

  function deleteOne(id: string): void {
    if (id === DEFAULT_WORKSPACE_ID) {                     // D10: protect ws_local
      throw new AppError("conflict", "Cannot delete the default workspace");
    }
    const refs = taskRepo.list({ workspace_id: id, page: 1, per_page: 1, sort: "updated_at_desc" });
    if (refs.total > 0) {
      throw new AppError("conflict", `Cannot delete workspace "${id}" — ${refs.total} task(s) reference it`, { task_count: refs.total });
    }
    repo.delete(id);
    log.info({ workspace_id: id }, "workspace deleted");
  }
  // ... list, get, require, patch ...
}
```

### ERROR_HANDLING — typed AppError + envelope
```ts
// SOURCE: apps/desktop/src/main/services/task-service.ts:46-50, agent-service.ts:26-30
// Pattern: services throw AppError with one of the ErrorCodes from errors.ts:10-16.
// Never wrap in TRPCError. Never catch-all — name the exception you handle.

function get(id: string): Workspace {
  const ws = repo.findById(id);
  if (!ws) throw new AppError("not_found", `Workspace "${id}" not found`);
  return ws;
}
// agent-service.delete extended (D8):
function deleteAgent(id: string): void {
  const refsTasks = taskRepo.list({ agent_id: id, page: 1, per_page: 1, sort: "updated_at_desc" });
  const refsWorkspaces = workspaceRepo.list().filter(w => w.default_agent_id === id);
  if (refsTasks.total > 0 || refsWorkspaces.length > 0) {
    throw new AppError("conflict",
      `Cannot delete agent "${id}" — ${refsTasks.total} task(s) and ${refsWorkspaces.length} workspace(s) reference it`,
      { task_count: refsTasks.total, workspace_count: refsWorkspaces.length });
  }
  agentRepo.delete(id);
}
```

### LOGGING_PATTERN — pino childLogger
```ts
// SOURCE: apps/desktop/src/main/services/task-service.ts:8, run-dispatcher.ts:20
// Pattern: const log = childLogger({ module: "<module-name>" });
// Then log.info({ workspace_id, ... }, "<event>"). Never console.log.
// D16: enumerate log lines per service so debugging is grep-able.

const log = childLogger({ module: "workspace-service" });
// Lines emitted:
log.info({ workspace_id, path, agent }, "workspace created");
log.info({ workspace_id }, "workspace deleted");
log.info({ workspace_id, fields }, "workspace patched");
log.info({ from, to }, "active workspace switched");        // echoed from renderer via IPC (D16)

// run-dispatcher logs the skillPrefix IDs only — never the prompt body (PTY content rule, CLAUDE.md).
log.info({ run_id, agent_id, skills: opts.skillPrefix }, "skills prefixed");
```

### ROUTER_PATTERN — tRPC procedure with .input() + .output()
```ts
// SOURCE: apps/desktop/src/main/routers/tasks.ts:12-39, agents.ts:8-48
// Pattern: every procedure declares `.input(zodSchema)` AND `.output(zodSchema)`.
// Wrap the service result in `{ data: ... }` to match the response envelope.
// NOTE: no retryClone (D2). list/get/create/patch/delete only.

export const workspacesRouter = router({
  list: procedure.output(workspaceListResponseSchema).query(() => {
    const svc = createWorkspaceService();
    return { data: svc.list() };
  }),
  get: procedure.input(workspaceIdInputSchema).output(workspaceResponseSchema)
    .query(({ input }) => ({ data: createWorkspaceService().require(input.id) })),
  create: procedure.input(workspaceCreateInputSchema).output(workspaceResponseSchema)
    .mutation(({ input }) => ({ data: createWorkspaceService().create(input) })),
  patch: procedure.input(workspacePatchInputSchema).output(workspaceResponseSchema)
    .mutation(({ input }) => ({ data: createWorkspaceService().patch(input.id, input) })),
  delete: procedure.input(workspaceIdInputSchema).output(z.object({ ok: z.literal(true) }))
    .mutation(({ input }) => { createWorkspaceService().delete(input.id); return { ok: true }; }),
});
```

### DISPATCHER_COMPOSE — REV-S3: space-joined, not `\n`-joined
```ts
// SOURCE: apps/desktop/src/main/services/run-dispatcher.ts:75-194 (current shape)
// REV-S3 (D20 spike): finalPrompt is space-joined; first/only skill prepended.
// run-dispatcher.start signature widens from (runId, taskPrompt, agentId) to
// (runId, { prompt, agentId, cwd, skillPrefix }).
//
// REV-S2: prompt_via='arg' branch in pty-daemon/spawn.ts already does NOT write to
// stdin. The dispatcher passes finalPrompt by substituting it into the agent's
// args[]; spawn.ts:18 substitutes `{{prompt}}` per the existing code path.

type StartOpts = {
  prompt: string;
  agentId: string;
  cwd: string;
  skillPrefix: string[];                                  // length ≤ 1 after REV-S4
};

async start(runId: string, opts: StartOpts): Promise<void> {
  // ... existing live-check, agent lookup, runRow lookup, transcript writer ...
  const cwd = opts.cwd ?? agent.cwd ?? process.env.HOME ?? process.cwd();

  // REV-S3: space-join. Empty prefix → bare prompt. Non-empty → "{skill} {prompt}".
  const finalPrompt =
    opts.skillPrefix.length === 0
      ? opts.prompt
      : `${opts.skillPrefix.join(" ")} ${opts.prompt}`;

  log.info({ run_id: runId, skills: opts.skillPrefix }, "skills prefixed"); // log IDs, not content

  // spawnAgent does the substitution: agent.args[].replace("{{prompt}}", finalPrompt)
  const handle = spawnAgent({ runId, agent, prompt: finalPrompt, cwd, env, cols: 120, rows: 30 });
  // ... rest of dispatcher unchanged ...
}
```

### MIGRATION_STYLE — hand-authored, self-defensive BEGIN/COMMIT
```sql
-- 0001_workspaces.sql
-- MANUALLY AUTHORED. Do NOT regenerate via `drizzle-kit generate`.
-- The 12-step table rebuild + defensive agent re-seed cannot be auto-derived
-- from schema diffs. If the schema changes, edit this file by hand or write
-- a follow-up migration.
--
-- ARCH-E2: wrap the destructive sequence in explicit BEGIN/COMMIT so a partial
-- failure rolls back even if Drizzle's --> statement-breakpoint splits batches.
-- Belt + suspenders (nested transactions are harmless in SQLite via savepoints).
-- D2: no `kind` / `git_url` / `resolved_path` / `status` / `error` fields.
-- D22: workspaces.default_agent_id is NULLABLE; workspace-service lazy-fills.
-- REV-S1: UPDATE agents rows to switch prompt_via=arg with --print/exec args.

BEGIN;
  CREATE TABLE IF NOT EXISTS `workspaces` (
    `id` TEXT PRIMARY KEY NOT NULL,
    `label` TEXT NOT NULL,
    `path` TEXT NOT NULL,
    `default_agent_id` TEXT REFERENCES `agents`(`id`) ON DELETE RESTRICT,   -- D22: nullable
    `phase_skills` TEXT NOT NULL DEFAULT '{"planning":[],"running":[],"reviewing":[],"complete":[]}',
    `created_at` TEXT NOT NULL,
    `updated_at` TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS `workspaces_label_idx` ON `workspaces`(`label`);

  ALTER TABLE `agents` ADD COLUMN `skills` TEXT NOT NULL DEFAULT '[]';

  -- D11: defensive re-seed in case agents table was nuked between 0000 and 0001
  INSERT OR IGNORE INTO `agents` (id,label,monogram,hue,tier,command,args,env,cwd,prompt_via,available,version,registered_at,skills) VALUES
    ('claude-code', 'Claude Code', 'CC', 'oklch(74% 0.13 50)', 'v1', 'claude', '["--print","{{prompt}}"]', '{}', NULL, 'arg', 0, NULL, '2026-01-01T00:00:00.000Z', '[]'),
    ('codex',       'Codex',       'CX', 'oklch(72% 0.12 235)','v1', 'codex',  '["exec","{{prompt}}"]', '{}', NULL, 'arg', 0, NULL, '2026-01-01T00:00:00.000Z', '[]');

  -- REV-S1: update prior-seeded agent rows (if they exist with old shape) to the new invocation model
  UPDATE `agents` SET command='claude', args='["--print","{{prompt}}"]', prompt_via='arg' WHERE id='claude-code';
  UPDATE `agents` SET command='codex',  args='["exec","{{prompt}}"]',   prompt_via='arg' WHERE id='codex';

  -- ws_local default workspace; default_agent_id NULL → lazy-fill at first read
  INSERT OR IGNORE INTO `workspaces` (id,label,path,default_agent_id,phase_skills,created_at,updated_at)
  VALUES ('ws_local','Local','','',NULL,'{"planning":[],"running":[],"reviewing":[],"complete":[]}','2026-05-10T00:00:00.000Z','2026-05-10T00:00:00.000Z');
  -- ↑ path='' is sentinel; workspace-service rewrites it to os.homedir() on first read

  -- 12-step rebuild of tasks: add workspace_id NOT NULL FK + phase_skills_override
  CREATE TABLE `tasks_new` (
    `id` TEXT PRIMARY KEY NOT NULL,
    `title` TEXT NOT NULL,
    `prompt` TEXT NOT NULL,
    `status` TEXT NOT NULL CHECK (`status` IN ('backlog','running','reviewing','complete','blocked','error')),
    `agent_id` TEXT NOT NULL,                              -- D7: frozen at creation, no override column
    `workspace_id` TEXT NOT NULL REFERENCES `workspaces`(`id`) ON DELETE RESTRICT,
    `current_run_id` TEXT,
    `phase_skills_override` TEXT,                          -- nullable JSON; REV-S4 ≤1 per phase
    `created_at` TEXT NOT NULL,
    `updated_at` TEXT NOT NULL,
    `metadata` TEXT DEFAULT '{}'
  );
  INSERT INTO `tasks_new` (id,title,prompt,status,agent_id,workspace_id,current_run_id,phase_skills_override,created_at,updated_at,metadata)
    SELECT id,title,prompt,status,agent_id,'ws_local',current_run_id,NULL,created_at,updated_at,metadata FROM `tasks`;
  DROP TABLE `tasks`;
  ALTER TABLE `tasks_new` RENAME TO `tasks`;
  CREATE INDEX IF NOT EXISTS `status_agent_idx` ON `tasks` (`status`, `agent_id`, `id`);
  CREATE INDEX IF NOT EXISTS `tasks_workspace_idx` ON `tasks` (`workspace_id`, `status`, `id`);
COMMIT;
```

### EVENT_SCHEMA — D4 + ARCH-E3 graceful degradation
```ts
// SOURCE: packages/core/src/events.ts (existing event payloads)
// D4: add workspace_id to task.state_changed, run.started, run.progress, run.ended.
// ARCH-E3: workspace_id is OPTIONAL on the wire — pre-plan-11 ring-buffer entries
// lack it. Renderer treats missing as "no pill" (matches D18 1-workspace rule).
// agent.availability_changed stays global (no workspace_id).

export const taskStateChangedSchema = z.object({
  type: z.literal("task.state_changed"),
  task_id: z.string(),
  workspace_id: z.string().optional(),                    // ARCH-E3: optional for replay tolerance
  from: taskStatusSchema,
  to: taskStatusSchema,
  at: z.string().datetime(),
});
// ... runStartedSchema, runProgressSchema, runEndedSchema same shape ...
```

### TEST_STRUCTURE — bun:test, AAA, real DB
```ts
// SOURCE: apps/desktop/test/contract.test.ts:1-26, plan #2 test layout
// Pattern: describe(unit name); test(behavior under test). Real in-memory better-sqlite3
// (`:memory:`) seeded by running migrations. Use AAA blocks; never mock the DB.

describe("WorkspaceService", () => {
  test("create with valid path inserts workspace synchronously", () => {
    const svc = createWorkspaceService();
    const ws = svc.create({
      label: "acme-web",
      path: "/tmp/acme-web",
      default_agent_id: "claude-code",
      phase_skills: { planning:[], running:["/tdd-workflow"], reviewing:[], complete:[] },
    });
    expect(ws.label).toBe("acme-web");
    expect(ws.path).toBe("/tmp/acme-web");
    expect(ws.phase_skills.running).toEqual(["/tdd-workflow"]);
  });

  test("create rejects when path does not exist", () => {
    const svc = createWorkspaceService();
    expect(() => svc.create({ label: "x", path: "/does/not/exist", default_agent_id: "claude-code" }))
      .toThrow(/Path .* is not a directory|does not exist/);
  });

  test("create with duplicate label throws conflict (not internal_error)", () => {
    /* GAP-E1: cover the label UNIQUE remap (D10) */
  });

  test("delete('ws_local') is rejected with friendly message (D10)", () => { /* ... */ });
});
```

---

## Files to Change

> Post-review scope: ~22 files. Drops vs original draft: `git-clone.ts`, `retryClone` plumbing, `agent_id_override` column, `workspace.status`/`error` fields, async-provisioning state machine, `StageSkillEditor` (kept under the new name `PhaseSkillEditor`). Renames: `stage_*` → `phase_*`, `invokeStage` → `invokePhase`, `resolveStageSkills` → `resolvePhaseSkills`.

### `@vibemaestro/core` — contracts

| File | Action | Justification |
|---|---|---|
| `packages/core/src/contracts/workspace.ts` | CREATE | New resource contract (no `kind`/`git_url`/`status` — folder-only per D2). |
| `packages/core/src/contracts/skill.ts` | CREATE | `SkillDefinition` schema (id + label + optional description). |
| `packages/core/src/contracts/agent.ts` | UPDATE | Add `skills: SkillDefinition[]` field (defaults to `[]`). Update seed values to `prompt_via='arg'` + new args (REV-S1) in the migration; contract itself unchanged shape. |
| `packages/core/src/contracts/task.ts` | UPDATE | Add `workspace_id: z.string()` (required, frozen at create). Add `phase_skills_override: phaseSkillsSchema.partial().nullable().default(null)`. Extend `taskCreateInputSchema` to require `workspace_id`, accept optional `agent_id` (defaults from workspace), accept optional `phase_skills_override`. Extend `taskListInputSchema` with `workspace_id: z.string().optional()`. **NO `agent_id_override` column (D7).** |
| `packages/core/src/contracts/index.ts` | UPDATE | Re-export `workspace`, `skill`. |
| `packages/core/src/id.ts` | UPDATE | Add `newWorkspaceId()` + `isWorkspaceId()`. |
| `packages/core/src/phase-skills.ts` | CREATE | Pure function `resolvePhaseSkills(workspace, task)` and `resolveAgentId(workspace, task)`. Override semantics: whole-array replace (not key-merge). |
| `packages/core/src/events.ts` | UPDATE | Add OPTIONAL `workspace_id` to `task.state_changed`, `run.started`, `run.progress`, `run.ended` payloads (ARCH-E3). `agent.availability_changed` stays global. |
| `packages/core/src/index.ts` | UPDATE | Export `resolvePhaseSkills`, `resolveAgentId`. |
| `packages/core/test/phase-skills.test.ts` | CREATE | Resolver tests: override replaces (incl. empty array), partial override falls through. |

### `@vibemaestro/db` — schema, migration, repos

| File | Action | Justification |
|---|---|---|
| `packages/db/src/schema.ts` | UPDATE | Add `workspaces` table (no `kind`/`git_url`/`status`). Add `workspace_id` (NOT NULL), `phase_skills_override` (nullable JSON) to `tasks`. Add `skills` JSON column to `agents`. Drop `agent_id_override` (D7). |
| `packages/db/migrations/sqlite/0001_workspaces.sql` | CREATE | Hand-authored 12-step rebuild wrapped in explicit `BEGIN; ... COMMIT;` (ARCH-E2). Includes `INSERT OR IGNORE` defensive agent re-seed (D11) + `UPDATE agents` to switch to `prompt_via='arg'` (REV-S1). `ws_local.default_agent_id` is NULLABLE, lazy-filled at first read (D22). |
| `packages/db/migrations/sqlite/meta/_journal.json` | UPDATE | Append entry for `0001_workspaces`. |
| `packages/db/src/repositories/workspace-repo.ts` | CREATE | Mirror `agent-repo.ts`. No `setStatus` (D2 drops status). |
| `packages/db/src/repositories/task-repo.ts` | UPDATE | Add `workspace_id` filter to `list()`. `patch()` does NOT accept `workspace_id` (tasks immutable across workspaces per D15). |
| `packages/db/src/repositories/agent-repo.ts` | UPDATE | Persist + rehydrate `skills` JSON column. |
| `packages/db/src/repositories/index.ts` | UPDATE | Re-export `WorkspaceRepository`. |

### `apps/desktop` — services, routers, renderer

| File | Action | Justification |
|---|---|---|
| `apps/desktop/src/main/services/workspace-service.ts` | CREATE | `create` (synchronous; verify path via `fs.statSync`; D12 path normalize; remap SQLite UNIQUE to `AppError("conflict")`), `get`, `list`, `require`, `patch` (D15 shape: `{ label?, default_agent_id?, phase_skills? }` — path immutable), `delete` (D10 ws_local guard). |
| `apps/desktop/src/main/services/task-service.ts` | UPDATE | `create` requires `workspace_id`, freezes `agent_id` at creation (D7 — workspace default OR explicit input.agent_id), persists `phase_skills_override`. `run` resolves effective phase skill (running) + workspace cwd before calling `runDispatcher.start`. New `invokePhase(id, phase)` — rejects on live run (D9), spawns without state transition. |
| `apps/desktop/src/main/services/run-dispatcher.ts` | UPDATE | Signature widens to `start(runId, { prompt, agentId, cwd, skillPrefix })`. Composes `finalPrompt = skillPrefix.join(" ") + " " + prompt` (REV-S3 space-join). Logs skill IDs only (PTY content not logged). `agent.cwd` stays as the fallback path for legacy callers. |
| `apps/desktop/src/main/services/agent-service.ts` | UPDATE | `list()` returns agents with `skills`. New `registerSkills(id, skills)` mutation (admin helper, no UI in v1). `delete()` extended (D8) to reject when any workspace references the agent. |
| `apps/desktop/src/main/routers/workspaces.ts` | CREATE | `list`, `get`, `create`, `patch`, `delete`. No `retryClone` (D2). |
| `apps/desktop/src/main/routers/tasks.ts` | UPDATE | `list` accepts optional `workspace_id`; `create` consumes the new field; add `invokePhase` mutation (input: `{ id, phase }`). |
| `apps/desktop/src/main/routers/agents.ts` | UPDATE | Add `registerSkills` mutation. |
| `apps/desktop/src/main/routers/_app.ts` | UPDATE | Register `workspaces: workspacesRouter`. |
| `apps/desktop/src/main/seed.ts` | UPDATE | Default workspace `ws_local` is seeded by migration; seed.ts populates the lazy-fill on first read if needed. Seed agent skills (Claude Code: `/plan-eng-review`, `/tdd-workflow`, `/code-review`, `/document-release`, `/learn`; Codex: `/codex`, `/review`). Ensure seed tasks set `workspace_id = "ws_local"`. |
| `apps/desktop/src/renderer/hooks/useWorkspaces.ts` | CREATE | `useWorkspaces`, `useActiveWorkspace` (with localStorage), `useCreateWorkspace`, `useUpdateWorkspace`, `useDeleteWorkspace`, `useInvokePhase`. No `useRetryClone` (D2). |
| `apps/desktop/src/renderer/hooks/useTasks.ts` | UPDATE | `useTasks(workspaceId)` scopes the query key; `workspace_id` flows to `tasks.list`. |
| `apps/desktop/src/renderer/lib/workspace-storage.ts` | CREATE | 6-line `localStorage` helper (`getActiveWorkspaceId() / setActiveWorkspaceId(id)`); key `vibemaestro:active_workspace`, fallback `ws_local`. |
| `apps/desktop/src/renderer/components/workspace/WorkspacePicker.tsx` | CREATE | 320px dropdown anchored below pill, opens upward on clip. Items: agent monogram + label + path subtitle, active gets accent left strip + check icon. Footer: "+ Create workspace…". Keyboard nav: arrows + Enter + Esc. ARIA combobox. |
| `apps/desktop/src/renderer/components/workspace/CreateWorkspaceModal.tsx` | CREATE | Form: label, path (text + "Browse…" → Electron dialog), agent picker (v1 only), embedded `<PhaseSkillEditor>` (single-select per phase per REV-S4). Disable Create when no v1 agents available (D14). |
| `apps/desktop/src/renderer/components/workspace/PhaseSkillEditor.tsx` | CREATE | 4 rows (one per phase). Each row: phase label + single-select dropdown sourced from `agent.skills` (REV-S4). "Inherit" pill in task-modal mode. |
| `apps/desktop/src/renderer/components/workspace/WorkspaceStrip.tsx` | CREATE | Collapsed by default (40px single row: label · path · agent chip · `[P:N R:N Rv:N C:N]` chip group · expand chevron). Click toggles to expanded (4 phase rows). NO per-phase Run buttons in strip (D18 — they live in detail panel only). |
| `apps/desktop/src/renderer/components/topbar/Topbar.tsx` | UPDATE | Slot `<WorkspacePicker>` between logo and right cluster. `[-webkit-app-region:no-drag]` on the picker. |
| `apps/desktop/src/renderer/components/empty/CreateTaskModal.tsx` | UPDATE | Pre-fill `agent_id` + `phase_skills_override` from active workspace. Embed `<PhaseSkillEditor>` with "inherit" pill per phase. Re-render pre-fill on workspace switch (D14). |
| `apps/desktop/src/renderer/components/detail-panel/DetailPanel.tsx` | UPDATE | Add per-phase Run buttons (`Run planning`, `Run reviewing`, `Run complete`) next to existing Run/Approve/Reject. Disable when a run is live for the task. Each fires `tasks.invokePhase`. |
| `apps/desktop/src/renderer/components/conductor/ConductorStrip.tsx` | UPDATE | Render `[workspace.label]` pill (`surface-inset`, `radius-xs`, mono `caption`) BEFORE the agent chip on each row, **only when `workspaces.length >= 2`** (D18). |
| `apps/desktop/src/renderer/App.tsx` | UPDATE | Resolve active workspace from localStorage (fallback `ws_local`); pass `workspaceId` to `useTasks`; render `<WorkspaceStrip>`; fall back to `ws_local` on 404 + info toast. Echo workspace switch via IPC for pino log (D16). |

### Tests

| File | Action | Justification |
|---|---|---|
| `apps/desktop/test/contract.test.ts.snap` | UPDATE | Regenerate. IRON-RULE diff inspection: only ADDITIONS (workspaces.*, tasks.invokePhase, agents.registerSkills). Zero MODIFICATIONS to existing 14 procedures (REGRESSION-E1). |
| `apps/desktop/test/workspace-service.test.ts` | CREATE | Create with valid/invalid path, label collision conflict (D10), ws_local delete guard (D10), agent-delete blocked when workspace references agent (D8). |
| `apps/desktop/test/workspace-service-concurrent.test.ts` | CREATE | GAP-E1: two parallel inserts with same label → exactly 1 succeeds, 1 conflict. |
| `apps/desktop/test/migration-0001.test.ts` | CREATE | Backfill: every pre-existing task gets `workspace_id = ws_local`. Idempotency: re-run is a no-op. Defensive re-seed: works when agents table is empty at start (D11). |
| `apps/desktop/test/migration-0001-rollback.test.ts` | CREATE | GAP-E3: simulate partial failure mid-rebuild; assert SQLite `BEGIN/COMMIT` rolls back; old tasks table intact; app re-tries migration on next boot. |
| `apps/desktop/test/task-service-workspace.test.ts` | CREATE | `tasks.create` requires `workspace_id`; defaults agent from workspace; freezes `agent_id` at creation (D7); subsequent workspace.default_agent_id change does NOT mutate existing tasks. |
| `apps/desktop/test/task-service-invoke-phase.test.ts` | CREATE | `invokePhase` rejects on live run (D9). Spawns without state transition. `invokePhase` on a `complete` task is allowed. |
| `apps/desktop/test/run-dispatcher-skills.test.ts` | CREATE | Mock `spawnAgent`; assert finalPrompt = `${skill} ${prompt}` (space-joined per REV-S3); cwd = workspace.path. |
| `packages/core/test/phase-skills.test.ts` | CREATE | `resolvePhaseSkills` 4 cases: no override, override replaces, override = `[]` replaces, partial override falls through. Empty phase round-trip (GAP-E2). |

## NOT Building

- **Git-clone workspaces** (D2). v1 ships folder-only. The `kind`, `git_url`, `resolved_path` fields are dropped from the contract; the `gitClone` helper / `retryClone` mutation / async `provisioning`+`error` state are entirely out of scope. Promote in v1.x when user demand surfaces.
- **Multiple skills per phase** (REV-S4). Each phase holds at most 1 slash command. D20 spike proved `claude --print` only honors one leading slash command per arg; multiple slashes silently fail to activate. UI is single-select per phase.
- **Auto-fire phases on state transitions.** v1 auto-fires only the `running` phase (via `tasks.run`). Planning/reviewing/complete require explicit user click on a per-phase Run button. Auto-fire is a future TODO once structured agent events ship (TODOS.md v2 P2).
- **`agents.registerSkills` UI** in v1. The mutation exists for dev tools; the user-facing flow is seed-only. Future: settings page to register custom skills per agent.
- **Service-layer skill ID validation** (D13 reversed). Skill IDs are validated only by Zod shape (`^/?[a-z][a-z0-9-]*$`). The UI picker filters to `agent.skills`. Hand-crafted tRPC clients can pass arbitrary skill strings; the agent surfaces unknown skills as transcript errors at runtime.
- **Multi-workspace task moves.** Tasks can't change `workspace_id` once created (D15). Delete + recreate is the v1 path.
- **Workspace import / repo discovery.** v1 requires the user to type the path. No "scan `~/code/` for git repos" affordance.
- **Migration failure recovery UX.** If migration 0001 fails on the user's machine, app currently crashes with a SQLite error. P3 TODO added (D24) for a "migration failed" startup screen in v1.x.
- **Per-workspace metrics / activity log.** No workspace-scoped dashboards or run-count widgets. v2 if useful.
- **Team-mode resources** (`Membership`, `Mention`, presence). v2 adds these as new tables referencing `workspace_id`. Plan #11's Workspace is the single-user shape per D1.
- **Removing `agent.cwd`.** Kept as fallback for legacy callers / tests (CLAUDE.md "Don't refactor across plan boundaries").

---

## Step-by-Step Tasks

### Task 1 — Add `Workspace` + `Skill` + `PhaseSkills` contracts and ID helpers (Lane A)
- **ACTION:** Create `packages/core/src/contracts/workspace.ts`, `skill.ts`; update `agent.ts`, `task.ts`, `index.ts`, `id.ts`, `events.ts`.
- **IMPLEMENT:**
  - `workspaceSchema` per the `NAMING_CONVENTION` snippet — `id`, `label`, `path`, `default_agent_id`, `phase_skills`, `created_at`, `updated_at`. **No `kind`/`git_url`/`status`** (D2).
  - `workspaceCreateInputSchema`: `{ label, path, default_agent_id, phase_skills? }`.
  - `workspacePatchInputSchema`: `{ id, label?, default_agent_id?, phase_skills? }` — **`path` is immutable** (D15).
  - `workspaceIdInputSchema`, `workspaceListResponseSchema`, `workspaceResponseSchema`.
  - `phaseSkillsSchema` per the `ZOD_CONTRACT` snippet — each phase array `.max(1)` (REV-S4).
  - `phaseSchema` enum (`"planning"|"running"|"reviewing"|"complete"`).
  - `skillDefinitionSchema` with kebab-case `id` (leading `/` optional).
  - Extend `agentSchema` with `skills: z.array(skillDefinitionSchema).default([])`.
  - Extend `taskSchema` with `workspace_id: z.string()` (required), `phase_skills_override: phaseSkillsOverrideSchema`. **NO `agent_id_override`** (D7).
  - Extend `taskCreateInputSchema` to require `workspace_id`, accept optional `agent_id` (defaults from workspace), accept optional `phase_skills_override`.
  - Extend `taskListInputSchema` with `workspace_id: z.string().optional()`.
  - Extend `events.ts` payload schemas with OPTIONAL `workspace_id` on `task.state_changed`, `run.started`, `run.progress`, `run.ended` (ARCH-E3).
  - Add `newWorkspaceId()`, `isWorkspaceId()` to `id.ts`.
- **MIRROR:** `NAMING_CONVENTION`, `ID_FORMAT`, `ZOD_CONTRACT`, `EVENT_SCHEMA`.
- **IMPORTS:** `import { z } from "zod"; import { ulid } from "ulid";`
- **GOTCHA:** Tasks created before this plan don't have `workspace_id`. The Zod schema is required, but the migration backfills `ws_local` for every existing row first — by the time any code reads a Task, it has a `workspace_id`. Don't add a nullable shim; keep the schema honest.
- **VALIDATE:** `bun test --filter=phase-skills` passes; `bun typecheck` passes.

### Task 2 — `resolvePhaseSkills` + `resolveAgentId` pure functions (Lane A)
- **ACTION:** Create `packages/core/src/phase-skills.ts`.
- **IMPLEMENT:**
  ```ts
  export function resolvePhaseSkills(workspace: Workspace, task: Pick<Task, "phase_skills_override">): PhaseSkills {
    const ws = workspace.phase_skills;
    const ov = task.phase_skills_override ?? {};
    return {
      planning:  ov.planning  ?? ws.planning,
      running:   ov.running   ?? ws.running,
      reviewing: ov.reviewing ?? ws.reviewing,
      complete:  ov.complete  ?? ws.complete,
    };
  }
  // task.agent_id is frozen at creation (D7) — derivation is just the field read.
  export function resolveAgentId(_workspace: Workspace, task: Pick<Task, "agent_id">): string {
    return task.agent_id;
  }
  ```
- **MIRROR:** Pure-function style of `state-machine.ts:33-43`.
- **GOTCHA:** Override semantics are **whole-phase replace**, not key-merge. Task `running: []` resolves to `[]`, not the workspace's. Empty array is a valid "no skill for this run" signal.
- **VALIDATE:** `packages/core/test/phase-skills.test.ts` covers no-override, override-replaces (incl. `[]`), partial-override (others fall through), empty-phase round-trip (GAP-E2).

### Task 3 — Drizzle schema + migration `0001_workspaces.sql` (Lane A)
- **ACTION:** Update `packages/db/src/schema.ts`; create `packages/db/migrations/sqlite/0001_workspaces.sql`; append `meta/_journal.json`.
- **IMPLEMENT:**
  - Drizzle schema: add `workspaces` `sqliteTable` (no `kind`/`git_url`/`status`); add `skills: text("skills", { mode: "json" }).notNull().default(sql\`'[]'\`)` to `agents`; add `workspace_id` (NOT NULL FK) + `phase_skills_override` (nullable JSON) to `tasks`; **drop `agent_id_override` from the schema** (D7 — never existed in production).
  - Migration SQL per the `MIGRATION_STYLE` snippet above — full BEGIN/COMMIT wrap (ARCH-E2), defensive `INSERT OR IGNORE` + `UPDATE agents` for REV-S1, nullable `default_agent_id` (D22), 12-step table rebuild, `tasks_workspace_idx`.
- **MIRROR:** `MIGRATION_STYLE`.
- **GOTCHA:** Migration must be deterministic across machines — don't put `process.env.HOME` into the SQL. Use empty string `''` as path sentinel for `ws_local`; the workspace-service lazy-fills with `os.homedir()` on first read.
- **VALIDATE:** Drop the dev DB, restart, confirm migrations run cleanly. Re-run = idempotent. `apps/desktop/test/migration-0001.test.ts` (Task 11) covers backfill, idempotency, defensive re-seed.

### Task 4 — `WorkspaceRepository` + extend `AgentRepository` + `TaskRepository` (Lane A)
- **ACTION:** Create `packages/db/src/repositories/workspace-repo.ts`; update `agent-repo.ts` + `task-repo.ts`; export from `index.ts`.
- **IMPLEMENT:**
  - `WorkspaceRepository`: mirror `agent-repo.ts:1-91`. Methods: `insert`, `findById`, `list`, `patch` (only `label`, `default_agent_id`, `phase_skills`), `delete`. **NO `setStatus`** (D2).
  - `agent-repo.ts`: persist + rehydrate the new `skills` JSON column (pattern identical to existing `args`/`env`).
  - `task-repo.ts`: extend `TaskFilters` with `workspace_id?: string` and AND it into `list()`'s conditions. `patch()` does NOT accept `workspace_id` (D15 — tasks can't move workspaces).
  - `rowToTask` includes new `workspace_id`, `phase_skills_override` columns. Drop `agent_id_override`.
- **MIRROR:** `REPOSITORY_PATTERN`.
- **GOTCHA:** `rowToTask` change is typed — TS will surface the missing `workspace_id` on the return type at every callsite. `phase_skills_override` is nullable; default to `null` on rehydrate, not `{}`.
- **VALIDATE:** `bun test --filter=db` still green.

### Task 5 — `WorkspaceService` (Lane B; depends on Lane A)
- **ACTION:** Create `apps/desktop/src/main/services/workspace-service.ts`.
- **IMPLEMENT:**
  - `create(input)`: per `SERVICE_PATTERN` — validate `default_agent_id` exists; normalize path (D12: expand `~`, `path.resolve`, strip trailing `/`); `fs.statSync(normalized).isDirectory()` else `validation_error`; insert; remap SQLite UNIQUE violations to `AppError("conflict", "label is taken")` (D10).
  - `get`, `list`, `require` (throws `not_found`).
  - `patch(id, fields)`: D15 shape — `{ label?, default_agent_id?, phase_skills? }`. If `default_agent_id` changes: validate the new agent exists. **No path mutation** (D15 — Zod will reject at the router layer).
  - `delete(id)`: if `id === "ws_local"` throw `AppError("conflict", "Cannot delete the default workspace")` (D10). Else check `taskRepo.list({ workspace_id: id })` — `task_count > 0` → conflict.
  - Lazy-fill: `findById("ws_local")` post-migration sees `path = ''` → service rewrites to `os.homedir()` and persists once.
- **MIRROR:** `SERVICE_PATTERN`, `ERROR_HANDLING`, `LOGGING_PATTERN`.
- **GOTCHA:** Don't introduce `setStatus`/`retryClone`/clone helpers — those are out of scope per D2.
- **VALIDATE:** `bun test --filter=workspace-service` + `bun test --filter=workspace-service-concurrent` (GAP-E1).

### Task 6 — Extend `agent-service.ts` (Lane B; depends on Task 5)
- **ACTION:** Update `apps/desktop/src/main/services/agent-service.ts`.
- **IMPLEMENT:**
  - `list()` returns `Agent` with the new `skills` field (existing rowToAgent rehydration).
  - `delete(id)`: extend D8 — count tasks AND workspaces referencing this agent; combined > 0 → `AppError("conflict", `${task_count} task(s) and ${workspace_count} workspace(s) reference …`, { task_count, workspace_count })`.
  - `registerSkills(id, skills: SkillDefinition[])`: validate via Zod, persist via `agentRepo.upsert` (or a thinner `setSkills` method on the repo if cleaner).
- **MIRROR:** `ERROR_HANDLING`.
- **VALIDATE:** Existing `agent-service` tests + new test that asserts the workspace-count branch fires.

### Task 7 — Update `TaskService` for workspace-aware create/run + `invokePhase` (Lane B; depends on Tasks 5 + 6)
- **ACTION:** Update `apps/desktop/src/main/services/task-service.ts`.
- **IMPLEMENT:**
  - `create(input)`: load workspace via `WorkspaceRepository.findById(input.workspace_id)`; throw `not_found` if missing. **Freeze `agent_id` at creation** (D7): if `input.agent_id` provided, use it; else use `workspace.default_agent_id`. Persist `phase_skills_override` (nullable). Do NOT persist any "override flag" — the row stores the literal agent_id.
  - `run(id)`: inside transaction, load workspace via `task.workspace_id`. Compute `effectiveSkills = resolvePhaseSkills(workspace, task).running` (length 0 or 1). Pass `{ prompt: task.prompt, agentId: task.agent_id, cwd: workspace.path, skillPrefix: effectiveSkills }` to dispatcher. Workspace lookup is the only new DB read on the hot path.
  - `invokePhase(id, phase)`: NEW. Validate phase is one of 4; load task; if `runDispatcher.liveRunIds().some(r => runRepo.findById(r)?.task_id === id)` then throw `AppError("invalid_state", "Task has a live run; cancel or wait")` (D9). Create a Run row (status `running`). Call dispatcher with `skillPrefix = resolvePhaseSkills(workspace, task)[phase]` and the original task.prompt. **Do NOT call `transition()`** — task.status preserved.
- **MIRROR:** Existing `task-service.ts:72-145` shape. For `invokePhase` reuse the run-row creation pattern but skip the state machine call.
- **IMPORTS:** Add `WorkspaceRepository`, `resolvePhaseSkills` from `@vibemaestro/core`.
- **GOTCHA:** The dispatcher's `start` signature changes in Task 8 — Task 7's calls already pass the new shape. TS will catch any missed callsite.
- **VALIDATE:** `bun test --filter=task-service-workspace` + `bun test --filter=task-service-invoke-phase`.

### Task 8 — Update `runDispatcher.start` signature + composition (Lane B; depends on Task 7)
- **ACTION:** Update `apps/desktop/src/main/services/run-dispatcher.ts`.
- **IMPLEMENT:** Per `DISPATCHER_COMPOSE` snippet — widen signature to `{ prompt, agentId, cwd, skillPrefix }`. `cwd` resolution: `opts.cwd ?? agent.cwd ?? process.env.HOME ?? process.cwd()`. Compose `finalPrompt = skillPrefix.length === 0 ? opts.prompt : skillPrefix.join(" ") + " " + opts.prompt` (REV-S3 space-join). Log skill IDs only, never the prompt body.
- **MIRROR:** Existing structure of `run-dispatcher.ts:75-194` — keep PTY accounting, event emission, transcript writing, exit handler, listener registries identical. Only prompt composition + cwd resolution change.
- **GOTCHA:** ARCH-E1 verified single call site (`task-service.ts:113`) pre-plan-11. After Task 7, `invokePhase` adds the second call site — both pass the new shape.
- **VALIDATE:** `apps/desktop/test/run-dispatcher-skills.test.ts` mocks `spawnAgent` and asserts `finalPrompt === "/skill <user prompt>"` when `skillPrefix = ["/skill"]`, and `=== "<user prompt>"` when empty.

### Task 9 — Routers (Lane B; depends on Tasks 5-8)
- **ACTION:** Create `apps/desktop/src/main/routers/workspaces.ts`; update `tasks.ts`, `agents.ts`, `_app.ts`.
- **IMPLEMENT:**
  - `workspacesRouter`: `list`, `get`, `create`, `patch`, `delete`. **No `retryClone`** (D2). Per `ROUTER_PATTERN`.
  - `tasksRouter`: extend `list` input with `workspace_id?`. `create` consumes the new field. Add `invokePhase` mutation: `.input(taskIdInputSchema.extend({ phase: phaseSchema }))` → `.output(taskResponseSchema)`.
  - `agentsRouter`: add `registerSkills` mutation: `.input(z.object({ id: z.string(), skills: z.array(skillDefinitionSchema) }))`.
  - `_app.ts`: register `workspaces: workspacesRouter`.
- **MIRROR:** `ROUTER_PATTERN`.
- **GOTCHA:** Contract snapshot regenerates from 14 → 22 procedures. IRON-RULE inspection: only ADDITIONS. Run `bun test -u apps/desktop/test/contract.test.ts` and review the diff in PR.
- **VALIDATE:** `bun test --filter=contract`.

### Task 10 — Update `seed.ts` (Lane B; depends on Task 9)
- **ACTION:** Update `apps/desktop/src/main/seed.ts`.
- **IMPLEMENT:** After migrations run, idempotently `upsert` agent skills (Claude Code: `[{id:"/plan-eng-review",label:"Plan Eng Review"}, {id:"/tdd-workflow",label:"TDD Workflow"}, {id:"/code-review",label:"Code Review"}, {id:"/document-release",label:"Document Release"}, {id:"/learn",label:"Learn"}]`; Codex: `[{id:"/codex",label:"Codex"}, {id:"/review",label:"Review"}]`). Existing seed tasks remain — migration backfilled `workspace_id="ws_local"` for them. Lazy-fill `ws_local.path` to `os.homedir()` if currently empty string.
- **MIRROR:** Existing `seed.ts:13-128`.
- **GOTCHA:** Idempotency. Don't re-insert tasks (existing seed checks `repo.countAll() > 0`); don't re-INSERT agents (use upsert). The `ws_local` row is migration-seeded; only the path lazy-fill needs handling here.
- **VALIDATE:** Manual: blow away `~/Library/Application Support/.../vibemaestro.db`, restart, confirm `ws_local` exists, board renders seeded tasks under it, conductor pill is omitted (only 1 workspace).

### Task 11 — DB-level tests + migration tests (Lane D; depends on Tasks 3-10)
- **ACTION:** Create `apps/desktop/test/migration-0001.test.ts`, `migration-0001-rollback.test.ts`, `workspace-service.test.ts`, `workspace-service-concurrent.test.ts`, `task-service-workspace.test.ts`, `task-service-invoke-phase.test.ts`, `run-dispatcher-skills.test.ts`, `packages/core/test/phase-skills.test.ts`.
- **IMPLEMENT:**
  - `migration-0001.test.ts`: seed pre-migration tasks; run migration; assert every row has `workspace_id="ws_local"`. Run again (idempotent). Defensive re-seed: empty agents table at start → migration succeeds (D11).
  - `migration-0001-rollback.test.ts`: GAP-E3. Mock the migrator to throw between `INSERT INTO tasks_new` and `DROP TABLE tasks`. Assert BEGIN/COMMIT rolls back; old `tasks` intact; next migration attempt re-runs from scratch.
  - `workspace-service.test.ts`: create with valid path; reject missing path; D10 label conflict + ws_local guard.
  - `workspace-service-concurrent.test.ts`: GAP-E1. Two parallel `Promise.all([create(label:"X"), create(label:"X")])` → exactly one succeeds, one throws conflict.
  - `task-service-workspace.test.ts`: D7 freeze (mutate workspace.default_agent_id; assert existing task.agent_id unchanged).
  - `task-service-invoke-phase.test.ts`: D9 reject-live-run; phase-skill prefix flows to dispatcher.
  - `run-dispatcher-skills.test.ts`: REV-S3 space-join assertion.
  - `phase-skills.test.ts`: 4-case resolver + GAP-E2 empty round-trip.
- **MIRROR:** `TEST_STRUCTURE`.
- **VALIDATE:** `bun test` green across the workspace.

### Task 12 — Renderer hooks + storage + App.tsx wire (Lane C; depends on Lane B)
- **ACTION:** Create `apps/desktop/src/renderer/hooks/useWorkspaces.ts`; create `apps/desktop/src/renderer/lib/workspace-storage.ts`; update `apps/desktop/src/renderer/hooks/useTasks.ts`; update `apps/desktop/src/renderer/App.tsx`.
- **IMPLEMENT:**
  - `workspace-storage.ts`: get/set `vibemaestro:active_workspace`; fallback `"ws_local"`.
  - `useWorkspaces`: `useQuery({ queryKey: ["workspaces","list"], queryFn: () => trpc.workspaces.list.query() })`. Mutations: `useCreateWorkspace`, `useUpdateWorkspace`, `useDeleteWorkspace`, `useInvokePhase`. Mirror `useTasks.ts:59-66`.
  - `useTasks(workspaceId)`: include `workspace_id` in input and query key.
  - `App.tsx`: `useState(getActiveWorkspaceId())`; pass `activeWorkspaceId` to `useTasks`, `WorkspacePicker`, `WorkspaceStrip`, `CreateTaskModal`. On `tasks.list` 404 (workspace deleted out from under), reset to `ws_local` + toast info. Echo workspace switch via IPC for pino log (D16).
- **MIRROR:** `useTasks.ts` patterns.
- **GOTCHA:** Reset to `ws_local` on 404 should be silent (toast info, not modal).
- **VALIDATE:** Manual: create workspace, refresh app, persists.

### Task 13 — Renderer components: Picker, Strip, CreateWorkspaceModal, PhaseSkillEditor, ConductorStrip, DetailPanel (Lane C; depends on Task 12)
- **ACTION:** Create `WorkspacePicker.tsx`, `CreateWorkspaceModal.tsx`, `PhaseSkillEditor.tsx`, `WorkspaceStrip.tsx`; update `Topbar.tsx`, `CreateTaskModal.tsx`, `DetailPanel.tsx`, `ConductorStrip.tsx`.
- **IMPLEMENT:** Per the "Design Specifications" section earlier in this file (token map + state coverage + responsive + a11y already locked).
  - `WorkspacePicker`: 320px dropdown, anchored below pill, upward-on-clip; ARIA combobox; keyboard nav (Arrow/Enter/Esc); "+ Create workspace…" footer.
  - `CreateWorkspaceModal`: label/path (text + Browse → Electron native dialog)/agent-picker (v1-only)/PhaseSkillEditor; disable Create when no v1 agents available (D14).
  - `PhaseSkillEditor`: 4 phase rows; single-select dropdown per row sourced from `agent.skills` (REV-S4). "Inherit" pill in task-modal mode.
  - `WorkspaceStrip`: collapsed default (40px); click to expand; per-phase Run buttons NOT here (D18).
  - `Topbar`: slot `<WorkspacePicker>` between logo and right cluster; `[-webkit-app-region:no-drag]` on the pill.
  - `CreateTaskModal`: pre-fill from active workspace; re-render on workspace switch via `useEffect` keyed on `workspace.id` (D14).
  - `DetailPanel`: add per-phase Run buttons (`Run planning`, `Run reviewing`, `Run complete`) wired to `useInvokePhase`. Disable when a run is live for the task.
  - `ConductorStrip`: render `[workspace.label]` pill before agent chip when `workspaces.length >= 2` (D18).
- **MIRROR:** Existing `CreateTaskModal.tsx:51-167` shape; `Topbar.tsx:19-36`; DESIGN.md §10 components.
- **GOTCHA:** Apply the "AI slop guardrails" table from the Design Specifications section — NO assignee chips, lane labels in mono caption uppercase, ochre accent (not green/purple), workspace picker is a topbar pill (not a left sidebar).
- **VALIDATE:** Manual: create a workspace with `running: ["/tdd-workflow"]`; create a task; hit Run; verify PTY transcript shows `/tdd-workflow` prefix activated. Conductor strip shows `[acme-web]` pill only once you have 2+ workspaces.

### Task 14 — Final wire-up: TODOS.md, IMPLEMENTATION.md, contract snapshot, full validation (Lane D; depends on Tasks 11-13)
- **ACTION:**
  - Update `TODOS.md` line 42 (Diff tab) per D17.
  - Update `TODOS.md` line 53 (team-mode resources) per D17.
  - Add new `TODOS.md` row: `[P3] Migration failure recovery UX` (D24).
  - Add new `TODOS.md` row: `[P3] WorkspacePicker virtualization at 50+ workspaces` (PERF-E1).
  - Update `IMPLEMENTATION.md` §3 with plan #11 SHIPPED + merge SHA.
  - Regenerate contract snapshot (`bun test -u apps/desktop/test/contract.test.ts`). Inspect diff — only ADDITIONS per REGRESSION-E1.
  - Run `bun typecheck && bun lint && bun test` — all green.
  - Update `CHANGELOG.md` with the new feature entry.
- **MIRROR:** Existing `IMPLEMENTATION.md` and `TODOS.md` style.
- **GOTCHA:** CLAUDE.md mandates `IMPLEMENTATION.md` update in the same PR. Don't defer.
- **VALIDATE:** `bun typecheck && bun lint && bun test` all green. Contract snapshot diff inspection passes IRON-RULE (no shape changes on existing 14 procedures).

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `resolvePhaseSkills` no override | workspace `{running:["/a"]}`, task override null | `running: ["/a"]` | — |
| `resolvePhaseSkills` override wins | workspace `{running:["/a"]}`, task override `{running:["/b"]}` | `running: ["/b"]` | — |
| `resolvePhaseSkills` override empty array | workspace `{running:["/a"]}`, task override `{running:[]}` | `running: []` | Yes — empty replaces, doesn't fall through |
| `resolvePhaseSkills` partial override | workspace `{planning:["/p"], running:["/r"]}`, task `{running:["/x"]}` | `{planning:["/p"], running:["/x"], ...}` | — |
| `resolvePhaseSkills` empty round-trip (GAP-E2) | workspace `{...all empty}`, task null | all-empty PhaseSkills | Yes |
| `WorkspaceService.create` valid path | absolute existing dir | new workspace row | — |
| `WorkspaceService.create` missing path | non-existent path | `AppError("validation_error")` | Yes |
| `WorkspaceService.create` path normalization (D12) | `~/code/foo` | stored as absolute resolved path | Yes |
| `WorkspaceService.create` label collision (D10) | duplicate label | `AppError("conflict", "label is taken")` (not internal_error) | Yes |
| `WorkspaceService.create` concurrent label (GAP-E1) | 2 parallel inserts same label | exactly 1 conflict, 1 success | Yes — concurrency |
| `WorkspaceService.delete(ws_local)` (D10) | `id="ws_local"` | `AppError("conflict", "Cannot delete default workspace")` | Yes |
| `WorkspaceService.delete` with tasks | workspace with 1 task | `AppError("conflict", task_count:1)` | Yes |
| `AgentService.delete` with workspaces (D8) | agent referenced by workspace | `AppError("conflict", task_count, workspace_count)` | Yes |
| `TaskService.create` requires workspace_id | input without workspace_id | Zod validation → `validation_error` | Yes |
| `TaskService.create` freezes agent_id (D7) | workspace.default_agent_id changes after task created | existing task.agent_id unchanged | Yes — invariant |
| `TaskService.run` resolves skill + cwd | task with override `running:["/x"]`, workspace `path="/p"` | dispatcher: `skillPrefix=["/x"]`, `cwd="/p"` | — |
| `TaskService.invokePhase` rejects live run (D9) | task with active run | `AppError("invalid_state")` | Yes |
| `TaskService.invokePhase` no state transition | task `backlog`, invoke `planning` | task stays `backlog`, new run created | Yes |
| `runDispatcher.start` composes space-join (REV-S3) | `skillPrefix=["/x"]`, `prompt="hi"` | spawnAgent receives `finalPrompt="/x hi"` | — |
| `runDispatcher.start` empty prefix | `skillPrefix=[]`, `prompt="hi"` | spawnAgent receives `finalPrompt="hi"` | — |
| `migration-0001` backfill | pre-migration tasks | all rows have `workspace_id="ws_local"` post-migration | Yes |
| `migration-0001` defensive re-seed (D11) | empty agents table | migration succeeds; agents re-seeded | Yes |
| `migration-0001-rollback` (GAP-E3) | injected failure mid-rebuild | BEGIN/COMMIT rolls back; old tasks intact | Yes — disaster |
| `contract.test.ts.snap` REGRESSION-E1 | regen snapshot | only ADDITIONS (workspaces.*, tasks.invokePhase, agents.registerSkills); zero existing-procedure modifications | Yes — IRON RULE |

### Edge Cases Checklist

- [x] Empty phase skills (override `[]` replaces inheritance)
- [x] **Single-skill cap (REV-S4)**: Zod `.max(1)` per phase — second skill rejected at contract layer
- [x] Invalid workspace_id at task creation → `not_found`
- [x] Concurrent workspace deletes vs. task creates: SQLite write serialization + FK `ON DELETE RESTRICT` blocks the delete
- [x] Permission denied on folder path: `fs.statSync` throws → mapped to `validation_error`
- [x] Path normalization: `~/`, trailing `/`, relative → all collapse to absolute resolved (D12)
- [x] Workspace label rendering with special chars: React escapes by default; emoji in label allowed but discouraged
- [x] Migration FK to deleted claude-code agent → defensive re-seed (D11) re-inserts
- [x] Migration partial-failure rollback (GAP-E3) → BEGIN/COMMIT keeps old data intact
- [x] `tasks.invokePhase` on a `complete` task → allowed (user explicit; run.status=running, task.status=complete)
- [x] Active workspace deleted out-from-under → renderer fallback to `ws_local` + info toast
- [x] Cross-workspace conductor pill only renders when `workspaces.length >= 2` (D18)
- [x] First-launch with only `ws_local` → pill omitted; board renders correctly
- [x] Pre-plan-11 event ring buffer entries lack `workspace_id` → renderer treats as no-pill (ARCH-E3)

---

## Validation Commands

### Static Analysis
```bash
bun typecheck
```
EXPECT: Zero TS errors across `packages/core`, `packages/db`, `apps/desktop`.

```bash
bun lint
```
EXPECT: Biome reports zero issues.

### Unit Tests (per-area)
```bash
bun test --filter=phase-skills
bun test --filter=workspace
bun test --filter=task-service
bun test --filter=run-dispatcher
bun test --filter=migration-0001
bun test --filter=contract
```
EXPECT: All green; contract snapshot includes 22 procedures (14 existing + 8 new).

### Full Test Suite
```bash
bun test
```
EXPECT: No regressions across existing plans #1–#10.

### Database Validation
```bash
# Blow away dev DB to force fresh migration run:
rm -rf "$HOME/Library/Application Support/VibeMaestro Dev/vibemaestro.db"*
bun dev:desktop  # confirm migration 0001 runs cleanly, then idempotency on restart
```
EXPECT: `workspaces` table exists; `tasks` table has `workspace_id NOT NULL`; `ws_local` row exists; existing seed tasks have `workspace_id = "ws_local"`.

### Browser / App Validation
```bash
bun dev:desktop
```
Then in the app:
- Open workspace picker → create `acme-web` folder workspace pointing at any local repo
- Pick `/tdd-workflow` for the `running` phase
- Switch to the new workspace
- Create a task; hit Run
- Open the detail panel terminal tab; confirm the PTY transcript shows the agent activated `/tdd-workflow` (skill execution visible in output)
- Open the detail panel's per-phase Run buttons; click `Run reviewing` while task is in `complete` → fresh run spawns with `/code-review` (or workspace's reviewing phase skill)
- Click `Run reviewing` while task is `running` → error toast "task has a live run; cancel or wait" (D9)

### Manual Validation
- [ ] Create folder workspace at a path that exists → workspace created synchronously, no provisioning state
- [ ] Create folder workspace at a bogus path → toast surfaces `validation_error` with path hint
- [ ] Create workspace with duplicate label → toast: "Workspace label is taken" (NOT a SQLite error)
- [ ] Path normalization (D12): type `~/code/foo`, trailing slash, relative → all stored as same absolute path
- [ ] Try to delete `ws_local` → toast: "Cannot delete the default workspace"
- [ ] Switch workspaces → board re-queries; no flicker into other workspace's data
- [ ] Create task in workspace A; switch to B mid-modal → modal re-renders pre-fill from B (D14)
- [ ] Create task with no overrides → defaults inherit from workspace, marked with "inherit" pills per phase
- [ ] Change a task's running phase override → run uses the override skill, not the workspace default
- [ ] Override `running` phase to empty `[]` → run shows raw prompt with no prefix
- [ ] Delete workspace with tasks → conflict error toast, workspace not deleted
- [ ] Delete the active workspace from another tab/process, then refresh → app silently falls back to `ws_local` with info toast
- [ ] First-launch (only ws_local exists) → ConductorStrip rows have NO `[ws_local]` pill
- [ ] After creating a second workspace → ConductorStrip rows now show `[label]` pill prefix
- [ ] PTY-content rule: search the pino log file — only skill IDs ever appear (`"skills":["/tdd-workflow"]`); user prompts never appear
- [ ] `claude-code` agent invocation (verify via dev tools or transcript): `claude --print "/tdd-workflow <user prompt>"` was the actual command line

---

## Acceptance Criteria

- [ ] `Workspace` resource created/listed/fetched/patched/deleted via tRPC (workspaces router has 5 procedures)
- [ ] Folder workspaces only in v1; **no git-clone path** (D2). No `kind`/`git_url`/`status` fields.
- [ ] Every task has `workspace_id NOT NULL` after migration `0001`
- [ ] `ws_local` is auto-created via migration and adopts every pre-existing task
- [ ] `task.agent_id` is **frozen at creation** (D7); `workspace.default_agent_id` changes do not retroactively mutate existing tasks. No `agent_id_override` column.
- [ ] `Agent` rows persist a `skills: SkillDefinition[]` registry; seed populates Claude Code (5 skills) + Codex (2 skills)
- [ ] Claude Code agent registered with `prompt_via="arg"`, `args=["--print","{{prompt}}"]` per REV-S1; Codex with `prompt_via="arg"`, `args=["exec","{{prompt}}"]`
- [ ] `tasks.create` requires `workspace_id`; defaults `agent_id` from workspace; persists `phase_skills_override`
- [ ] `tasks.run` composes `finalPrompt = phaseSkill + " " + task.prompt` (space-joined per REV-S3); spawns with `cwd = workspace.path`
- [ ] `tasks.invokePhase(id, phase)` exists; spawns Run without state transition; rejects on live run per D9
- [ ] Topbar shows a `WorkspacePicker` pill; clicking opens a 320px dropdown reusing DESIGN.md §10 command palette pattern
- [ ] `WorkspaceStrip` renders collapsed by default (D18); click toggles expanded; per-phase Run buttons are NOT in the strip
- [ ] Per-phase `Run planning` / `Run reviewing` / `Run complete` buttons in the task detail panel; disabled when a live run exists
- [ ] `CreateWorkspaceModal`: label, path (text + Browse), agent picker, PhaseSkillEditor (single-select per phase per REV-S4); Create disabled when no v1 agents available (D14)
- [ ] `CreateTaskModal` pre-fills from active workspace; re-renders pre-fill on workspace switch (D14)
- [ ] `ConductorStrip` shows `[workspace.label]` pill BEFORE the agent chip when 2+ workspaces exist; omitted when only 1
- [ ] Run dispatcher signature widened; `agent.cwd` preserved as fallback (CLAUDE.md don't-refactor-across-plan-boundaries)
- [ ] Migration 0001 wrapped in explicit `BEGIN; ... COMMIT;` (ARCH-E2); defensive `INSERT OR IGNORE` agents re-seed (D11); `default_agent_id` nullable + lazy-fill (D22)
- [ ] TODOS.md lines 42 + 53 updated (D17); 2 new P3 TODOs added (migration recovery UX, picker virtualization)
- [ ] Contract snapshot regenerated; IRON-RULE diff inspection passes (only ADDITIONS, no shape changes to existing 14 procedures — REGRESSION-E1)
- [ ] All validation commands pass; no regressions
- [ ] `IMPLEMENTATION.md` updated to reflect plan #11 as shipped (per CLAUDE.md rule)

## Completion Checklist

- [ ] Code follows discovered patterns (see "Patterns to Mirror")
- [ ] Errors use `AppError` with one of the existing `ErrorCode`s
- [ ] Logging uses `childLogger`, never `console.log`; skill IDs logged, never prompt body
- [ ] Tests follow `bun:test` AAA shape; coverage ≥ 80% for `@vibemaestro/core` and `@vibemaestro/db`
- [ ] No raw `px` values (`grep -nE ': \d+px' src/` returns nothing new)
- [ ] No catch-all `catch (e)` blocks added
- [ ] DESIGN.md §15 anti-patterns not reintroduced; AI slop guardrails (this plan's Design Specifications section) honored
- [ ] No `git add -A`; staged paths are explicit
- [ ] Grep for purged identifiers per CQ-E1 returns ZERO hits: `agent_id_override`, `stage_skills`, `invokeStage`, `stage_skills_override`, `kind`, `git_url`, `resolved_path`, `provisioning`, `retryClone`, `gitClone`, `workspaceDir`, `setStatus`, `workspace.status_changed`
- [ ] `IMPLEMENTATION.md` updated to reflect this plan as shipped

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SQLite table-rebuild migration corrupts existing rows | Low | High | Explicit `BEGIN; ... COMMIT;` wrap inside the SQL (ARCH-E2). `migration-0001-rollback.test.ts` (GAP-E3) injects mid-rebuild failure and asserts rollback. |
| ws_local FK fails because claude-code agent was deleted | Low | Medium | Defensive `INSERT OR IGNORE INTO agents` for both v1 agents inside migration 0001 (D11). Also `default_agent_id` is nullable with lazy-fill (D22). |
| `claude --print` slash-command activation regresses | Low | High | D20 spike validated current Claude Code v2.1.138 behavior. If a future Claude Code release changes semantics, the `run-dispatcher-skills.test.ts` integration check (or manual transcript inspection) catches it. Plan #11's `prompt_via=arg` model means a regression shows up as "phase recipe didn't run" — surfaces in user transcript, fixable by adjusting `args`. |
| Phase skill is unknown to the agent | Medium | Low | User controls skill strings via the UI picker (filtered to `agent.skills`). Unknown skills surface as the agent's transcript output, not a VibeMaestro crash. |
| Workspace switch re-queries entire task list | Low | Low | Existing perf budget < 100 tasks/lane (CLAUDE.md). Workspaces typically *reduce* per-board task counts. Re-query cost is one tRPC roundtrip with `tasks_workspace_idx`. |
| Active workspace deleted out from under user | Low | Low | App.tsx fallback-to-`ws_local` + info toast (D14 / Task 12). |
| Migration on the user's machine fails (disk full, permissions) | Low | High | BEGIN/COMMIT keeps DB in last-known-good state. Cryptic SQLite error surfaces; P3 TODO added (D24) for friendly recovery UX in v1.x. |

## Notes

- **`agent.cwd` field stays** — it's the fallback chain in `run-dispatcher.ts:100` (`workspace.path >> agent.cwd >> $HOME >> cwd`). Don't refactor across plan boundaries (CLAUDE.md).
- **Phase-skill resolution is whole-phase replace**, not key-merge — empty array means "no skill for this phase" (Task 2 GOTCHA). PR description should call this out so reviewers don't ask.
- **REV-S4 single-skill cap is intentional** — D20 spike proved `claude --print` only honors one leading slash command per arg. UI is single-select per phase, not multi-select. If users want chained skills, that's a custom slash command defined under `~/.claude/skills/` (out of scope for v1).
- **`tasks.invokePhase` is the seed for v2 auto-phase-firing.** When structured agent events ship (TODOS.md v2 P2), the system can auto-fire `reviewing` on entry to `reviewing` state, `complete` on entry to `complete`, etc. The dispatcher path and event integration stay the same — only the trigger changes.
- **Future agents** (Gemini, Cursor) reserved in `design-tokens.json` get an empty `skills: []` by default; CLAUDE.md's "Don't expand the agent surface" rule applies — no new adapters in this plan.
- **`tasks.list` filter accepts `workspace_id` as optional** so admin/internal tools can still query across workspaces. The renderer always sends one. Matches API.md §4 convention.
- **Plan #11 PR is parallelizable across 2 worktrees** after the Lane A (foundation in `packages/`) lands. See the "Worktree parallelization strategy" inside the Engineering Specifications section below.
- **The conductor cross-workspace pill is automatic** — when the second workspace is created, TanStack Query invalidates `useWorkspaces`, ConductorStrip re-renders, and the pill appears on all rows. No imperative trigger needed (ARCH-E4).
- **Event ring buffer graceful degradation (ARCH-E3):** events stored in plan #4's ring buffer before plan #11 ships lack `workspace_id`. The renderer treats missing as "no pill" (which matches the D18 1-workspace rule, so the visual is identical). No backfill needed.

## Design Specifications (post `/plan-design-review`, 2026-05-10)

> All decisions calibrate against `DESIGN.md` terminal-dark theme, two type families (Inter + JetBrains Mono), and the token system. The 7-pass review found design completeness was 5/10; with the specs below the plan is at 9/10. Phase-specific design (PhaseSkillEditor visual, per-phase Run button placement) is **contingent on the D20 spike** and gets a separate `/plan-design-review` mini-pass after the spike resolves.

### Design system mapping per new surface

| Surface | DESIGN.md anchor | Concrete spec |
|---|---|---|
| WorkspacePicker pill (in Topbar) | §10 Buttons (secondary variant) | 28px tall, `surface-base` background, `border-default` border, `radius-sm`, padding `space-2 space-3`, Inter 13/500. Chevron-down icon (`text-tertiary`, 12px) on the right. Label is Inter 13/500 `text-primary`. Active workspace label is the visible text. Hover: `border-strong`. Focus: 2px `border-focus` ring (outline-style, offset 2px). |
| WorkspacePicker dropdown | §10 Command palette (reduced) | Width 320px (vs §10's 640px). Anchored below pill, opens upward if downward clips. `surface-raised`, `border-default`, `radius-md`, `shadow-3`. Header row 32px: caption mono uppercase "WORKSPACES" left (`text-tertiary`), count right (`text-tertiary`), `space-3` horizontal padding, bottom border-subtle. Items 40px each: `space-3` left padding, agent monogram chip (18px, AgentChip §10), workspace label (`title`), path subtitle (`meta` mono, `text-tertiary`, truncated middle). Active workspace gets `accent-base` 2px left strip and a check icon (`accent-base`, 12px) on the right. Hover: `surface-pressed`. Footer 36px: "+ Create workspace…" in ghost-button style (§10 Buttons), full-width, top border-subtle. |
| WorkspaceStrip (collapsed, default) | New surface; aligns with topbar visual weight | Height 40px (8px more than topbar bottom-padding-equivalent — sits like a "context belt"). `surface-base` background, bottom border `border-subtle`. Single horizontal row: `space-4` horizontal padding, `space-3` gap. Items left → right: workspace label (Inter `title` 15/600), `·` separator (`text-tertiary`), path (mono `meta` 12, `text-tertiary`, truncated middle, max ~50ch), `·` separator, AgentChip (small, §10), agent label (Inter `body` 13, `text-secondary`), spacer (flex), phase chip-count group `[P:N R:N Rv:N C:N]` (mono `caption` 11 uppercase tracking, `text-tertiary` — when phases unconfigured, render `[No phases configured]` in `text-tertiary` `meta`), chevron-down icon (`text-tertiary`, 12px) as expand affordance. Click anywhere on the row toggles expanded view. |
| WorkspaceStrip expanded view | (CONTINGENT ON D20 SPIKE) | Deferred. Will be specified after spike confirms phase framing. |
| CreateWorkspaceModal | §10 Modal + §10 Form inputs | `surface-raised`, `border-default`, `radius-lg`, `shadow-3`, max-width 520px. Heading "New workspace" in `heading` style. Fields top-to-bottom: (1) Label — text input (§10), max 80 chars, placeholder "acme-web"; (2) Path — text input + small "Browse…" secondary button (§10 Buttons) that opens Electron native folder dialog; live-validate on blur via `fs.statSync`, error border + `meta`-styled error in `status-error` if invalid; (3) Default agent — agent picker mirroring `CreateTaskModal.tsx:119-142` chip-button layout, filtered to tier=v1; (4) Phases — **contingent on D20 spike** placeholder (`text-tertiary` `meta`: "Configure phases after the agent is selected"). Footer: ghost "Cancel" + primary "Create workspace" (§10 Buttons), disabled until all required fields are valid. |
| ConductorStrip workspace pill | New element, calibrated against §10 Conductor strip rows | Each row gets a `[<workspace.label>]` pill BEFORE the agent chip. Pill: `surface-inset` background, `border-subtle`, `radius-xs`, padding `2px 6px`, mono `caption` 11 `text-secondary`, max-width ~14ch with ellipsis. Order: `[ws-label] <agent-chip> <verb> <task-key> · <elapsed> [› <action>]`. When **only one workspace exists** (e.g., fresh install with just `ws_local`), the pill is omitted entirely — strip renders existing format. When 2+ workspaces exist, the pill is always present. |
| CreateTaskModal (extended) | §10 (existing modal) | Adds "Inherit" pill next to each per-phase override row in the PhaseSkillEditor section. Inherit pill: `surface-inset`, `radius-xs`, mono `caption` 11 `text-tertiary`, padding `2px 6px`, text "inherit". Clicking it clears the override for that phase. (PhaseSkillEditor visual deferred to post-spike review.) |

### Interaction state coverage

| Surface | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|---|---|---|---|---|---|
| WorkspacePicker (closed) | inherits suspense skeleton from useWorkspaces (`surface-base` shimmer, 28px high) | Picker shows `ws_local` (the seed) — never truly empty | Toast `error` variant: "Couldn't load workspaces · retry" | Active workspace label visible | N/A |
| WorkspacePicker (open) | dropdown header shows "WORKSPACES · loading…" if mid-query | "+ Create workspace…" footer is the only row | Inline `meta` `status-error`: "Failed to load · retry" with a ghost retry button | Items rendered | Mix of cached + revalidating — show items, no spinner |
| CreateWorkspaceModal | Submit button: `disabled` + `meta` "Creating…" | Label/path empty: submit disabled, no error UI | Inline error under offending field, `status-error` border + `meta` red helper | Modal closes; toast `success`: "Workspace «label» created" | Path validated but label empty: submit stays disabled |
| WorkspaceStrip | suspense skeleton row (40px, `surface-base` shimmer) | Phase chip-count shows `[No phases configured]` in `text-tertiary` | Active workspace deleted: triggers App.tsx fallback to `ws_local` + toast `info`: "Workspace «label» was removed; switched to Local." | populated row | Some phases empty: chip count shows zeros where empty (e.g., `[P:1 R:1 Rv:0 C:0]`) |
| ConductorStrip cross-workspace | inherits existing skeleton | "Now conducting · No live runs" (existing) | inherits existing | Rows with workspace pills | Mix of workspaces: each row carries its own pill |

### User journey

```
STEP | USER DOES                          | USER FEELS              | PLAN SUPPORTS?
-----|------------------------------------|-------------------------|----------------
1    | Launches new build first time      | "Oh, multiple repos."   | Picker visible; ws_local pre-active; ConductorStrip omits pill (only 1 ws)
2    | Clicks workspace picker            | "How do I add one?"     | Dropdown shows ws_local + "+ Create workspace…" footer (CTA visible)
3    | Clicks Create workspace…           | "Standard form."        | Modal with label/path/agent fields (path: text + Browse…)
4    | Picks folder, types label          | "Validating?"           | Live fs.statSync on blur; "Browse…" opens Electron dialog
5    | Hits Create                        | "Submitting."           | Button → "Creating…"; on success modal closes with toast
6    | Picker re-opens implicitly         | "There's my workspace." | New workspace active immediately; board re-queries (~50ms loading shimmer)
7    | (Later) Switches workspace         | "Where I left off."     | localStorage persists active_workspace_id; ConductorStrip starts showing pills (2+ ws)
8    | Active workspace deleted elsewhere | "Where'd it go?"        | App.tsx falls back to ws_local + toast info; never blank board
```

Time-horizon design: 5-sec visceral (dark terminal, ochre accent, dense — "this is a power-user tool"); 5-min behavioral (switch workspaces, board scopes, conductor shows cross-workspace runs); 5-year reflective (workspaces are a primary mental model — repos = workspaces, recipes = phases).

### Responsive & accessibility

- **v1 minimum window:** 1280×800. DESIGN.md §13 confirms; mobile (<640px) and tablet (<1024px) are out of scope (v2 web mirror). At 1280px wide, topbar fits logo + picker (truncate path to ~50ch in strip), theme button, + New task button.
- **Keyboard navigation:**
  - WorkspacePicker pill: Tab-focusable. Space/Enter opens dropdown. Esc closes.
  - Dropdown items: ArrowUp/Down navigates. Enter selects. Esc closes.
  - "+ Create workspace…" footer is reachable by Tab from the last item or by ArrowDown past the last item.
  - CreateWorkspaceModal: trapped focus inside modal; Tab cycles fields; Esc closes (mirrors existing modal pattern).
  - No new global keybind in v1 — `⌘W` is reserved by Electron for close-window. Future v1.x can add `⌘⇧W` to open picker.
- **ARIA:**
  - Picker pill: `role="combobox"` + `aria-haspopup="listbox"` + `aria-expanded={open}` + `aria-controls="workspace-picker-listbox"`.
  - Dropdown: `role="listbox"`. Each item: `role="option"` + `aria-selected={active}`.
  - Modal: `role="dialog"` + `aria-modal="true"` + `aria-labelledby="modal-title"`.
  - WorkspaceStrip: `role="region"` + `aria-label="Active workspace"`. Toggle row has `aria-expanded`.
  - ConductorStrip pill: bare span — text content carries the meaning ("acme-web").
- **Touch targets:** v1 desktop-only; 32-40px row heights are fine (DESIGN.md §13 "v1 scope"). 44px+ promotion deferred to v2 mobile web mirror (TODOS.md P2).
- **Color contrast:** all new surfaces use existing palette (`text-primary` on `surface-raised` = AA; mono `caption` on `text-tertiary` = AA at 11px+, verify with the existing audit). New element: workspace pill in conductor strip uses `text-secondary` on `surface-inset` — verify contrast is ≥4.5:1 during implementation.

### AI slop guardrails (what NOT to ship)

The 3 mockups generated during design review demonstrated common drift modes. The implementer MUST NOT introduce any of:

| Drift mode | Why it's wrong | What to ship |
|---|---|---|
| Assignee chips / names on task cards | VibeMaestro is single-user (DESIGN.md §6); assignee slot is `display: none` until team mode | Only agent chip on the task card, exactly as today |
| Lane labels in Title Case ("Backlog" "Running") or alternate names ("In Progress", "Done") | DESIGN.md §10 Lane spec | Mono `caption` 11 uppercase tracking: `BACKLOG`, `RUNNING`, `REVIEWING`, `COMPLETE` |
| Phase chip counts spelled out as "Planning · Running · Reviewing · Complete" | Strip is 40px collapsed; full words don't fit | Mono `caption` uppercase: `[P:N R:N Rv:N C:N]`, terminal-style |
| Decorative quick-action toolbar at the bottom ("User auth · Run tests · Deploy") | Conductor strip IS the footer; no second toolbar | Conductor strip only, exactly per DESIGN.md §10 |
| Green or any non-ochre accent on the primary button | DESIGN.md §4 accent token | `accent-base` = ochre `oklch(74% 0.13 50)` |
| WorkspacePicker as a left sidebar | Plan #11 spec is a topbar pill + dropdown | Topbar pill, dropdown anchored below pill |
| Workspace creation as a separate page | CreateWorkspaceModal is a modal | Modal overlay |
| Path subtitles omitted from picker items | Identity of workspace = label + path; both must be visible | Path as `meta` mono `text-tertiary`, truncated middle |

### Reference mockups (annotated)

The 3 generated mockups are saved at `/Users/dongli/.gstack/projects/codeeatsleep2nd-VibeMaestro/designs/workspace-picker-strip-20260510/`. Variant A is the "least wrong" reference — it gets the ochre accent and topbar shape close, but it (and B and C) demonstrate the drift modes above. The implementer should treat the mockups as **NEGATIVE space** (this is what not to ship) and the spec table above as **POSITIVE space** (this is the spec).

## Engineering Specifications (post `/plan-eng-review`, 2026-05-10)

> 7 findings; all auto-applied per the session's "auto-pick recommended" directive. No issues unresolved. No critical gaps. Plan is implementation-ready post-spike + revisions.

### ARCH-E1 — `run-dispatcher.start` call sites (single-site verified)

Confirmed via grep `runDispatcher.start` in `apps/desktop/src/main/`: only call site is `task-service.ts:113`. After plan #11, `task-service.invokePhase` adds a second site — both pass the new shape `{ prompt, agentId, cwd, skillPrefix }`. No legacy callers to worry about.

### ARCH-E2 — Migration 0001 self-defensive atomicity

D22 said "verify Drizzle migrator wraps each file in BEGIN/COMMIT." If verification reveals `--> statement-breakpoint` splits transactions (PRAGMA-dependent), the mitigation is to wrap the destructive sequence in **explicit BEGIN/COMMIT inside the SQL file itself**:

```sql
-- 0001_workspaces.sql — MANUALLY AUTHORED. Do not regenerate via drizzle-kit generate;
-- the table rebuild + defensive re-seed cannot be auto-derived.

BEGIN;
  CREATE TABLE IF NOT EXISTS workspaces (...);
  ALTER TABLE agents ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
  INSERT OR IGNORE INTO agents (...claude-code, codex...);  -- D11 defensive re-seed
  INSERT OR IGNORE INTO workspaces (id, label, kind, ..., default_agent_id)
    VALUES ('ws_local', 'Local', 'folder', NULL, NULL);  -- D22 nullable default_agent_id
  CREATE TABLE tasks_new (...);
  INSERT INTO tasks_new SELECT ..., 'ws_local', NULL, NULL, ... FROM tasks;
  DROP TABLE tasks;
  ALTER TABLE tasks_new RENAME TO tasks;
  CREATE INDEX status_agent_idx ON tasks(...);
  CREATE INDEX tasks_workspace_idx ON tasks(workspace_id, status, id);
COMMIT;
```

Belt + suspenders: even if Drizzle wraps the migration in its own transaction, the inner `BEGIN/COMMIT` is harmless (SQLite is happy with nested savepoints).

### ARCH-E3 — Event ring buffer graceful degradation

Plan #4's event ring buffer stores the last 1000 events. Pre-plan-11 entries lack `workspace_id`. On reconnect-replay, the renderer treats missing `workspace_id` as "no pill rendered" (matches the D18 "1 workspace = no pill" semantics). No backfill needed. Plan adds Zod schema with `workspace_id: z.string().optional()` on event payloads (server always emits when 2+ workspaces; old replays just look unprefixed).

### ARCH-E4 — Cross-workspace pill re-render

When user creates the 2nd workspace, `useWorkspaces` query invalidates → re-renders ConductorStrip → re-evaluates `agents.length >= 2 ? pill : noPill`. TanStack Query reactivity handles this automatically. No imperative trigger needed.

### CQ-E1 — Purge stale identifiers from rewrite

When rewriting plan #11 per the 23 CEO + 17 design + this section's revisions, grep targets to verify zero hits:
- `agent_id_override` (column dropped per D7)
- `stage_skills` → must all be `phase_skills` (per D3)
- `invokeStage` → must all be `invokePhase` (per D3)
- `stage_skills_override` → must be `phase_skills_override`
- `kind`, `git_url`, `resolved_path`, `provisioning`, `retryClone`, `gitClone`, `workspaceDir` (all dropped per D2)
- `setStatus`, `workspace.status_changed` event (status field dropped per D2)

### CQ-E2 — Migration file comment header

The migration is hand-authored. Add header comment:
```sql
-- 0001_workspaces.sql
-- MANUALLY AUTHORED. Do NOT regenerate via `drizzle-kit generate`.
-- The 12-step table rebuild + defensive agent re-seed cannot be auto-derived
-- from schema diffs. If the schema changes, edit this file by hand or write
-- a follow-up migration.
```

### Tests (3 GAPS + 1 REGRESSION added)

```
[GAP-E1] apps/desktop/test/workspace-service-concurrent.test.ts
  Concurrent label inserts under SQLite serialization. 2 parallel
  workspace.create with same label → exactly 1 succeeds, 1 throws
  AppError("conflict"). Verifies D10 label UNIQUE remap holds under
  contention.

[GAP-E2] apps/desktop/test/workspace-service.test.ts (extended)
  Empty phase_skills round-trip. workspace.create({ phase_skills:
  { planning:[], running:[], reviewing:[], complete:[] } }) — assert
  read returns the same shape, not null/undefined. Catches JSON-default
  bugs in the repo's rowToWorkspace rehydration.

[GAP-E3] apps/desktop/test/migration-0001-rollback.test.ts
  Simulate partial-failure mid-rebuild via mock that throws after
  INSERT INTO tasks_new but before DROP TABLE tasks. Assert SQLite
  BEGIN/COMMIT (per ARCH-E2) rolls back; old `tasks` table intact;
  app re-tries migration on next boot.

[REGRESSION-E1] apps/desktop/test/contract.test.ts.snap
  IRON RULE: regenerate snapshot (~14 → ~22 procedures). PR diff
  inspection must show ONLY additions (workspaces.*, tasks.invokePhase,
  agents.registerSkills). Zero modifications to existing 14 procedure
  shapes. This is the regression guard for backward compatibility.
```

### PERF-E1 — WorkspacePicker virtualization deferred

WorkspacePicker dropdown is unvirtualized. Fine at v1 scale (~5 workspaces). Added to TODOS.md as P3: "WorkspacePicker virtualization at 50+ workspaces; mirrors the board virtualization TODO pattern."

### Failure Modes Registry

| Codepath | Failure | Test | Error handling | User sees |
|---|---|---|---|---|
| WorkspaceService.create concurrent label | 2 parallel inserts | GAP-E1 ✓ | AppError("conflict") | "label is taken" |
| WorkspaceService.create bad path | path missing | D12 ✓ | AppError("validation_error") | "path not found" |
| TaskService.invokePhase live run | concurrent run | D9 ✓ | AppError("invalid_state") | "task has live run" |
| AgentService.delete with workspace ref | workspace references it | D8 ✓ | AppError("conflict") | "N workspaces ref agent" |
| Migration 0001 partial failure | crash mid-rebuild | GAP-E3 ✓ | BEGIN/COMMIT rollback | App re-tries on next boot; tasks intact |
| Migration 0001 agent FK | claude-code deleted | D11 + D22 ✓ | nullable default_agent_id + INSERT OR IGNORE | (transparent) |
| Active workspace deleted out-from-under | external delete | manual ✓ | Renderer 404 → fallback | "Workspace X removed; switched to Local" |
| Event ring buffer replay (pre-plan-11 entries) | missing workspace_id | implicit | graceful degradation (no pill) | (transparent) |

**Zero CRITICAL GAPs.** Every failure has a test + error path + user-facing message.

### Worktree parallelization strategy

| Step | Modules touched | Depends on |
|---|---|---|
| 1: contracts + id (Workspace/Skill/PhaseSkills) | `packages/core/` | — |
| 2: phase-skills resolver | `packages/core/` | 1 |
| 3: schema + migration 0001 | `packages/db/` | 1 |
| 4: WorkspaceRepository + agent skills field + task filters | `packages/db/repositories/` | 1, 3 |
| 5: paths helper update | `apps/desktop/src/main/config/` | — |
| 6: WorkspaceService + task-service workspace lookup + agent-service guard | `apps/desktop/src/main/services/` | 2, 4 |
| 7: run-dispatcher signature widen | `apps/desktop/src/main/services/` | 6 |
| 8: routers (workspaces + tasks.invokePhase + agents.registerSkills) | `apps/desktop/src/main/routers/` | 6, 7 |
| 9: seed.ts update | `apps/desktop/src/main/` | 4, 8 |
| 10: renderer hooks + storage | `apps/desktop/src/renderer/hooks/`, `lib/` | 8 |
| 11: renderer components (Picker, Strip, CreateWorkspaceModal, PhaseSkillEditor stub, ConductorStrip update, App.tsx wire) | `apps/desktop/src/renderer/components/` | 10 |
| 12: tests (all of them) | every test file | 1-11 |
| 13: TODOS.md + IMPLEMENTATION.md + contract snapshot regen | docs | 12 |

**Lanes:**
- **Lane A (foundation):** 1 → 2 → 3 → 4 → 5 (sequential, all in `packages/`)
- **Lane B (services + routers):** 6 → 7 → 8 → 9 (sequential, all in `apps/desktop/src/main/`)
- **Lane C (renderer):** 10 → 11 (sequential)
- **Lane D (tests + docs):** 12 → 13 (sequential, depends on all)

**Execution order:**
1. Run Lane A first (foundation).
2. Lanes B and C can run in parallel after Lane A completes (B touches main process; C touches renderer; no overlap).
3. Lane D last.

**Conflict flags:**
- Lane B and Lane C both write to `apps/desktop/src/main/lib/event-bus.ts`? NO — Lane B touches services + routers + event payloads (events.ts is in core/, in Lane A). No overlap.
- Both modify `app.tsx`? Renderer-only (Lane C).

This plan is **parallelizable into 2 worktrees** after the foundation lane lands.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|---|---|---|---|
| Workspace shell (topbar + picker + strip + board + conductor) | `~/.gstack/projects/codeeatsleep2nd-VibeMaestro/designs/workspace-picker-strip-20260510/variant-A.png` | Closest to terminal-dark + ochre accent; topbar layout direction is right | DO NOT ship assignees, DO ensure all 4 lane labels render (Backlog included), DO add the WorkspaceStrip row + cross-workspace ConductorStrip pills not visible in mockup; treat the variant as a NEGATIVE reference for the drift modes called out in "AI slop guardrails" above |

## D20 Spike Resolution (2026-05-10)

> The CEO-review D20 spike has been executed. Plan #11 is **UNBLOCKED with architectural revisions** required to the agent registration + dispatcher composition. Spike artifacts at `/tmp/d20-spike/` (transient; key outputs reproduced below).

### Methodology

Used Python's stdlib `pty` module (avoids the node-pty Electron rebuild dependency for a one-off spike). Two invocation modes tested:
- **Interactive PTY mode** — `pty.fork()` + `os.execvp("claude")` + write `/help\r` to the child's TTY-attached stdin.
- **Non-interactive `--print` mode** — `claude --print "<arg>" < /dev/null` with various arg shapes.

### Findings

| # | Invocation | Result | Implication |
|---|---|---|---|
| 1 | PTY interactive: write `/help\r` | ✅ Slash command rendered the help panel | Slash commands DO work in TTY mode when submitted with `\r` (Enter), one line at a time |
| 2 | PTY interactive: write `/help\nwhat is 2+2\n` (single multi-line write) | ❌ Both lines stacked in input buffer, never submitted | `\n` in raw PTY write is treated as line-break-in-buffer (multiline input), not as submit. **The plan's `skillPrefix.join("\n") + "\n" + prompt` strategy DOES NOT work via PTY stdin.** |
| 3 | `claude --print "/learn"` | ✅ Skill activated, returned 78-byte skill output | `--print` mode honors slash commands at the start of the arg |
| 4 | `claude --print "/learn stats"` | ✅ Skill activated with sub-arg | Sub-args to slash commands pass through |
| 5 | `claude --print "/learn then list the top 3 entries verbatim"` | ✅ Skill activated AND honored the free-text instruction; output: "Listed all 3 stored learnings verbatim..." | **THE PLAN-#11 USE CASE.** Single slash command + free user prompt in the same arg works as designed. |
| 6 | `claude --print "/learn /learn stats"` (two slashes inline) | ❌ Empty output (skill didn't fire) | **Multiple slash commands in a single arg DO NOT work.** Only one slash command per invocation. |
| 7 | `claude --print "/learn\n/learn stats\nthen say WOMBAT please"` | 🟡 Output "WOMBAT" — neither slash activated as a skill, final free-text honored | Multi-line skill prefix joined with `\n` fails to activate any of the slashes; user instruction at the tail still runs |
| 8 | `codex exec "say only the word PONG"` | ✅ Returned "PONG" | Codex `exec` is the non-interactive entry; works with single-arg prompt |

### Architectural revisions required

**REV-S1 (CRITICAL): Claude Code agent registration changes.** Migration 0000's seeded agent row for `claude-code` is currently:
```sql
('claude-code', 'Claude Code', 'CC', 'oklch(74% 0.13 50)', 'v1', 'claude', '[]', '{}', NULL, 'stdin', 0, NULL, '2026-01-01T00:00:00.000Z')
                                                                                  ^^^ prompt_via
```
Must change to:
```sql
('claude-code', 'Claude Code', 'CC', 'oklch(74% 0.13 50)', 'v1', 'claude', '["--print","{{prompt}}"]', '{}', NULL, 'arg', 0, NULL, '2026-01-01T00:00:00.000Z')
                                                                            ^^^ args (NOTE: stdin closure required)         ^^^ prompt_via
```
This change goes into **migration 0001** (the workspace migration) via an `UPDATE agents SET command=..., args=..., prompt_via='arg' WHERE id='claude-code'` statement, alongside the existing defensive re-seed. Codex stays as-is initially, then a similar update for `codex` → `prompt_via='arg'`, `args=["exec","{{prompt}}"]`.

**REV-S2 (CRITICAL): `pty-daemon/spawn.ts` must close stdin.** Test E showed `claude --print` waits 3s on stdin then warns. The dispatcher's `runDispatcher.start` must spawn with stdin closed (or piped `/dev/null` equivalent) so the warning doesn't fire and the CLI returns immediately. `node-pty` doesn't expose a "close stdin" option directly — workaround: spawn with the `--print` arg only, never write to the PTY after spawn. Update `spawn.ts` to skip the `prompt_via: "stdin"` write path entirely when `prompt_via: "arg"` is used. (Already the case in current code — the arg-mode branch substitutes `{{prompt}}` and never writes to stdin. ✓)

**REV-S3 (CRITICAL): Dispatcher composition uses SPACE, not `\n`.** The plan's compose step changes:
```ts
// BEFORE (per original plan):
const finalPrompt = skillPrefix.length === 0
  ? prompt
  : `${skillPrefix.join("\n")}\n${prompt}`;

// AFTER (post-spike):
// Claude Code accepts ONE slash command + free text in the same arg.
// If the user configures multiple skills for a phase, only the FIRST activates
// as a slash command; the rest are treated as natural-language hints.
const finalPrompt = skillPrefix.length === 0
  ? prompt
  : `${skillPrefix[0]} ${prompt}`;
// (Skills 2..N are dropped on Claude Code's side. They still apply for codex
// where the dispatcher passes the full natural-language prefix.)
```
Or, more defensively, with all skills joined by space (codex honors natural-language prefix; Claude Code processes only the first slash):
```ts
const finalPrompt = skillPrefix.length === 0
  ? prompt
  : `${skillPrefix.join(" ")} ${prompt}`;
```

**REV-S4 (HIGH): Limit `phase_skills.{phase}` to 1 slash command per phase.** Zod schema:
```ts
export const stageSkillsSchema = z.object({
  planning: z.array(z.string().min(1).max(80)).max(1).default([]),  // was .max(10)
  running:  z.array(z.string().min(1).max(80)).max(1).default([]),
  reviewing:z.array(z.string().min(1).max(80)).max(1).default([]),
  complete: z.array(z.string().min(1).max(80)).max(1).default([]),
});
```
This is the **honest** constraint. UI's PhaseSkillEditor becomes simpler: single-select picker per phase, not multi-select.

**REV-S5 (MEDIUM): Update Plan #11's Patterns to Mirror and Test sections.** The `run-dispatcher-skills.test.ts` assertion changes from "skillPrefix joined with `\n`" to "first skill prepended with space separator". The seed in `apps/desktop/src/main/seed.ts` should default `phase_skills.running` to one skill per phase max.

**REV-S6 (LOW): Renderer UI implication.** D18's WorkspaceStrip phase chip count format `[P:N R:N Rv:N C:N]` becomes `[P:1 R:1 Rv:1 C:1]` (always 0 or 1). Visually unchanged, but the empty-state hint `[No phases configured]` can show when all 4 phases have 0 skills (currently triggers on aggregate count = 0).

### Spike verdict

**Plan #11 ships, with REV-S1 through REV-S6 applied.** The feature delivers real runtime value: when a user picks `/code-review` as their `reviewing` phase skill, hitting "Run reviewing" in the task detail panel will spawn `claude --print "/code-review <task.prompt>"` which the spike confirms activates the skill with the prompt as context.

D20 status: **RESOLVED · UNBLOCKED**.

### Spike-affected GSTACK REVIEW REPORT decisions

Updating prior decisions to match spike outcomes:
- **D2**: still locked (folder-only workspaces, no git clone).
- **D3**: still locked (4 phases, explicit-fire UI), but with REV-S4 reducing each phase's skill array to max length 1.
- **D9**: still locked (invokePhase rejects on live run).
- **D20**: was BLOCKING — now RESOLVED. Plan ships with REV-S1–S6 applied.
- **D13**: still locked (validation reversed; UI filter only). Confirmed correct — no service-layer skill validation needed.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | **CLEAR** (HOLD SCOPE post office-hours) | 23 decisions logged; 0 critical gaps; office-hours trimmed scope to 22 files |
| Outside Voice | (Codex auth failed; Claude subagent) | Cross-model challenge | 1 | issues_found (4 surfaced, all resolved) | TOP: skill-prefix runtime semantics unverified → spike required (D20); migration atomicity → defensive (D22); D13 reversed (drop write-time skill validation) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | **CLEAR** (FULL_REVIEW, 7 findings auto-applied) | 7 findings: single-call-site verified, BEGIN/COMMIT defensive migration, event-replay graceful degradation, cross-WS pill auto-rerender, purge stale identifiers, hand-authored SQL comment, virtualization deferred. 3 test GAPs added (concurrent labels, empty phase_skills, partial-failure rollback). 1 IRON-RULE regression (contract snapshot). 0 critical gaps. |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | **CLEAR** (stable surfaces; phase UX deferred to post-spike mini-review) | score 5/10 → 9/10; 17 decisions auto-applied; 3 mockup variants generated, all flagged as "negative reference" for AI-slop drift; AI slop guardrails table added to plan |
| DX Review | `/plan-devex-review` | Developer experience | 0 | — | optional |

- **CROSS-MODEL:** 4 tensions surfaced by outside voice; all resolved. Strategic disagreement (folder-scope-only vs full feature) preserved D5; D13 reversed; D20 pause added; D22 strengthened.
- **UNRESOLVED:** 0
- **DEFERRED ACTIONS (must apply to plan #11 file before implementation):**
  - ~~**D20 SPIKE (BLOCKING)**~~ → **RESOLVED 2026-05-10.** See "D20 Spike Resolution" section above. Outcome: REV-S1–S6 architectural revisions. Plan ships with `claude --print "{{prompt}}"` invocation, max 1 slash command per phase, space-joined composition.
  - Apply 4 office-hours revisions: D1 keep Workspace name (forward-compat) | D2 drop git clone, kind, git_url, resolved_path, status, error, retryClone | D3 rename stage_skills → phase_skills + invokeStage → invokePhase | D4 add cross-workspace conductor + workspace_id on event payloads.
  - Apply 18 review revisions: D7 freeze task.agent_id (drop agent_id_override column) | D8 extend agent-service.delete with workspace count check | D9 invokePhase rejects on live run | D10 label collision + ws_local delete guards | D11 defensive agent re-seed in migration 0001 | D12 path normalization (~ expand, resolve, strip trailing /) | D14 modal re-render + empty-agents UX | D15 workspace.patch shape (no path) | D16 log enumeration + IPC workspace-switch echo | D17 TODOS.md line 42 + 53 revisions | D18 collapsed WorkspaceStrip, Run buttons only in detail panel | D22 verify migrator atomicity + make ws_local.default_agent_id nullable | D23 drop write-time skill validation (UI filter only) | D24 add new P3 TODO for migration failure recovery UX.
- **DESIGN:** stable-surface specs locked in plan ("Design Specifications" section above) — token mapping per surface, full interaction-state table, user journey, responsive + a11y specs, AI slop guardrails. Phase-specific UX (PhaseSkillEditor visual, per-phase Run buttons in detail panel, expanded WorkspaceStrip phase rows) deferred to a focused mini `/plan-design-review` after the D20 spike.
- **ENG:** architecture + code quality + tests + perf reviewed in FULL_REVIEW mode; 7 findings auto-applied. Single-call-site for `run-dispatcher.start` confirmed. Migration self-defended with explicit BEGIN/COMMIT (ARCH-E2). Event ring buffer gracefully degrades for pre-plan-11 entries (ARCH-E3). Test coverage extended: GAP-E1 (concurrent labels), GAP-E2 (empty phase_skills round-trip), GAP-E3 (migration partial-failure rollback), REGRESSION-E1 (contract snapshot diff inspection — IRON RULE). Worktree parallelization: 2-worktree fan-out after foundation lane lands.
- **D20 SPIKE COMPLETE 2026-05-10** — see "D20 Spike Resolution" section. Plan UNBLOCKED with REV-S1–S6 applied to the rewrite checklist:
  - **REV-S1**: Migration 0001 includes `UPDATE agents` for `claude-code` (set `prompt_via='arg'`, `args=["--print","{{prompt}}"]`) and `codex` (`prompt_via='arg'`, `args=["exec","{{prompt}}"]`).
  - **REV-S2**: `pty-daemon/spawn.ts` arg-mode branch never writes to stdin — already correct in current code.
  - **REV-S3**: Dispatcher `finalPrompt` composition: `skillPrefix.join(" ") + " " + prompt` (space-joined), not `\n`-joined.
  - **REV-S4**: `phase_skills.{phase}` Zod schema: `.max(1)` per phase, not `.max(10)`. UI PhaseSkillEditor is single-select per phase.
  - **REV-S5**: Update `run-dispatcher-skills.test.ts` assertion + seed defaults.
  - **REV-S6**: WorkspaceStrip chip count format `[P:1 R:1 Rv:1 C:1]` (always 0 or 1).
- **PLAN REWRITE COMPLETE 2026-05-10** — all 24 CEO + 17 design + 7 eng + 6 spike-resolution decisions translated into the top sections of this file (Summary through Notes). The Design / Engineering / Spike specifications below remain as the review trail and as a reference for spec details that don't fit cleanly into the Task/Schema/UI/Test structure.
- **VERDICT:** **CEO + DESIGN + ENG + SPIKE + REWRITE CLEARED.** Implementation-ready. Next step: `/prp-implement` against this file. The plan is self-contained and reflects the final shape that will ship.
