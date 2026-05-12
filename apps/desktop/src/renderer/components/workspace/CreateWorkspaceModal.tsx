import { type Agent, emptyPhaseSkills, type PhaseSkills } from "@vibemaestro/core";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDiscoveredSkills } from "../../hooks/useDiscoveredSkills.js";
import { useCreateWorkspace } from "../../hooks/useWorkspaces.js";
import { cn } from "../../lib/cn.js";
import { AgentChip } from "../agent/AgentChip.js";
import { PhaseSkillEditor } from "./PhaseSkillEditor.js";

type Props = {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
  onCreated?: (workspaceId: string) => void;
};

export function CreateWorkspaceModal({ open, onClose, agents, onCreated }: Props) {
  const v1Agents = agents.filter((a) => a.tier === "v1");
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");
  const [agentId, setAgentId] = useState<string>(v1Agents[0]?.id ?? "");
  const [phaseSkills, setPhaseSkills] = useState<PhaseSkills>(emptyPhaseSkills());
  const [error, setError] = useState<string | null>(null);
  const create = useCreateWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const noAgents = v1Agents.length === 0;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!agentId && v1Agents[0]) setAgentId(v1Agents[0].id);
    setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, agentId, v1Agents]);

  const discoveredSkills = useDiscoveredSkills(agentId || null, null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !path.trim() || !agentId) return;
    try {
      const res = await create.mutateAsync({
        label: label.trim(),
        path: path.trim(),
        default_agent_id: agentId,
        phase_skills: phaseSkills,
      });
      onCreated?.(res.data.id);
      setLabel("");
      setPath("");
      setPhaseSkills(emptyPhaseSkills());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workspace-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-[var(--space-4)]"
      style={{ backgroundColor: "var(--surface-overlay)" }}
    >
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
        style={{ maxWidth: 520, boxShadow: "var(--shadow-3)" }}
      >
        <div className="flex items-center justify-between mb-[var(--space-4)]">
          <h2 id="create-workspace-title" className="font-display text-heading text-text-primary">
            New workspace
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {noAgents ? (
          <div className="mb-[var(--space-4)] rounded-sm border border-border-default bg-surface-inset px-[var(--space-3)] py-[var(--space-3)]">
            <p className="text-meta text-status-error">No v1 agents are configured.</p>
            <p className="text-caption text-text-tertiary mt-[var(--space-1)]">
              Install Claude Code or Codex on PATH and run an agent probe before creating a
              workspace.
            </p>
          </div>
        ) : null}

        <label className="block">
          <span className="text-caption text-text-secondary block mb-[var(--space-1)]">Label</span>
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            required
            placeholder="acme-web"
            className="w-full bg-surface-inset border border-border-subtle rounded-sm
                       px-[var(--space-3)] py-[var(--space-2)] text-text-primary
                       focus:border-border-focus focus:outline-none transition-colors"
          />
        </label>

        <label className="block mt-[var(--space-4)]">
          <span className="text-caption text-text-secondary block mb-[var(--space-1)]">Path</span>
          <div className="flex gap-[var(--space-2)]">
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              required
              placeholder="/Users/me/code/acme-web or ~/code/acme-web"
              className="flex-1 bg-surface-inset border border-border-subtle rounded-sm
                         px-[var(--space-3)] py-[var(--space-2)] text-text-primary font-mono text-meta
                         focus:border-border-focus focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={async () => {
                const result = await window.vmBridge.dialog.selectDirectory();
                if (typeof result === "string") setPath(result);
              }}
              className="px-[var(--space-3)] py-[var(--space-2)] text-meta rounded-sm
                         border border-border-default text-text-secondary
                         hover:border-border-strong hover:text-text-primary transition-colors"
            >
              Browse…
            </button>
          </div>
        </label>

        <fieldset className="mt-[var(--space-4)]">
          <legend className="text-caption text-text-secondary mb-[var(--space-2)]">
            Default agent
          </legend>
          <div className="flex gap-[var(--space-2)] flex-wrap">
            {v1Agents.map((agent) => (
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

        <div className="mt-[var(--space-4)]">
          <PhaseSkillEditor
            mode="workspace"
            value={phaseSkills}
            onChange={setPhaseSkills}
            skills={discoveredSkills}
          />
        </div>

        {error ? <p className="mt-[var(--space-3)] text-meta text-status-error">{error}</p> : null}

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
            disabled={noAgents || !label.trim() || !path.trim() || !agentId || create.isPending}
            className="px-[var(--space-4)] py-[var(--space-2)] text-meta rounded-sm
                       bg-accent-base text-text-on-accent hover:bg-accent-hover
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-[var(--duration-fast)]"
          >
            {create.isPending ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </form>
    </div>
  );
}
