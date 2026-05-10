import * as pty from "node-pty";
import type { SpawnedRun, SpawnOptions } from "./types.js";

/**
 * Spawn an agent inside a PTY. This is the *only* place in the codebase that
 * calls `pty.spawn` — every other caller goes through `runDispatcher`.
 *
 * `prompt_via`:
 *   - "stdin": after spawn, write `prompt + "\n"` once. Most CLIs that read
 *     a single instruction use this.
 *   - "arg":   substitute `{{prompt}}` inside `agent.args` before spawn.
 *
 * Defaults to a 120×30 TTY, which is sane for most CLIs. The renderer's
 * xterm.js will call `resize()` once it knows its viewport (plan #5).
 */
export function spawnAgent(opts: SpawnOptions): SpawnedRun {
  const args =
    opts.agent.prompt_via === "arg"
      ? opts.agent.args.map((a) => a.replace("{{prompt}}", opts.prompt))
      : opts.agent.args;

  const ipty = pty.spawn(opts.agent.command, args, {
    name: "xterm-color",
    cols: opts.cols ?? 120,
    rows: opts.rows ?? 30,
    cwd: opts.cwd,
    env: { ...opts.env, ...opts.agent.env },
  });

  if (opts.agent.prompt_via === "stdin") {
    ipty.write(`${opts.prompt}\n`);
  }

  return {
    runId: opts.runId,
    pid: ipty.pid,
    startedAt: new Date(),
    ipty,
    cancelled: false,
  };
}
