/**
 * Run IDs are ULIDs prefixed with `run_` so they're visually distinct from task slugs.
 * Treat them as opaque on the client (CLAUDE.md "IDs are opaque").
 */
export declare function newRunId(): string;
export declare function isRunId(value: string): boolean;
/**
 * Task IDs are sequence-allocated by the DB layer and presented as `VM-<n>` slugs.
 * The `<n>` is a monotonically increasing integer per install. The client never parses
 * the integer — the slug is the identity.
 */
export declare function formatTaskSlug(n: number): string;
export declare function isTaskSlug(value: string): boolean;
/**
 * Generic ULID for events, toasts, etc. Use `newRunId()` for runs.
 */
export declare function newEventId(): string;
export declare function newToastId(): string;
