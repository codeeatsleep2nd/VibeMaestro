import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { byteThrottle } from "@vibemaestro/pty-daemon";

describe("byteThrottle", () => {
  let now = 0;
  let timers: Array<{ at: number; fn: () => void }> = [];
  const flushed: number[] = [];

  beforeEach(() => {
    now = 0;
    timers = [];
    flushed.length = 0;
    // Hand-rolled fake timer so the test is deterministic without real wallclock waits.
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      const handle = { at: now + ms, fn };
      timers.push(handle);
      return handle as unknown as ReturnType<typeof setTimeout>;
    }) as typeof globalThis.setTimeout;
    globalThis.clearTimeout = ((handle: unknown) => {
      const i = timers.indexOf(handle as { at: number; fn: () => void });
      if (i >= 0) timers.splice(i, 1);
    }) as typeof globalThis.clearTimeout;
  });

  afterEach(() => {
    mock.restore();
  });

  function advance(ms: number) {
    now += ms;
    const fired = timers.filter((t) => t.at <= now);
    for (const t of fired) {
      const i = timers.indexOf(t);
      if (i >= 0) timers.splice(i, 1);
      t.fn();
    }
  }

  test("aggregates small writes and flushes after intervalMs", () => {
    const t = byteThrottle(250, (n) => flushed.push(n));
    t.add(100);
    t.add(50);
    expect(flushed).toEqual([]);
    advance(250);
    expect(flushed).toEqual([150]);
  });

  test("flushes immediately on 4 KB threshold", () => {
    const t = byteThrottle(250, (n) => flushed.push(n));
    t.add(2000);
    t.add(2000);
    expect(flushed).toEqual([]);
    t.add(200); // crosses 4096
    expect(flushed).toEqual([4200]);
  });

  test("flushNow is idempotent for an empty queue", () => {
    const t = byteThrottle(250, (n) => flushed.push(n));
    t.flushNow();
    t.flushNow();
    expect(flushed).toEqual([]);
  });

  test("flushNow drains pending bytes before timer", () => {
    const t = byteThrottle(250, (n) => flushed.push(n));
    t.add(123);
    t.flushNow();
    expect(flushed).toEqual([123]);
    advance(500); // timer should be cleared
    expect(flushed).toEqual([123]);
  });
});
