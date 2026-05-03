# VibeMaestro — API & Protocol

> **Posture:** local-first, single-user (v1) · **Transport (v1):** Electron IPC + tRPC · **Transport (v2):** HTTP + SSE + WebSocket localhost mirror · **Auth:** no-op in v1, pluggable · **Versioning:** `/api/v1`

This file specifies the contract between the VibeMaestro UI and the local backend that drives agents. It also defines the agent-adapter shape — how a local CLI tool (Claude Code, Codex, …) is plugged in.

If a UI affordance described in `DESIGN.md` doesn't have a corresponding contract here, that's a bug in this file.

---

## 1. Scope & posture

- **Single-user, local.** The backend binds to `127.0.0.1:<port>` and assumes the only client is the local UI on the same machine. There is no remote API and no multi-tenant concern in v1.
- **No authentication in v1.** The auth middleware slot exists and is wired up; it is implemented as a no-op (`allow`). Adding real auth (token, OAuth) is a swap of that one component — no endpoint change. See §3.
- **Stable shape, growing surface.** v1 ships the endpoints below. v2 additions (structured agent events, team mode, remote backend) are listed as TODOs in §11.

## 2. Transport

The resource and event surfaces in §5–§7 are **transport-agnostic**. v1 ships them over Electron IPC; v2 mirrors the same surface over HTTP/SSE/WebSocket.

### v1 (Electron IPC + tRPC)

| Channel | Mechanism | Use |
|---|---|---|
| Request/response | tRPC over `ipcRenderer.invoke` ↔ `ipcMain.handle` (`trpc.invoke`) | All resource queries and mutations (`tasks.*`, `runs.*`, `agents.*`) |
| One-way stream (server → client) | `webContents.send("event:<channel>", payload)` | Activity feed (`event:activity`), per-task event feeds (`event:task.<id>`) |
| Bidirectional terminal | Two paired channels: `ipcMain.on("term:input", …)` and `webContents.send("term:output", bytes)`, plus `ipcRenderer.invoke("term:control", …)` for resize/signal | Per-task interactive terminal — xterm.js attached to PTY |

No localhost HTTP server. No port discovery. No CORS. The renderer reaches main only through the preload `contextBridge`.

### v2 (HTTP/SSE/WebSocket localhost mirror)

When v2 ships an external integration surface for CLI tools, scripts, or MCP servers:

| Channel | Protocol | Use |
|---|---|---|
| Request/response | HTTP/1.1 + JSON | Same routers as v1, exposed via Hono |
| One-way stream | SSE | Same event channels as v1 |
| Bidirectional terminal | WebSocket | Same frame protocol as the IPC binary channel |

Base URL: `http://127.0.0.1:<port>/api/v1`. Port discovery writes to `~/.vibemaestro/port`.

### What this means for clients

- **Renderer (v1):** uses the typed tRPC client over a custom IPC link. All envelope shapes from §5–§8 are preserved.
- **External tools (v2 only):** speak HTTP/SSE/WS to the localhost mirror.

A change to a resource or event in §5–§7 lands in both transports simultaneously by design.

## 3. Authentication (pluggable, no-op in v1)

Every HTTP, SSE, and WebSocket endpoint passes through a single auth middleware:

```
Request → AuthMiddleware → Handler
```

In v1 the middleware is implemented as:

```ts
async function authMiddleware(req): AuthContext {
  return { userId: "local", scopes: ["*"] }; // no-op
}
```

**Constraint for v1 implementations:**
- Endpoints **must** receive an `AuthContext` from the middleware, not read identity from request fields directly. This means switching to real auth is a one-file change.
- Endpoints **must not** read `Authorization`, `Cookie`, or `X-User-*` headers in v1. Identity comes only from `AuthContext`.

**TODOs (tracked in §11) for v2:**
- Per-launch token in `Authorization: Bearer <token>` (token written to a 0600 file at startup).
- OAuth/PAT flow when remote backend ships.
- WebSocket auth via `?token=…` query param or first-frame handshake.

## 4. Conventions

### URLs
- Plural, kebab-case nouns. `/tasks`, `/agents`, `/team-members`.
- Action endpoints use a verb suffix when no clean CRUD mapping exists: `/tasks/:id/run`, `/tasks/:id/approve`.

