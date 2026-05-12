import type { Agent, Phase, Task, Workspace } from "@vibemaestro/core";
import { PHASES, resolvePhaseSkills } from "@vibemaestro/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useApproveTask,
  useCancelTask,
  useRejectTask,
  useRunTask,
  useSubmitForReview,
} from "../../hooks/useTasks.js";
import { useInvokePhase } from "../../hooks/useWorkspaces.js";
import { cn } from "../../lib/cn.js";
import { AgentChip } from "../agent/AgentChip.js";
import { StatusIndicator } from "../status/StatusIndicator.js";
import { TerminalTab } from "./TerminalTab.js";
import { TranscriptTab } from "./TranscriptTab.js";

type Props = {
  task: Task | null;
  agents: Map<string, Agent>;
  workspaces: Map<string, Workspace>;
  onClose: () => void;
};

const PHASE_LABEL: Record<Phase, string> = {
  planning: "Planning",
  running: "Implementing",
  reviewing: "Reviewing",
  complete: "Complete",
};

const STATUS_TO_ACTIVE_PHASE: Partial<Record<Task["status"], Phase>> = {
  backlog: "planning",
  running: "running",
  reviewing: "reviewing",
  complete: "complete",
};

type Tab = "terminal" | "transcript" | "diff";

const PANEL_LABELS: Record<Tab, string> = {
  terminal: "Terminal",
  transcript: "Transcript",
  diff: "Diff",
};

