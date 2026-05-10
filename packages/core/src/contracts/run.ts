import { z } from "zod";

export const RUN_STATUSES = ["running", "succeeded", "failed", "cancelled"] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSchema = z.object({
  id: z.string().regex(/^run_[0-9A-HJKMNP-TV-Z]{26}$/),
  task_id: z.string(),
  agent_id: z.string(),
  status: runStatusSchema,
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().nullable(),
  exit_code: z.number().int().nullable(),
  bytes_emitted: z.number().int(),
  tool_calls_count: z.number().int().nullable(),
});
export type Run = z.infer<typeof runSchema>;

export const runResponseSchema = z.object({ data: runSchema });
export type RunResponse = z.infer<typeof runResponseSchema>;
