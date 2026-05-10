import { z } from "zod";

export const AGENT_TIERS = ["v1", "future"] as const;
export const agentTierSchema = z.enum(AGENT_TIERS);
export type AgentTier = z.infer<typeof agentTierSchema>;

export const agentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1).max(80),
  monogram: z.string().regex(/^[A-Z0-9]{2}$/),
  hue: z.string().regex(/^oklch\(/),
  tier: agentTierSchema,
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  cwd: z.string().nullable(),
  prompt_via: z.enum(["stdin", "arg"]),
  available: z.boolean(),
  version: z.string().nullable(),
  registered_at: z.string().datetime(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentListResponseSchema = z.object({ data: z.array(agentSchema) });
export type AgentListResponse = z.infer<typeof agentListResponseSchema>;

export const agentResponseSchema = z.object({ data: agentSchema });
export type AgentResponse = z.infer<typeof agentResponseSchema>;
