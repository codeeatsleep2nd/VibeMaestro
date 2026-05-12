import type { Agent, PhaseSkillsOverride, Workspace } from "@vibemaestro/core";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDiscoveredSkills } from "../../hooks/useDiscoveredSkills.js";
import { useCreateTask } from "../../hooks/useTasks.js";
import { cn } from "../../lib/cn.js";
import { AgentChip } from "../agent/AgentChip.js";
import { PhaseSkillEditor } from "../workspace/PhaseSkillEditor.js";

type Props = {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
  workspace: Workspace | null;
  initialPrompt?: string | null;
};

export function CreateTaskModal({ open, onClose, agents, workspace, initialPrompt }: Props) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState<string>(
    workspace?.default_agent_id ?? agents[0]?.id ?? "claude-code",
  );
  const [phaseSkillsOverride, setPhaseSkillsOverride] = useState<PhaseSkillsOverride>(null);
  const create = useCreateTask();
  const inputRef = useRef<HTMLInputElement>(null);

  // D14: re-render pre-fill when the active workspace changes.
  // Reset agent + override whenever the workspace changes (or modal opens fresh).
  useEffect(() => {
    if (!open) return;
    setAgentId(workspace?.default_agent_id ?? agents[0]?.id ?? "claude-code");
    setPhaseSkillsOverride(null);
  }, [open, workspace, agents]);

  useEffect(() => {
    if (!open) return;
    if (initialPrompt) {
      setPrompt(initialPrompt);
      // Use the first sentence (or first 80 chars) as the title hint.
      const trimmed = initialPrompt.trim();
      const firstStop = trimmed.search(/[.!?\n]/);
      const hint = firstStop > 0 ? trimmed.slice(0, firstStop) : trimmed.slice(0, 80);
      if (!title.trim()) setTitle(hint);
    }
    setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, initialPrompt, title]);

  const discoveredSkills = useDiscoveredSkills(agentId || null, workspace?.id ?? null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !prompt.trim() || !workspace) return;
    await create.mutateAsync({
      workspace_id: workspace.id,
      title: title.trim(),
      prompt: prompt.trim(),
      agent_id: agentId,
      phase_skills_override: phaseSkillsOverride,
    });
    setTitle("");
    setPrompt("");
    setPhaseSkillsOverride(null);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create task"
      className="fixed inset-0 z-50 flex items-center justify-center px-[var(--space-4)]"
      style={{ backgroundColor: "var(--surface-overlay)" }}
    >
      {/* Backdrop. Click-outside-to-close is intentional, but it's not a
          keyboard target — Esc closes the modal (see useEffect above). */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <form
        onSubmit={submit}
        className={cn(
          "relative w-full bg-surface-raised border border-border-default rounded-md",
          "p-[var(--space-5)]",
        )}
        style={{ maxWidth: 560, boxShadow: "var(--shadow-3)" }}
      >
        <div className="flex items-center justify-between mb-[var(--space-4)]">
          <h2 className="font-display text-heading text-text-primary">New task</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <label className="block">
          <span className="text-caption text-text-secondary block mb-[var(--space-1)]">Title</span>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            placeholder="Add CSV export to invoice list"
            className="w-full bg-surface-inset border border-border-subtle rounded-sm
                       px-[var(--space-3)] py-[var(--space-2)] text-text-primary
                       focus:border-border-focus focus:outline-none transition-colors"
          />
        </label>

        <label className="block mt-[var(--space-4)]">
          <span className="text-caption text-text-secondary block mb-[var(--space-1)]">Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={8000}
            required
            rows={4}
            placeholder="One-liner the agent should act on…"
            className="w-full bg-surface-inset border border-border-subtle rounded-sm
                       px-[var(--space-3)] py-[var(--space-2)] text-text-primary font-mono text-meta
                       focus:border-border-focus focus:outline-none transition-colors resize-y"
          />
        </label>

        <fieldset className="mt-[var(--space-4)]">
          <legend className="text-caption text-text-secondary mb-[var(--space-2)]">Agent</legend>
          <div className="flex gap-[var(--space-2)]">
            {agents
              .filter((a) => a.tier === "v1")
              .map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setAgentId(agent.id)}
                  className={cn(
                    "flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)]",
                    "rounded-sm border transition-colors duration-[var(--duration-fast)]",
                    agentId === agent.id
                      ? "border-border-focus bg-surface-pressed"
                      : "border-border-subtle hover:border-border-default",
                  )}
                >
                  <AgentChip agent={agent} size="sm" />
                  <span className="text-meta text-text-primary">{agent.label}</span>
                </button>
              ))}
          </div>
        </fieldset>

        {workspace ? (
          <div className="mt-[var(--space-4)]">
            <PhaseSkillEditor
              mode="task"
              inheritFrom={workspace.phase_skills}
              value={phaseSkillsOverride}
              onChange={setPhaseSkillsOverride}
              skills={discoveredSkills}
            />
          </div>
        ) : null}

        <div className="mt-[var(--space-5)] flex items-center justify-end gap-[var(--space-2)]">
          <button
            type="button"
            onClick={onClose}
            className="px-[var(--space-3)] py-[var(--space-2)] text-meta text-text-secondary
                       hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!workspace || !title.trim() || !prompt.trim() || create.isPending}
            className="px-[var(--space-4)] py-[var(--space-2)] text-meta rounded-sm
                       bg-accent-base text-text-on-accent hover:bg-accent-hover
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-[var(--duration-fast)]"
          >
            {create.isPending ? "Creating…" : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
