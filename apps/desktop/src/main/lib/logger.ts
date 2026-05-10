import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "vibemaestro-main" },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export type ChildLogger = ReturnType<typeof logger.child>;

export function childLogger(bindings: Record<string, unknown>): ChildLogger {
  return logger.child(bindings);
}
