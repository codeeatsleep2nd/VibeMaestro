import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Phase, WorkspaceCreateInput, WorkspacePatchInput } from "@vibemaestro/core";
import { trpc } from "../lib/trpc.js";

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces", "list"],
    queryFn: () => trpc.workspaces.list.query(),
    staleTime: 60_000,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspaceCreateInput) => trpc.workspaces.create.mutate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspacePatchInput) => trpc.workspaces.patch.mutate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trpc.workspaces.delete.mutate({ id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useInvokePhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; phase: Phase }) => trpc.tasks.invokePhase.mutate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
