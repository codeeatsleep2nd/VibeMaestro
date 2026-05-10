import { z } from "zod";
export declare const TASK_STATUSES: readonly [
  "backlog",
  "running",
  "reviewing",
  "complete",
  "blocked",
  "error",
];
export declare const taskStatusSchema: z.ZodEnum<
  ["backlog", "running", "reviewing", "complete", "blocked", "error"]
>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export declare const taskSchema: z.ZodObject<
  {
    id: z.ZodString;
    title: z.ZodString;
    prompt: z.ZodString;
    status: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
    agent_id: z.ZodString;
    current_run_id: z.ZodNullable<z.ZodString>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  },
  "strip",
  z.ZodTypeAny,
  {
    id: string;
    status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
    agent_id: string;
    title: string;
    prompt: string;
    current_run_id: string | null;
    created_at: string;
    updated_at: string;
    metadata: Record<string, unknown>;
  },
  {
    id: string;
    status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
    agent_id: string;
    title: string;
    prompt: string;
    current_run_id: string | null;
    created_at: string;
    updated_at: string;
    metadata?: Record<string, unknown> | undefined;
  }
>;
export type Task = z.infer<typeof taskSchema>;
export declare const taskCreateInputSchema: z.ZodObject<
  {
    title: z.ZodString;
    prompt: z.ZodString;
    agent_id: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  },
  "strip",
  z.ZodTypeAny,
  {
    agent_id: string;
    title: string;
    prompt: string;
    metadata?: Record<string, unknown> | undefined;
  },
  {
    agent_id: string;
    title: string;
    prompt: string;
    metadata?: Record<string, unknown> | undefined;
  }
>;
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;
export declare const taskListInputSchema: z.ZodObject<
  {
    status: z.ZodOptional<
      z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>
    >;
    agent_id: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    per_page: z.ZodDefault<z.ZodNumber>;
    sort: z.ZodDefault<z.ZodEnum<["created_at_desc", "updated_at_desc"]>>;
  },
  "strip",
  z.ZodTypeAny,
  {
    sort: "created_at_desc" | "updated_at_desc";
    page: number;
    per_page: number;
    status?: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked" | undefined;
    agent_id?: string | undefined;
  },
  {
    sort?: "created_at_desc" | "updated_at_desc" | undefined;
    status?: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked" | undefined;
    agent_id?: string | undefined;
    page?: number | undefined;
    per_page?: number | undefined;
  }
>;
export type TaskListInput = z.infer<typeof taskListInputSchema>;
export declare const taskListResponseSchema: z.ZodObject<
  {
    data: z.ZodArray<
      z.ZodObject<
        {
          id: z.ZodString;
          title: z.ZodString;
          prompt: z.ZodString;
          status: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
          agent_id: z.ZodString;
          current_run_id: z.ZodNullable<z.ZodString>;
          created_at: z.ZodString;
          updated_at: z.ZodString;
          metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        },
        "strip",
        z.ZodTypeAny,
        {
          id: string;
          status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
          agent_id: string;
          title: string;
          prompt: string;
          current_run_id: string | null;
          created_at: string;
          updated_at: string;
          metadata: Record<string, unknown>;
        },
        {
          id: string;
          status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
          agent_id: string;
          title: string;
          prompt: string;
          current_run_id: string | null;
          created_at: string;
          updated_at: string;
          metadata?: Record<string, unknown> | undefined;
        }
      >,
      "many"
    >;
    meta: z.ZodObject<
      {
        total: z.ZodNumber;
        page: z.ZodNumber;
        per_page: z.ZodNumber;
      },
      "strip",
      z.ZodTypeAny,
      {
        page: number;
        per_page: number;
        total: number;
      },
      {
        page: number;
        per_page: number;
        total: number;
      }
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    data: {
      id: string;
      status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
      agent_id: string;
      title: string;
      prompt: string;
      current_run_id: string | null;
      created_at: string;
      updated_at: string;
      metadata: Record<string, unknown>;
    }[];
    meta: {
      page: number;
      per_page: number;
      total: number;
    };
  },
  {
    data: {
      id: string;
      status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
      agent_id: string;
      title: string;
      prompt: string;
      current_run_id: string | null;
      created_at: string;
      updated_at: string;
      metadata?: Record<string, unknown> | undefined;
    }[];
    meta: {
      page: number;
      per_page: number;
      total: number;
    };
  }
>;
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
export declare const taskResponseSchema: z.ZodObject<
  {
    data: z.ZodObject<
      {
        id: z.ZodString;
        title: z.ZodString;
        prompt: z.ZodString;
        status: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
        agent_id: z.ZodString;
        current_run_id: z.ZodNullable<z.ZodString>;
        created_at: z.ZodString;
        updated_at: z.ZodString;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
      },
      "strip",
      z.ZodTypeAny,
      {
        id: string;
        status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
        agent_id: string;
        title: string;
        prompt: string;
        current_run_id: string | null;
        created_at: string;
        updated_at: string;
        metadata: Record<string, unknown>;
      },
      {
        id: string;
        status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
        agent_id: string;
        title: string;
        prompt: string;
        current_run_id: string | null;
        created_at: string;
        updated_at: string;
        metadata?: Record<string, unknown> | undefined;
      }
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    data: {
      id: string;
      status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
      agent_id: string;
      title: string;
      prompt: string;
      current_run_id: string | null;
      created_at: string;
      updated_at: string;
      metadata: Record<string, unknown>;
    };
  },
  {
    data: {
      id: string;
      status: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
      agent_id: string;
      title: string;
      prompt: string;
      current_run_id: string | null;
      created_at: string;
      updated_at: string;
      metadata?: Record<string, unknown> | undefined;
    };
  }
>;
export type TaskResponse = z.infer<typeof taskResponseSchema>;
export declare const taskIdInputSchema: z.ZodObject<
  {
    id: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    id: string;
  },
  {
    id: string;
  }
>;
export type TaskIdInput = z.infer<typeof taskIdInputSchema>;
