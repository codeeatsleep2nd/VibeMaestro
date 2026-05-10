import { z } from "zod";
import { taskStatusSchema } from "./contracts/task.js";
export const eventTaskStateChanged = z.object({
  type: z.literal("task.state_changed"),
  task_id: z.string(),
  from: taskStatusSchema,
  to: taskStatusSchema,
  at: z.string().datetime(),
});
export const eventRunStarted = z.object({
  type: z.literal("run.started"),
  task_id: z.string(),
  run_id: z.string(),
  agent_id: z.string(),
  at: z.string().datetime(),
});
export const eventRunProgress = z.object({
  type: z.literal("run.progress"),
  task_id: z.string(),
  run_id: z.string(),
  elapsed_ms: z.number().int(),
  bytes_emitted: z.number().int(),
});
export const eventRunEnded = z.object({
  type: z.literal("run.ended"),
  task_id: z.string(),
  run_id: z.string(),
  exit_code: z.number().int().nullable(),
  duration_ms: z.number().int(),
  outcome: z.enum(["succeeded", "failed", "cancelled"]),
});
export const eventAgentAvailability = z.object({
  type: z.literal("agent.availability_changed"),
  agent_id: z.string(),
  available: z.boolean(),
});
export const renderableEventSchema = z.discriminatedUnion("type", [
  eventTaskStateChanged,
  eventRunStarted,
  eventRunProgress,
  eventRunEnded,
  eventAgentAvailability,
]);
export const envelopedEventSchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  event: renderableEventSchema,
});
