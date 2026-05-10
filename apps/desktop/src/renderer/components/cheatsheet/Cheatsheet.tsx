import { X } from "lucide-react";
import { useEffect, useState } from "react";

type Shortcut = { keys: string[]; label: string };

const SHORTCUTS: Shortcut[] = [
  { keys: ["⌘", "N"], label: "New task" },
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["?"], label: "Toggle this cheatsheet" },
  { keys: ["Esc"], label: "Close panel / modal" },
  { keys: ["Enter"], label: "Open task (when focused)" },
];

export function Cheatsheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-[var(--space-4)]"
      style={{ backgroundColor: "var(--surface-overlay)" }}
    >
      <button
        type="button"
        aria-label="Close shortcuts"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
      />
      <div
        className="relative w-full max-w-md bg-surface-raised border border-border-default rounded-md p-[var(--space-5)]"
        style={{ boxShadow: "var(--shadow-3)" }}
      >
        <div className="flex items-center justify-between mb-[var(--space-4)]">
          <h2 className="font-display text-heading text-text-primary">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="flex flex-col gap-[var(--space-3)]">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-[var(--space-3)]">
              <span className="text-text-secondary text-meta">{s.label}</span>
              <span className="flex items-center gap-[var(--space-1)]">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="font-mono bg-surface-pressed border border-border-subtle text-text-primary"
                    style={{
                      padding: "var(--space-1) var(--space-2)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: 11,
                      minWidth: 22,
                      textAlign: "center",
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
