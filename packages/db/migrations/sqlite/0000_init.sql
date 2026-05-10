CREATE TABLE IF NOT EXISTS `tasks` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `title` TEXT NOT NULL,
  `prompt` TEXT NOT NULL,
  `status` TEXT NOT NULL CHECK (`status` IN ('backlog','running','reviewing','complete','blocked','error')),
  `agent_id` TEXT NOT NULL,
  `current_run_id` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  `metadata` TEXT DEFAULT '{}'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `status_agent_idx` ON `tasks` (`status`, `agent_id`, `id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `runs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `task_id` TEXT NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  `agent_id` TEXT NOT NULL,
  `status` TEXT NOT NULL CHECK (`status` IN ('running','succeeded','failed','cancelled')),
  `started_at` TEXT NOT NULL,
  `ended_at` TEXT,
  `exit_code` INTEGER,
  `bytes_emitted` INTEGER NOT NULL DEFAULT 0,
  `tool_calls_count` INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `runs_task_idx` ON `runs` (`task_id`, `started_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agents` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `label` TEXT NOT NULL,
  `monogram` TEXT NOT NULL,
  `hue` TEXT NOT NULL,
  `tier` TEXT NOT NULL CHECK (`tier` IN ('v1','future')),
  `command` TEXT NOT NULL,
  `args` TEXT NOT NULL DEFAULT '[]',
  `env` TEXT NOT NULL DEFAULT '{}',
  `cwd` TEXT,
  `prompt_via` TEXT NOT NULL CHECK (`prompt_via` IN ('stdin','arg')),
  `available` INTEGER NOT NULL DEFAULT 0,
  `version` TEXT,
  `registered_at` TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `task_sequence` (
  `id` INTEGER PRIMARY KEY,
  `next_value` INTEGER NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `task_sequence` (`id`, `next_value`) VALUES (1, 1);
--> statement-breakpoint
INSERT OR IGNORE INTO `agents` (`id`, `label`, `monogram`, `hue`, `tier`, `command`, `args`, `env`, `cwd`, `prompt_via`, `available`, `version`, `registered_at`) VALUES
  ('claude-code', 'Claude Code', 'CC', 'oklch(74% 0.13 50)', 'v1', 'claude', '[]', '{}', NULL, 'stdin', 0, NULL, '2026-01-01T00:00:00.000Z'),
  ('codex',       'Codex',       'CX', 'oklch(72% 0.12 235)', 'v1', 'codex',  '[]', '{}', NULL, 'stdin', 0, NULL, '2026-01-01T00:00:00.000Z');
