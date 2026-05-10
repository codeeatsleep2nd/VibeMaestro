import { z } from "zod";
export const TASK_STATUSES = ["backlog", "running", "reviewing", "complete", "blocked", "error"];
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskSchema = z.object({
  id: z.string().regex(/^VM-\d+$/),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(8000),
  status: taskStatusSchema,
  agent_id: z.string(),
  current_run_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});
export const taskCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(8000),
  agent_id: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
export const taskListInputSchema = z.object({
  status: taskStatusSchema.optional(),
  agent_id: z.string().optional(),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at_desc", "updated_at_desc"]).default("updated_at_desc"),
});
export const taskListResponseSchema = z.object({
  data: z.array(taskSchema),
  meta: z.object({
    total: z.number().int(),
    page: z.number().int(),
    per_page: z.number().int(),
  }),
});
export const taskResponseSchema = z.object({ data: taskSchema });
export const taskIdInputSchema = z.object({ id: z.string().regex(/^VM-\d+$/) });
