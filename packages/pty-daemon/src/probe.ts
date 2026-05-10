import { spawn } from "node:child_process";
import type { Agent } from "@vibemaestro/core";
import type { ProbeResult } from "./types.js";

/**
 * Ask an agent's CLI for its version. Cheap shape: spawn `agent.command --version`
 * with a 2 s timeout, capture the first non-empty stdout line, treat any non-zero
 * exit OR a timeout as "unavailable".
 *
 * The shell PATH is the caller's responsibility — pass the resolved PATH from
 * `lib/path-helper.ts` via `env`. Otherwise GUI-launched Electron on macOS
 * sees `/usr/bin:/bin` and brew/asdf-installed CLIs read as missing.
 */
export async function probeAgent(
  agent: Agent,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const child = spawn(agent.command, ["--version"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ available: false, version: null, error: "probe_timeout" });
    }, 2000);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ available: false, version: null, error: err.message });
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const tail = stderr.trim() || stdout.trim() || `exit ${code}`;
        resolve({ available: false, version: null, error: tail.slice(0, 200) });
        return;
      }
      const firstLine = stdout.trim().split("\n")[0]?.trim() ?? null;
      resolve({ available: true, version: firstLine, error: null });
    });
  });
}
