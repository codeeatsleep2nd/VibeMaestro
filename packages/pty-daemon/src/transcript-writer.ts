import { createWriteStream, type WriteStream } from "node:fs";

export type TranscriptWriter = {
  write: (chunk: string) => void;
  close: () => Promise<void>;
  readonly bytesWritten: number;
};

/**
 * Append-only transcript file under `~/.vibemaestro/runs/<run_id>/transcript`.
 * Plain UTF-8 text — no structured logging — so plan #5's terminal IPC bridge
 * can replay it byte-for-byte to a re-attaching xterm.
 *
 * `flags: "a"` — re-attaching after a crash appends instead of truncating.
 * `mode: 0o600` — readable only by the user (transcripts may carry prompts).
 */
export function transcriptWriter(path: string): TranscriptWriter {
  const stream: WriteStream = createWriteStream(path, { flags: "a", mode: 0o600 });
  let bytesWritten = 0;

  return {
    write(chunk: string): void {
      const buf = Buffer.from(chunk, "utf8");
      stream.write(buf);
      bytesWritten += buf.byteLength;
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        stream.end(() => resolve());
      });
    },
    get bytesWritten() {
      return bytesWritten;
    },
  };
}
