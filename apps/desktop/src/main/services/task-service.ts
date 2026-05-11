import {
  AppError,
  newRunId,
  type Phase,
  resolvePhaseSkills,
  type Task,
  type TaskCreateInput,
  transition,
} from "@vibemaestro/core";
import {
  AgentRepository,
  RunRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@vibemaestro/db";
import { getDb } from "../db.js";
import { bus } from "../lib/event-bus.js";
import { childLogger } from "../lib/logger.js";
import { runDispatcher } from "./run-dispatcher.js";
import { createWorkspaceService } from "./workspace-service.js";

const log = childLogger({ module: "task-service" });

export type TaskService = ReturnType<typeof createTaskService>;

export function createTaskService() {
  const { db } = getDb();
  const taskRepo = new TaskRepository(db);
  const runRepo = new RunRepository(db);
  const agentRepo = new AgentRepository(db);
  const workspaceRepo = new WorkspaceRepository(db);

  function nowIso(): string {
    return new Date().toISOString();
  }

  function create(input: TaskCreateInput): Task {
    // Workspace exists check (also lazy-fills ws_local if first read).
    const workspace = createWorkspaceService().require(input.workspace_id);

    // D7: freeze agent_id at task creation. If input.agent_id is provided, use it;
    // otherwise default to the workspace's default. Subsequent changes to the
    // workspace's default_agent_id do NOT retroactively rewrite this task.
    const effectiveAgentId = input.agent_id ?? workspace.default_agent_id;
    const agent = agentRepo.findById(effectiveAgentId);
    if (!agent) {
      throw new AppError("not_found", `Agent "${effectiveAgentId}" not found`);
    }

    const at = nowIso();
    return db.transaction(() => {
      const id = taskRepo.allocateNextSlug();
      const task: Task = {
        id,
        title: input.title,
        prompt: input.prompt,
        status: "backlog",
        agent_id: effectiveAgentId,
        workspace_id: workspace.id,
        current_run_id: null,
        phase_skills_override: input.phase_skills_override ?? null,
        created_at: at,
        updated_at: at,
        metadata: input.metadata ?? {},
      };
      taskRepo.insert(task);
      log.info(
        { task_id: id, workspace_id: workspace.id, agent_id: effectiveAgentId },
        "task created",
      );
      return task;
    });
  }

  function get(id: string): Task {
    const task = taskRepo.findById(id);
    if (!task) throw new AppError("not_found", `Task "${id}" not found`);
    return task;
  }

  function list(filters: {
    status?: Task["status"];
    agent_id?: string;
    page: number;
    per_page: number;
    sort: "created_at_desc" | "updated_at_desc";
  }) {
    return taskRepo.list(filters);
  }

  /**
   * Run lifecycle:
   *   1. Inside transaction: transition task `backlog → running`, create run row.
   *   2. After transaction commits: ask the dispatcher to spawn the PTY.
   *
   * The spawn happens OUTSIDE the transaction because (a) `pty.spawn` can take
   * tens of ms (b) holding the SQLite write lock during a process spawn is a
   * footgun, and (c) plan #4 will replace the direct call here with an event
   * subscription — keeping it post-commit makes that swap a one-line change.
   */
  function run(id: string): { task: Task; run_id: string } {
    const result = db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const workspace = workspaceRepo.findById(task.workspace_id);
      if (!workspace) {
        // FK should prevent this; defensive.
        throw new AppError("not_found", `Workspace "${task.workspace_id}" not found`);
      }
      const fromStatus = task.status;
      const newStatus = transition(fromStatus, "run");
      const at = nowIso();
      const runId = newRunId();
      runRepo.insert({
        id: runId,
        task_id: id,
        agent_id: task.agent_id,
        status: "running",
        started_at: at,
        ended_at: null,
        exit_code: null,
        bytes_emitted: 0,
        tool_calls_count: null,
      });
      taskRepo.updateStatus(id, newStatus, runId, at);

      // Resolve the effective `running` phase skills (max 1 per REV-S4).
      const effective = resolvePhaseSkills(workspace, task);
      return {
        task: { ...task, status: newStatus, current_run_id: runId, updated_at: at },
        run_id: runId,
        prompt: task.prompt,
        agent_id: task.agent_id,
        cwd: workspace.path,
        skillPrefix: effective.running,
        workspace_id: workspace.id,
        from: fromStatus,
        at,
      };
    });

    bus.emit({
      type: "task.state_changed",
      task_id: id,
      workspace_id: result.workspace_id,
      from: result.from,
      to: result.task.status,
      at: result.at,
    });

    // Fire-and-forget — the dispatcher's onExit handler is responsible for
    // markFinished on success/failure. If `start` itself rejects (e.g.,
    // agent_unavailable), we move the task back to `error` so the user sees it.
    runDispatcher
      .start(result.run_id, {
        prompt: result.prompt,
        agentId: result.agent_id,
        cwd: result.cwd,
        skillPrefix: result.skillPrefix,
      })
      .catch((err) => {
        log.error(
          {
            run_id: result.run_id,
            task_id: id,
            err: err instanceof Error ? err.message : String(err),
          },
          "dispatcher.start rejected — marking run failed",
        );
        try {
          db.transaction(() => {
            const at = nowIso();
            runRepo.markFinished(result.run_id, {
              status: "failed",
              exit_code: null,
              bytes_emitted: 0,
              ended_at: at,
            });
            const task = taskRepo.findById(id);
            if (task && task.status === "running") {
              taskRepo.updateStatus(id, "error", task.current_run_id, at);
            }
          });
        } catch (rollbackErr) {
          log.error(
            { err: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr) },
            "rollback after dispatcher.start failure threw",
          );
        }
      });

    return { task: result.task, run_id: result.run_id };
  }

  /**
   * D9: invoke a phase recipe (planning/reviewing/complete) as a fresh run without
   * mutating task.status. Rejected if a run is already live for this task.
   * The `running` phase is reserved for `tasks.run` (which also performs the state
   * transition); invokePhase('running') is allowed and behaves like a "rerun" but
   * still without a state transition.
   */
  function invokePhase(id: string, phase: Phase): { task: Task; run_id: string } {
    const task = taskRepo.findById(id);
    if (!task) throw new AppError("not_found", `Task "${id}" not found`);

    // Concurrency guard (D9): one live PTY per task.
    if (task.current_run_id && runDispatcher.isRunning(task.current_run_id)) {
      throw new AppError(
        "invalid_state",
        `Task has a live run "${task.current_run_id}"; cancel or wait for it to finish.`,
        { current_run_id: task.current_run_id },
      );
    }

    const workspace = workspaceRepo.findById(task.workspace_id);
    if (!workspace) {
      throw new AppError("not_found", `Workspace "${task.workspace_id}" not found`);
    }

    const result = db.transaction(() => {
      const at = nowIso();
      const runId = newRunId();
      runRepo.insert({
        id: runId,
        task_id: id,
        agent_id: task.agent_id,
        status: "running",
        started_at: at,
        ended_at: null,
        exit_code: null,
        bytes_emitted: 0,
        tool_calls_count: null,
      });
      // No state transition — task.status stays put. current_run_id points at the
      // new ad-hoc run for conductor strip visibility.
      taskRepo.updateStatus(id, task.status, runId, at);
      const effective = resolvePhaseSkills(workspace, task);
      return {
        task: { ...task, current_run_id: runId, updated_at: at },
        run_id: runId,
        skillPrefix: effective[phase],
        prompt: task.prompt,
        agent_id: task.agent_id,
        cwd: workspace.path,
        workspace_id: workspace.id,
        at,
      };
    });

    log.info(
      {
        task_id: id,
        run_id: result.run_id,
        phase,
        skills: result.skillPrefix,
        workspace_id: result.workspace_id,
      },
      "phase invoked",
    );

    runDispatcher
      .start(result.run_id, {
        prompt: result.prompt,
        agentId: result.agent_id,
        cwd: result.cwd,
        skillPrefix: result.skillPrefix,
      })
      .catch((err) => {
        log.error(
          {
            run_id: result.run_id,
            task_id: id,
            phase,
            err: err instanceof Error ? err.message : String(err),
          },
          "dispatcher.start rejected during invokePhase — marking run failed",
        );
        try {
          db.transaction(() => {
            const at = nowIso();
            runRepo.markFinished(result.run_id, {
              status: "failed",
              exit_code: null,
              bytes_emitted: 0,
              ended_at: at,
            });
            // Clear current_run_id back to whatever it was before, or null if no prior.
            // Task.status was never changed; keep it.
            taskRepo.updateStatus(id, task.status, task.current_run_id, at);
          });
        } catch (rollbackErr) {
          log.error(
            { err: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr) },
            "rollback after invokePhase dispatcher failure threw",
          );
        }
      });

    return { task: result.task, run_id: result.run_id };
  }

  function approve(id: string): Task {
    const updated = db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const newStatus = transition(task.status, "approve");
      const at = nowIso();
      taskRepo.updateStatus(id, newStatus, task.current_run_id, at);
      return {
        from: task.status,
        task: { ...task, status: newStatus, updated_at: at },
        workspace_id: task.workspace_id,
        at,
      };
    });
    bus.emit({
      type: "task.state_changed",
      task_id: id,
      workspace_id: updated.workspace_id,
      from: updated.from,
      to: updated.task.status,
      at: updated.at,
    });
    return updated.task;
  }

  function reject(id: string): Task {
    const updated = db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const newStatus = transition(task.status, "reject");
      const at = nowIso();
      taskRepo.updateStatus(id, newStatus, task.current_run_id, at);
      return {
        from: task.status,
        task: { ...task, status: newStatus, updated_at: at },
        workspace_id: task.workspace_id,
        at,
      };
    });
    bus.emit({
      type: "task.state_changed",
      task_id: id,
      workspace_id: updated.workspace_id,
      from: updated.from,
      to: updated.task.status,
      at: updated.at,
    });
    return updated.task;
  }

  /**
   * Cancel transitions the task to `blocked` synchronously, then asks the
   * dispatcher to send SIGTERM (with a 2s SIGKILL fallback). The dispatcher's
   * exit handler will close the run row with `cancelled` outcome.
   */
  function cancel(id: string): Task {
    const result = db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const newStatus = transition(task.status, "cancel");
      const at = nowIso();
      taskRepo.updateStatus(id, newStatus, task.current_run_id, at);
      return {
        from: task.status,
        task: { ...task, status: newStatus, updated_at: at },
        run_id: task.current_run_id,
        workspace_id: task.workspace_id,
        at,
      };
    });
    bus.emit({
      type: "task.state_changed",
      task_id: id,
      workspace_id: result.workspace_id,
      from: result.from,
      to: result.task.status,
      at: result.at,
    });
    if (result.run_id) runDispatcher.cancel(result.run_id);
    return result.task;
  }

  /**
   * Dev/test helper kept for the prototype period — drives the state machine
   * forward without spawning a real PTY. Useful for manually walking the
   * board through transitions when no agent CLI is installed locally.
   */
  function simulateAgentExit(id: string, success: boolean): Task {
    return db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const via = success ? "agent_exit_0" : "agent_fail";
      const newStatus = transition(task.status, via);
      const at = nowIso();
      taskRepo.updateStatus(id, newStatus, task.current_run_id, at);
      if (task.current_run_id) {
        runRepo.markFinished(task.current_run_id, {
          status: success ? "succeeded" : "failed",
          exit_code: success ? 0 : 1,
          bytes_emitted: 0,
          ended_at: at,
        });
      }
      return { ...task, status: newStatus, updated_at: at };
    });
  }

  return { create, get, list, run, invokePhase, approve, reject, cancel, simulateAgentExit };
}
