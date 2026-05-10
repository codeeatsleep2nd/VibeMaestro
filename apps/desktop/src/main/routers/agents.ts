import { agentListResponseSchema, agentResponseSchema } from "@vibemaestro/core";
import { z } from "zod";
import { createAgentService } from "../services/agent-service.js";
import { procedure, router } from "../trpc.js";

const agentIdInput = z.object({ id: z.string() });

export const agentsRouter = router({
  list: procedure.output(agentListResponseSchema).query(() => {
    const svc = createAgentService();
    return { data: svc.list() };
  }),

  get: procedure
    .input(agentIdInput)
    .output(agentResponseSchema)
    .query(({ input }) => {
      const svc = createAgentService();
      return { data: svc.require(input.id) };
    }),

  /**
   * Run `command --version` against the agent CLI, persist availability +
   * version. Cheap (≤2s timeout per probe), idempotent, safe to call from
   * the empty-state UI.
   */
  probe: procedure
    .input(agentIdInput)
    .output(agentResponseSchema)
    .mutation(async ({ input }) => {
      const svc = createAgentService();
      return { data: await svc.probe(input.id) };
    }),

  probeAll: procedure.output(agentListResponseSchema).mutation(async () => {
    const svc = createAgentService();
    return { data: await svc.probeAll() };
  }),

  delete: procedure
    .input(agentIdInput)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ input }) => {
      const svc = createAgentService();
      svc.delete(input.id);
      return { ok: true };
    }),
});
