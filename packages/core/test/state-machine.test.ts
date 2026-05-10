import { describe, expect, test } from "bun:test";
import { AppError, canTransition, transition } from "../src/index.js";

describe("state-machine.transition", () => {
  test("backlog → running via run", () => {
    expect(transition("backlog", "run")).toBe("running");
  });

  test("running → reviewing on agent_exit_0", () => {
    expect(transition("running", "agent_exit_0")).toBe("reviewing");
  });

  test("running → error on agent_fail", () => {
    expect(transition("running", "agent_fail")).toBe("error");
  });

  test("running → blocked on cancel", () => {
    expect(transition("running", "cancel")).toBe("blocked");
  });

  test("reviewing → complete via approve", () => {
    expect(transition("reviewing", "approve")).toBe("complete");
  });

  test("reviewing → backlog via reject", () => {
    expect(transition("reviewing", "reject")).toBe("backlog");
  });

  test("error → running via retry", () => {
    expect(transition("error", "retry")).toBe("running");
  });

  test("complete → backlog via discard_run", () => {
    expect(transition("complete", "discard_run")).toBe("backlog");
  });

  test("rejects illegal transitions with AppError(invalid_state)", () => {
    let caught: unknown = null;
    try {
      transition("complete", "run");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("invalid_state");
  });

  test("approve from non-reviewing is illegal", () => {
    expect(() => transition("backlog", "approve")).toThrow(AppError);
    expect(() => transition("running", "approve")).toThrow(AppError);
    expect(() => transition("complete", "approve")).toThrow(AppError);
  });

  test("canTransition mirrors transition's allow-list", () => {
    expect(canTransition("backlog", "run")).toBe(true);
    expect(canTransition("running", "approve")).toBe(false);
  });
});
