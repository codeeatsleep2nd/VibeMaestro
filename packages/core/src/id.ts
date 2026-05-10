import { ulid } from "ulid";

/**
 * Run IDs are ULIDs prefixed with `run_` so they're visually distinct from task slugs.
 * Treat them as opaque on the client (CLAUDE.md "IDs are opaque").
 */
export function newRunId(): string {
  return `run_${ulid()}`;
}

export function isRunId(value: string): boolean {
  return /^run_[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}

/**
 * Task IDs are sequence-allocated by the DB layer and presented as `VM-<n>` slugs.
 * The `<n>` is a monotonically increasing integer per install. The client never parses
 * the integer — the slug is the identity.
 */
export function formatTaskSlug(n: number): string {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid task sequence: ${n}`);
  }
  return `VM-${n.toString().padStart(3, "0")}`;
}

export function isTaskSlug(value: string): boolean {
  return /^VM-\d+$/.test(value);
}

/**
 * Generic ULID for events, toasts, etc. Use `newRunId()` for runs.
 */
export function newEventId(): string {
  return `evt_${ulid()}`;
}

export function newToastId(): string {
  return ulid();
}
