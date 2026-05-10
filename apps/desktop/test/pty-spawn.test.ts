import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent } from "@vibemaestro/core";
import { spawnAgent } from "@vibemaestro/pty-daemon";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-agents");

/**
 * `node-pty` is a native binding rebuilt against Electron's Node ABI by
 * `electron-builder install-app-deps`. That makes it incompatible with Bun's
 * runtime (different `NODE_MODULE_VERSION`), so `bun test` would crash on
 * `pty.spawn`. We only run this suite when the binding's ABI matches the
 * current runtime — which is the case under `playwright-electron` (plan #8)
 * and inside a packaged build's smoke tests.
 *
 * Set `VM_RUN_PTY_TESTS=1` to force the suite to run anyway (for local
 * debugging when you've manually rebuilt node-pty against Bun).
 */
const SKIP_PTY = process.env.VM_RUN_PTY_TESTS !== "1";
const describePty = SKIP_PTY ? describe.skip : describe;

function fakeAgent(overrides: Partial<Agent>): Agent {
  return {
    id: "fake",
    label: "Fake",
    monogram: "FK",
    hue: "oklch(72% 0.13 145)",
    tier: "v1",
    command: join(fixtureDir, "echo-success.sh"),
    args: [],
    env: {},
    cwd: null,
    prompt_via: "stdin",
    available: true,
    version: "1.0.0",
    registered_at: new Date().toISOString(),
    ...overrides,
  };
}

function waitForExit(handle: ReturnType<typeof spawnAgent>) {
  return new Promise<{ exitCode: number; stdout: string }>((resolve) => {
    let stdout = "";
    handle.ipty.onData((chunk) => {
      stdout += chunk;
    });
    handle.ipty.onExit(({ exitCode }) => {
      resolve({ exitCode: exitCode ?? -1, stdout });
    });
  });
}

describePty("spawnAgent (requires Electron-ABI node-pty)", () => {
  test("happy path: stdin prompt → exit 0 with echo'd line", async () => {
    const handle = spawnAgent({
      runId: "run_test_1",
      agent: fakeAgent({}),
      prompt: "hello world",
      cwd: process.env.HOME ?? "/tmp",
      env: { ...process.env } as Record<string, string>,
    });
    const result = await waitForExit(handle);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("received: hello world");
  });

  test("non-zero exit propagates", async () => {
    const handle = spawnAgent({
      runId: "run_test_2",
      agent: fakeAgent({ command: join(fixtureDir, "echo-fail.sh") }),
      prompt: "fail me",
      cwd: process.env.HOME ?? "/tmp",
      env: { ...process.env } as Record<string, string>,
    });
    const result = await waitForExit(handle);
    expect(result.exitCode).toBe(1);
  });

  test("prompt_via: arg substitutes {{prompt}} in args", async () => {
    const handle = spawnAgent({
      runId: "run_test_3",
      agent: fakeAgent({
        command: join(fixtureDir, "uses-arg.sh"),
        args: ["{{prompt}}"],
        prompt_via: "arg",
      }),
      prompt: "via-arg",
      cwd: process.env.HOME ?? "/tmp",
      env: { ...process.env } as Record<string, string>,
    });
    const result = await waitForExit(handle);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("got arg: via-arg");
  });

  test("kill terminates the process", async () => {
    const handle = spawnAgent({
      runId: "run_test_4",
      agent: fakeAgent({ command: join(fixtureDir, "long-running.sh") }),
      prompt: "wait",
      cwd: process.env.HOME ?? "/tmp",
      env: { ...process.env } as Record<string, string>,
    });
    setTimeout(() => handle.ipty.kill("SIGTERM"), 200);
    const result = await waitForExit(handle);
    // Killed process: exitCode is implementation-defined but signal is set;
    // node-pty surfaces this as a non-zero / unusual code. Just assert it ended.
    expect(result.exitCode).not.toBe(0);
  });
});
