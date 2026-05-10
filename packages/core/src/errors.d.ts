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
export declare class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;
  readonly statusHint: number;
  constructor(code: ErrorCode, message: string, details?: unknown, statusHint?: number);
}
export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    details: unknown;
    request_id: string;
  };
};
export declare function toEnvelope(error: AppError, requestId: string): ErrorEnvelope;