### JSON
- Field names: `snake_case`.
- IDs: opaque strings. The current format for tasks is a human slug (`VM-218`) and for runs a ULID (`run_01HXY…`). **Clients must treat IDs as opaque** and not parse them.
- Timestamps: ISO 8601 with offset, UTC: `2026-05-03T10:14:22Z`.
- Money / counters: integers (cents, byte counts).
- Enums: lowercase strings. State values: `backlog | running | reviewing | complete | blocked | error`.

### Response envelope

Single resource:
```json
{ "data": { ... } }
```

Collection:
```json
{
  "data": [ ... ],
  "meta": { "total": 142, "page": 1, "per_page": 20, "total_pages": 8 },
  "links": { "self": "...", "next": "...", "prev": "..." }
}
```

Error:
```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [ { "field": "title", "message": "Required", "code": "missing" } ]
  }
}
```

Distinguish by HTTP status code, not by a `success` boolean in the body.

### HTTP status usage

| Code | When |
|---|---|
| 200 | GET, PATCH (returns body) |
| 201 | POST that creates a resource (with `Location` header) |
| 202 | POST that starts an async run (`/tasks/:id/run`) |
| 204 | DELETE, POST action with no body |
| 400 | Malformed JSON, missing required header |
| 404 | Resource not found |
| 409 | State conflict (start a task already running) |
| 422 | Validation failure (well-formed JSON, bad field) |
| 500 | Unexpected error (do not leak internals) |

### Pagination

Offset for v1 (task counts are small for a local single-user tool). Cursor is a v2 TODO if a single user ever crosses ~10K tasks.

```
GET /api/v1/tasks?page=1&per_page=20
```

## 5. Resources

### 5.1 Task

A user request that an agent will execute. The state machine matches the DESIGN.md §1 lifecycle.

#### Schema

```json
{
  "id": "VM-218",
  "title": "Refactor auth middleware to use new session token format",
  "prompt": "Replace bcrypt with argon2id across the user service. Run the test suite after each change.",
  "status": "running",
  "agent_id": "claude-code",
  "current_run_id": "run_01HXY7N3K0ABCDEFG",
  "created_at": "2026-05-03T10:14:22Z",
  "updated_at": "2026-05-03T10:16:36Z",
  "metadata": {}
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Opaque. Currently a slug like `VM-218`. |
| `title` | string | Short label shown on the card. |
| `prompt` | string | Full instruction passed to the agent. |
| `status` | enum | `backlog \| running \| reviewing \| complete \| blocked \| error` |
| `agent_id` | string | FK into `/agents`. |
| `current_run_id` | string \| null | The most recent run for this task. Null if never run. |
| `metadata` | object | Free-form key/value bag. UI must round-trip unknown keys. |

#### State machine

```
            ┌─────────────────────────┐
            │                         │
            ▼                         │
        backlog ──run──▶ running ──exit(0)──▶ reviewing ──approve──▶ complete
            ▲              │   │                  │
            │              │   └── exit(≠0) ────▶ error
            │              │                       │
            │              └── cancel ──▶ blocked ◀┘
            │                              │
            └────────── reject / retry ────┘
```

Transitions are server-enforced. The client never sends `status: "running"` directly; it calls action endpoints.

| Transition | Endpoint |
|---|---|
| `backlog → running` | `POST /tasks/:id/run` |
| `running → reviewing` | server-driven (agent exits 0) |
| `running → error` | server-driven (agent exits non-zero) |
| `running → blocked` | `POST /tasks/:id/cancel` |
| `reviewing → complete` | `POST /tasks/:id/approve` |
| `reviewing → backlog` | `POST /tasks/:id/reject` |
| `error → backlog` | `POST /tasks/:id/retry` (creates a new run) |
| `* → backlog` (destructive) | `POST /tasks/:id/discard-run` |

#### Endpoints

```
GET    /api/v1/tasks
GET    /api/v1/tasks?status=running,reviewing
GET    /api/v1/tasks?agent_id=claude-code
GET    /api/v1/tasks?sort=-updated_at
GET    /api/v1/tasks/:id

POST   /api/v1/tasks                       → 201, Location header
PATCH  /api/v1/tasks/:id                   (title, prompt, agent_id; not status)
DELETE /api/v1/tasks/:id                   → 204; 409 if status != backlog|complete|error

