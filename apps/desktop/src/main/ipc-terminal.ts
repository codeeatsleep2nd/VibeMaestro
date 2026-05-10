import { app, ipcMain } from "electron";
import { z } from "zod";
import { childLogger } from "./lib/logger.js";
import { runDispatcher } from "./services/run-dispatcher.js";

const log = childLogger({ module: "ipc-terminal" });

const ATTACH = z.object({ run_id: z.string() });
const WRITE = z.object({ run_id: z.string(), data: z.string() });
const RESIZE = z.object({ run_id: z.string(), cols: z.number().int(), rows: z.number().int() });
const SIGNAL = z.object({ run_id: z.string(), sig: z.enum(["SIGINT", "SIGTERM"]) });

/**
 * Per-WebContents tap registry: each window's webContents.id maps to the set
 * of run IDs it has attached to, plus the unsubscribe handles for that run's
 * data + closed listeners. Cleaned up on `webContents.destroyed`.
 */
type Tap = { offData: () => void; offClosed: () => void };
const taps: Map<number, Map<string, Tap>> = new Map();

function getOrCreate(wcId: number): Map<string, Tap> {
  let m = taps.get(wcId);
  if (!m) {
    m = new Map();
    taps.set(wcId, m);
  }
  return m;
}

function detach(wcId: number, runId: string): void {
  const m = taps.get(wcId);
  const tap = m?.get(runId);
  if (!tap) return;
  tap.offData();
  tap.offClosed();
  m?.delete(runId);
}

export function registerTerminalBridges(): void {
  ipcMain.handle("terminal.attach", (e, raw) => {
    const { run_id } = ATTACH.parse(raw);
    const live = runDispatcher.getLive(run_id);
    if (!live) {
      log.debug({ run_id }, "attach to non-live run");
      return null;
    }

    const wc = e.sender;
    const wcId = wc.id;
    const map = getOrCreate(wcId);
    if (map.has(run_id)) {
      // Already attached; just return current geometry.
      return {
        cols: live.cols,
        rows: live.rows,
        bytes_replayed: live.scrollback.bytes,
      };
    }

    // Send scrollback first so the renderer's xterm receives the bytes-up-to-now
    // before any live tail. Then register the data tap and the closed tap.
    const snapshot = live.scrollback.snapshot();
    if (snapshot.length > 0) {
      wc.send(`term:output:${run_id}`, snapshot);
    }

    const offData = runDispatcher.onData(run_id, (chunk) => {
      if (wc.isDestroyed()) return;
      wc.send(`term:output:${run_id}`, chunk);
    });
    const offClosed = runDispatcher.onClosed(run_id, (info) => {
      if (wc.isDestroyed()) return;
      wc.send(`term:closed:${run_id}`, info);
    });

    map.set(run_id, { offData, offClosed });
    log.info({ run_id, wc_id: wcId, replay_bytes: snapshot.length }, "terminal attached");

    return {
      cols: live.cols,
      rows: live.rows,
      bytes_replayed: snapshot.length,
    };
  });

  ipcMain.handle("terminal.detach", (e, raw) => {
    const { run_id } = ATTACH.parse(raw);
    detach(e.sender.id, run_id);
    return { ok: true };
  });

  ipcMain.handle("terminal.write", (_e, raw) => {
    const { run_id, data } = WRITE.parse(raw);
    runDispatcher.sendInput(run_id, data);
    return { ok: true };
  });

  ipcMain.handle("terminal.resize", (_e, raw) => {
    const { run_id, cols, rows } = RESIZE.parse(raw);
    runDispatcher.resize(run_id, cols, rows);
    return { ok: true };
  });

  ipcMain.handle("terminal.signal", (_e, raw) => {
    const { run_id, sig } = SIGNAL.parse(raw);
    runDispatcher.sendSignal(run_id, sig);
    return { ok: true };
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("destroyed", () => {
      const m = taps.get(contents.id);
      if (m) {
        for (const tap of m.values()) {
          tap.offData();
          tap.offClosed();
        }
        taps.delete(contents.id);
      }
    });
  });
}
