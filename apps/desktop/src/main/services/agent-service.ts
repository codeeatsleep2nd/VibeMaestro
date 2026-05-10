import type { Agent } from "@vibemaestro/core";
import { AgentRepository } from "@vibemaestro/db";
import { getDb } from "../db.js";

export type AgentService = ReturnType<typeof createAgentService>;

export function createAgentService() {
  const { db } = getDb();
  const repo = new AgentRepository(db);

  function list(): Agent[] {
    return repo.list();
  }

  function get(id: string): Agent | null {
    return repo.findById(id);
  }

  return { list, get };
}
