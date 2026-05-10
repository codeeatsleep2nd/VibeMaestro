import { AppError, transition } from "@vibemaestro/core";
import { RunRepository, TaskRepository } from "@vibemaestro/db";
import { getDb } from "../db.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ module: "run-service-internal" });

/**
 * Internal-only service used by `run-dispatcher`. NOT exposed via tRPC. The
 * boundary keeps "I'm the PTY supervisor reporting back" calls separate from
 * "the user clicked approve" calls — even though both eventually mutate the
 * same row, they have different invariants.
 */
export type RunServiceInternal = ReturnType<typeof createRunServiceInternal>;

export function createRunServiceInternal() {
  const { db } = getDb();
  const taskRepo = new TaskRepository(db);
  const runRepo = new RunRepository(db);

  /**
   * Called once per run when the PTY exits.
   *   outcome=succeeded → task: running → reviewing
   *   outcome=failed    → task: running → error
   *   outcome=cancelled → task is already in `blocked` because the user issued
   *                       cancel BEFORE the PTY exited; just close out the run
   *                       row without re-transitioning.
   */
  function markFinished(
    runId: string,
    fields: {
      outcome: "succeeded" | "failed" | "cancelled";
      exit_code: number | null;
      bytes_emitted: number;
    },
  ): void {
    db.transaction(() => {
      const run = runRepo.findById(runId);
      if (!run) {
        log.warn({ run_id: runId }, "markFinished: run not found");
        return;
      }
      if (run.status !== "running") {
        log.warn({ run_id: runId, status: run.status }, "markFinished: run already terminal");
        return;
      }

      const at = new Date().toISOString();
      runRepo.markFinished(runId, {
        status: fields.outcome,
        exit_code: fields.exit_code,
        bytes_emitted: fields.bytes_emitted,
        ended_at: at,
      });

      const task = taskRepo.findById(run.task_id);
      if (!task) {
        log.warn({ run_id: runId, task_id: run.task_id }, "markFinished: task missing");
        return;
      }

      if (fields.outcome === "cancelled") {
        // taskService.cancel already moved task to `blocked`; nothing to do.
        return;
      }

      // Only transition if the task hasn't already moved on (e.g. user
      // discarded the run mid-flight).
      if (task.status !== "running") {
        log.info(
          { run_id: runId, task_status: task.status },
          "markFinished: task already moved on, skipping transition",
        );
        return;
      }

      const via = fields.outcome === "succeeded" ? "agent_exit_0" : "agent_fail";
      const next = transition(task.status, via);
      taskRepo.updateStatus(task.id, next, task.current_run_id, at);
    });
  }

  /**
   * Throttled byte-count update. Called from `byteThrottle` inside the
   * dispatcher every 250 ms (or on a 4 KB threshold) — never per-PTY-chunk.
   * Bypasses the repo's `markFinished` so we don't accidentally write a
   * `null` ended_at field — direct UPDATE here is intentional.
   */
  function incrementBytes(runId: string, additional: number): void {
    if (additional <= 0) return;
    runRepo.incrementBytes(runId, additional);
  }

  function requireRun(runId: string) {
    const run = runRepo.findById(runId);
    if (!run) throw new AppError("not_found", `Run "${runId}" not found`);
    return run;
  }

  return { markFinished, incrementBytes, requireRun };
}