POST   /api/v1/tasks/:id/run               → 202, body { run_id }
POST   /api/v1/tasks/:id/cancel            → 202
POST   /api/v1/tasks/:id/approve           → 200, body { task }
POST   /api/v1/tasks/:id/reject            → 200, body { task, feedback? }
POST   /api/v1/tasks/:id/retry             → 202, body { run_id }
POST   /api/v1/tasks/:id/discard-run       → 202
```

#### Examples

**Create a task** (client → server):
```http
POST /api/v1/tasks
Content-Type: application/json

{
  "title": "Refactor auth middleware",
  "prompt": "Replace bcrypt with argon2id …",
  "agent_id": "claude-code"
}
```
```http
HTTP/1.1 201 Created
Location: /api/v1/tasks/VM-218

{ "data": { "id": "VM-218", "status": "backlog", ... } }
```

**Start the run:**
```http
POST /api/v1/tasks/VM-218/run
```
```http
HTTP/1.1 202 Accepted

{ "data": { "run_id": "run_01HXY7N3K0ABCDEFG" } }
```

**Conflict — already running:**
```http
HTTP/1.1 409 Conflict

{ "error": { "code": "invalid_state", "message": "Task is already running. Cancel before re-running." } }
```

### 5.2 Run

A single agent execution attempt for a task. Tasks have many runs; only one run is current at a time.

#### Schema

```json
{
  "id": "run_01HXY7N3K0ABCDEFG",
  "task_id": "VM-218",
  "agent_id": "claude-code",
  "status": "running",
  "started_at": "2026-05-03T10:14:25Z",
  "ended_at": null,
  "exit_code": null,
  "bytes_emitted": 18234,
  "tool_calls_count": null,
  "transcript_url": "/api/v1/tasks/VM-218/runs/run_01HXY7N3K0ABCDEFG/transcript",
  "diff_url": "/api/v1/tasks/VM-218/runs/run_01HXY7N3K0ABCDEFG/diff"
}
```

| Field | Type | Notes |
|---|---|---|
| `status` | enum | `running \| succeeded \| failed \| cancelled` |
| `bytes_emitted` | integer | Cumulative PTY output size; updated live. |
| `tool_calls_count` | integer \| null | `null` in v1 (no structured event channel). v2 will populate. |
| `transcript_url` | string | Lazy fetch; available after run ends. |
| `diff_url` | string | File changes summary; available after run ends. |

#### Endpoints

```
GET /api/v1/tasks/:task_id/runs
GET /api/v1/tasks/:task_id/runs/:run_id
GET /api/v1/tasks/:task_id/runs/:run_id/transcript    → text/plain (full PTY transcript)
GET /api/v1/tasks/:task_id/runs/:run_id/diff          → application/json (see §5.2.1)
```

#### 5.2.1 Diff schema

```json
{
  "data": {
    "files": [
      {
        "path": "src/auth/session.ts",
        "additions": 24,
        "deletions": 8,
        "patch": "@@ -12,7 +12,7 @@ ..."
      }
    ],
    "totals": { "additions": 186, "deletions": 94, "files_changed": 4 }
  }
}
```

`patch` is unified-diff text. The UI renders it in the Diff tab (DESIGN.md §11 detail panel).

### 5.3 Agent

A configured local CLI tool that VibeMaestro can drive.

#### Schema

```json
{
  "id": "claude-code",
  "label": "Claude Code",
  "monogram": "CC",
  "hue": "oklch(74% 0.13 50)",
  "tier": "v1",
  "command": "claude",
  "args": ["--no-color"],
  "env": { "ANTHROPIC_API_KEY": "$ANTHROPIC_API_KEY" },
  "cwd": null,
  "available": true,
  "version": "1.5.2",
  "registered_at": "2026-05-03T09:00:00Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable identifier. UI maps this to `--agent-<id>` design token. |
| `command` / `args` / `env` / `cwd` | — | How the agent is spawned. Backend resolves env-var refs (`$VAR`) at spawn time. |
| `available` | boolean | Backend probes `command --version` (or equivalent) on registration and on demand. `false` if not on PATH. |
| `version` | string \| null | Captured from probe; informational. |

#### Endpoints

```
GET    /api/v1/agents
GET    /api/v1/agents/:id
POST   /api/v1/agents              → 201, Location header
PATCH  /api/v1/agents/:id
DELETE /api/v1/agents/:id          → 204; 409 if any task references this agent_id
POST   /api/v1/agents/:id/probe    → 200, { available, version }
```

#### Adapter contract (v1)

The minimal contract for "VibeMaestro can drive this agent":

1. The agent runs as a **subprocess in a PTY** spawned with `command + args + env + cwd`.
2. The agent receives the user's prompt **on stdin** (a single write of `prompt + "\n"`), or via an `args`-substituted placeholder (e.g. `args: ["-p", "{{prompt}}"]`) — registration declares which.
3. The agent writes human-readable output to **stdout/stderr** (via the PTY).
4. The agent **exits with code 0** on success, non-zero on failure.

That's it. v1 does not require structured events. v2 will define a JSON-tagged event protocol agents may opt into.

Two registration modes for prompt delivery:

```json
// Mode A: stdin
{ "command": "claude", "args": [], "prompt_via": "stdin" }

// Mode B: arg placeholder
{ "command": "codex", "args": ["-p", "{{prompt}}"], "prompt_via": "arg" }
```

## 6. Streams (SSE)

Two SSE endpoints. Both are read-only and use `text/event-stream`.

### 6.1 `GET /api/v1/activity/stream` — conductor strip feed

Drives the persistent footer (DESIGN.md §10 conductor strip). Emits events whenever a task changes state or a run reports progress.

**Event types:**

| `event:` | Payload |
|---|---|
| `task.state_changed` | `{ "task_id": "VM-218", "from": "backlog", "to": "running", "at": "..." }` |
| `run.started` | `{ "task_id", "run_id", "agent_id", "at" }` |
| `run.progress` | `{ "task_id", "run_id", "elapsed_ms", "bytes_emitted" }` (throttled to 1/s) |
| `run.ended` | `{ "task_id", "run_id", "exit_code", "duration_ms", "outcome": "succeeded\|failed\|cancelled" }` |
| `agent.availability_changed` | `{ "agent_id", "available": true }` |

Every message includes an SSE `id:` (monotonic ULID) so clients can resume with `Last-Event-ID` after disconnect.

**Example wire:**

```
event: run.started
id: 01HXY7N3K0ABCDEFG
data: {"task_id":"VM-218","run_id":"run_01HXY7N3K0","agent_id":"claude-code","at":"2026-05-03T10:14:25Z"}

event: run.progress
id: 01HXY7N3K1ABCDEFH
data: {"task_id":"VM-218","run_id":"run_01HXY7N3K0","elapsed_ms":1340,"bytes_emitted":4096}
```

### 6.2 `GET /api/v1/tasks/:id/events/stream` — per-task feed

Same event types as 6.1, scoped to a single task. Used by the detail panel for the in-panel status indicator and the latest-line preview, without subscribing to the full firehose.

## 7. Terminal (WebSocket)

The one bidirectional surface in v1. Attaches the UI's `xterm.js` instance to the live PTY of a task's current run.

### Endpoint

```
WS /api/v1/tasks/:id/terminal
```

### Frame protocol

| Frame | Direction | Format | Meaning |
|---|---|---|---|
| **Binary** | both | raw PTY bytes (UTF-8) | Output from agent (server→client), keystrokes (client→server) |
| **Text JSON** | both | `{ "type": "...", ... }` | Control messages |

**Control message types:**

| `type` | Direction | Fields | Use |
|---|---|---|---|
| `attached` | server→client | `{ run_id, cols, rows, scrollback_replayed_bytes }` | First frame after connect; confirms attach. |
| `resize` | client→server | `{ cols, rows }` | UI viewport changed. Server updates PTY winsize. |
| `signal` | client→server | `{ sig: "SIGINT" \| "SIGTERM" \| "SIGKILL" }` | Send signal to the agent process. |
| `run_ended` | server→client | `{ exit_code, outcome }` | Agent process exited. Server closes the WS shortly after. |
| `error` | server→client | `{ code, message }` | Server-side issue (e.g., run already ended); client should reconnect or close. |

### Scrollback / reattach

The backend maintains a **per-task scrollback ring** of the last 32 KB (configurable) of PTY output. On WebSocket connect:

1. Server sends `attached` control frame.
2. Server replays the entire scrollback as binary frames.
3. Server then streams live PTY output as it arrives.

Closing the WebSocket does **not** kill the agent. The PTY keeps running, scrollback keeps filling. Reopening the panel reattaches and replays — the user sees the recent context immediately.

### Multi-attach

Multiple WebSocket clients may attach to the same task simultaneously. All receive the same output stream; all keystrokes from any client are forwarded to the PTY. (In v1 single-user, this matters only for "two browser tabs open." In team mode it becomes a real collaboration surface.)

### Closing the run

`POST /tasks/:id/cancel` or `POST /tasks/:id/discard-run` triggers a `SIGTERM` (then `SIGKILL` after 5 s). The WebSocket emits `run_ended` and closes.

## 8. Errors

### Standard codes

| Code | HTTP | When |
|---|---|---|
| `validation_error` | 422 | Request body fails schema. `details` lists per-field issues. |
| `not_found` | 404 | Resource ID unknown. |
| `invalid_state` | 409 | Action not allowed in current state (e.g. approve while running). |
| `conflict` | 409 | Duplicate resource (e.g. registering an agent ID that exists). |
| `agent_unavailable` | 503 | Agent's `command` is not on PATH or probe failed. |
| `rate_limit_exceeded` | 429 | Future use; not enforced in v1 since single-user local. |
| `internal_error` | 500 | Generic. Body **must not** include stack traces or paths. |

### Error envelope rules

- Always JSON, even for 5xx. Never HTML error pages.
- `code` is machine-readable (snake_case), `message` is human-readable.
- `details` is optional; when present, it is an array of `{ field, message, code }` for validation errors, or free-form key/value diagnostics for other classes.
- 5xx responses include a `request_id` field to correlate with server logs.

## 9. Versioning

- v1 lives at `/api/v1`. The plan is to keep it for the foreseeable future; non-breaking changes (new fields, new endpoints) ship in-place.
- Breaking changes ship as `/api/v2`, with v1 deprecated 6 months out via a `Sunset:` header on responses.
- Field-level deprecations: keep the old field, add the new one, mark old in changelog.

## 10. Operational concerns

- **Port selection:** the backend tries `5170` first, falls back to the next free port. The active port is written to `~/.vibemaestro/port` at startup so the UI can find it.
- **Logging:** structured JSON to stderr. One line per request with method, path, status, duration_ms, and request_id. PTY content is **not** logged.
- **Persistence (v1):** SQLite at `~/.vibemaestro/data.sqlite`. Tasks, runs, and agents are durable. PTY scrollback is in-memory only — restarts lose live scrollback but durable run records (and the captured transcript at run-end) are preserved.

## 11. Open TODOs (v2)

| TODO | Note |
|---|---|
| **HTTP/SSE/WebSocket localhost mirror** | External CLI tools, MCP servers, and scripts need to talk to a running VibeMaestro. v2 exposes the same routers via Hono on `127.0.0.1:<port>` with port discovery written to `~/.vibemaestro/port`. SSE replaces IPC event channels; WebSocket replaces the terminal IPC binary channel. Renderer code does not change. |
| **Auth implementation** | Per-launch token in `Authorization: Bearer …`; WebSocket via `?token=…`. Middleware slot already exists; this is a swap. |
| **Structured agent events** | Side-channel JSON event protocol (separate fd or JSON-tagged stdout) so `tool_calls_count`, per-tool-call events, and richer detail-panel content become available. |
| **Team mode resources** | `User`, `Workspace`, `Membership`, `Mention`, presence channel. The `assignee` slot on Task is already reserved in DESIGN.md §6. |
| **Cursor pagination** | Add when any single-user task list crosses ~10K. |
| **Remote backend** | Hosted variant with proper auth, multi-tenant data model, and CORS. Local-only assumptions in v1 (`AuthContext = local`, no rate limiting, etc.) are explicitly called out so they don't leak. |
| **Diff syntax highlighting** | Currently plain mono with semantic colors; revisit when real diffs feel illegible. |
| **Cost / model metadata** | Detail-panel meta strip mentions cost and model. v1 leaves these `null`; v2 collects them either via structured events or an agent self-report endpoint. |

## 12. File map

- `DESIGN.md` — visual system, components, surfaces. UI affordances must trace back to this file.
- `API.md` — this file. Backend contracts the UI relies on.
- `design-tokens.json`, `design-preview.html`, `assets/logo.svg` — design implementation artifacts.

When a UI surface in DESIGN.md changes its data needs, update API.md in the same change.
