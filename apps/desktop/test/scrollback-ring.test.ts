import { describe, expect, test } from "bun:test";
import { ScrollbackRing } from "@vibemaestro/pty-daemon";

describe("ScrollbackRing", () => {
  test("snapshot is empty initially", () => {
    const r = new ScrollbackRing();
    expect(r.snapshot()).toBe("");
    expect(r.bytes).toBe(0);
  });

  test("preserves chunks in order under cap", () => {
    const r = new ScrollbackRing();
    r.push("hello ");
    r.push("world\n");
    expect(r.snapshot()).toBe("hello world\n");
  });

  test("evicts oldest when crossing 32 KB", () => {
    const r = new ScrollbackRing();
    const chunk = "X".repeat(8 * 1024);
    for (let i = 0; i < 6; i++) r.push(chunk);
    expect(r.bytes).toBeLessThanOrEqual(32 * 1024);
    expect(r.snapshot().length).toBeLessThanOrEqual(32 * 1024);
  });

  test("keeps the most recent chunk verbatim even if over cap", () => {
    const r = new ScrollbackRing();
    r.push("X".repeat(40 * 1024));
    expect(r.snapshot().length).toBe(40 * 1024);
    expect(r.snapshot().endsWith("X")).toBe(true);
  });

  test("clear empties everything", () => {
    const r = new ScrollbackRing();
    r.push("data");
    r.clear();
    expect(r.snapshot()).toBe("");
    expect(r.bytes).toBe(0);
  });
});
