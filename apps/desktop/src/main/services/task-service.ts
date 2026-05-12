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

  /**
   * Before spawning a new run for a task, cancel the previous live run if any.
   * Without this, calling `run` or `invokePhase` while an interactive agent is
   * still attached leaves the old PTY orphaned (still alive in the dispatcher's
   * `live` map, holding a node-pty handle and a transcript file) while the task
   * row's `current_run_id` points at the new one. The user can no longer see or
   * interact with the old agent. SIGTERM is fast (~ms) and the dispatcher's
   * 2 s SIGKILL fallback handles a misbehaving CLI.
   */
  function cancelExistingLiveRun(task: Task, reason: string): void {
    if (task.current_run_id && runDispatcher.isRunning(task.current_run_id)) {
      log.info(
        { task_id: task.id, run_id: task.current_run_id, reason },
        "cancelling existing live run before spawning new one",
      );
      runDispatcher.cancel(task.current_run_id);
    }
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
    const task = db.transaction(() => {
      const id = taskRepo.allocateNextSlug();
      const row: Task = {
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
      taskRepo.insert(row);
      log.info(
        { task_id: id, workspace_id: workspace.id, agent_id: effectiveAgentId },
        "task created",
      );
      return row;
    });

    // Auto-fire the planning phase skill on creation if one is configured. The
    // task stays in 'backlog' status (which the UI labels "Planning"); the
    // agent just gets the planning-phase invocation. If no planning skill is
    // configured, the agent doesn't auto-spawn — the user clicks Run manually.
    const planning = resolvePhaseSkills(workspace, task).planning;
    if (planning.length > 0) {
      try {
        invokePhase(task.id, "planning");
      } catch (err) {
        log.warn(
          {
            task_id: task.id,
            err: err instanceof Error ? err.message : String(err),
          },
          "post-create planning auto-fire failed — task created in backlog",
        );
      }
    }
    return task;
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
    const existing = taskRepo.findById(id);
    if (!existing) throw new AppError("not_found", `Task "${id}" not found`);
    cancelExistingLiveRun(existing, "tasks.run");

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

    // D9 (revised): rather than reject, cancel the existing live run and spawn
    // fresh. The "one PTY per task" invariant is preserved by the SIGTERM
    // happening before the new spawn. This is what the user expects when they
    // click a different phase Run button while an agent is still attached:
    // "switch to this phase recipe", not "you must cancel first".
    cancelExistingLiveRun(task, `tasks.invokePhase(${phase})`);

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

  /**
   * Auto-fire a phase skill after a state transition. Safe to call from any
   * mutation; swallows dispatcher errors so a failed agent spawn doesn't
   * unwind an already-committed status change. Skips the spawn if the target
   * phase has no skill configured (matches "if there's any" from the user
   * intent — empty phase = no agent fires).
   */
  function autoFirePhaseIfConfigured(taskId: string, phase: Phase, reason: string): void {
    const task = taskRepo.findById(taskId);
    if (!task) return;
    const workspace = workspaceRepo.findById(task.workspace_id);
    if (!workspace) return;
    const skills = resolvePhaseSkills(workspace, task)[phase];
    if (skills.length === 0) return;
    log.info({ task_id: taskId, phase, reason }, "auto-firing phase skill");
    try {
      invokePhase(taskId, phase);
    } catch (err) {
      log.warn(
        {
          task_id: taskId,
          phase,
          reason,
          err: err instanceof Error ? err.message : String(err),
        },
        "auto-fire phase failed — state change preserved, agent did not spawn",
      );
    }
  }

  /**
   * User-triggered running → reviewing transition. Interactive YOLO agents
   * don't exit on their own, so the `agent_exit_0` auto-transition (plan #3)
   * never fires; the user signals "done with planning/execution" via this call.
   * Auto-fires the reviewing-phase skill if one is configured.
   */
  function submitForReview(id: string): Task {
    const updated = db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const newStatus = transition(task.status, "submit_for_review");
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
    autoFirePhaseIfConfigured(id, "reviewing", "tasks.submitForReview");
    return updated.task;
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
    // Entered "complete" phase — fire the complete-phase skill if configured.
    autoFirePhaseIfConfigured(id, "complete", "tasks.approve");
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
    // Re-entered "planning" phase (backlog status) — fire the planning skill if configured.
    autoFirePhaseIfConfigured(id, "planning", "tasks.reject");
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

  return {
    create,
    get,
    list,
    run,
    invokePhase,
    submitForReview,
    approve,
    reject,
    cancel,
    simulateAgentExit,
  };
}
