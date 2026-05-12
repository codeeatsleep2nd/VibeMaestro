import { useEffect, useState } from "react";

/**
 * Track which tasks currently have an agent parked at the REPL prompt waiting
 * for user input. The dispatcher emits `run.input_requested` after the PTY
 * goes quiet for 3s+ and `run.input_resumed` when the agent (or user) types
 * again. Returns a Set of task IDs for cheap O(1) membership checks in task
 * cards.
 *
 * Cleared on `run.ended` too so a task that ends while flagged drops the icon
 * without waiting for a separate resume event.
 */
export function useTasksAwaitingInput(): Set<string> {
  const [awaiting, setAwaiting] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const unsubscribe = window.vmBridge.events.subscribeActivity((env) => {
      const evt = env.event;
      if (evt.type === "run.input_requested") {
        setAwaiting((prev) => {
          if (prev.has(evt.task_id)) return prev;
          const next = new Set(prev);
          next.add(evt.task_id);
          return next;
        });
      } else if (evt.type === "run.input_resumed" || evt.type === "run.ended") {
        setAwaiting((prev) => {
          if (!prev.has(evt.task_id)) return prev;
          const next = new Set(prev);
          next.delete(evt.task_id);
          return next;
        });
      }
    });
    return unsubscribe;
  }, []);

  return awaiting;
}
