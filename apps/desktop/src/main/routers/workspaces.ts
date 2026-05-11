import {
  workspaceCreateInputSchema,
  workspaceIdInputSchema,
  workspaceListResponseSchema,
  workspacePatchInputSchema,
  workspaceResponseSchema,
} from "@vibemaestro/core";
import { z } from "zod";
import { createWorkspaceService } from "../services/workspace-service.js";
import { procedure, router } from "../trpc.js";

export const workspacesRouter = router({
  list: procedure.output(workspaceListResponseSchema).query(() => {
    const svc = createWorkspaceService();
    return { data: svc.list() };
  }),

  get: procedure
    .input(workspaceIdInputSchema)
    .output(workspaceResponseSchema)
    .query(({ input }) => {
      const svc = createWorkspaceService();
      return { data: svc.require(input.id) };
    }),

  create: procedure
    .input(workspaceCreateInputSchema)
    .output(workspaceResponseSchema)
    .mutation(({ input }) => {
      const svc = createWorkspaceService();
      return { data: svc.create(input) };
    }),

  patch: procedure
    .input(workspacePatchInputSchema)
    .output(workspaceResponseSchema)
    .mutation(({ input }) => {
      const svc = createWorkspaceService();
      return { data: svc.patch(input) };
    }),

  delete: procedure
    .input(workspaceIdInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ input }) => {
      const svc = createWorkspaceService();
      svc.delete(input.id);
      return { ok: true };
    }),
});
