export class AppError extends Error {
  code;
  details;
  statusHint;
  constructor(code, message, details, statusHint) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details ?? null;
    this.statusHint = statusHint ?? defaultStatusFor(code);
  }
}
function defaultStatusFor(code) {
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
export function toEnvelope(error, requestId) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      request_id: requestId,
    },
  };
}
