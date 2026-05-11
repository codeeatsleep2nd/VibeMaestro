import { type Agent, AppError, type SkillDefinition } from "@vibemaestro/core";
import { AgentRepository, TaskRepository, WorkspaceRepository } from "@vibemaestro/db";
import { probeAgent } from "@vibemaestro/pty-daemon";
import { getDb } from "../db.js";
import { bus } from "../lib/event-bus.js";
import { childLogger } from "../lib/logger.js";
import { resolveShellPath } from "../lib/path-helper.js";

const log = childLogger({ module: "agent-service" });

export type AgentService = ReturnType<typeof createAgentService>;

export function createAgentService() {
  const { db } = getDb();
  const repo = new AgentRepository(db);
  const taskRepo = new TaskRepository(db);
  const workspaceRepo = new WorkspaceRepository(db);

  function list(): Agent[] {
    return repo.list();
  }

  function get(id: string): Agent | null {
    return repo.findById(id);
  }

  function require_(id: string): Agent {
    const agent = repo.findById(id);
    if (!agent) throw new AppError("not_found", `Agent "${id}" not found`);
    return agent;
  }

  /** Admin/dev helper. UI surface is seed-only in v1 (no Settings page). */
  function registerSkills(id: string, skills: SkillDefinition[]): Agent {
    require_(id);
    repo.setSkills(id, skills);
    log.info({ agent_id: id, skill_count: skills.length }, "agent skills registered");
    return require_(id);
  }

  /**
   * Probe the agent's CLI to figure out whether it's installed and which
   * version. Persists the result so the renderer's empty-state can show
   * "no agents conducting · install claude…" without a roundtrip per query.
   */
  async function probe(id: string): Promise<Agent> {
    const agent = require_(id);
    const path = await resolveShellPath();
    const result = await probeAgent(agent, { ...process.env, PATH: path });
    log.info(
      { agent_id: id, available: result.available, version: result.version, error: result.error },
      "probe complete",
    );
    const previous = agent.available;
    repo.markProbed(id, result.available, result.version);
    if (previous !== result.available) {
      bus.emit({
        type: "agent.availability_changed",
        agent_id: id,
        available: result.available,
      });
    }
    return require_(id);
  }

  /**
   * Probe every registered agent in parallel. Useful at app startup so the
   * board's "agent available" state is correct without forcing the user to
   * trigger probes manually.
   */
  async function probeAll(): Promise<Agent[]> {
    const all = list();
    await Promise.all(all.map((a) => probe(a.id).catch(() => undefined)));
    return list();
  }

  function deleteOne(id: string): void {
    const refsTasks = taskRepo.list({
      agent_id: id,
      page: 1,
      per_page: 1,
      sort: "updated_at_desc",
    });
    // D8: extend the delete guard to also count workspaces that pin this agent as their default.
    const refsWorkspaces = workspaceRepo.list().filter((w) => w.default_agent_id === id);
    if (refsTasks.total > 0 || refsWorkspaces.length > 0) {
      throw new AppError(
        "conflict",
        `Cannot delete agent "${id}" — ${refsTasks.total} task(s) and ${refsWorkspaces.length} workspace(s) reference it`,
        { task_count: refsTasks.total, workspace_count: refsWorkspaces.length },
      );
    }
    repo.delete(id);
    log.info({ agent_id: id }, "agent deleted");
  }

  return { list, get, require: require_, probe, probeAll, registerSkills, delete: deleteOne };
}
