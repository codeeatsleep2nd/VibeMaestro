import { z } from "zod";
export declare const eventTaskStateChanged: z.ZodObject<
  {
    type: z.ZodLiteral<"task.state_changed">;
    task_id: z.ZodString;
    from: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
    to: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
    at: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    at: string;
    type: "task.state_changed";
    task_id: string;
    from: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
    to: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
  },
  {
    at: string;
    type: "task.state_changed";
    task_id: string;
    from: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
    to: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
  }
>;
export declare const eventRunStarted: z.ZodObject<
  {
    type: z.ZodLiteral<"run.started">;
    task_id: z.ZodString;
    run_id: z.ZodString;
    agent_id: z.ZodString;
    at: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    at: string;
    type: "run.started";
    task_id: string;
    agent_id: string;
    run_id: string;
  },
  {
    at: string;
    type: "run.started";
    task_id: string;
    agent_id: string;
    run_id: string;
  }
>;
export declare const eventRunProgress: z.ZodObject<
  {
    type: z.ZodLiteral<"run.progress">;
    task_id: z.ZodString;
    run_id: z.ZodString;
    elapsed_ms: z.ZodNumber;
    bytes_emitted: z.ZodNumber;
  },
  "strip",
  z.ZodTypeAny,
  {
    type: "run.progress";
    task_id: string;
    bytes_emitted: number;
    run_id: string;
    elapsed_ms: number;
  },
  {
    type: "run.progress";
    task_id: string;
    bytes_emitted: number;
    run_id: string;
    elapsed_ms: number;
  }
>;
export declare const eventRunEnded: z.ZodObject<
  {
    type: z.ZodLiteral<"run.ended">;
    task_id: z.ZodString;
    run_id: z.ZodString;
    exit_code: z.ZodNullable<z.ZodNumber>;
    duration_ms: z.ZodNumber;
    outcome: z.ZodEnum<["succeeded", "failed", "cancelled"]>;
  },
  "strip",
  z.ZodTypeAny,
  {
    type: "run.ended";
    task_id: string;
    exit_code: number | null;
    run_id: string;
    duration_ms: number;
    outcome: "succeeded" | "failed" | "cancelled";
  },
  {
    type: "run.ended";
    task_id: string;
    exit_code: number | null;
    run_id: string;
    duration_ms: number;
    outcome: "succeeded" | "failed" | "cancelled";
  }
>;
export declare const eventAgentAvailability: z.ZodObject<
  {
    type: z.ZodLiteral<"agent.availability_changed">;
    agent_id: z.ZodString;
    available: z.ZodBoolean;
  },
  "strip",
  z.ZodTypeAny,
  {
    type: "agent.availability_changed";
    available: boolean;
    agent_id: string;
  },
  {
    type: "agent.availability_changed";
    available: boolean;
    agent_id: string;
  }
>;
export declare const renderableEventSchema: z.ZodDiscriminatedUnion<
  "type",
  [
    z.ZodObject<
      {
        type: z.ZodLiteral<"task.state_changed">;
        task_id: z.ZodString;
        from: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
        to: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
        at: z.ZodString;
      },
      "strip",
      z.ZodTypeAny,
      {
        at: string;
        type: "task.state_changed";
        task_id: string;
        from: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
        to: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
      },
      {
        at: string;
        type: "task.state_changed";
        task_id: string;
        from: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
        to: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
      }
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"run.started">;
        task_id: z.ZodString;
        run_id: z.ZodString;
        agent_id: z.ZodString;
        at: z.ZodString;
      },
      "strip",
      z.ZodTypeAny,
      {
        at: string;
        type: "run.started";
        task_id: string;
        agent_id: string;
        run_id: string;
      },
      {
        at: string;
        type: "run.started";
        task_id: string;
        agent_id: string;
        run_id: string;
      }
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"run.progress">;
        task_id: z.ZodString;
        run_id: z.ZodString;
        elapsed_ms: z.ZodNumber;
        bytes_emitted: z.ZodNumber;
      },
      "strip",
      z.ZodTypeAny,
      {
        type: "run.progress";
        task_id: string;
        bytes_emitted: number;
        run_id: string;
        elapsed_ms: number;
      },
      {
        type: "run.progress";
        task_id: string;
        bytes_emitted: number;
        run_id: string;
        elapsed_ms: number;
      }
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"run.ended">;
        task_id: z.ZodString;
        run_id: z.ZodString;
        exit_code: z.ZodNullable<z.ZodNumber>;
        duration_ms: z.ZodNumber;
        outcome: z.ZodEnum<["succeeded", "failed", "cancelled"]>;
      },
      "strip",
      z.ZodTypeAny,
      {
        type: "run.ended";
        task_id: string;
        exit_code: number | null;
        run_id: string;
        duration_ms: number;
        outcome: "succeeded" | "failed" | "cancelled";
      },
      {
        type: "run.ended";
        task_id: string;
        exit_code: number | null;
        run_id: string;
        duration_ms: number;
        outcome: "succeeded" | "failed" | "cancelled";
      }
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"agent.availability_changed">;
        agent_id: z.ZodString;
        available: z.ZodBoolean;
      },
      "strip",
      z.ZodTypeAny,
      {
        type: "agent.availability_changed";
        available: boolean;
        agent_id: string;
      },
      {
        type: "agent.availability_changed";
        available: boolean;
        agent_id: string;
      }
    >,
  ]
