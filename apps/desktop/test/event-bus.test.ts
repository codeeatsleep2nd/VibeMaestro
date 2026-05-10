import { afterEach, describe, expect, test } from "bun:test";
import type { EnvelopedEvent, RenderableEvent } from "@vibemaestro/core";
import { bus } from "../src/main/lib/event-bus.js";

afterEach(() => {
  bus._resetForTesting();
});

function makeEvent(taskId: string, to: "running" | "reviewing" = "running"): RenderableEvent {
  return {
    type: "task.state_changed",
    task_id: taskId,
    from: "backlog",
    to,
    at: new Date().toISOString(),
  };
}

describe("event-bus", () => {
  test("emit fans out to type-specific listeners", () => {
    const seen: EnvelopedEvent[] = [];
    bus.on("task.state_changed", (env) => seen.push(env));
    bus.emit(makeEvent("VM-001"));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.event.type).toBe("task.state_changed");
  });

  test("emit fans out to onAny listeners", () => {
    const seen: EnvelopedEvent[] = [];
    bus.onAny((env) => seen.push(env));
    bus.emit(makeEvent("VM-002"));
    expect(seen).toHaveLength(1);
  });

  test("listener errors don't break sibling listeners", () => {
    const seen: string[] = [];
    bus.onAny(() => {
      throw new Error("boom");
    });
    bus.onAny((env) => {
      if (env.event.type === "task.state_changed") seen.push(env.event.task_id);
    });
    bus.emit(makeEvent("VM-003"));
    expect(seen).toEqual(["VM-003"]);
  });

  test("off() removes the listener", () => {
    const seen: number[] = [];
    const off = bus.onAny(() => seen.push(1));
    bus.emit(makeEvent("VM-004"));
    off();
    bus.emit(makeEvent("VM-004"));
    expect(seen).toHaveLength(1);
  });

  test("ring evicts beyond 1000 entries", () => {
    for (let i = 0; i < 1500; i++) bus.emit(makeEvent(`VM-${i}`));
    const replay = bus.replaySince(null);
    expect(replay.events).toHaveLength(1000);
    expect(replay.truncated).toBe(false);
  });

  test("replaySince(null) returns full ring", () => {
    bus.emit(makeEvent("VM-A"));
    bus.emit(makeEvent("VM-B"));
    const replay = bus.replaySince(null);
    expect(replay.events).toHaveLength(2);
  });

  test("replaySince returns events strictly after sinceId", () => {
    const a = bus.emit(makeEvent("VM-A"));
    bus.emit(makeEvent("VM-B"));
    bus.emit(makeEvent("VM-C"));
    const replay = bus.replaySince(a.id);
    expect(replay.events.map((e) => (e.event as { task_id: string }).task_id)).toEqual([
      "VM-B",
      "VM-C",
    ]);
    expect(replay.truncated).toBe(false);
  });

  test("replaySince with unknown id reports truncated", () => {
    bus.emit(makeEvent("VM-A"));
    const replay = bus.replaySince("evt_NEVER_SAW_THIS");
    expect(replay.events).toHaveLength(0);
    expect(replay.truncated).toBe(true);
  });

  test("event order is preserved in fan-out", () => {
    const seen: string[] = [];
    bus.onAny((env) => {
      if (env.event.type === "task.state_changed") seen.push(env.event.task_id);
    });
    for (const id of ["X1", "X2", "X3", "X4"]) bus.emit(makeEvent(id));
    expect(seen).toEqual(["X1", "X2", "X3", "X4"]);
  });
});
