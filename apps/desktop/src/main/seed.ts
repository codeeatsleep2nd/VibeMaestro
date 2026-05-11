import { DEFAULT_WORKSPACE_ID, type SkillDefinition, type Task } from "@vibemaestro/core";
import { AgentRepository, TaskRepository } from "@vibemaestro/db";
import { getDb } from "./db.js";
import { childLogger } from "./lib/logger.js";
import { createWorkspaceService } from "./services/workspace-service.js";

const log = childLogger({ module: "seed" });

const CLAUDE_CODE_SKILLS: SkillDefinition[] = [
  { id: "/plan-eng-review", label: "Plan Eng Review" },
  { id: "/tdd-workflow", label: "TDD Workflow" },
  { id: "/code-review", label: "Code Review" },
  { id: "/document-release", label: "Document Release" },
  { id: "/learn", label: "Learn" },
];

const CODEX_SKILLS: SkillDefinition[] = [
  { id: "/codex", label: "Codex" },
  { id: "/review", label: "Review" },
];

/**
 * Idempotent dev seed. Three responsibilities, all safe to re-run:
 *   1. Populate agent skill registries (Claude Code + Codex) if empty.
 *   2. Trigger ws_local lazy-fill (path = HOME, default_agent_id = first v1 agent).
 *   3. If tasks table is empty, seed starter rows so the board has visible content.
 */
export function seedIfEmpty(): void {
  const { db } = getDb();
  const taskRepo = new TaskRepository(db);
  const agentRepo = new AgentRepository(db);

  // (1) Agent skill registries. setSkills overwrites; only run if currently empty so
  // the user can hand-edit and not have us stomp on their changes on next boot.
  for (const [agentId, skills] of [
    ["claude-code", CLAUDE_CODE_SKILLS],
    ["codex", CODEX_SKILLS],
  ] as const) {
    const agent = agentRepo.findById(agentId);
    if (agent && agent.skills.length === 0) {
      agentRepo.setSkills(agentId, skills);
      log.info({ agent_id: agentId, skill_count: skills.length }, "agent skills seeded");
    }
  }

  // (2) Touch the local workspace via the service to trigger lazy-fill.
  createWorkspaceService().get(DEFAULT_WORKSPACE_ID);

  // (3) Task seed — only if completely empty.
  if (taskRepo.countAll() > 0) {
    log.info("task seed skipped — tasks present");
    return;
  }
  log.info("seeding starter tasks");

  const now = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

  const seeds: Task[] = [
    {
      id: taskRepo.allocateNextSlug(),
      title: "Refactor session module",
      prompt: "Pull session storage out of `auth/` into a fresh `session/` package.",
      status: "running",
      agent_id: "claude-code",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-1_800_000),
      updated_at: now(-15_000),
      metadata: {},
    },
    {
      id: taskRepo.allocateNextSlug(),
      title: "Migrate analytics to ClickHouse",
      prompt: "Move the legacy ETL from Postgres to ClickHouse with a one-week dual-write window.",
      status: "running",
      agent_id: "codex",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-2_700_000),
      updated_at: now(-90_000),
      metadata: {},
    },
    {
      id: taskRepo.allocateNextSlug(),
      title: "Add CSV export to invoice list",
      prompt: "Add a CSV export action to the invoice list page; respect the active filter.",
      status: "reviewing",
      agent_id: "claude-code",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-3_600_000),
      updated_at: now(-300_000),
      metadata: {},
    },
    {
      id: taskRepo.allocateNextSlug(),
      title: "Add pagination to the audit log",
      prompt: "The audit log is unbounded. Cursor-paginate by `created_at` desc, 50 per page.",
      status: "backlog",
      agent_id: "claude-code",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-600_000),
      updated_at: now(-600_000),
      metadata: {},
    },
    {
      id: taskRepo.allocateNextSlug(),
      title: "Document the rate-limiter middleware",
      prompt: "Add a CONTRIBUTING-style doc explaining how to configure rate limits per route.",
      status: "backlog",
      agent_id: "codex",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-300_000),
      updated_at: now(-300_000),
      metadata: {},
    },
    {
      id: taskRepo.allocateNextSlug(),
      title: "Wire up Stripe webhook signature verification",
      prompt: "We're trusting the body without checking the signature header. Fix it.",
      status: "complete",
      agent_id: "claude-code",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-86_400_000),
      updated_at: now(-3_600_000),
      metadata: {},
    },
    {
      id: taskRepo.allocateNextSlug(),
      title: "Bump pino to v9",
      prompt: "Upgrade pino across packages and replace deprecated APIs.",
      status: "complete",
      agent_id: "codex",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-90_000_000),
      updated_at: now(-7_200_000),
      metadata: {},
    },
    {
      id: taskRepo.allocateNextSlug(),
      title: "Investigate flaky CI on macOS runners",
      prompt: "The token generator test fails intermittently on macos-latest. Find the race.",
      status: "blocked",
      agent_id: "claude-code",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-7_200_000),
      updated_at: now(-1_200_000),
      metadata: {},
    },
    {
      id: taskRepo.allocateNextSlug(),
      title: "Bug — emoji in task titles breaks the ID column",
      prompt: "Strip or normalize emoji in titles before render in the audit drawer.",
      status: "error",
      agent_id: "codex",
      workspace_id: DEFAULT_WORKSPACE_ID,
      current_run_id: null,
      phase_skills_override: null,
      created_at: now(-180_000),
      updated_at: now(-60_000),
      metadata: {},
    },
  ];

  for (const t of seeds) taskRepo.insert(t);
  log.info({ count: seeds.length }, "task seed complete");
}
