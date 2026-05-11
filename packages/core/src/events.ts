import { z } from "zod";
import { taskStatusSchema } from "./contracts/task.js";

/**
 * `workspace_id` is OPTIONAL on every payload (ARCH-E3). The server emits it
 * when 2+ workspaces exist (renderer renders the [workspace-label] pill); legacy
 * ring-buffer entries from before plan #11 lack it and replay as no-pill rows.
 */
export const eventTaskStateChanged = z.object({
  type: z.literal("task.state_changed"),
  task_id: z.string(),
  workspace_id: z.string().optional(),
  from: taskStatusSchema,
  to: taskStatusSchema,
  at: z.string().datetime(),
});

export const eventRunStarted = z.object({
  type: z.literal("run.started"),
  task_id: z.string(),
  workspace_id: z.string().optional(),
  run_id: z.string(),
  agent_id: z.string(),
  at: z.string().datetime(),
});

export const eventRunProgress = z.object({
  type: z.literal("run.progress"),
  task_id: z.string(),
  workspace_id: z.string().optional(),
  run_id: z.string(),
  elapsed_ms: z.number().int(),
  bytes_emitted: z.number().int(),
});

export const eventRunEnded = z.object({
  type: z.literal("run.ended"),
  task_id: z.string(),
  workspace_id: z.string().optional(),
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

export type RenderableEvent = z.infer<typeof renderableEventSchema>;

export const envelopedEventSchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  event: renderableEventSchema,
});

export type EnvelopedEvent = z.infer<typeof envelopedEventSchema>;
