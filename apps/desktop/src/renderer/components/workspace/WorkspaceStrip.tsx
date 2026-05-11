import type { Agent, Workspace } from "@vibemaestro/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn.js";
import { AgentChip } from "../agent/AgentChip.js";

type Props = {
  workspace: Workspace;
  agent: Agent | null;
};

const PHASE_KEYS: { phase: keyof Workspace["phase_skills"]; short: string }[] = [
  { phase: "planning", short: "P" },
  { phase: "running", short: "R" },
  { phase: "reviewing", short: "Rv" },
  { phase: "complete", short: "C" },
];

/**
 * Per D18: collapsed by default (single 40px row). Click to expand the 4 phase rows.
 * Per-phase Run buttons live ONLY in the task detail panel, NOT here. The strip is
 * a read-only context belt.
 */
export function WorkspaceStrip({ workspace, agent }: Props) {
  const [expanded, setExpanded] = useState(false);

  const counts = PHASE_KEYS.map((p) => ({
    short: p.short,
    n: workspace.phase_skills[p.phase].length,
  }));
  const total = counts.reduce((acc, c) => acc + c.n, 0);

  return (
    <div
      className={cn(
        "border-b border-border-subtle bg-surface-base select-none",
        "[-webkit-app-region:no-drag]",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls="workspace-strip-phases"
        className={cn(
          "w-full flex items-center gap-[var(--space-3)]",
          "px-[var(--space-4)] py-[var(--space-2)] h-[40px]",
          "hover:bg-surface-pressed transition-colors duration-[var(--duration-fast)]",
        )}
      >
        <span className="text-title text-text-primary truncate max-w-[160px]">
          {workspace.label}
        </span>
        <span className="text-text-tertiary">·</span>
        <span
          className="font-mono text-meta text-text-tertiary truncate flex-1 min-w-0 text-left"
          style={{ direction: "rtl" }}
          title={workspace.path}
        >
          {workspace.path}
        </span>
        <span className="text-text-tertiary">·</span>
        {agent ? (
          <span className="flex items-center gap-[var(--space-2)]">
            <AgentChip agent={agent} size="sm" />
            <span className="text-meta text-text-secondary">{agent.label}</span>
          </span>
        ) : null}
        <span
          className={cn(
            "font-mono text-caption uppercase tracking-wider",
            total > 0 ? "text-text-tertiary" : "text-text-tertiary opacity-70",
          )}
        >
          {total === 0
            ? "[no phases configured]"
            : `[${counts.map((c) => `${c.short}:${c.n}`).join(" ")}]`}
        </span>
        {expanded ? (
          <ChevronUp size={12} className="text-text-tertiary" />
        ) : (
          <ChevronDown size={12} className="text-text-tertiary" />
        )}
      </button>
      {expanded ? (
        <div
          id="workspace-strip-phases"
          className="px-[var(--space-4)] py-[var(--space-2)] border-t border-border-subtle"
        >
          {PHASE_KEYS.map(({ phase, short }) => {
            const skill = workspace.phase_skills[phase][0];
            return (
              <div
                key={phase}
                className="flex items-center gap-[var(--space-3)] py-[var(--space-1)]"
              >
                <span className="text-caption font-mono uppercase text-text-tertiary w-[24px]">
                  {short}
                </span>
                <span className="text-meta text-text-secondary capitalize w-[78px]">{phase}</span>
                {skill ? (
                  <span className="font-mono text-meta text-text-primary">{skill}</span>
                ) : (
                  <span className="text-meta text-text-tertiary italic">— not configured —</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
