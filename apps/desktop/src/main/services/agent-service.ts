import { type Agent, AppError } from "@vibemaestro/core";
import { AgentRepository, TaskRepository } from "@vibemaestro/db";
import { probeAgent } from "@vibemaestro/pty-daemon";
import { getDb } from "../db.js";
import { childLogger } from "../lib/logger.js";
import { resolveShellPath } from "../lib/path-helper.js";

const log = childLogger({ module: "agent-service" });

export type AgentService = ReturnType<typeof createAgentService>;

export function createAgentService() {
  const { db } = getDb();
  const repo = new AgentRepository(db);
  const taskRepo = new TaskRepository(db);

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
    repo.markProbed(id, result.available, result.version);
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
    const refs = taskRepo.list({ agent_id: id, page: 1, per_page: 1, sort: "updated_at_desc" });
    if (refs.total > 0) {
      throw new AppError(
        "conflict",
        `Cannot delete agent "${id}" — ${refs.total} task(s) reference it`,
        { task_count: refs.total },
      );
    }
    repo.delete(id);
  }

  return { list, get, require: require_, probe, probeAll, delete: deleteOne };
}
