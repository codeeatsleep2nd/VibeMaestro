import type { Agent } from "@vibemaestro/core";
import type { IPty } from "node-pty";

export type SpawnedRun = {
  runId: string;
  pid: number;
  startedAt: Date;
  ipty: IPty;
  /**
   * Set true by `runDispatcher.cancel()` *before* the kill signal is issued so
   * the onExit handler can distinguish "user cancelled" from "agent crashed".
   */
  cancelled: boolean;
};

export type SpawnOptions = {
  runId: string;
  agent: Agent;
  prompt: string;
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
};

export type ProbeResult = {
  available: boolean;
  version: string | null;
  error: string | null;
};