export function DetailPanel({ task, agents, workspaces, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("terminal");
  // Reset tab to terminal when task changes
  useEffect(() => {
    setTab("terminal");
  }, [task?.id]);

  // Esc to close
  useEffect(() => {
    if (!task) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  if (!task) return null;
  const agent = agents.get(task.agent_id);
  const workspace = workspaces.get(task.workspace_id) ?? null;
  const effectivePhases = workspace
    ? resolvePhaseSkills(workspace, task)
    : { planning: [], running: [], reviewing: [], complete: [] };
  const activePhase = STATUS_TO_ACTIVE_PHASE[task.status] ?? null;

  return (
    <aside
      role="dialog"
      aria-label={`Task ${task.id} detail`}
      aria-modal="false"
      className={cn(
        "fixed top-0 right-0 h-full bg-surface-base border-l border-border-default z-40",
        "flex flex-col",
      )}
      style={{
        width: "clamp(560px, 55vw, 720px)",
        boxShadow: "var(--shadow-3)",
      }}
    >
      <PanelHeader task={task} agent={agent} onClose={onClose} />
      <PhaseSkillStrip phases={effectivePhases} activePhase={activePhase} />
      <div className="border-b border-border-subtle px-[var(--space-5)] flex gap-[var(--space-4)]">
        {(Object.keys(PANEL_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "py-[var(--space-3)] text-meta border-b-2 transition-colors duration-[var(--duration-fast)]",
              tab === t
                ? "border-accent-base text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {PANEL_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "terminal" && <TerminalTab task={task} />}
        {tab === "transcript" && <TranscriptTab task={task} />}
        {tab === "diff" && <DiffPlaceholder />}
      </div>

      <PanelFooter task={task} workspaces={workspaces} onClose={onClose} />
    </aside>
  );
}

function PanelHeader({
  task,
  agent,
  onClose,
}: {
  task: Task;
  agent: Agent | undefined;
  onClose: () => void;
}) {
  return (
    <header className="px-[var(--space-5)] py-[var(--space-4)] border-b border-border-subtle">
      <div className="flex items-center justify-between gap-[var(--space-3)]">
        <div className="flex items-center gap-[var(--space-3)] min-w-0">
          <span className="text-meta text-text-tertiary font-mono">{task.id}</span>
          <StatusIndicator status={task.status} withLabel />
          {agent && <AgentChip agent={agent} size="sm" />}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail panel"
          className="text-text-tertiary hover:text-text-primary transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <h2 className="font-display text-heading text-text-primary mt-[var(--space-3)]">
        {task.title}
      </h2>
      <p className="text-meta text-text-secondary mt-[var(--space-2)] line-clamp-3">
        {task.prompt}
      </p>
    </header>
  );
}

/**
 * Compact row under the panel header summarizing the effective phase skills for
 * this task (override > workspace default). The active phase (matching task.status)
 * gets an accent rule on the left and brighter foreground; the others render in
 * muted secondary text. Phases without a configured skill show "—".
 */
function PhaseSkillStrip({
  phases,
  activePhase,
}: {
  phases: ReturnType<typeof resolvePhaseSkills>;
  activePhase: Phase | null;
}) {
  return (
    <section
      aria-label="Phase skills"
      className="px-[var(--space-5)] py-[var(--space-3)] border-b border-border-subtle bg-surface-base"
    >
      <div className="text-caption font-mono uppercase tracking-wider text-text-tertiary mb-[var(--space-2)]">
        Phase skills
      </div>
      <ul className="flex flex-col gap-[var(--space-1)]">
        {(PHASES as readonly Phase[]).map((phase) => {
          const skill = phases[phase][0];
          const isActive = phase === activePhase;
          return (
            <li
              key={phase}
              className={cn(
                "flex items-center gap-[var(--space-3)] pl-[var(--space-2)]",
                "border-l-2",
                isActive ? "border-accent-base" : "border-transparent",
              )}
            >
              <span
                className={cn(
                  "text-caption font-mono uppercase tracking-wider w-[78px]",
                  isActive ? "text-text-primary" : "text-text-tertiary",
                )}
              >
                {PHASE_LABEL[phase]}
              </span>
              {skill ? (
                <span
                  className={cn(
                    "font-mono text-meta",
                    isActive ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  {skill}
                </span>
              ) : (
                <span className="text-meta text-text-tertiary italic">— not configured —</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DiffPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-[var(--space-5)]">
      <div>
        <p className="text-meta text-text-tertiary">Diff view coming in v1.5</p>
        <p className="text-meta text-text-tertiary mt-[var(--space-2)] max-w-prose mx-auto">
          Real diffs need a project-root concept on the task. Tracked in TODOS.md.
        </p>
      </div>
    </div>
  );
}

function PanelFooter({
  task,
  workspaces,
  onClose,
}: {
  task: Task;
  workspaces: Map<string, Workspace>;
  onClose: () => void;
}) {
  const run = useRunTask();
  const approve = useApproveTask();
  const reject = useRejectTask();
  const cancel = useCancelTask();
  const submitForReview = useSubmitForReview();
  const invokePhase = useInvokePhase();

  const workspace = workspaces.get(task.workspace_id) ?? null;

  // D18: per-phase Run buttons live HERE (not in the WorkspaceStrip).
  // Disabled when a run is live for the task (D9 guard).
  const liveRun = task.status === "running";
  const effectivePhases = workspace
    ? resolvePhaseSkills(workspace, task)
    : { planning: [], running: [], reviewing: [], complete: [] };

  const phaseButtons = (PHASES as readonly Phase[])
    .filter((p) => p !== "running") // "Run" handles the running phase via tasks.run with state transition
    .map((p) => {
      const skill = effectivePhases[p][0];
      if (!skill) return null;
      return (
        <button
          key={p}
          type="button"
          onClick={() => invokePhase.mutate({ id: task.id, phase: p })}
          disabled={liveRun || invokePhase.isPending}
          title={`Spawn a fresh run with ${skill} (no state change)`}
          className="px-[var(--space-3)] py-[var(--space-2)] rounded-sm border border-border-default text-meta text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed capitalize"
        >
          Run {p}
        </button>
      );
    })
    .filter(Boolean);

  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <footer className="border-t border-border-subtle px-[var(--space-5)] py-[var(--space-3)] flex items-center justify-end gap-[var(--space-2)] flex-wrap">
      {children}
    </footer>
  );

  if (task.status === "backlog") {
    return (
      <Wrap>
        {phaseButtons}
        <button
          type="button"
          onClick={() => run.mutate(task.id)}
          disabled={run.isPending}
          className="px-[var(--space-4)] py-[var(--space-2)] rounded-sm bg-accent-base text-text-on-accent text-meta hover:bg-accent-hover transition-colors duration-[var(--duration-fast)] disabled:opacity-50"
        >
          Run
        </button>
      </Wrap>
    );
  }
  if (task.status === "running") {
    return (
      <Wrap>
        <button
          type="button"
          onClick={() => cancel.mutate(task.id)}
          disabled={cancel.isPending}
          className="px-[var(--space-3)] py-[var(--space-2)] rounded-sm border border-border-default text-meta text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-50"
        >
          Cancel run
        </button>
        <button
          type="button"
          onClick={() => submitForReview.mutate(task.id)}
          disabled={submitForReview.isPending}
          title="Move to Reviewing — fires the reviewing-phase skill if configured"
          className="px-[var(--space-4)] py-[var(--space-2)] rounded-sm bg-accent-base text-text-on-accent text-meta hover:bg-accent-hover transition-colors duration-[var(--duration-fast)] disabled:opacity-50"
        >
          Submit for review
        </button>
      </Wrap>
    );
  }
  if (task.status === "reviewing") {
    return (
      <Wrap>
        {phaseButtons}
        <button
          type="button"
          onClick={() => reject.mutate(task.id)}
          disabled={reject.isPending}
          className="px-[var(--space-3)] py-[var(--space-2)] rounded-sm border border-border-default text-meta text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-50"
        >
          Request changes
        </button>
        <button
          type="button"
          onClick={() => {
            approve.mutate(task.id);
            onClose();
          }}
          disabled={approve.isPending}
          className="px-[var(--space-4)] py-[var(--space-2)] rounded-sm bg-accent-base text-text-on-accent text-meta hover:bg-accent-hover transition-colors duration-[var(--duration-fast)] disabled:opacity-50"
        >
          Approve
        </button>
      </Wrap>
    );
  }
  // complete / blocked / error — phase buttons remain available for invoke-after-fact.
  return phaseButtons.length > 0 ? <Wrap>{phaseButtons}</Wrap> : null;
}
