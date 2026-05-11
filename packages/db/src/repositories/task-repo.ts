import type { PhaseSkillsOverride, Task, TaskStatus } from "@vibemaestro/core";
import { and, count, desc, eq } from "drizzle-orm";
import type { DbClient } from "../client.js";
import { taskSequence, tasks } from "../schema.js";

export type TaskFilters = {
  status?: TaskStatus;
  agent_id?: string;
  workspace_id?: string;
  page: number;
  per_page: number;
  sort: "created_at_desc" | "updated_at_desc";
};

export class TaskRepository {
  constructor(private readonly db: DbClient) {}

  /**
   * Allocate the next task slug atomically. Always call inside a transaction so
   * a concurrent insert can't observe a stale `next_value`.
   */
  allocateNextSlug(): string {
    const row = this.db.select().from(taskSequence).where(eq(taskSequence.id, 1)).get();
    if (!row) {
      throw new Error("task_sequence row missing — migrations did not seed correctly");
    }
    const n = row.next_value;
    this.db
      .update(taskSequence)
      .set({ next_value: n + 1 })
      .where(eq(taskSequence.id, 1))
      .run();
    return `VM-${n.toString().padStart(3, "0")}`;
  }

  insert(task: Task): void {
    this.db
      .insert(tasks)
      .values({
        id: task.id,
        title: task.title,
        prompt: task.prompt,
        status: task.status,
        agent_id: task.agent_id,
        workspace_id: task.workspace_id,
        current_run_id: task.current_run_id,
        phase_skills_override: task.phase_skills_override,
        created_at: task.created_at,
        updated_at: task.updated_at,
        metadata: task.metadata,
      })
      .run();
  }

  findById(id: string): Task | null {
    const row = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    return row ? rowToTask(row) : null;
  }

  list(filters: TaskFilters): { items: Task[]; total: number } {
    const conditions = [];
    if (filters.status) conditions.push(eq(tasks.status, filters.status));
    if (filters.agent_id) conditions.push(eq(tasks.agent_id, filters.agent_id));
    if (filters.workspace_id) conditions.push(eq(tasks.workspace_id, filters.workspace_id));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn =
      filters.sort === "created_at_desc" ? desc(tasks.created_at) : desc(tasks.updated_at);

    const offset = (filters.page - 1) * filters.per_page;
    const items = this.db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(sortColumn)
      .limit(filters.per_page)
      .offset(offset)
      .all();

    const totalRow = this.db.select({ n: count() }).from(tasks).where(where).get();

    return {
      items: items.map(rowToTask),
      total: totalRow?.n ?? 0,
    };
  }

  updateStatus(id: string, status: TaskStatus, currentRunId: string | null, at: string): void {
    this.db
      .update(tasks)
      .set({ status, current_run_id: currentRunId, updated_at: at })
      .where(eq(tasks.id, id))
      .run();
  }

  patch(
    id: string,
    fields: Partial<
      Pick<Task, "title" | "prompt" | "agent_id" | "metadata" | "phase_skills_override">
    >,
    at: string,
  ): void {
    // D15: workspace_id is NOT patchable here. Tasks can't move workspaces in v1.
    this.db
      .update(tasks)
      .set({ ...fields, updated_at: at })
      .where(eq(tasks.id, id))
      .run();
  }

  delete(id: string): void {
    this.db.delete(tasks).where(eq(tasks.id, id)).run();
  }

  countAll(): number {
    const row = this.db.select({ n: count() }).from(tasks).get();
    return row?.n ?? 0;
  }
}

type DbTaskRow = typeof tasks.$inferSelect;

function rowToTask(row: DbTaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    status: row.status as TaskStatus,
    agent_id: row.agent_id,
    workspace_id: row.workspace_id,
    current_run_id: row.current_run_id,
    phase_skills_override: (row.phase_skills_override as PhaseSkillsOverride) ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}
