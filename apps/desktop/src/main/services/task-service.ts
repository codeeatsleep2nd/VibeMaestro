import { AppError, newRunId, type Task, type TaskCreateInput, transition } from "@vibemaestro/core";
import { AgentRepository, RunRepository, TaskRepository } from "@vibemaestro/db";
import { getDb } from "../db.js";

export type TaskService = ReturnType<typeof createTaskService>;

export function createTaskService() {
  const { db } = getDb();
  const taskRepo = new TaskRepository(db);
  const runRepo = new RunRepository(db);
  const agentRepo = new AgentRepository(db);

  function nowIso(): string {
    return new Date().toISOString();
  }

  function create(input: TaskCreateInput): Task {
    const agent = agentRepo.findById(input.agent_id);
    if (!agent) {
      throw new AppError("not_found", `Agent "${input.agent_id}" not found`);
    }
    const at = nowIso();
    return db.transaction(() => {
      const id = taskRepo.allocateNextSlug();
      const task: Task = {
        id,
        title: input.title,
        prompt: input.prompt,
        status: "backlog",
        agent_id: input.agent_id,
        current_run_id: null,
        created_at: at,
        updated_at: at,
        metadata: input.metadata ?? {},
      };
      taskRepo.insert(task);
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

  function run(id: string): { task: Task; run_id: string } {
    return db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const newStatus = transition(task.status, "run");
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
      return {
        task: { ...task, status: newStatus, current_run_id: runId, updated_at: at },
        run_id: runId,
      };
    });
  }

  function approve(id: string): Task {
    return db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const newStatus = transition(task.status, "approve");
      const at = nowIso();
      taskRepo.updateStatus(id, newStatus, task.current_run_id, at);
      return { ...task, status: newStatus, updated_at: at };
    });
  }

  function reject(id: string): Task {
    return db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const newStatus = transition(task.status, "reject");
      const at = nowIso();
      taskRepo.updateStatus(id, newStatus, task.current_run_id, at);
      return { ...task, status: newStatus, updated_at: at };
    });
  }

  function cancel(id: string): Task {
    return db.transaction(() => {
      const task = taskRepo.findById(id);
      if (!task) throw new AppError("not_found", `Task "${id}" not found`);
      const newStatus = transition(task.status, "cancel");
      const at = nowIso();
      taskRepo.updateStatus(id, newStatus, task.current_run_id, at);
      return { ...task, status: newStatus, updated_at: at };
    });
  }

  /**
   * Test/dev helper — simulate an agent finishing successfully so the lifecycle
   * advances even without a real PTY. Plan #3 replaces this hook with a real
   * exit-code-driven dispatcher path.
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

  return { create, get, list, run, approve, reject, cancel, simulateAgentExit };
}
