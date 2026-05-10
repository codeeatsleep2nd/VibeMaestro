import type { Agent, Task } from "@vibemaestro/core";
import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.js";
import { AgentChip } from "../agent/AgentChip.js";

type Props = {
  tasks: Task[];
  agents: Agent[];
};

const MAX_ROWS = 3;

/**
 * Conductor strip — sticky footer that shows live agent activity. Per
 * DESIGN.md §10, this is the most distinctive surface in the product.
 *
 * - 56px collapsed (≤1 row) / 84px expanded (multiple rows)
 * - Up to 3 visible rows; overflow chip handles the rest (≤8 active in v1)
 * - 1Hz tick to update elapsed times — uses a tick state, not requestAnimationFrame,
 *   to stay calm and never re-render mid-animation.
 */
export function ConductorStrip({ tasks, agents }: Props) {
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const active = tasks
    .filter((t) => t.status === "running" || t.status === "reviewing")
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
    .slice(0, 8);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (active.length === 0) {
    return (
      <aside
        aria-label="Conductor strip"
        className="h-[56px] border-t border-border-subtle bg-surface-raised
                   flex items-center px-[var(--space-5)]"
      >
        <span className="text-meta text-text-tertiary">
          No agents conducting · ready when you are
        </span>
      </aside>
    );
  }

  const visible = active.slice(0, MAX_ROWS);
  const overflow = active.length - visible.length;
  const expanded = visible.length > 1;

  return (
    <aside
      aria-label="Conductor strip"
      className={cn(
        "border-t border-border-subtle bg-surface-raised",
        "px-[var(--space-5)] py-[var(--space-3)]",
        "transition-[height] duration-[var(--duration-base)] ease-[var(--easing-standard)]",
      )}
      style={{
        minHeight: expanded ? 84 : 56,
      }}
    >
      <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-2)]">
        <span className="text-caption text-text-tertiary">Conducting</span>
        <span className="text-meta text-text-tertiary tabular-nums">{active.length} active</span>
        {overflow > 0 && (
          <span className="text-meta text-text-secondary px-[var(--space-2)] py-[2px] rounded-pill border border-border-subtle">
            +{overflow} more
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-[var(--space-2)]">
        {visible.map((task) => {
          const agent = agentMap.get(task.agent_id);
          if (!agent) return null;
          return (
            <li key={task.id} className="flex items-center gap-[var(--space-3)]">
              <AgentChip agent={agent} size="sm" />
              <span className="text-meta text-text-primary font-mono" style={{ minWidth: 64 }}>
                {task.id}
              </span>
              <span className="text-meta text-text-secondary truncate flex-1">
                {actionLine(task)}
              </span>
              <span className="text-caption text-text-tertiary tabular-nums">
                {elapsedSince(task.updated_at)}
              </span>
              <StatusBadge task={task} />
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function StatusBadge({ task }: { task: Task }) {
  if (task.status === "running") {
    return (
      <span className="inline-flex items-center gap-[var(--space-1)] text-meta text-status-running">
        <span
          aria-hidden="true"
          className="vm-pulse-status inline-block"
          style={{
            width: 8,
            height: 8,
            borderRadius: 9999,
            backgroundColor: "var(--status-running)",
          }}
        />
        running
      </span>
    );
  }
  return (
    <span className="text-meta" style={{ color: "var(--status-review)" }}>
      review
    </span>
  );
}

function actionLine(task: Task): string {
  if (task.status === "reviewing") return `awaiting review · ${task.title}`;
  // For running tasks we'd normally read the latest run.progress event line.
  // Plan #4 wires real events; for the prototype, fall back to title.
  return task.title;
}

function elapsedSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m - h * 60}m`;
}
