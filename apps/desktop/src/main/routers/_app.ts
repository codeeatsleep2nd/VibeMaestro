import { router } from "../trpc.js";
import { agentsRouter } from "./agents.js";
import { healthRouter } from "./health.js";
import { tasksRouter } from "./tasks.js";
import { workspacesRouter } from "./workspaces.js";

export const appRouter = router({
  health: healthRouter,
  tasks: tasksRouter,
  agents: agentsRouter,
  workspaces: workspacesRouter,
});

export type AppRouter = typeof appRouter;
