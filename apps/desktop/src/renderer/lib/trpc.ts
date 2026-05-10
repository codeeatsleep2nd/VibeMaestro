import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ErrorEnvelope } from "@vibemaestro/core";
import type { AppRouter } from "../../main/routers/_app.js";

/**
 * Custom IPC link. The renderer never speaks HTTP — it tunnels each tRPC call
 * through the preload `vmBridge.trpcInvoke`. The shape of the link mirrors
 * httpLink so the rest of the tRPC client doesn't care.
 */
function ipcLink(): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (typeof window === "undefined" || !window.vmBridge) {
          observer.error(
            new TRPCClientError("vmBridge not available — preload script may be missing"),
          );
          return () => {};
        }
        window.vmBridge
          .trpcInvoke({
            id: op.id.toString(),
            path: op.path,
            type: op.type as "query" | "mutation",
            input: op.input,
          })
          .then((result) => {
            if (result.ok) {
              observer.next({ result: { type: "data", data: result.data } });
              observer.complete();
            } else {
              const env = result.envelope as ErrorEnvelope;
              const err = new TRPCClientError<AppRouter>(env.error.message);
              (err as unknown as { data: unknown }).data = env;
              observer.error(err);
            }
          })
          .catch((reason: unknown) => {
            const message = reason instanceof Error ? reason.message : String(reason);
            observer.error(new TRPCClientError(message));
          });
        return () => {};
      });
}

export const trpc = createTRPCClient<AppRouter>({
  links: [ipcLink()],
});

export type { AppRouter };
