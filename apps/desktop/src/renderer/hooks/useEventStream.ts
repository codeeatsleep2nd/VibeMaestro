import { useQueryClient } from "@tanstack/react-query";
import type { EnvelopedEvent, Task } from "@vibemaestro/core";
import { useEffect, useRef } from "react";

type ListResponse = {
  data: Task[];
  meta: { total: number; page: number; per_page: number };
};

/**
 * Subscribe to the main-process event firehose and merge updates into the
 * TanStack Query cache. Replaces the prototype's 2.5 s `refetchInterval` with
 * push-based updates so cards move between lanes the moment a state transition
 * commits in the main process.
 *
 * Replay-on-mount: if we have a Last-Event-ID we send it; the main process
 * responds with `{ truncated: true }` when our id is older than the ring,
 * meaning we should `invalidateQueries` instead of trying to merge.
 */
export function useEventStream() {
  const qc = useQueryClient();
  const lastSeenId = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.vmBridge) return;

    let cancelled = false;

    (async () => {
      const replay = await window.vmBridge.events.replaySince(lastSeenId.current);
      if (cancelled) return;

      if (replay.truncated) {
        // Lost too much state; fall back to a full refetch.
        await qc.invalidateQueries({ queryKey: ["tasks"] });
        await qc.invalidateQueries({ queryKey: ["agents"] });
      } else {
        for (const env of replay.events) {
          if (cancelled) return;
          apply(qc, env);
          lastSeenId.current = env.id;
        }
      }

      if (cancelled) return;
      const off = window.vmBridge.events.subscribeActivity((env) => {
        lastSeenId.current = env.id;
        apply(qc, env);
      });
      cleanup = off;
    })();

    let cleanup: (() => void) | null = null;
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
    // qc is stable from useQueryClient — we don't need to re-subscribe on each render.
    // biome-ignore lint/correctness/useExhaustiveDependencies: qc is stable across renders
  }, []);
}

function apply(qc: ReturnType<typeof useQueryClient>, env: EnvelopedEvent) {
  const e = env.event;
  switch (e.type) {
    case "task.state_changed":
      // Patch every cached `tasks.list` query (different filter combos may exist).
      qc.setQueriesData<ListResponse>({ queryKey: ["tasks", "list"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((t) =>
            t.id === e.task_id ? { ...t, status: e.to, updated_at: e.at } : t,
          ),
        };
      });
      // The detail-panel might cache tasks.get for this id — invalidate.
      qc.invalidateQueries({ queryKey: ["tasks", "get", e.task_id] });
      break;

    case "run.started":
    case "run.ended":
      // Run lifecycle changes don't directly mutate task fields, but the
      // detail panel reads run rows that we don't cache aggressively. Cheap
      // to invalidate the get-task query so the footer state updates.
      qc.invalidateQueries({ queryKey: ["tasks", "get", e.task_id] });
      break;

    case "agent.availability_changed":
      qc.invalidateQueries({ queryKey: ["agents", "list"] });
      break;

    case "run.progress":
      // Progress events are 1 Hz and don't change cache shape — they're
      // consumed by the conductor strip via a side-channel ref. No-op here.
      break;
  }
}
