import {
  agentListResponseSchema,
  agentResponseSchema,
  skillDefinitionSchema,
} from "@vibemaestro/core";
import { z } from "zod";
import { discoverSkillsForClaudeCode } from "../lib/skill-discovery.js";
import { createAgentService } from "../services/agent-service.js";
import { createWorkspaceService } from "../services/workspace-service.js";
import { procedure, router } from "../trpc.js";

const agentIdInput = z.object({ id: z.string() });

export const agentsRouter = router({
  list: procedure.output(agentListResponseSchema).query(() => {
    const svc = createAgentService();
    return { data: svc.list() };
  }),

  get: procedure
    .input(agentIdInput)
    .output(agentResponseSchema)
    .query(({ input }) => {
      const svc = createAgentService();
      return { data: svc.require(input.id) };
    }),

  /**
   * Run `command --version` against the agent CLI, persist availability +
   * version. Cheap (≤2s timeout per probe), idempotent, safe to call from
   * the empty-state UI.
   */
  probe: procedure
    .input(agentIdInput)
    .output(agentResponseSchema)
    .mutation(async ({ input }) => {
      const svc = createAgentService();
      return { data: await svc.probe(input.id) };
    }),

  probeAll: procedure.output(agentListResponseSchema).mutation(async () => {
    const svc = createAgentService();
    return { data: await svc.probeAll() };
  }),

  delete: procedure
    .input(agentIdInput)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ input }) => {
      const svc = createAgentService();
      svc.delete(input.id);
      return { ok: true };
    }),

  /**
   * Admin/dev helper for replacing an agent's skill registry. v1 has no UI for
   * this; the seed populates initial skills. Future v1.x can add a Settings page.
   */
  registerSkills: procedure
    .input(z.object({ id: z.string(), skills: z.array(skillDefinitionSchema) }))
    .output(agentResponseSchema)
    .mutation(({ input }) => {
      const svc = createAgentService();
      return { data: svc.registerSkills(input.id, input.skills) };
    }),

  /**
   * Filesystem-scanned skill catalog for an agent in the context of a workspace.
   * Returns the live list every call (no caching) so installing a new skill
   * shows up immediately without restarting the app. For Claude Code this scans
   * ~/.claude/skills, plugin marketplaces, and <workspace.path>/.claude/skills.
   * For agents without a filesystem skill model (codex), falls back to the
   * seeded list stored on the agent row.
   */
  discoverSkills: procedure
    .input(z.object({ agent_id: z.string(), workspace_id: z.string().optional() }))
    .output(z.object({ data: z.array(skillDefinitionSchema) }))
    .query(({ input }) => {
      const svc = createAgentService();
      const agent = svc.require(input.agent_id);
      if (agent.id !== "claude-code") {
        // Codex et al. — return the static seeded list.
        return { data: agent.skills };
      }
      let workspacePath: string | null = null;
      if (input.workspace_id) {
        try {
          const ws = createWorkspaceService().get(input.workspace_id);
          workspacePath = ws?.path ?? null;
        } catch {
          workspacePath = null;
        }
      }
      const scanned = discoverSkillsForClaudeCode(workspacePath);
      // Merge with the agent's seeded skills so workspace-scoped extras are
      // additive — seeded skills shadow scanned ones when ids collide.
      const byId = new Map(scanned.map((s) => [s.id, s]));
      for (const seeded of agent.skills) byId.set(seeded.id, seeded);
      return { data: Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id)) };
    }),
});
