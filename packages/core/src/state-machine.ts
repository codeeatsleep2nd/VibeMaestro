import type { TaskStatus } from "./contracts/task.js";
import { AppError } from "./errors.js";

/**
 * Server-enforced state machine. The renderer never sends `status: "running"` —
 * it calls `tasks.run` (or `approve`, `reject`, `cancel`, etc.). Each action maps
 * to a `Transition`; this module is the single source of truth for what's allowed.
 */
export type Transition =
  | "run"
  | "agent_exit_0"
  | "agent_fail"
  | "cancel"
  | "approve"
  | "reject"
  | "retry"
  | "discard_run";

const ALLOWED: Record<Transition, { from: ReadonlyArray<TaskStatus>; to: TaskStatus }> = {
  run: { from: ["backlog"], to: "running" },
  agent_exit_0: { from: ["running"], to: "reviewing" },
  agent_fail: { from: ["running"], to: "error" },
  cancel: { from: ["running"], to: "blocked" },
  approve: { from: ["reviewing"], to: "complete" },
  reject: { from: ["reviewing"], to: "backlog" },
  retry: { from: ["error"], to: "running" },
  discard_run: {
    from: ["backlog", "running", "reviewing", "complete", "blocked", "error"],
    to: "backlog",
  },
};

export function transition(current: TaskStatus, via: Transition): TaskStatus {
  const rule = ALLOWED[via];
  if (!rule.from.includes(current)) {
    throw new AppError("invalid_state", `Cannot ${via} a task in status "${current}"`, {
      current,
      transition: via,
      allowed_from: rule.from,
    });
  }
  return rule.to;
}

export function canTransition(current: TaskStatus, via: Transition): boolean {
  return ALLOWED[via].from.includes(current);
}
