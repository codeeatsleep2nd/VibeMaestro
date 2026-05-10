import type { ErrorEnvelope } from "@vibemaestro/core";

export type IpcInvokeRequest = {
  id: string;
  path: string;
  type: "query" | "mutation";
  input: unknown;
};

export type IpcInvokeResult = { ok: true; data: unknown } | { ok: false; envelope: ErrorEnvelope };

export type VmBridge = {
  trpcInvoke: (request: IpcInvokeRequest) => Promise<IpcInvokeResult>;
  platform: NodeJS.Platform;
};

declare global {
  interface Window {
    vmBridge: VmBridge;
  }
}
