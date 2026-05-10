import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcriptWriter } from "@vibemaestro/pty-daemon";

describe("transcriptWriter", () => {
  test("writes UTF-8 in append order with byte counter", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vmtest-"));
    const path = join(dir, "transcript");

    const writer = transcriptWriter(path);
    writer.write("hello, ");
    writer.write("world\n");
    writer.write("こんにちは\n"); // multi-byte UTF-8
    await writer.close();

    const content = readFileSync(path, "utf8");
    expect(content).toBe("hello, world\nこんにちは\n");
    expect(writer.bytesWritten).toBe(Buffer.byteLength("hello, world\nこんにちは\n", "utf8"));
  });

  test("re-opening with append mode does not truncate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vmtest-"));
    const path = join(dir, "transcript");

    const w1 = transcriptWriter(path);
    w1.write("first run\n");
    await w1.close();

    const w2 = transcriptWriter(path);
    w2.write("second run\n");
    await w2.close();

    const content = readFileSync(path, "utf8");
    expect(content).toBe("first run\nsecond run\n");
  });

  test("file mode is 0o600 (user-only read/write)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vmtest-"));
    const path = join(dir, "transcript");
    const writer = transcriptWriter(path);
    writer.write("secret prompt content\n");
    await writer.close();

    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
