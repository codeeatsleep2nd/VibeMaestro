import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PhaseSkillsOverride, Task, TaskListInput } from "@vibemaestro/core";
import { trpc } from "../lib/trpc.js";

const DEFAULT_INPUT: TaskListInput = {
  page: 1,
  per_page: 100,
  sort: "updated_at_desc",
};

/**
 * When `workspaceId` is provided, the list is scoped to that workspace; otherwise
 * the unscoped query is used (kept for back-compat with the empty-state path that
 * runs before a workspace is selected).
 */
export function useTasks(workspaceId?: string) {
  const input: TaskListInput = workspaceId
    ? { ...DEFAULT_INPUT, workspace_id: workspaceId }
    : DEFAULT_INPUT;
  return useQuery({
    queryKey: ["tasks", "list", input],
    queryFn: () => trpc.tasks.list.query(input),
    staleTime: 30_000,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents", "list"],
    queryFn: () => trpc.agents.list.query(),
    staleTime: 60_000,
  });
}

export function useRunTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.tasks.run.mutate({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useApproveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.tasks.approve.mutate({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useRejectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.tasks.reject.mutate({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.tasks.cancel.mutate({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useSubmitForReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.tasks.submitForReview.mutate({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export type CreateTaskInput = {
  workspace_id: string;
  title: string;
  prompt: string;
  agent_id?: string;
  phase_skills_override?: PhaseSkillsOverride;
};

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => trpc.tasks.create.mutate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/**
 * Dev helper — drives the state machine forward without a real PTY. Replaced
 * by plan #3's dispatcher when real agents are wired in.
 */
export function useSimulateExit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, success }: { id: string; success: boolean }) =>
      trpc.tasks._simulateAgentExit.mutate({ id, success }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export type TaskGroups = Record<Task["status"], Task[]>;

export function groupByStatus(tasks: Task[]): TaskGroups {
  const empty: TaskGroups = {
    backlog: [],
    running: [],
    reviewing: [],
    complete: [],
    blocked: [],
    error: [],
  };
  for (const task of tasks) {
    empty[task.status].push(task);
  }
  return empty;
}
