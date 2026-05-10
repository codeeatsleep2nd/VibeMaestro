import { mkdirSync } from "node:fs";
import { AppError } from "@vibemaestro/core";
import { RunRepository } from "@vibemaestro/db";
import {
  byteThrottle,
  ScrollbackRing,
  type SpawnedRun,
  spawnAgent,
  type TranscriptWriter,
  transcriptWriter,
} from "@vibemaestro/pty-daemon";
import { runDir, transcriptPath } from "../config/paths.js";
import { getDb } from "../db.js";
import { bus } from "../lib/event-bus.js";
import { childLogger } from "../lib/logger.js";
import { resolveShellPath } from "../lib/path-helper.js";
import { createAgentService } from "./agent-service.js";
import { createRunServiceInternal } from "./run-service-internal.js";

const log = childLogger({ module: "run-dispatcher" });

type LiveEntry = SpawnedRun & {
  writer: TranscriptWriter;
  killTimer?: ReturnType<typeof setTimeout>;
  progressTimer?: ReturnType<typeof setInterval>;
  taskId: string;
  agentId: string;
  scrollback: ScrollbackRing;
  cols: number;
  rows: number;
};

const live = new Map<string, LiveEntry>();
const dataListeners = new Map<string, Set<(chunk: string) => void>>();
const closedListeners = new Map<string, Set<(info: { at: string }) => void>>();

function notifyData(runId: string, chunk: string): void {
  const set = dataListeners.get(runId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(chunk);
    } catch {
      // best-effort; one window's bad listener doesn't break the rest
    }
  }
}

function notifyClosed(runId: string, at: string): void {
  const set = closedListeners.get(runId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn({ at });
    } catch {}
  }
}

/**
 * Single source of truth for spawning, cancelling, and tracking live agent
 * processes. Plan #4 will move the call sites from `taskService` to an event
 * subscription, but the surface stays identical.
 *
 * Invariants:
 *   - exactly one PTY per `runId` at a time
 *   - `cancel(runId)` sets `cancelled=true` BEFORE issuing SIGTERM so the exit
 *     handler can map outcome correctly
 *   - all writers are flushed in the exit handler before `markFinished`
 */
