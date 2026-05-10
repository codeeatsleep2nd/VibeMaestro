import { contextBridge, ipcRenderer } from "electron";
import type { IpcInvokeRequest, IpcInvokeResult, VmBridge } from "./types.js";

const bridge: VmBridge = {
  trpcInvoke: (request: IpcInvokeRequest): Promise<IpcInvokeResult> =>
    ipcRenderer.invoke("trpc.invoke", request),
  platform: process.platform,
};

contextBridge.exposeInMainWorld("vmBridge", bridge);
