import type { Agent, Workspace } from "@vibemaestro/core";
import { Plus, SunMoon } from "lucide-react";
import { type Theme, useTheme } from "../../hooks/useTheme.js";
import { cn } from "../../lib/cn.js";
import { WorkspacePicker } from "../workspace/WorkspacePicker.js";

type Props = {
  onCreate: () => void;
  workspaces: Workspace[];
  agents: Agent[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
};

export function Topbar({
  onCreate,
  workspaces,
  agents,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
}: Props) {
  const [theme, cycleTheme] = useTheme();

  return (
    <header
      className="h-[var(--space-7)] border-b border-border-subtle
                 flex items-center justify-between px-[var(--space-5)]
                 bg-surface-base [-webkit-app-region:drag] select-none"
    >
      {/* Logo + name + workspace picker */}
      <div className="flex items-center gap-[var(--space-3)] [-webkit-app-region:no-drag]">
        <span
          aria-hidden="true"
          className="inline-block"
          style={{
            width: 18,
            height: 18,
            background:
              "conic-gradient(from 220deg, var(--accent-base), var(--surface-raised) 70%)",
            borderRadius: "var(--radius-xs)",
            boxShadow: "var(--shadow-1)",
          }}
        />
        <span className="font-display text-text-primary tracking-tight" style={{ fontWeight: 600 }}>
          VibeMaestro
        </span>
        <WorkspacePicker
          workspaces={workspaces}
          agents={agents}
          activeId={activeWorkspaceId}
          onSelect={onSelectWorkspace}
          onCreate={onCreateWorkspace}
        />
        <span className="text-caption text-text-tertiary">v0.1 · prototype</span>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-[var(--space-2)] [-webkit-app-region:no-drag]">
        <button
          type="button"
          onClick={cycleTheme}
          title={`Theme: ${theme}`}
          className={cn(
            "inline-flex items-center gap-[var(--space-1)] px-[var(--space-3)] py-[var(--space-1)]",
            "text-meta rounded-sm border border-border-subtle",
            "text-text-secondary hover:text-text-primary hover:border-border-default",
            "transition-colors duration-[var(--duration-fast)]",
          )}
        >
          <SunMoon size={13} />
          <ThemeLabel theme={theme} />
        </button>
        <button
          type="button"
          onClick={onCreate}
          className={cn(
            "inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-1)]",
            "text-meta rounded-sm border border-transparent",
            "bg-accent-base text-text-on-accent hover:bg-accent-hover",
            "transition-colors duration-[var(--duration-fast)]",
          )}
        >
          <Plus size={13} strokeWidth={2.5} />
          New task
          <kbd className="font-mono text-text-on-accent/80" style={{ fontSize: 10 }}>
            ⌘N
          </kbd>
        </button>
      </div>
    </header>
  );
}

function ThemeLabel({ theme }: { theme: Theme }) {
  return <span className="font-mono">{theme === "terminal-dark" ? "dark" : "light"}</span>;
}
