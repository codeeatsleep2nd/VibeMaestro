import { z } from "zod";
export declare const healthPingResponseSchema: z.ZodObject<
  {
    status: z.ZodLiteral<"ok">;
    version: z.ZodString;
    uptime_ms: z.ZodNumber;
  },
  "strip",
  z.ZodTypeAny,
  {
    status: "ok";
    version: string;
    uptime_ms: number;
  },
  {
    status: "ok";
    version: string;
    uptime_ms: number;
  }
>;
export type HealthPingResponse = z.infer<typeof healthPingResponseSchema>;
