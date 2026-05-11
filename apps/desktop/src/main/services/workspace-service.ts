import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  AppError,
  DEFAULT_WORKSPACE_ID,
  emptyPhaseSkills,
  newWorkspaceId,
  type Workspace,
  type WorkspaceCreateInput,
  type WorkspacePatchInput,
} from "@vibemaestro/core";
import { AgentRepository, TaskRepository, WorkspaceRepository } from "@vibemaestro/db";
import { getDb } from "../db.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ module: "workspace-service" });

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;

/** D12: normalize ~expand, resolve to absolute, strip trailing slash. */
export function normalizeWorkspacePath(input: string): string {
  let p = input.trim();
  if (p === "" || p === "~") return homedir();
  if (p.startsWith("~/")) p = path.join(homedir(), p.slice(2));
  p = path.resolve(p);
  // Strip trailing slash (path.resolve already does this on macOS/Linux but be explicit).
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function isSqliteUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("UNIQUE constraint failed: workspaces.label");
}

export function createWorkspaceService() {
  const { db } = getDb();
  const repo = new WorkspaceRepository(db);
  const taskRepo = new TaskRepository(db);
  const agentRepo = new AgentRepository(db);

  function nowIso(): string {
    return new Date().toISOString();
  }

  /**
   * Lazy-fill for ws_local: migration seeds `path=''` and `default_agent_id=NULL`
   * because migrations must be deterministic across machines. The first read after
   * migration backfills with `os.homedir()` and the first available v1 agent.
   */
  function hydrateLocalIfNeeded(ws: Workspace): Workspace {
    if (ws.id !== DEFAULT_WORKSPACE_ID) return ws;
    if (ws.path !== "" && ws.default_agent_id !== "") return ws;
    const fallbackPath = ws.path === "" ? homedir() : ws.path;
    const fallbackAgent =
      ws.default_agent_id === ""
        ? (agentRepo.list().find((a) => a.tier === "v1")?.id ?? "")
        : ws.default_agent_id;
    if (!fallbackAgent) {
      log.warn({ workspace_id: ws.id }, "ws_local lazy-fill: no v1 agent available");
      // Return the original; the next read after agent seeding will retry.
      return { ...ws, path: fallbackPath };
    }
    const at = nowIso();
    repo.hydrateLocalDefaults(ws.id, fallbackPath, fallbackAgent, at);
    log.info(
      { workspace_id: ws.id, path: fallbackPath, default_agent_id: fallbackAgent },
      "ws_local lazy-fill applied",
    );
    return { ...ws, path: fallbackPath, default_agent_id: fallbackAgent, updated_at: at };
  }

  function get(id: string): Workspace | null {
    const ws = repo.findById(id);
    return ws ? hydrateLocalIfNeeded(ws) : null;
  }

  function require_(id: string): Workspace {
    const ws = get(id);
    if (!ws) throw new AppError("not_found", `Workspace "${id}" not found`);
    return ws;
  }

  function list(): Workspace[] {
    return repo.list().map(hydrateLocalIfNeeded);
  }

  function create(input: WorkspaceCreateInput): Workspace {
    // D7 sequencing: validate the default agent exists before normalizing or inserting.
    const agent = agentRepo.findById(input.default_agent_id);
    if (!agent) {
      throw new AppError("not_found", `Agent "${input.default_agent_id}" not found`);
    }

    // D12: path normalization at the boundary.
    const normalized = normalizeWorkspacePath(input.path);
    if (!existsSync(normalized)) {
      throw new AppError("validation_error", `Path "${normalized}" does not exist`);
    }
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(normalized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError("validation_error", `Cannot read path "${normalized}": ${msg}`);
    }
    if (!stat.isDirectory()) {
      throw new AppError("validation_error", `Path "${normalized}" is not a directory`);
    }

    const id = newWorkspaceId();
    const at = nowIso();
    const ws: Workspace = {
      id,
      label: input.label,
      path: normalized,
      default_agent_id: input.default_agent_id,
      phase_skills: input.phase_skills ?? emptyPhaseSkills(),
      created_at: at,
      updated_at: at,
    };
    try {
      repo.insert(ws);
    } catch (err) {
      if (isSqliteUniqueViolation(err)) {
        // D10: friendly label conflict (not internal_error).
        throw new AppError("conflict", `Workspace label "${input.label}" is taken`);
      }
      throw err;
    }
    log.info(
      { workspace_id: id, path: normalized, default_agent_id: input.default_agent_id },
      "workspace created",
    );
    return ws;
  }

  function patch(input: WorkspacePatchInput): Workspace {
    const existing = require_(input.id);
    if (input.default_agent_id && input.default_agent_id !== existing.default_agent_id) {
      const agent = agentRepo.findById(input.default_agent_id);
      if (!agent) {
        throw new AppError("not_found", `Agent "${input.default_agent_id}" not found`);
      }
    }
    const at = nowIso();
    const fields: Partial<Pick<Workspace, "label" | "default_agent_id" | "phase_skills">> = {};
    if (input.label !== undefined) fields.label = input.label;
    if (input.default_agent_id !== undefined) fields.default_agent_id = input.default_agent_id;
    if (input.phase_skills !== undefined) fields.phase_skills = input.phase_skills;

    try {
      repo.patch(input.id, fields, at);
    } catch (err) {
      if (isSqliteUniqueViolation(err)) {
        throw new AppError("conflict", `Workspace label "${input.label}" is taken`);
      }
      throw err;
    }
    log.info({ workspace_id: input.id, fields: Object.keys(fields) }, "workspace patched");
    return require_(input.id);
  }

  function deleteOne(id: string): void {
    if (id === DEFAULT_WORKSPACE_ID) {
      // D10: ws_local is irreplaceable.
      throw new AppError("conflict", "Cannot delete the default workspace");
    }
    const refs = taskRepo.list({
      workspace_id: id,
      page: 1,
      per_page: 1,
      sort: "updated_at_desc",
    });
    if (refs.total > 0) {
      throw new AppError(
        "conflict",
        `Cannot delete workspace "${id}" — ${refs.total} task(s) reference it`,
        { task_count: refs.total },
      );
    }
    // The require_ guard ensures we surface a friendly not_found for non-existent rows.
    require_(id);
    repo.delete(id);
    log.info({ workspace_id: id }, "workspace deleted");
  }

  return {
    create,
    get,
    require: require_,
    list,
    patch,
    delete: deleteOne,
  };
}
