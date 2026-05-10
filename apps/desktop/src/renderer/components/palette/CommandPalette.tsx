import type { Task } from "@vibemaestro/core";
import { Command } from "cmdk";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTasks } from "../../hooks/useTasks.js";
import { cn } from "../../lib/cn.js";

type Props = {
  onSelectTask: (taskId: string) => void;
  onCreate: (initialPrompt?: string) => void;
};

export function CommandPalette({ onSelectTask, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data } = useTasks();
  const tasks: Task[] = data?.data ?? [];

  // ⌘K opens / closes; Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const isTyping = tag === "input" || tag === "textarea";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape" && open && !isTyping) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-[var(--space-4)]"
      {...({
        overlayClassName: "fixed inset-0",
        style: { backgroundColor: "var(--surface-overlay)" },
      } as Record<string, unknown>)}
    >
      <div
        className={cn(
          "w-full max-w-lg bg-surface-raised border border-border-default rounded-md",
          "overflow-hidden",
        )}
        style={{ boxShadow: "var(--shadow-3)" }}
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="search tasks · or type to create…"
          className="w-full bg-transparent border-0 border-b border-border-subtle px-[var(--space-4)] py-[var(--space-3)] text-text-primary text-meta font-mono outline-none"
        />
        <Command.List className="max-h-[55vh] overflow-y-auto py-[var(--space-2)]">
          <Command.Empty className="px-[var(--space-4)] py-[var(--space-3)] text-meta text-text-tertiary">
            No matches.
          </Command.Empty>

          {query.trim() && (
            <Command.Group heading="Create" className="px-[var(--space-2)]">
              <Command.Item
                value={`create ${query}`}
                onSelect={() => {
                  setOpen(false);
                  onCreate(query);
                }}
                className="flex items-center gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] text-meta rounded-sm cursor-pointer aria-selected:bg-surface-pressed"
              >
                <Plus size={14} />
                <span className="text-text-primary">New task with this prompt</span>
              </Command.Item>
            </Command.Group>
          )}

          <Command.Group heading="Tasks" className="px-[var(--space-2)]">
            {tasks.map((t) => (
              <Command.Item
                key={t.id}
                value={`${t.id} ${t.title}`}
                onSelect={() => {
                  setOpen(false);
                  onSelectTask(t.id);
                }}
                className="flex items-center gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] text-meta rounded-sm cursor-pointer aria-selected:bg-surface-pressed"
              >
                <span className="text-text-tertiary font-mono">{t.id}</span>
                <span className="text-text-primary truncate flex-1">{t.title}</span>
                <span
                  className="text-caption"
                  style={{ color: `var(--status-${t.status === "backlog" ? "idle" : t.status})` }}
                >
                  {t.status}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
