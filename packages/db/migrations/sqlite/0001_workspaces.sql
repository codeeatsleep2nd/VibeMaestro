-- 0001_workspaces.sql
-- MANUALLY AUTHORED. Do NOT regenerate via `drizzle-kit generate`.
-- The 12-step table rebuild + defensive agent re-seed cannot be auto-derived
-- from schema diffs. If the schema changes, edit this file by hand or write
-- a follow-up migration.
--
-- ATOMICITY: Drizzle's better-sqlite3 migrator already wraps each migration file
-- in a single transaction (see drizzle-orm/better-sqlite3/migrator). So a partial
-- failure rolls back automatically without an explicit BEGIN/COMMIT here.
-- (ARCH-E2's original "belt + suspenders" inner BEGIN/COMMIT was tried and rejected:
-- nested transactions inside an existing implicit transaction throw at runtime via
-- better-sqlite3's prepared-statement API. The outer migrator transaction is the
-- single source of atomicity for this file.)
--
-- D2: no `kind` / `git_url` / `resolved_path` / `status` / `error` fields.
-- D22: workspaces.default_agent_id is NULLABLE; workspace-service lazy-fills.
-- REV-S1: UPDATE agents rows to prompt_via=arg with --print / exec args.
-- D11: defensive INSERT OR IGNORE of v1 agents in case 0000's seed rows were deleted.
-- D7: tasks gains workspace_id NOT NULL + phase_skills_override. NO agent_id_override.

-- The runs table FK-references `tasks(id)` ON DELETE CASCADE. With foreign_keys=ON
-- (sqlite-init.ts), `DROP TABLE tasks` mid-migration would violate the FK. Defer
-- FK checks to COMMIT time — the rename of tasks_new → tasks reinstates the target
-- before COMMIT, so the check passes. defer_foreign_keys is per-transaction and
-- auto-resets, so subsequent transactions see foreign_keys=ON as normal.
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `workspaces` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `label` TEXT NOT NULL,
  `path` TEXT NOT NULL,
  `default_agent_id` TEXT REFERENCES `agents`(`id`) ON DELETE RESTRICT,
  `phase_skills` TEXT NOT NULL DEFAULT '{"planning":[],"running":[],"reviewing":[],"complete":[]}',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `workspaces_label_idx` ON `workspaces`(`label`);
--> statement-breakpoint
ALTER TABLE `agents` ADD COLUMN `skills` TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint

-- D11: defensive re-seed. If 0000's agent rows were nuked at any point, this
-- restores them. INSERT OR IGNORE is a no-op when rows already exist.
INSERT OR IGNORE INTO `agents` (id,label,monogram,hue,tier,command,args,env,cwd,prompt_via,available,version,registered_at,skills) VALUES
  ('claude-code', 'Claude Code', 'CC', 'oklch(74% 0.13 50)',  'v1', 'claude', '["--print","{{prompt}}"]', '{}', NULL, 'arg', 0, NULL, '2026-01-01T00:00:00.000Z', '[]'),
  ('codex',       'Codex',       'CX', 'oklch(72% 0.12 235)', 'v1', 'codex',  '["exec","{{prompt}}"]',    '{}', NULL, 'arg', 0, NULL, '2026-01-01T00:00:00.000Z', '[]');
--> statement-breakpoint

-- REV-S1: prior installs already have claude-code/codex with prompt_via='stdin'
-- and the old args. Switch them to the new --print/exec invocation contract.
UPDATE `agents` SET command='claude', args='["--print","{{prompt}}"]', prompt_via='arg' WHERE id='claude-code';
--> statement-breakpoint
UPDATE `agents` SET command='codex',  args='["exec","{{prompt}}"]',    prompt_via='arg' WHERE id='codex';
--> statement-breakpoint

-- ws_local default workspace. path='' is a sentinel; workspace-service lazy-fills
-- with os.homedir() on first read so the migration stays deterministic across machines.
-- default_agent_id is NULL (D22); the service lazy-fills with the first available v1 agent.
INSERT OR IGNORE INTO `workspaces` (id,label,path,default_agent_id,phase_skills,created_at,updated_at)
VALUES ('ws_local','Local','',NULL,'{"planning":[],"running":[],"reviewing":[],"complete":[]}','2026-05-10T00:00:00.000Z','2026-05-10T00:00:00.000Z');
--> statement-breakpoint

-- 12-step rebuild of `tasks` to add NOT NULL workspace_id with FK + phase_skills_override.
-- The whole migration file runs inside Drizzle's outer transaction, so DROP+RENAME
-- here is already atomic with the surrounding CREATE/INSERT statements.
CREATE TABLE `tasks_new` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `title` TEXT NOT NULL,
  `prompt` TEXT NOT NULL,
  `status` TEXT NOT NULL CHECK (`status` IN ('backlog','running','reviewing','complete','blocked','error')),
  `agent_id` TEXT NOT NULL,
  `workspace_id` TEXT NOT NULL REFERENCES `workspaces`(`id`) ON DELETE RESTRICT,
  `current_run_id` TEXT,
  `phase_skills_override` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  `metadata` TEXT DEFAULT '{}'
);
--> statement-breakpoint
INSERT INTO `tasks_new` (id,title,prompt,status,agent_id,workspace_id,current_run_id,phase_skills_override,created_at,updated_at,metadata)
  SELECT id,title,prompt,status,agent_id,'ws_local',current_run_id,NULL,created_at,updated_at,metadata FROM `tasks`;
--> statement-breakpoint
DROP TABLE `tasks`;
--> statement-breakpoint
ALTER TABLE `tasks_new` RENAME TO `tasks`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `status_agent_idx` ON `tasks` (`status`, `agent_id`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tasks_workspace_idx` ON `tasks` (`workspace_id`, `status`, `id`);
