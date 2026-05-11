import { describe, expect, test } from "bun:test";
import {
  emptyPhaseSkills,
  type PhaseSkills,
  resolveAgentId,
  resolvePhaseSkills,
  type Task,
  type Workspace,
} from "../src/index.js";

function ws(phase_skills: PhaseSkills): Workspace {
  return {
    id: "ws_test",
    label: "test",
    path: "/tmp/test",
    default_agent_id: "claude-code",
    phase_skills,
    created_at: "2026-05-10T00:00:00.000Z",
    updated_at: "2026-05-10T00:00:00.000Z",
  };
}

describe("resolvePhaseSkills", () => {
  test("no override → workspace values for every phase", () => {
    const workspace = ws({
      planning: ["/plan-eng-review"],
      running: ["/tdd-workflow"],
      reviewing: ["/code-review"],
      complete: [],
    });
    const task: Pick<Task, "phase_skills_override"> = { phase_skills_override: null };
    const result = resolvePhaseSkills(workspace, task);
    expect(result.planning).toEqual(["/plan-eng-review"]);
    expect(result.running).toEqual(["/tdd-workflow"]);
    expect(result.reviewing).toEqual(["/code-review"]);
    expect(result.complete).toEqual([]);
  });

  test("override replaces — workspace value is ignored for that phase", () => {
    const workspace = ws({
      planning: [],
      running: ["/a"],
      reviewing: [],
      complete: [],
    });
    const task: Pick<Task, "phase_skills_override"> = {
      phase_skills_override: { running: ["/b"] },
    };
    expect(resolvePhaseSkills(workspace, task).running).toEqual(["/b"]);
  });

  test("override = [] replaces (not a fall-through)", () => {
    const workspace = ws({
      planning: [],
      running: ["/a"],
      reviewing: [],
      complete: [],
    });
    const task: Pick<Task, "phase_skills_override"> = {
      phase_skills_override: { running: [] },
    };
    expect(resolvePhaseSkills(workspace, task).running).toEqual([]);
  });

  test("partial override — non-overridden phases fall through to workspace", () => {
    const workspace = ws({
      planning: ["/p"],
      running: ["/r"],
      reviewing: ["/rv"],
      complete: ["/c"],
    });
    const task: Pick<Task, "phase_skills_override"> = {
      phase_skills_override: { running: ["/x"] },
    };
    const result = resolvePhaseSkills(workspace, task);
    expect(result.planning).toEqual(["/p"]);
    expect(result.running).toEqual(["/x"]);
    expect(result.reviewing).toEqual(["/rv"]);
    expect(result.complete).toEqual(["/c"]);
  });

  test("empty phase round-trip (GAP-E2): all-empty workspace, no override", () => {
    const workspace = ws(emptyPhaseSkills());
    const task: Pick<Task, "phase_skills_override"> = { phase_skills_override: null };
    expect(resolvePhaseSkills(workspace, task)).toEqual(emptyPhaseSkills());
  });
});

describe("resolveAgentId", () => {
  test("D7: returns task.agent_id (frozen at creation)", () => {
    const workspace = ws(emptyPhaseSkills());
    workspace.default_agent_id = "claude-code";
    const task: Pick<Task, "agent_id"> = { agent_id: "codex" };
    // Workspace default is claude-code; task was frozen with codex; resolver returns codex.
    expect(resolveAgentId(workspace, task)).toBe("codex");
  });
});
