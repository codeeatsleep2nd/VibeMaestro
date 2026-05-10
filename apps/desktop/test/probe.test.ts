import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent } from "@vibemaestro/core";
import { probeAgent } from "@vibemaestro/pty-daemon";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-agents");

function fakeAgent(command: string): Agent {
  return {
    id: "fake",
    label: "Fake",
    monogram: "FK",
    hue: "oklch(72% 0.13 145)",
    tier: "v1",
    command,
    args: [],
    env: {},
    cwd: null,
    prompt_via: "stdin",
    available: false,
    version: null,
    registered_at: new Date().toISOString(),
  };
}

describe("probeAgent", () => {
  test("missing command returns available=false with error", async () => {
    const result = await probeAgent(fakeAgent("/no/such/binary"));
    expect(result.available).toBe(false);
    expect(result.version).toBeNull();
    expect(result.error).not.toBeNull();
  });

  test("available command captures first stdout line as version", async () => {
    // node prints its version on `node --version`; it's universally on PATH in
    // the test environment so this exercises the success path without a fixture.
    const result = await probeAgent(fakeAgent("node"));
    expect(result.available).toBe(true);
    expect(result.version).toMatch(/^v\d+/);
    expect(result.error).toBeNull();
  });

  test("non-zero exit returns available=false with error tail", async () => {
    // `false` is a unix builtin that always exits 1.
    const result = await probeAgent(fakeAgent(join(fixtureDir, "echo-fail.sh")));
    expect(result.available).toBe(false);
    expect(result.version).toBeNull();
    expect(result.error).not.toBeNull();
  });
});
