import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    status: text("status").notNull(),
    agent_id: text("agent_id").notNull(),
    current_run_id: text("current_run_id"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    metadata: text("metadata", { mode: "json" }).default(sql`'{}'`),
  },
  (t) => [uniqueIndex("status_agent_idx").on(t.status, t.agent_id, t.id)],
);

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  task_id: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  agent_id: text("agent_id").notNull(),
  status: text("status").notNull(),
  started_at: text("started_at").notNull(),
  ended_at: text("ended_at"),
  exit_code: integer("exit_code"),
  bytes_emitted: integer("bytes_emitted").notNull().default(0),
  tool_calls_count: integer("tool_calls_count"),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  monogram: text("monogram").notNull(),
  hue: text("hue").notNull(),
  tier: text("tier").notNull(),
  command: text("command").notNull(),
  args: text("args", { mode: "json" }).notNull().default(sql`'[]'`),
  env: text("env", { mode: "json" }).notNull().default(sql`'{}'`),
  cwd: text("cwd"),
  prompt_via: text("prompt_via").notNull(),
  available: integer("available", { mode: "boolean" }).notNull().default(false),
  version: text("version"),
  registered_at: text("registered_at").notNull(),
});

export const taskSequence = sqliteTable("task_sequence", {
  id: integer("id").primaryKey(),
  next_value: integer("next_value").notNull(),
});

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;
export type AgentRow = typeof agents.$inferSelect;
export type NewAgentRow = typeof agents.$inferInsert;
