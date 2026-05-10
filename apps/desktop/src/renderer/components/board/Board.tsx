import type { Agent, Task } from "@vibemaestro/core";
import { useMemo } from "react";
import { groupByStatus } from "../../hooks/useTasks.js";
import { Lane } from "./Lane.js";

type Props = {
  tasks: Task[];
  agents: Agent[];
  onSelect?: (taskId: string) => void;
};

export function Board({ tasks, agents, onSelect }: Props) {
  const groups = useMemo(() => groupByStatus(tasks), [tasks]);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Blocked + error roll into the source lane visually until they're either
  // retried (back to backlog) or discarded — DESIGN.md §8 four-lane rule.
  const backlog = [...groups.backlog, ...groups.blocked];
  const running = groups.running;
  const reviewing = [...groups.reviewing, ...groups.error];
  const complete = groups.complete;

  return (
    <div
      className="grid gap-[var(--space-5)] h-full px-[var(--space-5)] py-[var(--space-4)]
                 grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
    >
      <Lane
        status="backlog"
        label="Backlog"
        caption={groups.blocked.length > 0 ? `${groups.blocked.length} blocked` : undefined}
        tasks={backlog}
        agents={agentMap}
        onSelect={onSelect}
      />
      <Lane
        status="running"
        label="Running"
        caption={running.length > 0 ? "live" : undefined}
        tasks={running}
        agents={agentMap}
        onSelect={onSelect}
      />
      <Lane
        status="reviewing"
        label="Reviewing"
        caption={groups.error.length > 0 ? `${groups.error.length} errored` : undefined}
        tasks={reviewing}
        agents={agentMap}
        onSelect={onSelect}
      />
      <Lane
        status="complete"
        label="Complete"
        tasks={complete}
        agents={agentMap}
        onSelect={onSelect}
      />
    </div>
  );
}