>;
export type RenderableEvent = z.infer<typeof renderableEventSchema>;
export declare const envelopedEventSchema: z.ZodObject<
  {
    id: z.ZodString;
    at: z.ZodString;
    event: z.ZodDiscriminatedUnion<
      "type",
      [
        z.ZodObject<
          {
            type: z.ZodLiteral<"task.state_changed">;
            task_id: z.ZodString;
            from: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
            to: z.ZodEnum<["backlog", "running", "reviewing", "complete", "blocked", "error"]>;
            at: z.ZodString;
          },
          "strip",
          z.ZodTypeAny,
          {
            at: string;
            type: "task.state_changed";
            task_id: string;
            from: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
            to: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
          },
          {
            at: string;
            type: "task.state_changed";
            task_id: string;
            from: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
            to: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
          }
        >,
        z.ZodObject<
          {
            type: z.ZodLiteral<"run.started">;
            task_id: z.ZodString;
            run_id: z.ZodString;
            agent_id: z.ZodString;
            at: z.ZodString;
          },
          "strip",
          z.ZodTypeAny,
          {
            at: string;
            type: "run.started";
            task_id: string;
            agent_id: string;
            run_id: string;
          },
          {
            at: string;
            type: "run.started";
            task_id: string;
            agent_id: string;
            run_id: string;
          }
        >,
        z.ZodObject<
          {
            type: z.ZodLiteral<"run.progress">;
            task_id: z.ZodString;
            run_id: z.ZodString;
            elapsed_ms: z.ZodNumber;
            bytes_emitted: z.ZodNumber;
          },
          "strip",
          z.ZodTypeAny,
          {
            type: "run.progress";
            task_id: string;
            bytes_emitted: number;
            run_id: string;
            elapsed_ms: number;
          },
          {
            type: "run.progress";
            task_id: string;
            bytes_emitted: number;
            run_id: string;
            elapsed_ms: number;
          }
        >,
        z.ZodObject<
          {
            type: z.ZodLiteral<"run.ended">;
            task_id: z.ZodString;
            run_id: z.ZodString;
            exit_code: z.ZodNullable<z.ZodNumber>;
            duration_ms: z.ZodNumber;
            outcome: z.ZodEnum<["succeeded", "failed", "cancelled"]>;
          },
          "strip",
          z.ZodTypeAny,
          {
            type: "run.ended";
            task_id: string;
            exit_code: number | null;
            run_id: string;
            duration_ms: number;
            outcome: "succeeded" | "failed" | "cancelled";
          },
          {
            type: "run.ended";
            task_id: string;
            exit_code: number | null;
            run_id: string;
            duration_ms: number;
            outcome: "succeeded" | "failed" | "cancelled";
          }
        >,
        z.ZodObject<
          {
            type: z.ZodLiteral<"agent.availability_changed">;
            agent_id: z.ZodString;
            available: z.ZodBoolean;
          },
          "strip",
          z.ZodTypeAny,
          {
            type: "agent.availability_changed";
            available: boolean;
            agent_id: string;
          },
          {
            type: "agent.availability_changed";
            available: boolean;
            agent_id: string;
          }
        >,
      ]
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    id: string;
    at: string;
    event:
      | {
          at: string;
          type: "task.state_changed";
          task_id: string;
          from: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
          to: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
        }
      | {
          at: string;
          type: "run.started";
          task_id: string;
          agent_id: string;
          run_id: string;
        }
      | {
          type: "run.progress";
          task_id: string;
          bytes_emitted: number;
          run_id: string;
          elapsed_ms: number;
        }
      | {
          type: "run.ended";
          task_id: string;
          exit_code: number | null;
          run_id: string;
          duration_ms: number;
          outcome: "succeeded" | "failed" | "cancelled";
        }
      | {
          type: "agent.availability_changed";
          available: boolean;
          agent_id: string;
        };
  },
  {
    id: string;
    at: string;
    event:
      | {
          at: string;
          type: "task.state_changed";
          task_id: string;
          from: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
          to: "error" | "running" | "backlog" | "reviewing" | "complete" | "blocked";
        }
      | {
          at: string;
          type: "run.started";
          task_id: string;
          agent_id: string;
          run_id: string;
        }
      | {
          type: "run.progress";
          task_id: string;
          bytes_emitted: number;
          run_id: string;
          elapsed_ms: number;
        }
      | {
          type: "run.ended";
          task_id: string;
          exit_code: number | null;
          run_id: string;
          duration_ms: number;
          outcome: "succeeded" | "failed" | "cancelled";
        }
      | {
          type: "agent.availability_changed";
          available: boolean;
          agent_id: string;
        };
  }
>;
export type EnvelopedEvent = z.infer<typeof envelopedEventSchema>;
