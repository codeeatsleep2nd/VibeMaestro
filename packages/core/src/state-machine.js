import { AppError } from "./errors.js";

const ALLOWED = {
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
export function transition(current, via) {
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
export function canTransition(current, via) {
  return ALLOWED[via].from.includes(current);
}
