import { healthPingResponseSchema } from "@vibemaestro/core";
import { procedure, router } from "../trpc.js";

const startedAt = Date.now();

export const healthRouter = router({
  ping: procedure.output(healthPingResponseSchema).query(() => ({
    status: "ok" as const,
    version: "0.1.0",
    uptime_ms: Date.now() - startedAt,
  })),
});
