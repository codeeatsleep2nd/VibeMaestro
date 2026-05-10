import { Plus } from "lucide-react";

type Props = {
  onCreate: () => void;
};

export function BoardEmptyState({ onCreate }: Props) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center px-[var(--space-5)]">
      <h2 className="font-display text-display text-text-primary tracking-tight">No tasks yet.</h2>
      <p className="mt-[var(--space-3)] text-text-secondary" style={{ maxWidth: 480 }}>
        Drop a one-liner. Your agents pick it up. You stay the conductor.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-[var(--space-5)] inline-flex items-center gap-[var(--space-2)]
                   px-[var(--space-4)] py-[var(--space-2)] rounded-sm
                   bg-accent-base text-text-on-accent text-meta
                   hover:bg-accent-hover transition-colors duration-[var(--duration-fast)]"
      >
        <Plus size={14} strokeWidth={2.5} />
        New task
      </button>
      <span className="mt-[var(--space-3)] text-caption text-text-tertiary">⌘N</span>
    </section>
  );
}
