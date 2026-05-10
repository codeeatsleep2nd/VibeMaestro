import type { Task } from "@vibemaestro/core";

type Props = {
  task: Task;
};

/**
 * The transcript file under `~/.vibemaestro/runs/<run_id>/transcript` is the
 * source of truth for past runs. v1 doesn't expose a tRPC endpoint for it —
 * plan #5's terminal bridge replays the same bytes via the scrollback ring,
 * so the live terminal IS the transcript view for active sessions. A real
 * `runs.getTranscript` lands when there's a need to view ended runs.
 */
export function TranscriptTab({ task }: Props) {
  return (
    <div className="flex-1 overflow-auto px-[var(--space-5)] py-[var(--space-4)]">
      <p className="text-meta text-text-tertiary">
        Transcript view will read from{" "}
        <span className="font-mono">
          ~/.vibemaestro/runs/{task.current_run_id ?? "<run_id>"}/transcript
        </span>{" "}
        once the runs.* router exposes it. The Terminal tab replays the same bytes from the live
        scrollback ring for the current session.
      </p>
    </div>
  );
}
