import { describe, expect, test } from "bun:test";
import {
  formatTaskSlug,
  isRunId,
  isTaskSlug,
  newEventId,
  newRunId,
  newToastId,
} from "../src/id.js";

describe("id helpers", () => {
  test("formatTaskSlug pads to 3 digits", () => {
    expect(formatTaskSlug(1)).toBe("VM-001");
    expect(formatTaskSlug(42)).toBe("VM-042");
    expect(formatTaskSlug(218)).toBe("VM-218");
    expect(formatTaskSlug(2026)).toBe("VM-2026");
  });

  test("formatTaskSlug rejects non-positive ints", () => {
    expect(() => formatTaskSlug(0)).toThrow();
    expect(() => formatTaskSlug(-1)).toThrow();
    expect(() => formatTaskSlug(1.5)).toThrow();
  });

  test("isTaskSlug recognizes well-formed slugs", () => {
    expect(isTaskSlug("VM-001")).toBe(true);
    expect(isTaskSlug("VM-1")).toBe(true);
    expect(isTaskSlug("VM-9999")).toBe(true);
    expect(isTaskSlug("vm-1")).toBe(false);
    expect(isTaskSlug("XX-1")).toBe(false);
    expect(isTaskSlug("VM-")).toBe(false);
  });

  test("newRunId returns a run_<ULID> and isRunId accepts it", () => {
    const id = newRunId();
    expect(id.startsWith("run_")).toBe(true);
    expect(isRunId(id)).toBe(true);
  });

  test("newEventId is evt_<ULID>", () => {
    expect(newEventId().startsWith("evt_")).toBe(true);
  });

  test("newToastId is a bare ULID", () => {
    expect(newToastId().length).toBe(26);
  });
});
