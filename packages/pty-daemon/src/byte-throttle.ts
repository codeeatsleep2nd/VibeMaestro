/**
 * Throttle byte-counter updates so a chatty PTY doesn't hammer SQLite.
 *
 * Flushes when EITHER:
 *   - `intervalMs` elapses since the first pending byte, OR
 *   - the pending count crosses `FLUSH_BYTES` (4 KB).
 *
 * Callers MUST call `flushNow()` on PTY exit so the final count lands before
 * `runService.markFinished` reads it.
 */
const FLUSH_BYTES = 4 * 1024;

export type ByteThrottle = {
  add: (n: number) => void;
  flushNow: () => void;
};

export function byteThrottle(intervalMs: number, flush: (n: number) => void): ByteThrottle {
  let pending = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending > 0) {
      const n = pending;
      pending = 0;
      flush(n);
    }
  };

  return {
    add(n: number): void {
      pending += n;
      if (pending >= FLUSH_BYTES) {
        fire();
        return;
      }
      if (!timer) {
        timer = setTimeout(fire, intervalMs);
      }
    },
    flushNow: fire,
  };
}
