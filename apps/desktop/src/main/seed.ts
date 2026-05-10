import type { Task } from "@vibemaestro/core";
import { TaskRepository } from "@vibemaestro/db";
import { getDb } from "./db.js";
import { childLogger } from "./lib/logger.js";

const log = childLogger({ module: "seed" });

/**
 * Idempotent dev seed. If the tasks table is empty, populate enough rows that
 * every lane on the board has visible content. Plan #2 ships proper task
 * creation; this runs only when the DB is fresh.
 */
export function seedIfEmpty(): void {
  const { db } = getDb();
  const repo = new TaskRepository(db);
  if (repo.countAll() > 0) {
    log.info("seed skipped — tasks present");
    return;
  }
  log.info("seeding starter tasks");

  const now = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

  const seeds: Task[] = [
    {
      id: repo.allocateNextSlug(),
      title: "Refactor session module",
      prompt: "Pull session storage out of `auth/` into a fresh `session/` package.",
      status: "running",
      agent_id: "claude-code",
      current_run_id: null,
      created_at: now(-1_800_000),
      updated_at: now(-15_000),
      metadata: {},
    },
    {
      id: repo.allocateNextSlug(),
      title: "Migrate analytics to ClickHouse",
      prompt: "Move the legacy ETL from Postgres to ClickHouse with a one-week dual-write window.",
      status: "running",
      agent_id: "codex",
      current_run_id: null,
      created_at: now(-2_700_000),
      updated_at: now(-90_000),
      metadata: {},
    },
    {
      id: repo.allocateNextSlug(),
      title: "Add CSV export to invoice list",
      prompt: "Add a CSV export action to the invoice list page; respect the active filter.",
      status: "reviewing",
      agent_id: "claude-code",
      current_run_id: null,
      created_at: now(-3_600_000),
      updated_at: now(-300_000),
      metadata: {},
    },
    {
      id: repo.allocateNextSlug(),
      title: "Add pagination to the audit log",
      prompt: "The audit log is unbounded. Cursor-paginate by `created_at` desc, 50 per page.",
      status: "backlog",
      agent_id: "claude-code",
      current_run_id: null,
      created_at: now(-600_000),
      updated_at: now(-600_000),
      metadata: {},
    },
    {
      id: repo.allocateNextSlug(),
      title: "Document the rate-limiter middleware",
      prompt: "Add a CONTRIBUTING-style doc explaining how to configure rate limits per route.",
      status: "backlog",
      agent_id: "codex",
      current_run_id: null,
      created_at: now(-300_000),
      updated_at: now(-300_000),
      metadata: {},
    },
    {
      id: repo.allocateNextSlug(),
      title: "Wire up Stripe webhook signature verification",
      prompt: "We're trusting the body without checking the signature header. Fix it.",
      status: "complete",
      agent_id: "claude-code",
      current_run_id: null,
      created_at: now(-86_400_000),
      updated_at: now(-3_600_000),
      metadata: {},
    },
    {
      id: repo.allocateNextSlug(),
      title: "Bump pino to v9",
      prompt: "Upgrade pino across packages and replace deprecated APIs.",
      status: "complete",
      agent_id: "codex",
      current_run_id: null,
      created_at: now(-90_000_000),
      updated_at: now(-7_200_000),
      metadata: {},
    },
    {
      id: repo.allocateNextSlug(),
      title: "Investigate flaky CI on macOS runners",
      prompt: "The token generator test fails intermittently on macos-latest. Find the race.",
      status: "blocked",
      agent_id: "claude-code",
      current_run_id: null,
      created_at: now(-7_200_000),
      updated_at: now(-1_200_000),
      metadata: {},
    },
    {
      id: repo.allocateNextSlug(),
      title: "Bug — emoji in task titles breaks the ID column",
      prompt: "Strip or normalize emoji in titles before render in the audit drawer.",
      status: "error",
      agent_id: "codex",
      current_run_id: null,
      created_at: now(-180_000),
      updated_at: now(-60_000),
      metadata: {},
    },
  ];

  for (const t of seeds) repo.insert(t);
  log.info({ count: seeds.length }, "seed complete");
}
