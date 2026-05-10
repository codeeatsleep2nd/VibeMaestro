/**
 * Bounded ring buffer of UTF-8 PTY output. The renderer attaches xterm.js to
 * a live run, gets the snapshot up to NOW, then receives the live tail. If
 * the run already ended, the ring is the full transcript replay until GC
 * collects it (30 s after run end — see ipc-terminal.ts).
 *
 * Invariant: total bytes ≤ MAX_BYTES, except when a single push exceeds the
 * cap — we keep the latest chunk verbatim so the user always sees the most
 * recent output. (CLAUDE.md performance budget: 32 KB per task.)
 */
const MAX_BYTES = 32 * 1024;

export class ScrollbackRing {
  private chunks: string[] = [];
  private byteCount = 0;

  push(chunk: string): void {
    this.chunks.push(chunk);
    this.byteCount += Buffer.byteLength(chunk, "utf8");
    while (this.byteCount > MAX_BYTES && this.chunks.length > 1) {
      const dropped = this.chunks.shift();
      if (dropped !== undefined) {
        this.byteCount -= Buffer.byteLength(dropped, "utf8");
      }
    }
  }

  snapshot(): string {
    return this.chunks.join("");
  }

  get bytes(): number {
    return this.byteCount;
  }

  clear(): void {
    this.chunks = [];
    this.byteCount = 0;
  }
}
