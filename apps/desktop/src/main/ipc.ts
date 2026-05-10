import { callTRPCProcedure, type TRPCError } from "@trpc/server";
import { AppError, toEnvelope } from "@vibemaestro/core";
import { ipcMain } from "electron";
import { ulid } from "ulid";
import { childLogger } from "./lib/logger.js";
import { getAuthContext } from "./middleware/auth.js";
import { appRouter } from "./routers/_app.js";

export type IpcInvokeRequest = {
  id: string;
  path: string;
  type: "query" | "mutation";
  input: unknown;
};

export type IpcInvokeResult =
  | { ok: true; data: unknown }
  | { ok: false; envelope: ReturnType<typeof toEnvelope> };

const IPC_CHANNEL = "trpc.invoke";

export function registerTrpcIpc(): void {
  ipcMain.handle(
    IPC_CHANNEL,
    async (_event, request: IpcInvokeRequest): Promise<IpcInvokeResult> => {
      const requestId = ulid();
      const log = childLogger({ request_id: requestId, path: request.path, type: request.type });
      const start = Date.now();
      try {
        const data = await callTRPCProcedure({
          router: appRouter,
          path: request.path,
          getRawInput: () => Promise.resolve(request.input),
          ctx: { auth: getAuthContext(), request_id: requestId, logger: log },
          type: request.type,
          signal: undefined,
          batchIndex: 0,
        });
        log.info({ duration_ms: Date.now() - start }, "trpc.ok");
        return { ok: true, data };
      } catch (error) {
        return { ok: false, envelope: extractEnvelope(error, requestId, log, start) };
      }
    },
  );
}

function extractEnvelope(
  error: unknown,
  requestId: string,
  log: ReturnType<typeof childLogger>,
  start: number,
): ReturnType<typeof toEnvelope> {
  // tRPC wraps thrown errors in TRPCError; the formatter attached the envelope to data.
  const trpcErr = error as TRPCError & { shape?: { data?: { envelope?: unknown } } };
  if (trpcErr?.shape?.data?.envelope) {
    log.warn({ duration_ms: Date.now() - start, code: trpcErr.code }, "trpc.error");
    return trpcErr.shape.data.envelope as ReturnType<typeof toEnvelope>;
  }
  if (error instanceof AppError) {
    log.warn({ duration_ms: Date.now() - start, code: error.code }, "trpc.app_error");
    return toEnvelope(error, requestId);
  }
  log.error(
    {
      duration_ms: Date.now() - start,
      err: error instanceof Error ? error.message : String(error),
    },
    "trpc.unhandled",
  );
  return toEnvelope(new AppError("internal_error", "Internal error"), requestId);
}
