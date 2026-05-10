/**
 * Application error codes — every API response uses one of these. See API.md §8.
 *
 * Services throw `AppError`. The tRPC errorFormatter wraps it into the response envelope:
 *   { error: { code, message, details, request_id } }
 *
 * Never throw bare `Error` from a service or router — the renderer can't tell whether
 * it's a known failure mode (validation) or an internal bug.
 */
export type ErrorCode =
  | "validation_error"
  | "not_found"
  | "invalid_state"
  | "conflict"
  | "agent_unavailable"
  | "internal_error";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details: unknown;
  public readonly statusHint: number;

  constructor(code: ErrorCode, message: string, details?: unknown, statusHint?: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details ?? null;
    this.statusHint = statusHint ?? defaultStatusFor(code);
  }
}

function defaultStatusFor(code: ErrorCode): number {
  switch (code) {
    case "validation_error":
      return 400;
    case "not_found":
      return 404;
    case "invalid_state":
      return 409;
    case "conflict":
      return 409;
    case "agent_unavailable":
      return 503;
    case "internal_error":
      return 500;
  }
}

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    details: unknown;
    request_id: string;
  };
};

export function toEnvelope(error: AppError, requestId: string): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      request_id: requestId,
    },
  };
}