export const runDispatcher = {
  /**
   * Start a PTY for the given run. Idempotent if `runId` is already live.
   * Throws `AppError("agent_unavailable")` if the agent's CLI isn't on PATH.
   */
  async start(runId: string, taskPrompt: string, agentId: string): Promise<void> {
    if (live.has(runId)) {
      log.warn({ run_id: runId }, "start ignored — already live");
      return;
    }

    const agentService = createAgentService();
    const agent = agentService.get(agentId);
    if (!agent) {
      throw new AppError("not_found", `Agent "${agentId}" not found`);
    }
    if (!agent.available) {
      throw new AppError(
        "agent_unavailable",
        `${agent.label} is not on PATH — run "agents.probe" first`,
      );
    }

    // Look up which task this run belongs to so we can include task_id in events.
    const { db } = getDb();
    const runRepo = new RunRepository(db);
    const runRow = runRepo.findById(runId);
    if (!runRow) throw new AppError("not_found", `Run "${runId}" not found`);
    const taskId = runRow.task_id;

    const cwd = agent.cwd ?? process.env.HOME ?? process.cwd();
    mkdirSync(runDir(runId), { recursive: true, mode: 0o700 });
    const writer = transcriptWriter(transcriptPath(runId));
    const runService = createRunServiceInternal();
    const flush = byteThrottle(250, (n) => runService.incrementBytes(runId, n));

    const path = await resolveShellPath();
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string") env[k] = v;
    }
    env.PATH = path;

    const cols = 120;
    const rows = 30;
    const handle = spawnAgent({ runId, agent, prompt: taskPrompt, cwd, env, cols, rows });
    const scrollback = new ScrollbackRing();
    const entry: LiveEntry = { ...handle, writer, taskId, agentId, scrollback, cols, rows };
    live.set(runId, entry);
    const startedAt = handle.startedAt;
    log.info({ run_id: runId, agent_id: agentId, pid: handle.pid }, "run started");

    bus.emit({
      type: "run.started",
      task_id: taskId,
      run_id: runId,
      agent_id: agentId,
      at: startedAt.toISOString(),
    });

    // 1Hz progress tick — drives the conductor strip's elapsed/byte counters.
    entry.progressTimer = setInterval(() => {
      bus.emit({
        type: "run.progress",
        task_id: taskId,
        run_id: runId,
        elapsed_ms: Date.now() - startedAt.getTime(),
        bytes_emitted: writer.bytesWritten,
      });
    }, 1000);

    handle.ipty.onData((chunk) => {
      writer.write(chunk);
      scrollback.push(chunk);
      notifyData(runId, chunk);
      flush.add(Buffer.byteLength(chunk, "utf8"));
    });

    handle.ipty.onExit(({ exitCode, signal }) => {
      flush.flushNow();
      void writer.close();
      if (entry.killTimer) clearTimeout(entry.killTimer);
      if (entry.progressTimer) clearInterval(entry.progressTimer);
      live.delete(runId);

      const outcome: "succeeded" | "failed" | "cancelled" = entry.cancelled
        ? "cancelled"
        : exitCode === 0
          ? "succeeded"
          : "failed";

      log.info({ run_id: runId, exit_code: exitCode, signal, outcome }, "run ended");

      const endedAt = new Date().toISOString();
      notifyClosed(runId, endedAt);
      // GC scrollback + listener registries 30 s after run end so a
      // re-attaching renderer can still replay the tail of a freshly-ended run.
      setTimeout(() => {
        dataListeners.delete(runId);
        closedListeners.delete(runId);
      }, 30_000);

      bus.emit({
        type: "run.ended",
        task_id: taskId,
        run_id: runId,
        exit_code: exitCode ?? null,
        duration_ms: Date.now() - startedAt.getTime(),
        outcome,
      });

      try {
        runService.markFinished(runId, {
          outcome,
          exit_code: exitCode ?? null,
          bytes_emitted: writer.bytesWritten,
        });
      } catch (err) {
        log.error(
          { run_id: runId, err: err instanceof Error ? err.message : String(err) },
          "markFinished threw",
        );
      }
    });
  },

  /**
   * Mark the entry as cancelled, send SIGTERM, and schedule a SIGKILL fallback
   * 2 s later if the process hasn't exited cleanly.
   */
  cancel(runId: string): void {
    const entry = live.get(runId);
    if (!entry) {
      log.debug({ run_id: runId }, "cancel ignored — not live");
      return;
    }
    entry.cancelled = true;
    entry.ipty.kill("SIGTERM");
    entry.killTimer = setTimeout(() => {
      const stillLive = live.get(runId);
      if (stillLive) {
        log.warn({ run_id: runId }, "SIGTERM ignored after 2s — escalating to SIGKILL");
        try {
          stillLive.ipty.kill("SIGKILL");
        } catch (err) {
          log.error(
            { run_id: runId, err: err instanceof Error ? err.message : String(err) },
            "SIGKILL threw",
          );
        }
      }
    }, 2000);
  },

  /**
   * Best-effort kill of every live PTY. Called from the `before-quit` lifecycle
   * hook so users don't leave Electron with orphaned agent processes.
   */
  killAll(): number {
    const count = live.size;
    for (const entry of live.values()) {
      entry.cancelled = true;
      try {
        entry.ipty.kill("SIGKILL");
      } catch {
        // best-effort during shutdown
      }
    }
    live.clear();
    return count;
  },

  isRunning(runId: string): boolean {
    return live.has(runId);
  },

  /** Plan #5 — terminal-bridge surface. */
  resize(runId: string, cols: number, rows: number): void {
    const entry = live.get(runId);
    if (!entry) return;
    entry.ipty.resize(cols, rows);
    entry.cols = cols;
    entry.rows = rows;
  },

  sendInput(runId: string, data: string): void {
    const entry = live.get(runId);
    if (!entry) return;
    entry.ipty.write(data);
  },

  sendSignal(runId: string, sig: "SIGINT" | "SIGTERM"): void {
    const entry = live.get(runId);
    if (!entry) return;
    entry.ipty.kill(sig);
  },

  scrollbackSnapshot(runId: string): string | null {
    return live.get(runId)?.scrollback.snapshot() ?? null;
  },

  onData(runId: string, fn: (chunk: string) => void): () => void {
    let set = dataListeners.get(runId);
    if (!set) {
      set = new Set();
      dataListeners.set(runId, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  },

  onClosed(runId: string, fn: (info: { at: string }) => void): () => void {
    let set = closedListeners.get(runId);
    if (!set) {
      set = new Set();
      closedListeners.set(runId, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  },

  getLive(runId: string): LiveEntry | undefined {
    return live.get(runId);
  },

  liveRunIds(): string[] {
    return Array.from(live.keys());
  },
};
