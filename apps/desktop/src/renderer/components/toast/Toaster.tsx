import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { type Toast, type ToastVariant, toast } from "../../lib/toast.js";

const VARIANT_COLOR: Record<ToastVariant, string> = {
  info: "var(--accent-base)",
  success: "var(--status-complete)",
  warning: "var(--status-review)",
  error: "var(--status-error)",
};

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => toast.subscribe(setList), []);

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-[var(--space-7)] right-[var(--space-5)] z-50 flex flex-col gap-[var(--space-2)]"
      style={{ pointerEvents: "none" }}
    >
      {list.slice(-3).map((t) => (
        <div
          key={t.id}
          role={t.variant === "error" ? "alert" : "status"}
          className="bg-surface-raised border border-border-default rounded-md px-[var(--space-4)] py-[var(--space-3)] flex items-start gap-[var(--space-3)]"
          style={{
            minWidth: 280,
            maxWidth: 420,
            pointerEvents: "auto",
            boxShadow: "var(--shadow-2)",
            borderLeft: `3px solid ${VARIANT_COLOR[t.variant]}`,
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-meta text-text-primary font-mono">{t.title}</div>
            {t.body && (
              <div className="text-meta text-text-secondary mt-[var(--space-1)]">{t.body}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
