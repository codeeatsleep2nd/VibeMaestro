import { agentListResponseSchema } from "@vibemaestro/core";
import { createAgentService } from "../services/agent-service.js";
import { procedure, router } from "../trpc.js";

export const agentsRouter = router({
  list: procedure.output(agentListResponseSchema).query(() => {
    const svc = createAgentService();
    return { data: svc.list() };
  }),
});
