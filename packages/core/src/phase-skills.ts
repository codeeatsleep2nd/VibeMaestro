import type { Task } from "./contracts/task.js";
import type { PhaseSkills, Workspace } from "./contracts/workspace.js";

/**
 * Resolve the effective phase skills for a task by overlaying its
 * `phase_skills_override` onto the workspace's `phase_skills`.
 *
 * Override semantics are WHOLE-PHASE REPLACE, not key-merge:
 *   - workspace `running: ["/a"]`, task override `running: ["/b"]` → `running: ["/b"]`
 *   - workspace `running: ["/a"]`, task override `running: []`     → `running: []` (intentional empty)
 *   - workspace `running: ["/a"]`, task override `null` or missing → `running: ["/a"]` (fall through)
 *
 * Each phase key is independently nullable on the override; missing keys fall through.
 *
 * NOTE: Each phase holds AT MOST ONE skill (REV-S4 from the D20 spike). The Zod
 * schema enforces `.max(1)`; this resolver merely overlays.
 */
export function resolvePhaseSkills(
  workspace: Workspace,
  task: Pick<Task, "phase_skills_override">,
): PhaseSkills {
  const ws = workspace.phase_skills;
  const ov = task.phase_skills_override ?? {};
  return {
    planning: ov.planning ?? ws.planning,
    running: ov.running ?? ws.running,
    reviewing: ov.reviewing ?? ws.reviewing,
    complete: ov.complete ?? ws.complete,
  };
}

/**
 * D7: task.agent_id is frozen at creation. This helper exists for API symmetry
 * with `resolvePhaseSkills`. It does NOT consult the workspace — changes to
 * `workspace.default_agent_id` do not retroactively rewrite existing tasks.
 */
export function resolveAgentId(_workspace: Workspace, task: Pick<Task, "agent_id">): string {
  return task.agent_id;
}
