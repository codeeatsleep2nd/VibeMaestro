import { initTRPC } from "@trpc/server";
import { AppError, toEnvelope } from "@vibemaestro/core";
import { ZodError } from "zod";
import type { ChildLogger } from "./lib/logger.js";
import type { AuthContext } from "./middleware/auth.js";

export type TRPCContext = {
  auth: AuthContext;
  request_id: string;
  logger: ChildLogger;
};

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error, ctx }) {
    const requestId = ctx?.request_id ?? "unknown";
    if (error.cause instanceof ZodError) {
      const wrapped = new AppError(
        "validation_error",
        "Input failed validation",
        error.cause.flatten(),
      );
      return {
        ...shape,
        data: {
          ...shape.data,
          envelope: toEnvelope(wrapped, requestId),
        },
      };
    }
    if (error.cause instanceof AppError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          envelope: toEnvelope(error.cause, requestId),
        },
      };
    }
    const wrapped = new AppError("internal_error", error.message ?? "Internal error");
    return {
      ...shape,
      data: {
        ...shape.data,
        envelope: toEnvelope(wrapped, requestId),
      },
    };
  },
});

export const router = t.router;
export const procedure = t.procedure;
export const middleware = t.middleware;
