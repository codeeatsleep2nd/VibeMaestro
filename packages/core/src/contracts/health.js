import { z } from "zod";
export const healthPingResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  uptime_ms: z.number(),
});
