import { contextBridge, ipcRenderer } from "electron";
import type { IpcInvokeRequest, IpcInvokeResult, ReplayResult, VmBridge } from "./types.js";

const bridge: VmBridge = {
  trpcInvoke: (request: IpcInvokeRequest): Promise<IpcInvokeResult> =>
    ipcRenderer.invoke("trpc.invoke", request),
  platform: process.platform,

  events: {
    subscribeActivity(cb) {
      const handler = (_e: unknown, env: unknown) => cb(env as Parameters<typeof cb>[0]);
      ipcRenderer.on("event:activity", handler);
      return () => ipcRenderer.removeListener("event:activity", handler);
    },
    async subscribeTask(taskId, cb) {
      await ipcRenderer.invoke("events.subscribeTask", { task_id: taskId });
      const channel = `event:task.${taskId}`;
      const handler = (_e: unknown, env: unknown) => cb(env as Parameters<typeof cb>[0]);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
        void ipcRenderer.invoke("events.unsubscribeTask", { task_id: taskId });
      };
    },
    replaySince(sinceId) {
      return ipcRenderer.invoke("events.replaySince", {
        since_id: sinceId,
      }) as Promise<ReplayResult>;
    },
  },

  terminal: {
    attach: (runId) => ipcRenderer.invoke("terminal.attach", { run_id: runId }),
    detach: (runId) => ipcRenderer.invoke("terminal.detach", { run_id: runId }),
    write: (runId, data) => ipcRenderer.invoke("terminal.write", { run_id: runId, data }),
    resize: (runId, cols, rows) =>
      ipcRenderer.invoke("terminal.resize", { run_id: runId, cols, rows }),
    signal: (runId, sig) => ipcRenderer.invoke("terminal.signal", { run_id: runId, sig }),
    onOutput(runId, cb) {
      const channel = `term:output:${runId}`;
      const handler = (_e: unknown, chunk: unknown) => cb(chunk as string);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onClosed(runId, cb) {
      const channel = `term:closed:${runId}`;
      const handler = (_e: unknown, info: unknown) => cb(info as { at: string });
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },

  dialog: {
    selectDirectory: () => ipcRenderer.invoke("dialog.selectDirectory") as Promise<string | null>,
  },
};

contextBridge.exposeInMainWorld("vmBridge", bridge);
