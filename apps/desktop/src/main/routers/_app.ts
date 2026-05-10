import { router } from "../trpc.js";
import { agentsRouter } from "./agents.js";
import { healthRouter } from "./health.js";
import { tasksRouter } from "./tasks.js";

export const appRouter = router({
  health: healthRouter,
  tasks: tasksRouter,
  agents: agentsRouter,
});

export type AppRouter = typeof appRouter;
