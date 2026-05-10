import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskListInput } from "@vibemaestro/core";
import { trpc } from "../lib/trpc.js";

const DEFAULT_INPUT: TaskListInput = {
  page: 1,
  per_page: 100,
  sort: "updated_at_desc",
};

export function useTasks() {
  return useQuery({
    queryKey: ["tasks", "list", DEFAULT_INPUT],
    queryFn: () => trpc.tasks.list.query(DEFAULT_INPUT),
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

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; prompt: string; agent_id: string }) =>
      trpc.tasks.create.mutate(input),
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
