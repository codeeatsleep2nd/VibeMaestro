import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Board } from "./components/board/Board.js";
import { ConductorStrip } from "./components/conductor/ConductorStrip.js";
import { BoardEmptyState } from "./components/empty/BoardEmptyState.js";
import { CreateTaskModal } from "./components/empty/CreateTaskModal.js";
import { Topbar } from "./components/topbar/Topbar.js";
import { useEventStream } from "./hooks/useEventStream.js";
import { useAgents, useTasks } from "./hooks/useTasks.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Plan #4: events push state into the cache, so we don't need polling.
      // Keep a generous stale time since the bus is the source of freshness.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}

function Shell() {
  useEventStream();
  const tasksQuery = useTasks();
  const agentsQuery = useAgents();
  const [createOpen, setCreateOpen] = useState(false);

  // ⌘N — open create modal globally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setCreateOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tasks = tasksQuery.data?.data ?? [];
  const agents = agentsQuery.data?.data ?? [];
  const isLoading = tasksQuery.isLoading || agentsQuery.isLoading;
  const isEmpty = !isLoading && tasks.length === 0;

  const errored = tasksQuery.error || agentsQuery.error;

  const content = useMemo(() => {
    if (isLoading) return <LoadingState />;
    if (errored) return <ErrorState error={errored} />;
    if (isEmpty) return <BoardEmptyState onCreate={() => setCreateOpen(true)} />;
    return <Board tasks={tasks} agents={agents} />;
  }, [isLoading, errored, isEmpty, tasks, agents]);

  return (
    <div className="h-full flex flex-col bg-surface-base">
      <Topbar onCreate={() => setCreateOpen(true)} />
      <main className="flex-1 min-h-0">{content}</main>
      <ConductorStrip tasks={tasks} agents={agents} />
      <CreateTaskModal open={createOpen} onClose={() => setCreateOpen(false)} agents={agents} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="h-full flex items-center justify-center">
      <span className="text-meta text-text-tertiary">Loading the board…</span>
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <h2 className="font-display text-heading text-status-error">Something is off.</h2>
      <p className="mt-[var(--space-2)] text-meta text-text-tertiary">{message}</p>
    </div>
  );
}
