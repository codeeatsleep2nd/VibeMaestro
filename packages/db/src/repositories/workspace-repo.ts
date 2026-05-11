import type { PhaseSkills, Workspace } from "@vibemaestro/core";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client.js";
import { workspaces } from "../schema.js";

const EMPTY_PHASE_SKILLS: PhaseSkills = {
  planning: [],
  running: [],
  reviewing: [],
  complete: [],
};

export class WorkspaceRepository {
  constructor(private readonly db: DbClient) {}

  insert(ws: Workspace): void {
    this.db
      .insert(workspaces)
      .values({
        id: ws.id,
        label: ws.label,
        path: ws.path,
        default_agent_id: ws.default_agent_id,
        phase_skills: ws.phase_skills,
        created_at: ws.created_at,
        updated_at: ws.updated_at,
      })
      .run();
  }

  findById(id: string): Workspace | null {
    const row = this.db.select().from(workspaces).where(eq(workspaces.id, id)).get();
    return row ? rowToWorkspace(row) : null;
  }

  list(): Workspace[] {
    return this.db.select().from(workspaces).all().map(rowToWorkspace);
  }

  patch(
    id: string,
    fields: Partial<Pick<Workspace, "label" | "default_agent_id" | "phase_skills">>,
    at: string,
  ): void {
    this.db
      .update(workspaces)
      .set({ ...fields, updated_at: at })
      .where(eq(workspaces.id, id))
      .run();
  }

  /** Lazy-fill for `ws_local`: migration seeds path='' and default_agent_id=NULL. */
  hydrateLocalDefaults(id: string, path: string, defaultAgentId: string, at: string): void {
    this.db
      .update(workspaces)
      .set({ path, default_agent_id: defaultAgentId, updated_at: at })
      .where(eq(workspaces.id, id))
      .run();
  }

  delete(id: string): void {
    this.db.delete(workspaces).where(eq(workspaces.id, id)).run();
  }
}

type DbWorkspaceRow = typeof workspaces.$inferSelect;

function rowToWorkspace(row: DbWorkspaceRow): Workspace {
  return {
    id: row.id,
    label: row.label,
    path: row.path,
    // Service layer is responsible for lazy-filling NULL → agent id; if a consumer
    // reads through here while the lazy-fill hasn't run yet, surface empty string.
    default_agent_id: row.default_agent_id ?? "",
    phase_skills: (row.phase_skills as PhaseSkills) ?? EMPTY_PHASE_SKILLS,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
