import {
  taskCreateInputSchema,
  taskIdInputSchema,
  taskListInputSchema,
  taskListResponseSchema,
  taskResponseSchema,
} from "@vibemaestro/core";
import { z } from "zod";
import { createTaskService } from "../services/task-service.js";
import { procedure, router } from "../trpc.js";

export const tasksRouter = router({
  list: procedure
    .input(taskListInputSchema)
    .output(taskListResponseSchema)
    .query(({ input }) => {
      const svc = createTaskService();
      const { items, total } = svc.list(input);
      return {
        data: items,
        meta: { total, page: input.page, per_page: input.per_page },
      };
    }),

  get: procedure
    .input(taskIdInputSchema)
    .output(taskResponseSchema)
    .query(({ input }) => {
      const svc = createTaskService();
      return { data: svc.get(input.id) };
    }),

  create: procedure
    .input(taskCreateInputSchema)
    .output(taskResponseSchema)
    .mutation(({ input }) => {
      const svc = createTaskService();
      return { data: svc.create(input) };
    }),

  run: procedure
    .input(taskIdInputSchema)
    .output(taskResponseSchema)
    .mutation(({ input }) => {
      const svc = createTaskService();
      return { data: svc.run(input.id).task };
    }),

  approve: procedure
    .input(taskIdInputSchema)
    .output(taskResponseSchema)
    .mutation(({ input }) => {
      const svc = createTaskService();
      return { data: svc.approve(input.id) };
    }),

  reject: procedure
    .input(taskIdInputSchema)
    .output(taskResponseSchema)
    .mutation(({ input }) => {
      const svc = createTaskService();
      return { data: svc.reject(input.id) };
    }),

  cancel: procedure
    .input(taskIdInputSchema)
    .output(taskResponseSchema)
    .mutation(({ input }) => {
      const svc = createTaskService();
      return { data: svc.cancel(input.id) };
    }),

  /**
   * Dev/preview helper. Drives state machine forward without a real PTY.
   * Plan #3 replaces this with the dispatcher's exit-code path.
   */
  _simulateAgentExit: procedure
    .input(taskIdInputSchema.extend({ success: z.boolean() }))
    .output(taskResponseSchema)
    .mutation(({ input }) => {
      const svc = createTaskService();
      return { data: svc.simulateAgentExit(input.id, input.success) };
    }),
});
