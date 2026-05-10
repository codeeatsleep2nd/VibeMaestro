import type { Run, RunStatus } from "@vibemaestro/core";
import { desc, eq, sql } from "drizzle-orm";
import type { DbClient } from "../client.js";
import { runs } from "../schema.js";

export class RunRepository {
  constructor(private readonly db: DbClient) {}

  insert(run: Run): void {
    this.db
      .insert(runs)
      .values({
        id: run.id,
        task_id: run.task_id,
        agent_id: run.agent_id,
        status: run.status,
        started_at: run.started_at,
        ended_at: run.ended_at,
        exit_code: run.exit_code,
        bytes_emitted: run.bytes_emitted,
        tool_calls_count: run.tool_calls_count,
      })
      .run();
  }

  findById(id: string): Run | null {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    return row ? rowToRun(row) : null;
  }

  listByTask(taskId: string): Run[] {
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.task_id, taskId))
      .orderBy(desc(runs.started_at))
      .all()
      .map(rowToRun);
  }

  markFinished(
    id: string,
    fields: {
      status: RunStatus;
      exit_code: number | null;
      bytes_emitted: number;
      ended_at: string;
    },
  ): void {
    this.db
      .update(runs)
      .set({
        status: fields.status,
        exit_code: fields.exit_code,
        bytes_emitted: fields.bytes_emitted,
        ended_at: fields.ended_at,
      })
      .where(eq(runs.id, id))
      .run();
  }

  /**
   * Atomic increment for the throttled byte counter. Avoids a read-modify-write
   * race when the dispatcher's flush coincides with another writer.
   */
  incrementBytes(id: string, by: number): void {
    if (by <= 0) return;
    this.db
      .update(runs)
      .set({ bytes_emitted: sql`${runs.bytes_emitted} + ${by}` })
      .where(eq(runs.id, id))
      .run();
  }
}

type DbRunRow = typeof runs.$inferSelect;

function rowToRun(row: DbRunRow): Run {
  return {
    id: row.id,
    task_id: row.task_id,
    agent_id: row.agent_id,
    status: row.status as RunStatus,
    started_at: row.started_at,
    ended_at: row.ended_at,
    exit_code: row.exit_code,
    bytes_emitted: row.bytes_emitted,
    tool_calls_count: row.tool_calls_count,
  };
}
