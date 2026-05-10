import type { Agent, Task, TaskStatus } from "@vibemaestro/core";
import { TaskCard } from "./TaskCard.js";

type Props = {
  status: TaskStatus;
  label: string;
  caption?: string;
  tasks: Task[];
  agents: Map<string, Agent>;
  onSelect?: (taskId: string) => void;
};

export function Lane({ status, label, caption, tasks, agents, onSelect }: Props) {
  return (
    <section
      aria-labelledby={`lane-${status}-heading`}
      className="flex flex-col gap-[var(--space-3)] min-w-0 h-full"
    >
      <header className="flex items-baseline justify-between px-[var(--space-1)]">
        <div className="flex items-baseline gap-[var(--space-3)]">
          <h2
            id={`lane-${status}-heading`}
            className="text-caption text-text-secondary"
            style={{ color: `var(--status-${status === "backlog" ? "idle" : status})` }}
          >
            {label}
          </h2>
          <span className="text-meta text-text-tertiary tabular-nums">{tasks.length}</span>
        </div>
        {caption && <span className="text-meta text-text-tertiary">{caption}</span>}
      </header>

      <div
        className="flex-1 flex flex-col gap-[var(--space-3)] overflow-y-auto pr-[var(--space-2)]"
        style={{ scrollbarGutter: "stable" }}
      >
        {tasks.length === 0 ? (
          <EmptyLaneHint status={status} />
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} agents={agents} onSelect={onSelect} />
          ))
        )}
      </div>
    </section>
  );
}

function EmptyLaneHint({ status }: { status: TaskStatus }) {
  const lines: Record<TaskStatus, string> = {
    backlog: "Drop a one-liner. Agents will pick it up.",
    running: "Quiet for now.",
    reviewing: "Nothing waiting on you.",
    complete: "Ship more.",
    blocked: "Nothing stuck. Good.",
    error: "No errors. Even better.",
  };
  return (
    <div
      className="border border-dashed border-border-subtle rounded-md p-[var(--space-4)]
                 text-meta text-text-tertiary text-center"
    >
      {lines[status]}
    </div>
  );
}
