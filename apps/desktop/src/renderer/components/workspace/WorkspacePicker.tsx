import type { Agent, Workspace } from "@vibemaestro/core";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import { AgentChip } from "../agent/AgentChip.js";

type Props = {
  workspaces: Workspace[];
  agents: Agent[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

/**
 * Per DESIGN.md §10 command palette pattern (reduced width). 320px dropdown anchored
 * below the pill, ARIA combobox, keyboard nav (Arrow/Enter/Esc). Items: agent
 * monogram + label + path subtitle. Active workspace gets an accent left strip + check.
 */
export function WorkspacePicker({ workspaces, agents, activeId, onSelect, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const pillRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const active = workspaces.find((w) => w.id === activeId);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        pillRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(workspaces.length, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (focusIdx === workspaces.length) {
          setOpen(false);
          onCreate();
        } else {
          const ws = workspaces[focusIdx];
          if (ws) {
            onSelect(ws.id);
            setOpen(false);
            pillRef.current?.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, focusIdx, workspaces, onCreate, onSelect]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && e.target !== pillRef.current) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block [-webkit-app-region:no-drag]">
      <button
        ref={pillRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-[var(--space-2)]",
          "px-[var(--space-3)] py-[var(--space-1)]",
          "text-meta rounded-sm border border-border-default",
          "bg-surface-base text-text-primary",
          "hover:border-border-strong transition-colors duration-[var(--duration-fast)]",
          "focus:outline-none focus:border-border-focus",
        )}
      >
        <ChevronDown size={12} className="text-text-tertiary" />
        <span className="truncate max-w-[180px]">{active?.label ?? "—"}</span>
      </button>
      {open ? (
        <div
          ref={dropdownRef}
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute left-0 top-[calc(100%+var(--space-1))] z-50",
            "w-[320px] bg-surface-raised border border-border-default rounded-md",
            "overflow-hidden",
          )}
          style={{ boxShadow: "var(--shadow-3)" }}
        >
          <div className="px-[var(--space-3)] py-[var(--space-2)] flex items-center justify-between border-b border-border-subtle">
            <span className="text-caption font-mono uppercase text-text-tertiary tracking-wider">
              Workspaces
            </span>
            <span className="text-caption font-mono text-text-tertiary">{workspaces.length}</span>
          </div>
          <ul className="max-h-[360px] overflow-y-auto">
            {workspaces.map((ws, idx) => {
              const isActive = ws.id === activeId;
              const isFocused = idx === focusIdx;
              const agent = ws.default_agent_id ? agentMap.get(ws.default_agent_id) : null;
              const handleSelect = () => {
                onSelect(ws.id);
                setOpen(false);
                pillRef.current?.focus();
              };
              return (
                <li
                  key={ws.id}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={isFocused ? 0 : -1}
                  className={cn(
                    "relative flex items-center gap-[var(--space-3)] cursor-pointer",
                    "px-[var(--space-3)] py-[var(--space-2)]",
                    isFocused ? "bg-surface-pressed" : "hover:bg-surface-pressed",
                  )}
                  onClick={handleSelect}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelect();
                    }
                  }}
                  onMouseEnter={() => setFocusIdx(idx)}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 bottom-0 w-[2px]"
                      style={{ backgroundColor: "var(--accent-base)" }}
                    />
                  ) : null}
                  {agent ? (
                    <AgentChip agent={agent} size="sm" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="inline-block bg-surface-inset border border-border-subtle rounded-sm"
                      style={{ width: 18, height: 18 }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-meta text-text-primary truncate">{ws.label}</div>
                    <div className="text-caption font-mono text-text-tertiary truncate">
                      {ws.path || "—"}
                    </div>
                  </div>
                  {isActive ? <Check size={12} className="text-accent-base shrink-0" /> : null}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            role="option"
            aria-selected={focusIdx === workspaces.length}
            className={cn(
              "w-full flex items-center gap-[var(--space-2)]",
              "px-[var(--space-3)] py-[var(--space-2)]",
              "text-meta text-text-secondary border-t border-border-subtle",
              "hover:bg-surface-pressed hover:text-text-primary",
              focusIdx === workspaces.length ? "bg-surface-pressed" : "",
            )}
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
            onMouseEnter={() => setFocusIdx(workspaces.length)}
          >
            <Plus size={12} />
            Create workspace…
          </button>
        </div>
      ) : null}
    </div>
  );
}
