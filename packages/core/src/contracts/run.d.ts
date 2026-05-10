import { z } from "zod";
export declare const RUN_STATUSES: readonly ["running", "succeeded", "failed", "cancelled"];
export declare const runStatusSchema: z.ZodEnum<["running", "succeeded", "failed", "cancelled"]>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export declare const runSchema: z.ZodObject<
  {
    id: z.ZodString;
    task_id: z.ZodString;
    agent_id: z.ZodString;
    status: z.ZodEnum<["running", "succeeded", "failed", "cancelled"]>;
    started_at: z.ZodString;
    ended_at: z.ZodNullable<z.ZodString>;
    exit_code: z.ZodNullable<z.ZodNumber>;
    bytes_emitted: z.ZodNumber;
    tool_calls_count: z.ZodNullable<z.ZodNumber>;
  },
  "strip",
  z.ZodTypeAny,
  {
    id: string;
    status: "running" | "succeeded" | "failed" | "cancelled";
    task_id: string;
    agent_id: string;
    started_at: string;
    ended_at: string | null;
    exit_code: number | null;
    bytes_emitted: number;
    tool_calls_count: number | null;
  },
  {
    id: string;
    status: "running" | "succeeded" | "failed" | "cancelled";
    task_id: string;
    agent_id: string;
    started_at: string;
    ended_at: string | null;
    exit_code: number | null;
    bytes_emitted: number;
    tool_calls_count: number | null;
  }
>;
export type Run = z.infer<typeof runSchema>;
export declare const runResponseSchema: z.ZodObject<
  {
    data: z.ZodObject<
      {
        id: z.ZodString;
        task_id: z.ZodString;
        agent_id: z.ZodString;
        status: z.ZodEnum<["running", "succeeded", "failed", "cancelled"]>;
        started_at: z.ZodString;
        ended_at: z.ZodNullable<z.ZodString>;
        exit_code: z.ZodNullable<z.ZodNumber>;
        bytes_emitted: z.ZodNumber;
        tool_calls_count: z.ZodNullable<z.ZodNumber>;
      },
      "strip",
      z.ZodTypeAny,
      {
        id: string;
        status: "running" | "succeeded" | "failed" | "cancelled";
        task_id: string;
        agent_id: string;
        started_at: string;
        ended_at: string | null;
        exit_code: number | null;
        bytes_emitted: number;
        tool_calls_count: number | null;
      },
      {
        id: string;
        status: "running" | "succeeded" | "failed" | "cancelled";
        task_id: string;
        agent_id: string;
        started_at: string;
        ended_at: string | null;
        exit_code: number | null;
        bytes_emitted: number;
        tool_calls_count: number | null;
      }
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    data: {
      id: string;
      status: "running" | "succeeded" | "failed" | "cancelled";
      task_id: string;
      agent_id: string;
      started_at: string;
      ended_at: string | null;
      exit_code: number | null;
      bytes_emitted: number;
      tool_calls_count: number | null;
    };
  },
  {
    data: {
      id: string;
      status: "running" | "succeeded" | "failed" | "cancelled";
      task_id: string;
      agent_id: string;
      started_at: string;
      ended_at: string | null;
      exit_code: number | null;
      bytes_emitted: number;
      tool_calls_count: number | null;
    };
  }
>;
export type RunResponse = z.infer<typeof runResponseSchema>;
