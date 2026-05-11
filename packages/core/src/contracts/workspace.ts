import { z } from "zod";

export const PHASES = ["planning", "running", "reviewing", "complete"] as const;
export const phaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof phaseSchema>;

/**
 * Each phase holds AT MOST ONE slash command. The D20 spike (2026-05-10) showed
 * `claude --print "<arg>"` honors a single leading slash command + free text; multi-slash
 * in one arg does NOT activate the additional slashes. UI is single-select per phase.
 */
export const MAX_SKILLS_PER_PHASE = 1;

export const phaseSkillsSchema = z.object({
  planning: z.array(z.string().min(1).max(80)).max(MAX_SKILLS_PER_PHASE).default([]),
  running: z.array(z.string().min(1).max(80)).max(MAX_SKILLS_PER_PHASE).default([]),
  reviewing: z.array(z.string().min(1).max(80)).max(MAX_SKILLS_PER_PHASE).default([]),
  complete: z.array(z.string().min(1).max(80)).max(MAX_SKILLS_PER_PHASE).default([]),
});
export type PhaseSkills = z.infer<typeof phaseSkillsSchema>;

export const emptyPhaseSkills = (): PhaseSkills => ({
  planning: [],
  running: [],
  reviewing: [],
  complete: [],
});

/**
 * Override semantics are whole-phase replace, not key-merge. If a task overrides
 * `running: []`, the resolved running skills are `[]`, not the workspace's. Each key
 * is independently nullable so partial overrides fall through to the workspace value.
 */
export const phaseSkillsOverrideSchema = phaseSkillsSchema.partial().nullable();
export type PhaseSkillsOverride = z.infer<typeof phaseSkillsOverrideSchema>;

export const workspaceSchema = z.object({
  id: z.string().regex(/^ws_[a-z0-9_-]+$/),
  label: z.string().min(1).max(80),
  path: z.string().min(1),
  default_agent_id: z.string(),
  phase_skills: phaseSkillsSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceCreateInputSchema = z.object({
  label: z.string().min(1).max(80),
  path: z.string().min(1),
  default_agent_id: z.string(),
  phase_skills: phaseSkillsSchema.optional(),
});
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateInputSchema>;

/**
 * D15: `path` is immutable post-create. Only label, default_agent_id, phase_skills
 * are patchable. To "move" a workspace, the user creates a new one.
 */
export const workspacePatchInputSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(80).optional(),
  default_agent_id: z.string().optional(),
  phase_skills: phaseSkillsSchema.optional(),
});
export type WorkspacePatchInput = z.infer<typeof workspacePatchInputSchema>;

export const workspaceIdInputSchema = z.object({ id: z.string() });
export type WorkspaceIdInput = z.infer<typeof workspaceIdInputSchema>;

export const workspaceResponseSchema = z.object({ data: workspaceSchema });
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;

export const workspaceListResponseSchema = z.object({ data: z.array(workspaceSchema) });
export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>;

export const DEFAULT_WORKSPACE_ID = "ws_local";
