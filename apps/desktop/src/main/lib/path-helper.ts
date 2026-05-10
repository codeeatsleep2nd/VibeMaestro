import { spawn } from "node:child_process";
import { childLogger } from "./logger.js";

/**
 * Resolve the user's interactive-shell PATH and cache it for the process
 * lifetime.
 *
 * **Why this exists:** macOS Electron launched from the Dock or Finder
 * inherits the system PATH (typically `/usr/bin:/bin`), NOT the user's
 * shell PATH. So `claude`, `codex`, brew installs, asdf/mise shims —
 * everything users actually rely on — disappears. Running the user's
 * login shell with `-l -c 'echo $PATH'` recovers it.
 *
 * On Windows we just return the existing `process.env.PATH` — there's no
 * equivalent split between GUI and shell PATH.
 */
const log = childLogger({ module: "path-helper" });

let cached: string | null = null;
let inflight: Promise<string> | null = null;

export async function resolveShellPath(): Promise<string> {
  if (cached !== null) return cached;
  if (inflight !== null) return inflight;

  if (process.platform === "win32") {
    cached = process.env.PATH ?? "";
    return cached;
  }

  inflight = new Promise<string>((resolve) => {
    const shell =
      process.env.SHELL && process.env.SHELL.length > 0 ? process.env.SHELL : "/bin/zsh";
    let stdout = "";
    let settled = false;

    const child = spawn(shell, ["-l", "-c", "echo $PATH"], { stdio: ["ignore", "pipe", "pipe"] });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      log.warn({ shell }, "shell PATH probe timed out — falling back to process.env.PATH");
      resolve(process.env.PATH ?? "");
    }, 2000);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log.warn({ err: err.message, shell }, "shell PATH probe failed — using process.env.PATH");
      resolve(process.env.PATH ?? "");
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 || stdout.trim().length === 0) {
        log.warn({ code, shell }, "shell PATH probe returned non-zero / empty");
        resolve(process.env.PATH ?? "");
        return;
      }
      const path = stdout.trim().split("\n").pop()?.trim() ?? "";
      resolve(path);
    });
  });

  cached = await inflight;
  inflight = null;
  log.info({ length: cached.length }, "shell PATH resolved");
  return cached;
}

/**
 * Test hook — clear the cache so a unit test can re-probe with a different
 * `process.env.SHELL`.
 */
export function _resetShellPathCacheForTesting(): void {
  cached = null;
  inflight = null;
}
