import { ulid } from "ulid";

export type ToastVariant = "info" | "success" | "warning" | "error";

export type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  body?: string;
};

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function notify(): void {
  for (const fn of listeners) fn(toasts);
}

/**
 * Replaces ad-hoc `alert()` calls. Variants drive both color (status tokens)
 * and screen-reader politeness:
 *   - error: assertive (interrupts)
 *   - warning / info / success: polite (queued)
 *
 * Auto-dismiss: 8 s for non-error variants. Errors stay until the user
 * dismisses them so a transient blip doesn't hide a real failure.
 */
export const toast = {
  push(variant: ToastVariant, title: string, body?: string): string {
    const id = ulid();
    toasts = [...toasts, { id, variant, title, body }];
    notify();
    if (variant !== "error") {
      setTimeout(() => toast.dismiss(id), 8000);
    }
    return id;
  },
  dismiss(id: string): void {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  },
  subscribe(cb: Listener): () => void {
    listeners.add(cb);
    cb(toasts);
    return () => {
      listeners.delete(cb);
    };
  },
};
