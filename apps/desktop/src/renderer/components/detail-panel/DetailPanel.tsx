import type { Agent, Task } from "@vibemaestro/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useApproveTask, useCancelTask, useRejectTask, useRunTask } from "../../hooks/useTasks.js";
import { cn } from "../../lib/cn.js";
import { AgentChip } from "../agent/AgentChip.js";
import { StatusIndicator } from "../status/StatusIndicator.js";
import { TerminalTab } from "./TerminalTab.js";
import { TranscriptTab } from "./TranscriptTab.js";

type Props = {
  task: Task | null;
  agents: Map<string, Agent>;
  onClose: () => void;
};

type Tab = "terminal" | "transcript" | "diff";

const PANEL_LABELS: Record<Tab, string> = {
  terminal: "Terminal",
  transcript: "Transcript",
  diff: "Diff",
};

export function DetailPanel({ task, agents, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("terminal");
  // Reset tab to terminal when task changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: only key on task.id
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

      <PanelFooter task={task} onClose={onClose} />
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

function PanelFooter({ task, onClose }: { task: Task; onClose: () => void }) {
  const run = useRunTask();
  const approve = useApproveTask();
  const reject = useRejectTask();
  const cancel = useCancelTask();

  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <footer className="border-t border-border-subtle px-[var(--space-5)] py-[var(--space-3)] flex items-center justify-end gap-[var(--space-2)]">
      {children}
    </footer>
  );

  if (task.status === "backlog") {
    return (
      <Wrap>
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
      </Wrap>
    );
  }
  if (task.status === "reviewing") {
    return (
      <Wrap>
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
  return null;
}
