import { z } from "zod";
export const ERROR_CODES = [
  "validation_error",
  "not_found",
  "invalid_state",
  "conflict",
  "agent_unavailable",
  "internal_error",
];
export const errorCodeSchema = z.enum(ERROR_CODES);
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown(),
    request_id: z.string(),
  }),
});
