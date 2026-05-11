import { z } from "zod";
import { phaseSchema, phaseSkillsOverrideSchema } from "./workspace.js";

export const TASK_STATUSES = [
  "backlog",
  "running",
  "reviewing",
  "complete",
  "blocked",
  "error",
] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskSchema = z.object({
  id: z.string().regex(/^VM-\d+$/),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(8000),
  status: taskStatusSchema,
  /**
   * D7: agent_id is FROZEN at task creation. Changes to workspace.default_agent_id
   * do not retroactively rewrite existing tasks. There is no agent_id_override column.
   */
  agent_id: z.string(),
  workspace_id: z.string(),
  current_run_id: z.string().nullable(),
  phase_skills_override: phaseSkillsOverrideSchema.default(null),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});
export type Task = z.infer<typeof taskSchema>;

export const taskCreateInputSchema = z.object({
  workspace_id: z.string(),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(8000),
  /** If omitted, the workspace's default_agent_id is used (then frozen on the task row). */
  agent_id: z.string().optional(),
  phase_skills_override: phaseSkillsOverrideSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;

export const taskListInputSchema = z.object({
  status: taskStatusSchema.optional(),
  agent_id: z.string().optional(),
  workspace_id: z.string().optional(),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at_desc", "updated_at_desc"]).default("updated_at_desc"),
});
export type TaskListInput = z.infer<typeof taskListInputSchema>;

export const taskListResponseSchema = z.object({
  data: z.array(taskSchema),
  meta: z.object({
    total: z.number().int(),
    page: z.number().int(),
    per_page: z.number().int(),
  }),
});
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

export const taskResponseSchema = z.object({ data: taskSchema });
export type TaskResponse = z.infer<typeof taskResponseSchema>;

export const taskIdInputSchema = z.object({ id: z.string().regex(/^VM-\d+$/) });
export type TaskIdInput = z.infer<typeof taskIdInputSchema>;

export const taskInvokePhaseInputSchema = taskIdInputSchema.extend({ phase: phaseSchema });
export type TaskInvokePhaseInput = z.infer<typeof taskInvokePhaseInputSchema>;
