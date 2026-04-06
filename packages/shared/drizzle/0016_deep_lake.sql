CREATE TABLE `team_ai_assistant_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`run_type` text NOT NULL,
	`question` text,
	`answer` text NOT NULL,
	`model` text NOT NULL,
	`context_summary` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_ai_assistant_runs_team_created_idx` ON `team_ai_assistant_runs` (`team_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `team_ai_assistant_runs_team_run_type_created_idx` ON `team_ai_assistant_runs` (`team_id`,`run_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `team_ai_assistant_settings` (
	`team_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '@cf/moonshotai/kimi-k2.5' NOT NULL,
	`auto_audit_enabled` integer DEFAULT 0 NOT NULL,
	`auto_audit_interval_minutes` integer DEFAULT 1440 NOT NULL,
	`max_context_items` integer DEFAULT 30 NOT NULL,
	`include_issues` integer DEFAULT 1 NOT NULL,
	`include_monitors` integer DEFAULT 1 NOT NULL,
	`include_components` integer DEFAULT 1 NOT NULL,
	`include_status_pages` integer DEFAULT 1 NOT NULL,
	`include_notifications` integer DEFAULT 1 NOT NULL,
	`include_grouping_rules` integer DEFAULT 1 NOT NULL,
	`custom_instructions` text,
	`last_auto_audit_at` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
