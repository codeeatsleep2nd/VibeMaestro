import type { Agent } from "@vibemaestro/core";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client.js";
import { agents } from "../schema.js";

export class AgentRepository {
  constructor(private readonly db: DbClient) {}

  insert(agent: Agent): void {
    this.db
      .insert(agents)
      .values({
        id: agent.id,
        label: agent.label,
        monogram: agent.monogram,
        hue: agent.hue,
        tier: agent.tier,
        command: agent.command,
        args: agent.args,
        env: agent.env,
        cwd: agent.cwd,
        prompt_via: agent.prompt_via,
        available: agent.available,
        version: agent.version,
        registered_at: agent.registered_at,
      })
      .run();
  }

  upsert(agent: Agent): void {
    const existing = this.findById(agent.id);
    if (existing) {
      this.db
        .update(agents)
        .set({
          label: agent.label,
          monogram: agent.monogram,
          hue: agent.hue,
          tier: agent.tier,
          command: agent.command,
          args: agent.args,
          env: agent.env,
          cwd: agent.cwd,
          prompt_via: agent.prompt_via,
          available: agent.available,
          version: agent.version,
        })
        .where(eq(agents.id, agent.id))
        .run();
      return;
    }
    this.insert(agent);
  }

  findById(id: string): Agent | null {
    const row = this.db.select().from(agents).where(eq(agents.id, id)).get();
    return row ? rowToAgent(row) : null;
  }

  list(): Agent[] {
    return this.db.select().from(agents).all().map(rowToAgent);
  }

  markProbed(id: string, available: boolean, version: string | null): void {
    this.db.update(agents).set({ available, version }).where(eq(agents.id, id)).run();
  }

  delete(id: string): void {
    this.db.delete(agents).where(eq(agents.id, id)).run();
  }
}

type DbAgentRow = typeof agents.$inferSelect;

function rowToAgent(row: DbAgentRow): Agent {
  return {
    id: row.id,
    label: row.label,
    monogram: row.monogram,
    hue: row.hue,
    tier: row.tier as Agent["tier"],
    command: row.command,
    args: (row.args as string[]) ?? [],
    env: (row.env as Record<string, string>) ?? {},
    cwd: row.cwd,
    prompt_via: row.prompt_via as Agent["prompt_via"],
    available: row.available,
    version: row.version,
    registered_at: row.registered_at,
  };
}
