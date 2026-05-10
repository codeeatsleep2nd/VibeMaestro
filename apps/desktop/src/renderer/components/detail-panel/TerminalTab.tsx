import type { Task } from "@vibemaestro/core";
import { useEffect, useRef, useState } from "react";
import { useTerminal } from "../../hooks/useTerminal.js";

type Props = {
  task: Task;
};

/**
 * Mounts xterm.js to a div ref and connects it to the dispatcher's terminal
 * bridge for the task's `current_run_id`. Falls back to a placeholder when no
 * run has been issued yet (task is in backlog or recovered from a crash).
 */
export function TerminalTab({ task }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    setContainer(containerRef.current);
  }, []);

  const state = useTerminal(task.current_run_id, container);

  if (!task.current_run_id) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-[var(--space-5)]">
        <p className="text-meta text-text-tertiary">No run yet — press Run to spawn the agent.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-inset">
      <div ref={containerRef} className="flex-1 min-h-0" style={{ padding: "var(--space-3)" }} />
      {state.closed && (
        <div className="px-[var(--space-5)] py-[var(--space-2)] border-t border-border-subtle text-meta text-text-tertiary">
          — run ended —
        </div>
      )}
    </div>
  );
}
