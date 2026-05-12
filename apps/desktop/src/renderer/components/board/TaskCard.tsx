import type { Agent, Task } from "@vibemaestro/core";
import { ArrowRight, Bell, Check, RefreshCw, X } from "lucide-react";
import {
  useApproveTask,
  useCancelTask,
  useRejectTask,
  useRunTask,
  useSimulateExit,
} from "../../hooks/useTasks.js";
import { cn } from "../../lib/cn.js";
import { AgentChip } from "../agent/AgentChip.js";
import { StatusIndicator } from "../status/StatusIndicator.js";

type Props = {
  task: Task;
  agents: Map<string, Agent>;
  awaitingInput?: boolean;
  onSelect?: (taskId: string) => void;
};

export function TaskCard({ task, agents, awaitingInput, onSelect }: Props) {
  const agent = agents.get(task.agent_id);
  const elapsed = formatRelative(task.updated_at);

  return (
    <article
      onClick={() => onSelect?.(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(task.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${task.id}: ${task.title}${awaitingInput ? " (agent awaiting input)" : ""}`}
      className={cn(
        "group relative bg-surface-raised rounded-md border border-border-subtle",
        "transition-[border-color,transform] duration-[var(--duration-fast)] ease-[var(--easing-standard)]",
        "hover:border-border-default cursor-pointer",
        "p-[var(--space-4)]",
      )}
      style={{
        boxShadow: "var(--shadow-1)",
        // Agent stripe — 3px left border using the agent hue. Per CLAUDE.md, not raw px.
        borderLeftWidth: "3px",
        borderLeftColor: `var(--agent-${task.agent_id})`,
      }}
    >
      {/* Header: ID + status indicator + (optional) input-needed bell + agent chip */}
      <header className="flex items-center justify-between gap-3">
        <span className="text-meta text-text-tertiary">{task.id}</span>
        <div className="flex items-center gap-2">
          {awaitingInput ? <AwaitingInputBadge /> : null}
          <StatusIndicator status={task.status} />
          {agent && <AgentChip agent={agent} size="sm" />}
        </div>
      </header>

      {/* Title */}
      <h3 className="text-title text-text-primary mt-[var(--space-3)] line-clamp-2">
        {task.title}
      </h3>

      {/* Prompt preview */}
      <p className="text-meta text-text-secondary mt-[var(--space-2)] line-clamp-2">
        {task.prompt}
      </p>

      {/* Footer: elapsed + actions */}
      <footer className="mt-[var(--space-4)] flex items-center justify-between">
        <span className="text-caption text-text-tertiary">{elapsed}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <CardActions task={task} />
        </div>
      </footer>
    </article>
  );
}

function CardActions({ task }: { task: Task }) {
  const run = useRunTask();
  const approve = useApproveTask();
  const reject = useRejectTask();
  const cancel = useCancelTask();
  const simulate = useSimulateExit();

  if (task.status === "backlog") {
    return (
      <ActionButton
        label="Run"
        icon={<ArrowRight size={13} />}
        primary
        onClick={() => run.mutate(task.id)}
      />
    );
  }
  if (task.status === "running") {
    return (
      <>
        <ActionButton
          label="Finish"
          icon={<Check size={13} />}
          onClick={() => simulate.mutate({ id: task.id, success: true })}
        />
        <ActionButton
          label="Cancel"
          icon={<X size={13} />}
          onClick={() => cancel.mutate(task.id)}
        />
      </>
    );
  }
  if (task.status === "reviewing") {
    return (
      <>
        <ActionButton
          label="Approve"
          icon={<Check size={13} />}
          primary
          onClick={() => approve.mutate(task.id)}
        />
        <ActionButton
          label="Reject"
          icon={<X size={13} />}
          onClick={() => reject.mutate(task.id)}
        />
      </>
    );
  }
  if (task.status === "error") {
    return (
      <ActionButton
        label="Retry"
        icon={<RefreshCw size={13} />}
        onClick={() => simulate.mutate({ id: task.id, success: true })}
      />
    );
  }
  return null;
}

function ActionButton({
  label,
  icon,
  primary,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex items-center gap-[var(--space-1)] px-[var(--space-2)] py-[var(--space-1)]",
        "text-meta rounded-sm border transition-colors duration-[var(--duration-fast)]",
        primary
          ? "bg-accent-base text-text-on-accent border-transparent hover:bg-accent-hover"
          : "border-border-default text-text-secondary hover:text-text-primary hover:border-border-strong",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Bell icon shown on the task card when the dispatcher reports the agent is
 * parked at the REPL prompt awaiting user input. Uses the accent hue + a calm
 * pulse so it reads as "attention" not "alarm" — matches DESIGN.md §13's
 * color-blind safety (shape + animation, not color alone).
 */
function AwaitingInputBadge() {
  return (
    <span
      role="img"
      aria-label="Agent awaiting input"
      title="Agent is waiting for your reply"
      className="vm-pulse-status inline-flex items-center justify-center"
      style={{
        width: 16,
        height: 16,
        borderRadius: "var(--radius-xs)",
        color: "var(--accent-base)",
        backgroundColor: "color-mix(in oklch, var(--accent-base) 18%, transparent)",
      }}
    >
      <Bell size={10} strokeWidth={2.25} />
    </span>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
