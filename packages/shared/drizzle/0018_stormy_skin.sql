CREATE TABLE `team_ai_action_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`executor` text DEFAULT 'dynamic_worker' NOT NULL,
	`status` text NOT NULL,
	`request_json` text,
	`response_json` text,
	`error` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`duration_ms` integer,
	FOREIGN KEY (`action_id`) REFERENCES `team_ai_actions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_ai_action_attempts_action_attempt_unique` ON `team_ai_action_attempts` (`action_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_ai_action_attempts_idempotency_unique` ON `team_ai_action_attempts` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `team_ai_action_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`action_id` text,
	`team_id` text NOT NULL,
	`event_type` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`data_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `team_ai_action_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`action_id`) REFERENCES `team_ai_actions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_ai_action_events_run_created_idx` ON `team_ai_action_events` (`run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `team_ai_action_events_action_created_idx` ON `team_ai_action_events` (`action_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `team_ai_action_events_team_created_idx` ON `team_ai_action_events` (`team_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `team_ai_action_policies` (
	`team_id` text PRIMARY KEY NOT NULL,
	`auto_actions_enabled` integer DEFAULT 1 NOT NULL,
	`execution_mode` text DEFAULT 'risk_based' NOT NULL,
	`low_risk_auto_enabled` integer DEFAULT 1 NOT NULL,
	`blocked_action_types_json` text,
	`egress_allowlist_json` text,
	`github_autofix_enabled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `team_ai_action_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`trigger_source` text NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_id` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`snapshot_json` text,
	`plan_json` text,
	`policy_json` text,
	`blocked_reason` text,
	`error` text,
	`cancelled_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_ai_action_runs_team_created_idx` ON `team_ai_action_runs` (`team_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `team_ai_action_runs_team_status_created_idx` ON `team_ai_action_runs` (`team_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_ai_action_runs_trigger_unique` ON `team_ai_action_runs` (`team_id`,`trigger_source`,`trigger_type`,`trigger_id`);--> statement-breakpoint
CREATE TABLE `team_ai_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`team_id` text NOT NULL,
	`action_type` text NOT NULL,
	`risk_tier` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`payload_json` text,
	`gate_decision` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`blocked_reason` text,
	`requires_approval` integer DEFAULT 0 NOT NULL,
	`approved_by_user_id` text,
	`approved_at` text,
	`executed_at` text,
	`failed_at` text,
	`rolled_back_at` text,
	`rollback_action_id` text,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `team_ai_action_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_ai_actions_run_created_idx` ON `team_ai_actions` (`run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `team_ai_actions_team_status_created_idx` ON `team_ai_actions` (`team_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_ai_actions_idempotency_unique` ON `team_ai_actions` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `team_ai_github_repo_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`project_id` text,
	`repository_owner` text NOT NULL,
	`repository_name` text NOT NULL,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`path_allowlist_json` text,
	`max_files_changed` integer DEFAULT 12 NOT NULL,
	`max_patch_bytes` integer DEFAULT 50000 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_ai_github_repo_mapping_unique` ON `team_ai_github_repo_mappings` (`team_id`,`project_id`,`repository_owner`,`repository_name`);--> statement-breakpoint
CREATE INDEX `team_ai_github_repo_mapping_team_project_idx` ON `team_ai_github_repo_mappings` (`team_id`,`project_id`);