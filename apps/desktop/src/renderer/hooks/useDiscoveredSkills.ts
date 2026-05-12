import { useQuery } from "@tanstack/react-query";
import type { SkillDefinition } from "@vibemaestro/core";
import { trpc } from "../lib/trpc.js";

/**
 * Live filesystem-scanned skill list for an agent in the context of a workspace.
 * Re-fetched on focus / workspace switch so newly-installed skills appear
 * without restarting the app. Returns an empty list while loading or when no
 * agent is selected — the PhaseSkillEditor renders "no skills" gracefully.
 */
export function useDiscoveredSkills(
  agentId: string | null | undefined,
  workspaceId: string | null | undefined,
): SkillDefinition[] {
  const enabled = Boolean(agentId);
  const query = useQuery({
    queryKey: ["agents", "discoverSkills", agentId, workspaceId],
    queryFn: () =>
      trpc.agents.discoverSkills.query({
        agent_id: agentId ?? "",
        workspace_id: workspaceId ?? undefined,
      }),
    enabled,
    staleTime: 30_000,
  });
  return query.data?.data ?? [];
}
