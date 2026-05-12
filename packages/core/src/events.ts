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

/**
 * Emitted when the dispatcher detects the agent's PTY has been idle for
 * IDLE_INPUT_REQUESTED_MS. The agent has finished responding and is parked at
 * the REPL prompt waiting for the next user message. The renderer surfaces
 * this as a notification icon on the task card so the user knows their
 * attention is needed.
 */
export const eventRunInputRequested = z.object({
  type: z.literal("run.input_requested"),
  task_id: z.string(),
  workspace_id: z.string().optional(),
  run_id: z.string(),
  idle_ms: z.number().int(),
});

/**
 * Emitted when PTY output resumes after a "waiting for input" window — the
 * user typed something into the REPL, or the agent started producing output
 * again (e.g., processing a queued tool call). The renderer clears the
 * notification icon.
 */
export const eventRunInputResumed = z.object({
  type: z.literal("run.input_resumed"),
  task_id: z.string(),
  workspace_id: z.string().optional(),
  run_id: z.string(),
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
  eventRunInputRequested,
  eventRunInputResumed,
  eventAgentAvailability,
]);

export type RenderableEvent = z.infer<typeof renderableEventSchema>;

export const envelopedEventSchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  event: renderableEventSchema,
});

export type EnvelopedEvent = z.infer<typeof envelopedEventSchema>;
