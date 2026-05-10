import { app, BrowserWindow, ipcMain } from "electron";
import { z } from "zod";
import { bus } from "./lib/event-bus.js";
import { childLogger } from "./lib/logger.js";

const log = childLogger({ module: "ipc-events" });

const REPLAY_INPUT = z.object({ since_id: z.string().nullable() });
const TASK_INPUT = z.object({ task_id: z.string() });

/**
 * Per-WebContents subscription registry. The renderer calls
 * `events.subscribeTask("VM-001")` to opt in to that task's events on a
 * scoped channel. The map is keyed by `webContents.id` so it can be cleaned up
 * when a window closes — otherwise we'd leak listeners forever.
 */
const taskSubs: Map<number, Set<string>> = new Map();

export function registerEventBridges(): void {
  // Firehose: every event goes to every window over `event:activity`.
  // Volume is bounded — 1k ring entries, agents emit at human-action cadence
  // plus 1 Hz progress ticks. No throttling needed at this scale.
  bus.onAny((env) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send("event:activity", env);

      // If this WebContents subscribed to the specific task, also send the
      // scoped channel. Lets the detail panel listen on a single quiet channel
      // instead of filtering the firehose in the renderer.
      const taskId = "task_id" in env.event ? (env.event as { task_id: string }).task_id : null;
      if (taskId !== null) {
        const subs = taskSubs.get(win.webContents.id);
        if (subs?.has(taskId)) {
          win.webContents.send(`event:task.${taskId}`, env);
        }
      }
    }
  });

  ipcMain.handle("events.subscribeTask", (e, raw) => {
    const { task_id } = TASK_INPUT.parse(raw);
    const id = e.sender.id;
    let subs = taskSubs.get(id);
    if (!subs) {
      subs = new Set();
      taskSubs.set(id, subs);
    }
    subs.add(task_id);
    log.debug({ wc_id: id, task_id }, "subscribeTask");
    return { ok: true };
  });

  ipcMain.handle("events.unsubscribeTask", (e, raw) => {
    const { task_id } = TASK_INPUT.parse(raw);
    const subs = taskSubs.get(e.sender.id);
    subs?.delete(task_id);
    return { ok: true };
  });

  ipcMain.handle("events.replaySince", (_e, raw) => {
    const { since_id } = REPLAY_INPUT.parse(raw);
    return bus.replaySince(since_id);
  });

  // Clean up when windows go away so we don't leak entries.
  app.on("web-contents-created", (_event, contents) => {
    contents.on("destroyed", () => {
      taskSubs.delete(contents.id);
    });
  });
}
