import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_WORKSPACE_ID } from "@vibemaestro/core";
import { useEffect, useMemo, useState } from "react";
import { Board } from "./components/board/Board.js";
import { ConductorStrip } from "./components/conductor/ConductorStrip.js";
import { DetailPanel } from "./components/detail-panel/DetailPanel.js";
import { BoardEmptyState } from "./components/empty/BoardEmptyState.js";
import { CreateTaskModal } from "./components/empty/CreateTaskModal.js";
import { Topbar } from "./components/topbar/Topbar.js";
import { CreateWorkspaceModal } from "./components/workspace/CreateWorkspaceModal.js";
import { WorkspaceStrip } from "./components/workspace/WorkspaceStrip.js";
import { useEventStream } from "./hooks/useEventStream.js";
import { useAgents, useTasks } from "./hooks/useTasks.js";
import { useWorkspaces } from "./hooks/useWorkspaces.js";
import { toast } from "./lib/toast.js";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "./lib/workspace-storage.js";

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
  const [activeWorkspaceId, _setActiveWorkspaceId] = useState<string>(() => getActiveWorkspaceId());
  const updateActiveWorkspaceId = (id: string) => {
    _setActiveWorkspaceId(id);
    setActiveWorkspaceId(id);
  };

  const workspacesQuery = useWorkspaces();
  const tasksQuery = useTasks(activeWorkspaceId);
  const agentsQuery = useAgents();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // ⌘N — open create-task modal globally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setCreateTaskOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const workspaces = workspacesQuery.data?.data ?? [];
  const tasks = tasksQuery.data?.data ?? [];
  const agents = agentsQuery.data?.data ?? [];
  const isLoading = workspacesQuery.isLoading || tasksQuery.isLoading || agentsQuery.isLoading;
  const isEmpty = !isLoading && tasks.length === 0;
  const errored = workspacesQuery.error || tasksQuery.error || agentsQuery.error;

  // Active workspace deleted out-from-under us → silently fall back to ws_local + info toast.
  useEffect(() => {
    if (workspacesQuery.isLoading || !workspaces.length) return;
    const found = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!found) {
      const fallback = workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID) ?? workspaces[0];
      if (fallback && fallback.id !== activeWorkspaceId) {
        toast.push("info", "Workspace not found", `Switched to ${fallback.label}.`);
        updateActiveWorkspaceId(fallback.id);
      }
    }
  }, [workspaces, activeWorkspaceId, workspacesQuery.isLoading]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );
  const activeAgent = useMemo(
    () =>
      activeWorkspace?.default_agent_id
        ? (agents.find((a) => a.id === activeWorkspace.default_agent_id) ?? null)
        : null,
    [agents, activeWorkspace],
  );

  // Live selected task — re-derived from the cache so state-machine transitions
  // refresh the panel header/footer in lockstep with the lanes.
  const selectedTask = useMemo(
    () => (selectedTaskId ? (tasks.find((t) => t.id === selectedTaskId) ?? null) : null),
    [selectedTaskId, tasks],
  );

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const workspaceMap = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces]);

  const content = useMemo(() => {
    if (isLoading) return <LoadingState />;
    if (errored) return <ErrorState error={errored} />;
    if (isEmpty) return <BoardEmptyState onCreate={() => setCreateTaskOpen(true)} />;
    return <Board tasks={tasks} agents={agents} onSelect={setSelectedTaskId} />;
  }, [isLoading, errored, isEmpty, tasks, agents]);

  return (
    <div className="h-full flex flex-col bg-surface-base">
      <Topbar
        onCreate={() => setCreateTaskOpen(true)}
        workspaces={workspaces}
        agents={agents}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={updateActiveWorkspaceId}
        onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
      />
      {activeWorkspace ? <WorkspaceStrip workspace={activeWorkspace} agent={activeAgent} /> : null}
      <main className="flex-1 min-h-0 relative">{content}</main>
      <ConductorStrip tasks={tasks} agents={agents} workspaces={workspaces} />
      <CreateTaskModal
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        agents={agents}
        workspace={activeWorkspace}
      />
      <CreateWorkspaceModal
        open={createWorkspaceOpen}
        onClose={() => setCreateWorkspaceOpen(false)}
        agents={agents}
        onCreated={(id) => updateActiveWorkspaceId(id)}
      />
      <DetailPanel
        task={selectedTask}
        agents={agentMap}
        workspaces={workspaceMap}
        onClose={() => setSelectedTaskId(null)}
      />
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
