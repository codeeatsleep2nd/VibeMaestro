import { z } from "zod";
export declare const AGENT_TIERS: readonly ["v1", "future"];
export declare const agentTierSchema: z.ZodEnum<["v1", "future"]>;
export type AgentTier = z.infer<typeof agentTierSchema>;
export declare const agentSchema: z.ZodObject<
  {
    id: z.ZodString;
    label: z.ZodString;
    monogram: z.ZodString;
    hue: z.ZodString;
    tier: z.ZodEnum<["v1", "future"]>;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    env: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    cwd: z.ZodNullable<z.ZodString>;
    prompt_via: z.ZodEnum<["stdin", "arg"]>;
    available: z.ZodBoolean;
    version: z.ZodNullable<z.ZodString>;
    registered_at: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    id: string;
    label: string;
    monogram: string;
    hue: string;
    tier: "v1" | "future";
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd: string | null;
    prompt_via: "stdin" | "arg";
    available: boolean;
    version: string | null;
    registered_at: string;
  },
  {
    id: string;
    label: string;
    monogram: string;
    hue: string;
    tier: "v1" | "future";
    command: string;
    cwd: string | null;
    prompt_via: "stdin" | "arg";
    available: boolean;
    version: string | null;
    registered_at: string;
    args?: string[] | undefined;
    env?: Record<string, string> | undefined;
  }
>;
export type Agent = z.infer<typeof agentSchema>;
export declare const agentListResponseSchema: z.ZodObject<
  {
    data: z.ZodArray<
      z.ZodObject<
        {
          id: z.ZodString;
          label: z.ZodString;
          monogram: z.ZodString;
          hue: z.ZodString;
          tier: z.ZodEnum<["v1", "future"]>;
          command: z.ZodString;
          args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
          env: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
          cwd: z.ZodNullable<z.ZodString>;
          prompt_via: z.ZodEnum<["stdin", "arg"]>;
          available: z.ZodBoolean;
          version: z.ZodNullable<z.ZodString>;
          registered_at: z.ZodString;
        },
        "strip",
        z.ZodTypeAny,
        {
          id: string;
          label: string;
          monogram: string;
          hue: string;
          tier: "v1" | "future";
          command: string;
          args: string[];
          env: Record<string, string>;
          cwd: string | null;
          prompt_via: "stdin" | "arg";
          available: boolean;
          version: string | null;
          registered_at: string;
        },
        {
          id: string;
          label: string;
          monogram: string;
          hue: string;
          tier: "v1" | "future";
          command: string;
          cwd: string | null;
          prompt_via: "stdin" | "arg";
          available: boolean;
          version: string | null;
          registered_at: string;
          args?: string[] | undefined;
          env?: Record<string, string> | undefined;
        }
      >,
      "many"
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    data: {
      id: string;
      label: string;
      monogram: string;
      hue: string;
      tier: "v1" | "future";
      command: string;
      args: string[];
      env: Record<string, string>;
      cwd: string | null;
      prompt_via: "stdin" | "arg";
      available: boolean;
      version: string | null;
      registered_at: string;
    }[];
  },
  {
    data: {
      id: string;
      label: string;
      monogram: string;
      hue: string;
      tier: "v1" | "future";
      command: string;
      cwd: string | null;
      prompt_via: "stdin" | "arg";
      available: boolean;
      version: string | null;
      registered_at: string;
      args?: string[] | undefined;
      env?: Record<string, string> | undefined;
    }[];
  }
>;
export type AgentListResponse = z.infer<typeof agentListResponseSchema>;
export declare const agentResponseSchema: z.ZodObject<
  {
    data: z.ZodObject<
      {
        id: z.ZodString;
        label: z.ZodString;
        monogram: z.ZodString;
        hue: z.ZodString;
        tier: z.ZodEnum<["v1", "future"]>;
        command: z.ZodString;
        args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        env: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        cwd: z.ZodNullable<z.ZodString>;
        prompt_via: z.ZodEnum<["stdin", "arg"]>;
        available: z.ZodBoolean;
        version: z.ZodNullable<z.ZodString>;
        registered_at: z.ZodString;
      },
      "strip",
      z.ZodTypeAny,
      {
        id: string;
        label: string;
        monogram: string;
        hue: string;
        tier: "v1" | "future";
        command: string;
        args: string[];
        env: Record<string, string>;
        cwd: string | null;
        prompt_via: "stdin" | "arg";
        available: boolean;
        version: string | null;
        registered_at: string;
      },
      {
        id: string;
        label: string;
        monogram: string;
        hue: string;
        tier: "v1" | "future";
        command: string;
        cwd: string | null;
        prompt_via: "stdin" | "arg";
        available: boolean;
        version: string | null;
        registered_at: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
      }
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    data: {
      id: string;
      label: string;
      monogram: string;
      hue: string;
      tier: "v1" | "future";
      command: string;
      args: string[];
      env: Record<string, string>;
      cwd: string | null;
      prompt_via: "stdin" | "arg";
      available: boolean;
      version: string | null;
      registered_at: string;
    };
  },
  {
    data: {
      id: string;
      label: string;
      monogram: string;
      hue: string;
      tier: "v1" | "future";
      command: string;
      cwd: string | null;
      prompt_via: "stdin" | "arg";
      available: boolean;
      version: string | null;
      registered_at: string;
      args?: string[] | undefined;
      env?: Record<string, string> | undefined;
    };
  }
>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
