import { describe, expect, test } from "bun:test";
import { appRouter } from "../src/main/routers/_app.js";

/**
 * Contract test — snapshots the shape of the tRPC router so any change to
 * the IPC surface (procedure names, query/mutation kinds) shows up as a
 * snapshot diff in PRs. The runtime implementation behind each procedure
 * can change freely; the public surface is locked here.
 *
 * Plan #1c said: v2 HTTP/SSE/WebSocket mirror reads the same Zod schemas;
 * PRs that drift the contract fail this test unless the snapshot is updated
 * intentionally.
 */
describe("appRouter contract", () => {
  test("snapshot of every procedure path + type", () => {
    const procs = appRouter._def.procedures as Record<string, unknown>;
    const surface: Array<[string, string]> = [];
    for (const [path, value] of Object.entries(procs)) {
      const def = (value as { _def?: { type?: string } })._def;
      const type = def?.type ?? "unknown";
      surface.push([path, type]);
    }
    surface.sort(([a], [b]) => a.localeCompare(b));
    expect(surface).toMatchSnapshot();
  });
});
