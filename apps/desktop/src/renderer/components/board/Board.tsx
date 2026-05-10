import type { Agent, Task } from "@vibemaestro/core";
import { useMemo } from "react";
import { groupByStatus } from "../../hooks/useTasks.js";
import { Lane } from "./Lane.js";

type Props = {
  tasks: Task[];
  agents: Agent[];
};

export function Board({ tasks, agents }: Props) {
  const groups = useMemo(() => groupByStatus(tasks), [tasks]);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Blocked + error roll into Backlog visually only when empty? No — DESIGN.md
  // §8 lists 4 lanes and treats blocked/error as overlays on the source lane.
  // Here we show the four lanes; blocked + error tasks render in their source
  // lane until they're either retried (back to backlog) or discarded.
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
      />
      <Lane
        status="running"
        label="Running"
        caption={running.length > 0 ? "live" : undefined}
        tasks={running}
        agents={agentMap}
      />
      <Lane
        status="reviewing"
        label="Reviewing"
        caption={groups.error.length > 0 ? `${groups.error.length} errored` : undefined}
        tasks={reviewing}
        agents={agentMap}
      />
      <Lane status="complete" label="Complete" tasks={complete} agents={agentMap} />
    </div>
  );
}
