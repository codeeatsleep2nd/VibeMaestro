import { z } from "zod";
export declare const ERROR_CODES: readonly [
  "validation_error",
  "not_found",
  "invalid_state",
  "conflict",
  "agent_unavailable",
  "internal_error",
];
export declare const errorCodeSchema: z.ZodEnum<
  [
    "validation_error",
    "not_found",
    "invalid_state",
    "conflict",
    "agent_unavailable",
    "internal_error",
  ]
>;
export declare const errorEnvelopeSchema: z.ZodObject<
  {
    error: z.ZodObject<
      {
        code: z.ZodEnum<
          [
            "validation_error",
            "not_found",
            "invalid_state",
            "conflict",
            "agent_unavailable",
            "internal_error",
          ]
        >;
        message: z.ZodString;
        details: z.ZodUnknown;
        request_id: z.ZodString;
      },
      "strip",
      z.ZodTypeAny,
      {
        code:
          | "validation_error"
          | "not_found"
          | "invalid_state"
          | "conflict"
          | "agent_unavailable"
          | "internal_error";
        message: string;
        request_id: string;
        details?: unknown;
      },
      {
        code:
          | "validation_error"
          | "not_found"
          | "invalid_state"
          | "conflict"
          | "agent_unavailable"
          | "internal_error";
        message: string;
        request_id: string;
        details?: unknown;
      }
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    error: {
      code:
        | "validation_error"
        | "not_found"
        | "invalid_state"
        | "conflict"
        | "agent_unavailable"
        | "internal_error";
      message: string;
      request_id: string;
      details?: unknown;
    };
  },
  {
    error: {
      code:
        | "validation_error"
        | "not_found"
        | "invalid_state"
        | "conflict"
        | "agent_unavailable"
        | "internal_error";
      message: string;
      request_id: string;
      details?: unknown;
    };
  }
>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
