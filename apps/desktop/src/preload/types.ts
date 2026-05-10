import type { EnvelopedEvent, ErrorEnvelope } from "@vibemaestro/core";

export type IpcInvokeRequest = {
  id: string;
  path: string;
  type: "query" | "mutation";
  input: unknown;
};

export type IpcInvokeResult = { ok: true; data: unknown } | { ok: false; envelope: ErrorEnvelope };

export type ReplayResult = {
  events: EnvelopedEvent[];
  truncated: boolean;
};

export type VmBridge = {
  trpcInvoke: (request: IpcInvokeRequest) => Promise<IpcInvokeResult>;
  platform: NodeJS.Platform;
  events: {
    /** Subscribe to the activity firehose. Returns an unsubscribe handle. */
    subscribeActivity: (cb: (env: EnvelopedEvent) => void) => () => void;
    /** Subscribe to the per-task scoped channel. */
    subscribeTask: (taskId: string, cb: (env: EnvelopedEvent) => void) => Promise<() => void>;
    replaySince: (sinceId: string | null) => Promise<ReplayResult>;
  };
  terminal: {
    attach: (
      runId: string,
    ) => Promise<{ cols: number; rows: number; bytes_replayed: number } | null>;
    detach: (runId: string) => Promise<void>;
    write: (runId: string, data: string) => Promise<void>;
    resize: (runId: string, cols: number, rows: number) => Promise<void>;
    signal: (runId: string, sig: "SIGINT" | "SIGTERM") => Promise<void>;
    onOutput: (runId: string, cb: (chunk: string) => void) => () => void;
    onClosed: (runId: string, cb: (info: { at: string }) => void) => () => void;
  };
};

declare global {
  interface Window {
    vmBridge: VmBridge;
  }
}
