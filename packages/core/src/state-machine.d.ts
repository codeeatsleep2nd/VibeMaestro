import type { TaskStatus } from "./contracts/task.js";
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
export declare function transition(current: TaskStatus, via: Transition): TaskStatus;
export declare function canTransition(current: TaskStatus, via: Transition): boolean;
